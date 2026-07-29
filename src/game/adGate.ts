/**
 * 激励视频统一出口
 *
 * 8 个广告位共用这一条链路：查日限 → 埋点曝光 → 拉起广告 → 扣次数 → 回 true。
 * 拆开写的话每个位都要重复「忘了埋点 / 忘了判日限 / 广告没看完却发了奖」三件事，
 * 而这三件事都属于「错了不会报错，只会静默漏钱或送奖」的类型。
 *
 * 约定：**先播完广告才扣次数**（未看完不消耗），奖励发放由调用方在 true 分支里做。
 * 之所以不让本模块代发奖励，是因为 8 个位的奖励形态完全不同（体力 / 翻倍 / 次数 / 单抽），
 * 塞进来只会得到一个 switch。
 */
import { Platform } from '@/core/PlatformService';
import { analytics } from '@/analytics';
import { PlayerData } from './PlayerData';
import { AD_PLACEMENTS, type AdPlacementId } from '@/balance/monetization';
import { REWARDED_AD_UNIT } from '@/config/adUnits';

/** 该广告位今日剩余次数（UI 拿它决定按钮显不显示） */
export function adUsesLeft(id: AdPlacementId): number {
  return PlayerData.adUsesLeft(id);
}

export function adPlacementName(id: AdPlacementId): string {
  return AD_PLACEMENTS[id].name;
}

/** 按钮副标题统一文案：「今日剩 N 次」 */
export function adUsesLeftText(id: AdPlacementId): string {
  return `今日剩 ${adUsesLeft(id)} 次`;
}

/**
 * 播一支激励视频。返回 true 才可发奖。
 * `extra` 会并入 ad_show 埋点（关卡 id、缺口数量等排查用上下文）。
 */
export async function watchAd(
  id: AdPlacementId,
  extra: Record<string, string | number | boolean> = {},
): Promise<boolean> {
  const def = AD_PLACEMENTS[id];
  // gatedElsewhere 的位（通天塔重置）日限由业务次数代管，这里不重复拦
  if (!def.gatedElsewhere && PlayerData.adUsesLeft(id) <= 0) {
    Platform.showToast(`${def.name}今日次数已用完`);
    return false;
  }

  analytics.trackAdShow(id, { ...extra, ad_unit_id: REWARDED_AD_UNIT });
  const ok = await Platform.showRewardedVideo(REWARDED_AD_UNIT);
  analytics.trackAdClose(id, ok, extra);
  if (!ok) {
    Platform.showToast('广告未完成，奖励未发放');
    return false;
  }

  if (!def.gatedElsewhere && !PlayerData.consumeAdUse(id)) {
    // 极端情况：播广告期间跨了日切或次数被别处占用
    Platform.showToast(`${def.name}今日次数已用完`);
    return false;
  }
  return true;
}
