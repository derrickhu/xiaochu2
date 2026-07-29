/**
 * 精英模式契约：变体构造口径、解锁门槛、产出差与「不污染主线」的边界，
 * 以及达标队伍在精英档下的 TTK 仍落在精英带内（否则 3 星玩家点开就是劝退墙）。
 */
import { describe, it, expect } from 'vitest';
import { STAGES, STAGE_MAP } from '../stages';
import { getStageType } from '../stageTypes';
import {
  ELITE_MODE, baseStageIdOf, buildEliteStage, eliteStageIdOf, eliteStageOf,
  hasEliteVariant, isEliteStageId, isEliteUnlocked,
} from '../eliteMode';
import { stageCoinReward, stageDrops, stageUniversalReward } from '@/formulas/economyOutput';
import { stageStaminaCost } from '@/game/staminaService';
import { simulateBattle } from '@/formulas/simulation';
import { buildTeam, COMBO_MODELS } from '@/formulas/simulationReport';
import { getChapterBudget } from '@/balance/growth';
import { STAGE_TTK } from '../powerBudget';

const normalStage = (chapter: number) =>
  STAGES.find((s) => s.chapter === chapter && s.type === 'normal' && !s.isBoss)!;

describe('精英变体构造', () => {
  it('只对主线普通关开放：Boss 关、已是精英的关、精英变体自身都不再套一层', () => {
    expect(hasEliteVariant(normalStage(3))).toBe(true);
    expect(hasEliteVariant(STAGES.find((s) => s.isBoss)!)).toBe(false);
    const alreadyElite = STAGES.find((s) => s.type === 'elite');
    if (alreadyElite) expect(hasEliteVariant(alreadyElite)).toBe(false);
    expect(hasEliteVariant(buildEliteStage(normalStage(3)))).toBe(false);
  });

  it('难度 ×1.35、type 改精英、回合上限放宽，其余（波次/机制/掉落表）沿用原关', () => {
    const base = normalStage(4);
    const elite = buildEliteStage(base);
    expect(elite.difficulty).toBeCloseTo(base.difficulty * ELITE_MODE.difficultyMult, 6);
    expect(elite.type).toBe('elite');
    expect(elite.starTurnLimit).toBe(base.starTurnLimit + ELITE_MODE.starTurnLimitBonus);
    expect(elite.encounters).toEqual(base.encounters);
    expect(elite.dropTableId).toBe(base.dropTableId);
    expect(elite.mechanics).toEqual(base.mechanics);
    expect(elite.chapter).toBe(base.chapter);
  });

  it('id 双向映射，且构造幂等（同一关重复进入不产生第二份关卡）', () => {
    const base = normalStage(2);
    const elite = buildEliteStage(base);
    expect(elite.id).toBe(eliteStageIdOf(base.id));
    expect(isEliteStageId(elite.id)).toBe(true);
    expect(baseStageIdOf(elite.id)).toBe(base.id);
    expect(baseStageIdOf(base.id)).toBe(base.id);
    expect(buildEliteStage(base)).toBe(elite);
    expect(STAGE_MAP.get(elite.id)).toBe(elite);
  });

  it('变体不进 STAGES：主线关数、章节导航与解锁链完全不受影响', () => {
    const before = STAGES.length;
    eliteStageOf(normalStage(5));
    expect(STAGES.length).toBe(before);
    expect(STAGES.some((s) => isEliteStageId(s.id))).toBe(false);
  });
});

describe('精英模式解锁门槛', () => {
  const base = normalStage(3);

  it('需 3 星通关；1~2 星不解锁', () => {
    expect(isEliteUnlocked(base, () => 0)).toBe(false);
    expect(isEliteUnlocked(base, () => 2)).toBe(false);
    expect(isEliteUnlocked(base, () => ELITE_MODE.unlockStars)).toBe(true);
  });

  it('Boss 关即便 3 星也没有精英模式', () => {
    const boss = STAGES.find((s) => s.isBoss)!;
    expect(isEliteUnlocked(boss, () => 3)).toBe(false);
  });
});

describe('精英模式产出与体力', () => {
  const base = normalStage(6);
  const elite = buildEliteStage(base);

  it('体力 9（普通 6）：单价随难度上去，日预算里精英是「贵而值」的选择', () => {
    expect(stageStaminaCost(elite)).toBe(9);
    expect(stageStaminaCost(base)).toBe(6);
  });

  it('币 ×1.4 / 经验 ×1.5，均高于普通关', () => {
    expect(getStageType('elite').expMult).toBe(1.5);
    expect(stageCoinReward(elite.chapter, 3, elite.type))
      .toBeGreaterThan(stageCoinReward(base.chapter, 3, base.type));
    expect(stageDrops(elite.dropTableId, elite.chapter, 3, elite.type).exp)
      .toBeGreaterThan(stageDrops(base.dropTableId, base.chapter, 3, base.type).exp);
  });

  it('掉通用碎片（补上「关卡完全不掉碎片」的缺口），普通关仍不掉', () => {
    expect(stageUniversalReward(elite.type)).toBeGreaterThan(0);
    expect(stageUniversalReward(base.type)).toBe(0);
    expect(stageDrops(elite.dropTableId, elite.chapter, 3, elite.type).universal)
      .toBe(stageUniversalReward('elite'));
  });
});

describe('精英模式难度符合性（模拟器口径）', () => {
  /**
   * 「已 3 星通关本章」的队伍口径：与 simulation.test.ts 的主门禁同源（爆发队原型），
   * 等级取本章通关预算 —— 3 星通关意味着玩家已经打到了该章的产出终点。
   * 用默认 5R 队验精英会验成「白嫖阵容能不能打精英」，那是养成问题不是难度问题。
   */
  const BUDGET_TEAM_IDS = ['pet_002', 'pet_016', 'pet_006', 'pet_026', 'pet_008'];
  const clearTeam = (chapter: number) => {
    const b = getChapterBudget(chapter);
    return buildTeam(BUDGET_TEAM_IDS, b.clearLevel, b.enterStar);
  };

  it('各章精英变体：达标队伍可通，且用时落在精英 TTK 带内', () => {
    for (const ch of [1, 4, 8, 12, 16]) {
      const elite = buildEliteStage(normalStage(ch));
      const r = simulateBattle(clearTeam(ch), elite.id, COMBO_MODELS.mid);
      expect(r.win, `${elite.id} 应可通`).toBe(true);
      expect(r.turnsUsed, `${elite.id} 用时 ${r.turnsUsed}`)
        .toBeLessThanOrEqual(STAGE_TTK.elite.max);
    }
  });

  it('精英确实比普通更耗回合（难度倍率没有被别处抹平）', () => {
    const ch = 8;
    const base = normalStage(ch);
    const elite = buildEliteStage(base);
    const team = clearTeam(ch);
    const rb = simulateBattle(team, base.id, COMBO_MODELS.mid);
    const re = simulateBattle(team, elite.id, COMBO_MODELS.mid);
    expect(re.turnsUsed).toBeGreaterThanOrEqual(rb.turnsUsed);
  });
});
