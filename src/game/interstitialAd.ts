/**
 * 插屏广告软曝光出口
 *
 * 不做强制贴片：只在「战斗结束点返回」这类自然断点尝试一次。
 * 失败 / 频控 / 未配置 adUnitId → 静默跳过，绝不挡跳转。
 *
 * 抖音频控经验值：冷启动约 30s 内难以展示；两次展示间隔约 60s。
 */
import { Platform } from '@/core/PlatformService';
import { analytics } from '@/analytics';
import { INTERSTITIAL_AD_UNIT } from '@/config/adUnits';

const COLD_START_MS = 30_000;
const MIN_INTERVAL_MS = 60_000;

let _bootAt = 0;
let _lastShowAt = 0;

function ensureBoot(): void {
  if (_bootAt === 0) _bootAt = Date.now();
}

/** 跳过原因（仅调试日志用） */
function skipReason(): string | null {
  ensureBoot();
  if (!INTERSTITIAL_AD_UNIT) return '未配置 interstitial adUnitId';
  if (!Platform.isMinigame) return '非小游戏环境';
  const now = Date.now();
  if (now - _bootAt < COLD_START_MS) {
    return `冷启动未满 ${Math.ceil((COLD_START_MS - (now - _bootAt)) / 1000)}s（平台频控）`;
  }
  if (_lastShowAt > 0 && now - _lastShowAt < MIN_INTERVAL_MS) {
    return `距上次展示不足 ${Math.ceil(MIN_INTERVAL_MS / 1000)}s`;
  }
  return null;
}

/** 是否允许尝试插屏（不保证一定有填充） */
export function canTryInterstitial(): boolean {
  return skipReason() === null;
}

/**
 * 尝试播一支插屏。无论成败都很快返回，调用方应在之后继续跳转。
 * @param scene 埋点场景名（如 victory_home）
 *
 * 注意：抖音开发者工具模拟器经常无广告填充 / 不弹原生层；
 * 请用真机预览验证。仅点胜利页「返回主页」会触发，点「继续下一层」不会。
 */
export async function tryShowInterstitial(scene: string): Promise<boolean> {
  const skip = skipReason();
  if (skip) {
    // 频控 / 冷启动 / 未配置都是正常跳过，弹 Toast 会让玩家以为返回失败
    console.log(`[Interstitial] 跳过 ${scene}: ${skip}`);
    return false;
  }

  analytics.trackAdShow(scene, { ad_type: 'interstitial', ad_unit_id: INTERSTITIAL_AD_UNIT });
  const ok = await Platform.showInterstitialAd(INTERSTITIAL_AD_UNIT);
  analytics.trackAdClose(scene, ok, { ad_type: 'interstitial' });
  console.log(`[Interstitial] ${scene} show=${ok} unit=${INTERSTITIAL_AD_UNIT}`);
  if (ok) _lastShowAt = Date.now();
  return ok;
}
