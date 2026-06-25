import { PET_MAP, type PetDef } from '@/balance/pets';
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
}

export const COMBO_MODELS: Readonly<Record<'low' | 'mid' | 'high', ComboModel>> = {
  low: { name: '低手3C', combo: 3, matchCount: 3, useSkills: false },
  mid: { name: '中手5C', combo: 5, matchCount: 3, useSkills: true },
  high: { name: '高手7C', combo: 7, matchCount: 4, useSkills: true },
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
