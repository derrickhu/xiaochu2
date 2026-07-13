/**
 * 技能成长数据表（纯数据 + 纯派生函数）
 *
 * 双轨设计（对标消消英雄2 / 智龙迷城）：
 * - 等级线（渐进）：技能等级 Lv.1~5 提升主动技效果；被动按等级里程碑逐条解锁
 * - 星级线（质变）：skillTier（balance/skills/tier.ts）与 ★3/★5 星辉被动，保持原职责
 *
 * 所有门槛用 UnlockRequirement 表达，走 progression 通用管线。
 */
import type { UnlockRequirement } from './progression/requirements';

/** 主动技技能等级里程碑（rank 1~5，effectPct 为效果加成，独立乘区） */
export interface SkillMasteryMilestone {
  rank: number;
  requirement: UnlockRequirement;
  effectPct: number;
}

export const SKILL_MASTERY_MILESTONES: readonly SkillMasteryMilestone[] = [
  { rank: 1, requirement: { kind: 'level', level: 1 }, effectPct: 0 },
  { rank: 2, requirement: { kind: 'level', level: 20 }, effectPct: 0.06 },
  { rank: 3, requirement: { kind: 'level', level: 40 }, effectPct: 0.12 },
  { rank: 4, requirement: { kind: 'level', level: 65 }, effectPct: 0.18 },
  { rank: 5, requirement: { kind: 'level', level: 90 }, effectPct: 0.25 },
];

export const MAX_SKILL_MASTERY_RANK =
  SKILL_MASTERY_MILESTONES[SKILL_MASTERY_MILESTONES.length - 1].rank;

/** 当前等级对应的技能等级（rank 1~5） */
export function skillMasteryRank(level: number): number {
  let rank = 1;
  for (const m of SKILL_MASTERY_MILESTONES) {
    if (m.requirement.kind === 'level' && level >= m.requirement.level) rank = m.rank;
  }
  return rank;
}

/** 技能等级 → 效果乘区（rank 1 = ×1.0） */
export function masteryEffectMult(rank: number): number {
  const m = SKILL_MASTERY_MILESTONES.find((x) => x.rank === rank);
  return 1 + (m?.effectPct ?? 0);
}

/** 下一个技能等级里程碑（满级返回 null） */
export function nextMasteryMilestone(level: number): SkillMasteryMilestone | null {
  for (const m of SKILL_MASTERY_MILESTONES) {
    if (m.requirement.kind === 'level' && level < m.requirement.level) return m;
  }
  return null;
}

/** L0 签名被动解锁门槛（平衡回归后从 Lv.10 提前到 Lv.5：保住前 1 章低手可达性） */
export const PASSIVE_L0_UNLOCK: UnlockRequirement = { kind: 'level', level: 5 };

/**
 * Ladder L1/L2/L3 被动解锁门槛（槽位索引对应）。
 * 对齐章节功率预算（powerBudget CHAPTER_POWER enterLevel 曲线：ch3=17 / ch6=34 / ch8=44）：
 * 锚点队伍进章时应已解锁对应层；Lv.60 需 ★2+ 抬等级上限，与升星天然互锁。
 */
export const PASSIVE_LADDER_UNLOCKS: readonly UnlockRequirement[] = [
  { kind: 'level', level: 15 },
  { kind: 'level', level: 35 },
  { kind: 'level', level: 60 },
];

export function passiveLadderRequirement(slotIndex: number): UnlockRequirement {
  return PASSIVE_LADDER_UNLOCKS[Math.min(slotIndex, PASSIVE_LADDER_UNLOCKS.length - 1)];
}
