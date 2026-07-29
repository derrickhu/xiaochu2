/**
 * Boss 阶段状态机契约
 *
 * 重点不在「函数会不会算」，而在两条容易悄悄失效的约束：
 * - 阶段数值以出场攻击为基准，多段不叠乘（否则三阶段 Boss 攻击会指数爆炸）；
 * - 真实战斗与模拟器共用同一对函数（阶段若只进战斗侧，TTK 预算就测不到 Boss 变身）。
 */
import { describe, it, expect } from 'vitest';
import type { EnemyDef } from '@/balance/enemies';
import { MOBS, creatureMonsterDef, resolveEncounter } from '@/balance/enemies';
import { CREATURES } from '@/balance/creatures';
import { STAGES } from '@/balance/stages';
import { spawnSimEnemy } from '@/formulas/simulationEnemy';
import { spawnBattleEnemy } from '../battleLifecycle';
import {
  enterBossPhase,
  initialPhaseState,
  pendingBossPhase,
  phaseHpMarkers,
  currentPhaseLabel,
  validatePhases,
  type PhaseCapableEnemy,
} from '../bossPhase';

const BASE_DEF: EnemyDef = {
  id: 'test_boss', name: '试验魔像', element: 'earth', displayTier: 'boss',
  baseHp: 1000, baseAtk: 100, baseDef: 10, attackInterval: 2,
  skillIds: ['enemy_golem_guard'],
  phases: [
    { hpThreshold: 0.7, label: '二阶·裂甲', atkMult: 1.5, addSkillIds: ['enemy_blade_charge'] },
    { hpThreshold: 0.3, label: '三阶·崩坏', atkMult: 2, attackInterval: 1 },
  ],
};

function makeEnemy(def: EnemyDef, atk = 200): PhaseCapableEnemy {
  return {
    def, hp: 1000, maxHp: 1000, atk, def_: 10,
    skillCds: (def.skillIds ?? []).map(() => 0),
    ...initialPhaseState(def, atk),
  } as PhaseCapableEnemy;
}

describe('阶段触发血线', () => {
  it('未跨血线不触发', () => {
    const e = makeEnemy(BASE_DEF);
    e.hp = 800;
    expect(pendingBossPhase(e)).toBeNull();
  });

  it('跨过血线返回对应阶段，按数组顺序逐段推进', () => {
    const e = makeEnemy(BASE_DEF);
    e.hp = 700;
    expect(pendingBossPhase(e)?.label).toBe('二阶·裂甲');
    enterBossPhase(e, pendingBossPhase(e)!);
    expect(e.phaseIndex).toBe(1);

    // 还没到三阶血线
    expect(pendingBossPhase(e)).toBeNull();
    e.hp = 200;
    expect(pendingBossPhase(e)?.label).toBe('三阶·崩坏');
  });

  it('血量一次暴跌跨过两条线时，仍逐段切换（不跳阶段丢演出）', () => {
    const e = makeEnemy(BASE_DEF);
    e.hp = 100;
    enterBossPhase(e, pendingBossPhase(e)!);
    expect(e.phaseIndex, '第一次只进二阶').toBe(1);
    expect(pendingBossPhase(e)?.label, '下个敌人回合再进三阶').toBe('三阶·崩坏');
  });

  it('走完全部阶段后不再触发；死亡时不触发', () => {
    const e = makeEnemy(BASE_DEF);
    e.hp = 100;
    enterBossPhase(e, pendingBossPhase(e)!);
    enterBossPhase(e, pendingBossPhase(e)!);
    expect(pendingBossPhase(e)).toBeNull();

    const dead = makeEnemy(BASE_DEF);
    dead.hp = 0;
    expect(pendingBossPhase(dead)).toBeNull();
  });

  it('无 phases 的普通怪永不触发', () => {
    const e = makeEnemy({ ...BASE_DEF, phases: undefined });
    e.hp = 1;
    expect(pendingBossPhase(e)).toBeNull();
  });
});

describe('阶段生效口径', () => {
  it('atkMult 以出场攻击为基准，多段不叠乘', () => {
    const e = makeEnemy(BASE_DEF, 200);
    e.hp = 700;
    enterBossPhase(e, pendingBossPhase(e)!);
    expect(e.atk, '二阶 = 200 × 1.5').toBe(300);
    e.hp = 200;
    enterBossPhase(e, pendingBossPhase(e)!);
    expect(e.atk, '三阶 = 200 × 2（不是 300 × 2）').toBe(400);
    expect(e.baseAtk, '基准值不被阶段改写').toBe(200);
  });

  it('追加技能进技能表且 CD 从 0 起算（新威胁应能立刻打出）', () => {
    const e = makeEnemy(BASE_DEF);
    e.hp = 700;
    enterBossPhase(e, pendingBossPhase(e)!);
    expect(e.skillIds).toContain('enemy_blade_charge');
    expect(e.skillCds.length, 'CD 数组与技能表长度必须一一对应').toBe(e.skillIds.length);
    expect(e.skillCds[e.skillIds.indexOf('enemy_blade_charge')]).toBe(0);
  });

  it('重复追加同一技能不会让技能表与 CD 数组错位', () => {
    const def: EnemyDef = {
      ...BASE_DEF,
      phases: [
        { hpThreshold: 0.7, label: 'A', addSkillIds: ['enemy_blade_charge'] },
        { hpThreshold: 0.3, label: 'B', addSkillIds: ['enemy_blade_charge'] },
      ],
    };
    const e = makeEnemy(def);
    e.hp = 700;
    enterBossPhase(e, pendingBossPhase(e)!);
    e.hp = 200;
    enterBossPhase(e, pendingBossPhase(e)!);
    expect(e.skillIds.filter((s) => s === 'enemy_blade_charge')).toHaveLength(1);
    expect(e.skillCds).toHaveLength(e.skillIds.length);
  });

  it('attackInterval 覆写只在指定阶段生效，未指定则沿用', () => {
    const e = makeEnemy(BASE_DEF);
    expect(e.attackInterval).toBe(2);
    e.hp = 700;
    enterBossPhase(e, pendingBossPhase(e)!);
    expect(e.attackInterval, '二阶未指定 → 沿用').toBe(2);
    e.hp = 200;
    enterBossPhase(e, pendingBossPhase(e)!);
    expect(e.attackInterval, '三阶指定 1').toBe(1);
  });

  it('出场技能表是 def 的副本，切阶段不得污染共享的 def 数据', () => {
    const e = makeEnemy(BASE_DEF);
    e.hp = 700;
    enterBossPhase(e, pendingBossPhase(e)!);
    expect(BASE_DEF.skillIds, 'def.skillIds 被就地改写会污染同模板的其它波次').toEqual(['enemy_golem_guard']);
  });
});

describe('UI 与数据契约', () => {
  it('phaseHpMarkers 给出降序血线，供血条分段', () => {
    expect(phaseHpMarkers(BASE_DEF)).toEqual([0.7, 0.3]);
    expect(phaseHpMarkers({ ...BASE_DEF, phases: undefined })).toEqual([]);
  });

  it('currentPhaseLabel 在原始形态为 null，切换后跟随阶段', () => {
    const e = makeEnemy(BASE_DEF);
    expect(currentPhaseLabel(e)).toBeNull();
    e.hp = 700;
    enterBossPhase(e, pendingBossPhase(e)!);
    expect(currentPhaseLabel(e)).toBe('二阶·裂甲');
  });

  it('validatePhases 拦下非递减血线、越界血线与不存在的技能', () => {
    expect(validatePhases(BASE_DEF)).toEqual([]);
    const bad: EnemyDef = {
      ...BASE_DEF,
      phases: [
        { hpThreshold: 0.3, label: 'A' },
        { hpThreshold: 0.7, label: 'B' },
        { hpThreshold: 1.5, label: 'C', onEnterSkillId: 'enemy_does_not_exist' },
      ],
    };
    const errors = validatePhases(bad);
    expect(errors.some((e) => e.includes('未低于前一阶段'))).toBe(true);
    expect(errors.some((e) => e.includes('开区间'))).toBe(true);
    expect(errors.some((e) => e.includes('不存在的敌人技'))).toBe(true);
  });

  it('终章 Boss 高级形态必须配阶段（否则最终战退化成单调磨血）', () => {
    const finalChapter = Math.max(...STAGES.map((s) => s.chapter));
    const boss = STAGES.find((s) => s.chapter === finalChapter && s.isBoss)!;
    const bossWave = boss.encounters[boss.encounters.length - 1];
    const def = resolveEncounter(bossWave).def;
    expect(def.phases?.length, `${def.name} 应有多阶段`).toBeGreaterThanOrEqual(2);
  });

  it('两套引擎出场口径一致：战斗与模拟器的阶段字段必须相同', () => {
    // bossPhase.ts 存在的全部理由就是防这条漂移——模拟器少一个字段，
    // TTK 契约就会在「Boss 不转阶段」的假世界里通过。
    const boss = STAGES.find((s) => s.isBoss && s.chapter === Math.max(...STAGES.map((x) => x.chapter)))!;
    const waveIndex = boss.encounters.length - 1;
    const waves = boss.encounters.map((e) => resolveEncounter(e));
    const battle = spawnBattleEnemy(boss, waves, waveIndex);
    const sim = spawnSimEnemy(boss, waveIndex);

    expect(sim.baseAtk).toBe(battle.baseAtk);
    expect(sim.attackInterval).toBe(battle.attackInterval);
    expect(sim.skillIds).toEqual(battle.skillIds);
    expect(sim.skillCds).toEqual(battle.skillCds);
    expect(sim.phaseIndex).toBe(battle.phaseIndex);
    expect(sim.atk).toBe(battle.atk);
    expect(sim.maxHp).toBe(battle.maxHp);
  });

  it('全量敌人模板的阶段表都合法（杂怪 + 生物两形态）', () => {
    const defs: EnemyDef[] = [
      ...MOBS,
      ...CREATURES.flatMap((c) => [
        creatureMonsterDef(c.id, 'tier1'),
        creatureMonsterDef(c.id, 'tier2'),
      ]),
    ];
    const errors = defs.flatMap(validatePhases);
    expect(errors).toEqual([]);
  });
});
