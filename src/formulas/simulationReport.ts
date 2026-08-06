import { PET_MAP, type PetDef } from '@/balance/pets';
import type { PlayerProfile } from '@/balance/difficultyBudget';
import type { TeamMember } from './team';

/** 玩家操作熟练度模型 */
export interface ComboModel {
  name: string;
  /** 每回合形成的消除组数（总 Combo） */
  combo: number;
  /** 每组平均珠数（3 连 / 4 连…） */
  matchCount: number;
  /** 是否会用主动技（低手不主动放技能） */
  useSkills: boolean;
  /**
   * 硬闸门的满足率（0~1）。模拟器是概率模型、没有真实盘面，无法判定
   * 「首消是否覆盖了 3 种属性」，故用熟练度折算成期望：
   * 队伍属性/combo 上限压根够不到需求时算硬失败（与本值无关），
   * 够得到时按本值折算「手上功夫能不能稳定摆出来」。
   */
  gateCompliance: number;
}

/**
 * 玩家画像。
 *
 * `mindless` 是 v0.7 新增的难度护栏基线：见珠就拖、从不放技能、完全不理会闸门提示。
 * 它不是用来验证「能不能过」，而是用来验证**过不了**——难度契约要求它从
 * difficultyBudget.MINDLESS_WALL_CHAPTER 起撞墙。旧体系缺的就是这一档，
 * 于是「太简单」永远测不出来。
 */
export const COMBO_MODELS: Readonly<Record<PlayerProfile, ComboModel>> = {
  mindless: { name: '无脑基线', combo: 3, matchCount: 3, useSkills: false, gateCompliance: 0 },
  low: { name: '低手3C', combo: 3, matchCount: 3, useSkills: false, gateCompliance: 0.3 },
  mid: { name: '中手5C', combo: 5, matchCount: 3, useSkills: true, gateCompliance: 0.7 },
  high: { name: '高手7C', combo: 7, matchCount: 4, useSkills: true, gateCompliance: 0.95 },
};

export interface SimResult {
  win: boolean;
  /** 已用回合（达到上限仍未通关 = 卡关） */
  turnsUsed: number;
  /** 通关时英雄剩余血量（未通关 = 0） */
  heroHpRemaining: number;
  heroMaxHp: number;
  /** 单波最高承伤（评估是否被蓄力一击带走） */
  maxEnemyHit: number;
  /** 是否受过伤（无伤星判定） */
  tookDamage: boolean;
  /** 预计星数（口径同 BattleController.finish） */
  stars: number;
}

export interface StageReportRow {
  stageId: string;
  mindless: SimResult;
  low: SimResult;
  mid: SimResult;
  high: SimResult;
}

export type SimulateBattleFn = (
  members: readonly TeamMember[],
  stageId: string,
  model: ComboModel,
) => SimResult;

/** 由宠物 id 构造固定 level/star 的队伍 */
export function buildTeam(
  ids: readonly string[],
  level: number,
  star: number,
): TeamMember[] {
  return ids
    .map((id) => PET_MAP.get(id))
    .filter((def): def is PetDef => !!def)
    .map((def) => ({ def, level, star }));
}

/** 跑一支队伍在一组关卡上的三模型矩阵 */
export function simulateMatrixWith(
  simulateBattle: SimulateBattleFn,
  members: readonly TeamMember[],
  stageIds: readonly string[],
): StageReportRow[] {
  return stageIds.map((stageId) => ({
    stageId,
    mindless: simulateBattle(members, stageId, COMBO_MODELS.mindless),
    low: simulateBattle(members, stageId, COMBO_MODELS.low),
    mid: simulateBattle(members, stageId, COMBO_MODELS.mid),
    high: simulateBattle(members, stageId, COMBO_MODELS.high),
  }));
}

/** 人类可读的一行摘要（调参时 console 打印用） */
export function formatResult(r: SimResult): string {
  const hp = r.win ? `${Math.round((r.heroHpRemaining / r.heroMaxHp) * 100)}%hp` : 'DEAD';
  return `${r.win ? `WIN ${r.stars}★` : 'LOSE'} t=${r.turnsUsed} ${hp} maxHit=${r.maxEnemyHit}`;
}
