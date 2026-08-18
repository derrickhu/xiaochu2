/**
 * 抖音 / 微信订阅消息模板 ID
 *
 * ── 抖音后台 ──
 * 路径：运营 → 运营能力 → 订阅消息 → 选模板 → 获得 MSG 开头的模板 ID
 * 建议先配 1～2 个长期订阅（签到提醒 / 体力恢复），一次最多传 3 个，且类型须一致。
 *
 * 空数组 = 尚未配置：requestSubscribeMessage 不会真正弹窗，但代码已接入 API，
 * 满足上传检测「已接入订阅消息」；填好 ID 后真机才会向用户要授权。
 */
import { detectMinigamePlatform } from '@/core/PlatformService';

export interface PlatformSubscribeTemplates {
  /** 签到 / 日常领取等点击时机请求的模板 */
  retention: readonly string[];
}

export const SUBSCRIBE_TEMPLATES: Readonly<Record<'wechat' | 'douyin', PlatformSubscribeTemplates>> = {
  douyin: {
    // 体力恢复提醒 + 礼包领取提醒（一次性订阅，类型一致）
    retention: [
      'MSG21693700137187665271759876409609', // 体力恢复：体力值、温馨提示
      'MSG21693700137217667096389536631074', // 礼包领取：礼包奖励、通知日期
    ],
  },
  wechat: {
    retention: [],
  },
};

/** 当前平台用于留存提醒的模板列表 */
export function currentSubscribeTmplIds(): readonly string[] {
  const platform = detectMinigamePlatform();
  if (platform === 'wechat' || platform === 'douyin') {
    return SUBSCRIBE_TEMPLATES[platform].retention;
  }
  return [];
}
