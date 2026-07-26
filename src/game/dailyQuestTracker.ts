/**
 * 日常任务进度上报
 *
 * 业务侧只调 reportQuest(trigger, value)，由这里过滤出「今天真正在架上的任务」
 * 再累加进度 —— 池里没被选中的任务不该悄悄涨进度，否则次日轮换会凭空出现已完成项。
 */
import { localDateKey } from '@/core/SidebarService';
import {
  dailyQuestsOf,
  QUEST_ALL_CLEAR_ID,
  type DailyQuestDef,
  type QuestTrigger,
} from '@/balance/dailyQuest';
import { PlayerData } from './PlayerData';

/** 今日在架的 4 条任务 */
export function todayQuests(dateKey = localDateKey()): readonly DailyQuestDef[] {
  return dailyQuestsOf(dateKey);
}

/**
 * 上报一次任务行为。
 * @param value comboReach 传本场最高 Combo；计数型任务传增量（默认 1）
 */
export function reportQuest(trigger: QuestTrigger, value = 1): void {
  for (const quest of todayQuests()) {
    if (quest.trigger !== trigger) continue;
    if (quest.threshold !== undefined) {
      // 阈值型（如单场 8 Combo）：达标才算 1 次，不累计差值
      if (value >= quest.threshold) PlayerData.addQuestProgress(quest.id, 1);
      continue;
    }
    PlayerData.addQuestProgress(quest.id, value);
  }
}

export function isQuestDone(quest: DailyQuestDef): boolean {
  return PlayerData.questProgress(quest.id) >= quest.target;
}

/** 4 条全部领奖后，全清奖励才可领 */
export function canClaimAllClear(): boolean {
  if (PlayerData.isQuestClaimed(QUEST_ALL_CLEAR_ID)) return false;
  return todayQuests().every((q) => PlayerData.isQuestClaimed(q.id));
}

/** 左栏红点：有任意可领奖项 */
export function hasClaimableQuest(): boolean {
  const anyQuest = todayQuests().some((q) => isQuestDone(q) && !PlayerData.isQuestClaimed(q.id));
  return anyQuest || canClaimAllClear();
}
