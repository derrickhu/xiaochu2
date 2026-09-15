/**
 * 解锁门的玩家状态判定。
 *
 * 门的定义（前置关卡、通告文案、通告 flag）在 balance/featureGates.ts —— 那边是纯数据，
 * 存档迁移也要读它；这里只放依赖 PlayerData 的判定，两层分开是为了不成环，理由见那个文件。
 */
import { PlayerData } from './PlayerData';
import {
  ALL_FEATURE_GATES,
  FEATURE_GATES,
  type FeatureGateDef,
  type GatedFeatureId,
} from '@/balance/featureGates';

export {
  FEATURE_GATES,
  featureUnlockHint,
  type FeatureGateDef,
  type GatedFeatureId,
} from '@/balance/featureGates';

export function isFeatureUnlocked(id: GatedFeatureId): boolean {
  return PlayerData.isCleared(FEATURE_GATES[id].requiresStageId);
}

/**
 * 已经开放、但还没跟玩家交代过的功能。
 *
 * 返回数组而不是单个：万一玩家用 GM 跳关或一次通关跨过两道门，两条都得补上，
 * 不能因为一次只弹一个就把另一条永久吞掉（调用方逐个弹即可）。
 */
export function pendingFeatureNotices(): FeatureGateDef[] {
  return ALL_FEATURE_GATES.filter(
    (g) => isFeatureUnlocked(g.id) && !PlayerData.isTutorialDone(g.noticeFlag),
  );
}

export function markFeatureNoticeSeen(id: GatedFeatureId): void {
  PlayerData.markTutorialDone(FEATURE_GATES[id].noticeFlag);
}
