/**
 * 战斗结算的关键规则回归
 *
 * 整套配平都建立在「模拟器如实镜像实战」这个前提上：难度门禁读的是模拟器的数字，
 * 一旦两边的规则漂开，门禁全绿也毫无意义——那才是旧体系真正的隐患所在。
 * 这里钉住 v0.7 改动的两条底层规则，它们同时决定了「编队值不值得动脑」。
 */
import { describe, expect, it } from 'vitest';
import { ORB_TYPES, type Element, type OrbType } from '@/balance/combat';
import { BoardModel } from '@/game/board/BoardModel';
import { PETS } from '@/balance/pets';
import { petAtk } from '@/formulas/growth';
import { skillForPet } from '../SkillEngine';
import { resolvePlayerTurnDamage } from '../battleTurnResolution';
import type { EnemyUnit, TeamPet } from '../battleTypes';
import type { MatchGroup } from '@/game/board/BoardModel';

function petOf(element: Element): TeamPet {
  const def = PETS.find((p) => p.element === element)!;
  return {
    def,
    level: 30,
    star: 3,
    skill: skillForPet(def, 3, 30),
    atk: petAtk(def, 30, 3),
    critRate: 0,
    critDamage: 1.5,
    skillCdLeft: 0,
  } as TeamPet;
}

function fakeEnemy(): EnemyUnit {
  return {
    def: { id: 'test_dummy', name: '木桩', element: 'earth', baseHp: 1, baseAtk: 1, baseDef: 0 },
    hp: 10_000_000,
    maxHp: 10_000_000,
    atk: 1,
    def_: 0,
    attackInterval: 99,
    attackCountdown: 99,
  } as unknown as EnemyUnit;
}

function group(orb: OrbType, cells = 3): MatchGroup {
  return {
    orb,
    cells: Array.from({ length: cells }, (_, i) => ({ r: 0, c: i })),
    waveIndex: 0,
  };
}

function resolve(team: TeamPet[], orb: OrbType) {
  return resolvePlayerTurnDamage({
    groups: [group(orb)],
    team,
    enemy: fakeEnemy(),
    bannedElements: new Set<Element>(),
    enemyDefEffective: 0,
    teamRcvTotal: 0,
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
  });
}

describe('同色宠全员出手', () => {
  it('一组水珠会让队里两只水宠各打一次', () => {
    const waters = PETS.filter((p) => p.element === 'water').slice(0, 2);
    expect(waters).toHaveLength(2);
    const team = waters.map((def) => ({ ...petOf('water'), def, atk: petAtk(def, 30, 3) })) as TeamPet[];

    const res = resolve(team, 'water');

    /*
     * 这条是「换阵容」能不能成立的地基。改造前只有该属性的**第一只**宠出伤，
     * 同色第二只等于空位，于是「五色各一只」永远是唯一不浪费席位的编队，
     * 玩家在编队页没有任何需要权衡的决定。
     */
    expect(res.attacks, '同色第二只宠没有出手').toHaveLength(2);
    expect(new Set(res.attacks.map((a) => a.petIndex)).size).toBe(2);
  });

  it('不在队伍属性覆盖内的珠子不产生伤害', () => {
    const team = [petOf('water')];
    expect(resolve(team, 'fire').attacks).toHaveLength(0);
  });
});

describe('盘面掉落池', () => {
  it('只生成传入的珠色', () => {
    const pool: OrbType[] = ['water', 'fire', 'heart'];
    const board = new BoardModel(Math.random, pool);
    const seen = new Set<OrbType>();
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const orb = board.get(r, c);
        if (orb) seen.add(orb);
      }
    }
    /*
     * 队伍没覆盖的颜色若照样落在盘上就是死珠，等于给窄队一个无条件的盘面惩罚，
     * 「三色爆发流」这类构筑从开打前就输了。收窄掉落池之后它才成立。
     */
    for (const orb of seen) {
      expect(pool, `盘面掉出了池外的珠：${orb}`).toContain(orb);
    }
  });

  it('掉落池不足三色时回退到全色，避免盘面死锁', () => {
    const board = new BoardModel(Math.random, ['water', 'heart']);
    const seen = new Set<OrbType>();
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const orb = board.get(r, c);
        if (orb) seen.add(orb);
      }
    }
    expect(seen.size).toBeGreaterThan(2);
    for (const orb of seen) expect(ORB_TYPES).toContain(orb);
  });
});
