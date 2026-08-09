/**
 * 日常任务进度上报
 *
 * 业务侧只调 reportQuest(trigger, value)，由这里累加今日在架任务进度。
 */
import { localDateKey } from '@/core/SidebarService';
import {
  activityFromClaimed,
  DAILY_ACTIVITY_CHESTS,
  dailyQuestsOf,
  type ActivityChestDef,
  type DailyQuestDef,
  type QuestTrigger,
} from '@/balance/dailyQuest';
import { PlayerData } from './PlayerData';

/** 今日在架任务（固定 8 条） */
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
      if (value >= quest.threshold) PlayerData.addQuestProgress(quest.id, 1);
      continue;
    }
    PlayerData.addQuestProgress(quest.id, value);
  }
}

export function isQuestDone(quest: DailyQuestDef): boolean {
  return PlayerData.questProgress(quest.id) >= quest.target;
}

/** 今日已领任务贡献的活跃度 */
export function todayActivity(): number {
  return activityFromClaimed(PlayerData.daily.questClaimed);
}

export function canClaimActivityChest(chest: ActivityChestDef): boolean {
  if (PlayerData.isQuestClaimed(chest.id)) return false;
  return todayActivity() >= chest.need;
}

/** @deprecated 兼容旧全清：等同 100 活跃宝箱可领 */
export function canClaimAllClear(): boolean {
  const last = DAILY_ACTIVITY_CHESTS[DAILY_ACTIVITY_CHESTS.length - 1];
  return canClaimActivityChest(last);
}

/** 左栏红点：有任意可领任务或宝箱 */
export function hasClaimableQuest(): boolean {
  const anyQuest = todayQuests().some((q) => isQuestDone(q) && !PlayerData.isQuestClaimed(q.id));
  if (anyQuest) return true;
  return DAILY_ACTIVITY_CHESTS.some((c) => canClaimActivityChest(c));
}
