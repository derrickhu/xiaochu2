/**
 * 订阅消息统一出口（抖音广告金政策建议接入）
 *
 * 必须在用户点击手势内调用。一天最多主动弹一次，避免烦用户。
 * 模板 ID 未配置时直接跳过（代码仍保留 requestSubscribeMessage 接入）。
 */
import { Platform } from '@/core/PlatformService';
import { analytics } from '@/analytics';
import { currentSubscribeTmplIds } from '@/config/subscribeTemplates';

const STORAGE_KEY = 'subscribe_ask_day';

function todayKey(): string {
  // 与存档日切一致即可；本地日历日够用
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function alreadyAskedToday(): boolean {
  return Platform.getStorageSync(STORAGE_KEY) === todayKey();
}

function markAskedToday(): void {
  Platform.setStorageSync(STORAGE_KEY, todayKey());
}

/**
 * 在点击回调里请求订阅。失败/拒接/未配置都不打扰玩家。
 * @param scene 埋点场景（checkin / quest / victory）
 */
export async function tryRequestSubscribe(scene: string): Promise<void> {
  if (!Platform.isDouyin && !Platform.isWechat) return;
  const tmplIds = currentSubscribeTmplIds();
  if (tmplIds.length === 0) return;
  if (alreadyAskedToday()) return;

  markAskedToday();
  const res = await Platform.requestSubscribeMessage(tmplIds);
  const accepted = Object.values(res).filter((v) => v === 'accept').length;
  analytics.trackSubscribeResult(scene, accepted);
}
