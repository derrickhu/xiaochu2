import { describe, it, expect } from 'vitest';
import { NO_GATES, VOID_PIERCE_MATCH_COUNT, VOID_PIERCE_MULT } from '@/balance/damageGates';
import { resolvePlayerTurnDamage, type ResolvePlayerTurnOptions } from '../battleTurnResolution';
import type { Cell, MatchGroup } from '@/game/board/BoardModel';
import type { EnemyUnit, TeamPet } from '../battleTypes';
import type { Element } from '@/balance/combat';

function pet(element: Element): TeamPet {
  return {
    // 特攻属性刻意避开敌人的 water：闸门测试要量的是闸门乘区，不是对位加成
    def: {
      element,
      tags: { killerElement: 'fire', bondTags: [], resist: 'sealOrbs' },
    } as unknown as TeamPet['def'],
    level: 1, star: 1,
    skill: {} as TeamPet['skill'],
    atk: 1000, critRate: 0, critDamage: 0, skillCdLeft: 0,
  };
}

function cells(n: number): Cell[] {
  return Array.from({ length: n }, (_, i) => ({ r: 0, c: i }));
}

function group(orb: MatchGroup['orb'], waveIndex = 0, size = 3): MatchGroup {
  return { orb, cells: cells(size), waveIndex };
}

const ENEMY = (): EnemyUnit =>
  ({ def: { element: 'water' }, maxHp: 10000, dmgReduction: null } as unknown as EnemyUnit);

function opts(over: Partial<ResolvePlayerTurnOptions>): ResolvePlayerTurnOptions {
  return {
    groups: [],
    team: [pet('fire'), pet('wood'), pet('earth'), pet('metal')],
    enemy: ENEMY(),
    bannedElements: new Set(),
    enemyDefEffective: 0,
    teamRcvTotal: 1000,
    noHeartHeal: false,
    passiveRegenPerTurn: 0,
    teamDamageMult: 1,
    leaderComboBonus: 0,
    teamHealBonus: 0,
    guaranteedCrit: false,
    heartHealMult: 1,
    elementBuffMult: () => 1,
    elementAbsorbMult: () => 1,
    rng: () => 0.99,
    elementTraitDamageMult: () => 1,
    counterRelation: () => 0,
    gates: NO_GATES,
    ...over,
  };
}

const totalDamage = (r: { attacks: { damage: number }[] }): number =>
  r.attacks.reduce((sum, a) => sum + a.damage, 0);

describe('五行阵盾接入回合结算', () => {
  it('首消属性数达标：伤害照常', () => {
    const r = resolvePlayerTurnDamage(opts({
      groups: [group('fire'), group('wood'), group('earth')],
      gates: { ...NO_GATES, elementNeed: 3 },
    }));
    expect(r.gateUnmet).toEqual([]);
    expect(totalDamage(r)).toBeGreaterThan(100);
  });

  it('首消属性数不足：每次出手都被压到 1 点，并报出还差多少', () => {
    const r = resolvePlayerTurnDamage(opts({
      groups: [group('fire'), group('wood')],
      gates: { ...NO_GATES, elementNeed: 3 },
    }));
    expect(r.attacks.every((a) => a.damage === 1)).toBe(true);
    expect(r.gateUnmet).toEqual([{ kind: 'elementGate', need: 3, actual: 2 }]);
  });

  it('只看首消：天降补出的第三种属性不算数（不让随机连锁替玩家过闸门）', () => {
    const r = resolvePlayerTurnDamage(opts({
      groups: [group('fire'), group('wood'), group('earth', 1)],
      gates: { ...NO_GATES, elementNeed: 3 },
    }));
    expect(r.gateUnmet).toHaveLength(1);
    expect(r.attacks.every((a) => a.damage === 1)).toBe(true);
  });

  it('反过来也成立：天降的坏连锁不会把已经过了的闸门推回去', () => {
    const r = resolvePlayerTurnDamage(opts({
      groups: [group('fire'), group('wood'), group('earth'), group('fire', 2)],
      gates: { ...NO_GATES, elementNeed: 3 },
    }));
    expect(r.gateUnmet).toEqual([]);
  });

  it('打不出伤害的珠不算属性数：队伍没有该属性的宠时不顶数', () => {
    const r = resolvePlayerTurnDamage(opts({
      team: [pet('fire'), pet('wood')],
      groups: [group('fire'), group('wood'), group('water')],
      gates: { ...NO_GATES, elementNeed: 3 },
    }));
    expect(r.gateUnmet).toEqual([{ kind: 'elementGate', need: 3, actual: 2 }]);
  });

  it('被本关禁用的属性同样不顶数', () => {
    const r = resolvePlayerTurnDamage(opts({
      groups: [group('fire'), group('wood'), group('earth')],
      bannedElements: new Set<Element>(['earth']),
      gates: { ...NO_GATES, elementNeed: 3 },
    }));
    expect(r.gateUnmet).toEqual([{ kind: 'elementGate', need: 3, actual: 2 }]);
  });

  it('心珠计入 combo 但不计入属性数', () => {
    const r = resolvePlayerTurnDamage(opts({
      groups: [group('fire'), group('wood'), group('heart')],
      gates: { ...NO_GATES, elementNeed: 3, comboNeed: 3 },
    }));
    expect(r.gateUnmet).toEqual([{ kind: 'elementGate', need: 3, actual: 2 }]);
  });
});

describe('连锁盾接入回合结算', () => {
  it('首消连数达标即放行', () => {
    const r = resolvePlayerTurnDamage(opts({
      groups: [group('fire'), group('wood'), group('earth')],
      gates: { ...NO_GATES, comboNeed: 3 },
    }));
    expect(r.gateUnmet).toEqual([]);
  });

  it('只有天降凑够连数不算过闸门', () => {
    const r = resolvePlayerTurnDamage(opts({
      groups: [group('fire'), group('wood', 1), group('earth', 1)],
      gates: { ...NO_GATES, comboNeed: 3 },
    }));
    expect(r.gateUnmet).toEqual([{ kind: 'comboGate', need: 3, actual: 1 }]);
  });
});

describe('锋锐无效接入回合结算', () => {
  /** 先量出该组在无闸门时的裸伤，再据此设阈值 */
  function baseHit(size: number): number {
    return resolvePlayerTurnDamage(opts({ groups: [group('fire', 0, size)] })).attacks[0].damage;
  }

  it('超过阈值的一击被压到 1 点，并标记 voided 供表现层播「无效」', () => {
    const raw = baseHit(3);
    const r = resolvePlayerTurnDamage(opts({
      groups: [group('fire', 0, 3)],
      gates: { ...NO_GATES, voidThreshold: Math.floor(raw / 2) },
    }));
    expect(r.attacks[0].voided).toBe(true);
    expect(r.attacks[0].damage).toBe(1);
  });

  it('阈值以内的一击不受影响', () => {
    const raw = baseHit(3);
    const r = resolvePlayerTurnDamage(opts({
      groups: [group('fire', 0, 3)],
      gates: { ...NO_GATES, voidThreshold: raw * 2 },
    }));
    expect(r.attacks[0].voided).toBe(false);
    expect(r.attacks[0].damage).toBe(raw);
  });

  it('5 连穿透并额外增伤 —— 解法是操作而不是数值', () => {
    const raw = baseHit(VOID_PIERCE_MATCH_COUNT);
    const r = resolvePlayerTurnDamage(opts({
      groups: [group('fire', 0, VOID_PIERCE_MATCH_COUNT)],
      gates: { ...NO_GATES, voidThreshold: 1 },
    }));
    expect(r.attacks[0].pierced).toBe(true);
    expect(r.attacks[0].damage).toBe(Math.floor(raw * VOID_PIERCE_MULT));
  });
});

describe('闸门与其他乘区的叠加口径', () => {
  it('闸门未过时雷霆真伤也不给后门（否则堆攻又变成通解）', () => {
    const withGate = resolvePlayerTurnDamage(opts({
      groups: [group('fire', 0, 5)],
      thunderTrueDamagePct: 1,
      thunderMatchCount: 4,
      teamAtkTotal: 100000,
      gates: { ...NO_GATES, elementNeed: 3 },
    }));
    expect(withGate.attacks[0].damage).toBe(1);
  });

  it('闸门通过时雷霆真伤照常叠加', () => {
    const noThunder = resolvePlayerTurnDamage(opts({ groups: [group('fire', 0, 5)] }));
    const withThunder = resolvePlayerTurnDamage(opts({
      groups: [group('fire', 0, 5)],
      thunderTrueDamagePct: 0.1,
      thunderMatchCount: 4,
      teamAtkTotal: 4000,
    }));
    expect(withThunder.attacks[0].damage).toBe(noThunder.attacks[0].damage + 400);
  });
});
