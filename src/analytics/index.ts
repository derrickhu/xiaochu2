/**
 * 经分埋点：SDK 初始化 + 业务门面（对齐 huahua / caizhu 接入方式）
 *
 * - GAME_KEY / ENDPOINT 单一真源：@/config/CloudConfig
 * - 业务侧只 import { analytics, initAnalytics, EVENT_NAMES } from '@/analytics'
 */
import {
  Analytics,
  EVENT_NAMES,
  type DeviceInfo,
  type EventParamValue,
  type PlatformName,
} from '@gp/analytics-sdk';

import { ANALYTICS_ENDPOINT } from '@/config/CloudConfig';
import { BASE_GAME_KEY } from '@/config/gameKeyScope';
import { Platform } from '@/core/PlatformService';
import { stageLevelId } from './stageLevel';

export { EVENT_NAMES };
export type AnalyticsParams = Record<string, EventParamValue>;

declare const __APP_VERSION__: string;

let inited = false;

function track(eventName: string, params: AnalyticsParams = {}): void {
  Analytics.track(eventName, params);
}

/** SDK 初始化：main.ts 启动尽早调用 */
export function initAnalytics(opts?: { endpoint?: string; userId?: string; debug?: boolean }): void {
  if (inited) return;

  // 经分 gameKey 必须用基础名 petTower（白名单只有这一档）。
  // 存档/本地 key 的抖音命名空间 petTower_tt_* 走 platform 字段区分，不要把 scoped key 写进 gameKey。
  Analytics.init({
    endpoint: opts?.endpoint || ANALYTICS_ENDPOINT,
    gameKey: BASE_GAME_KEY,
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.1.0',
    platform: mapPlatform(),
    deviceInfo: buildDeviceInfo(),
    initialUserId: opts?.userId,
    transport: { request: Platform.request.bind(Platform) },
    storage: {
      get: Platform.getStorageSync.bind(Platform),
      set: Platform.setStorageSync.bind(Platform),
      remove: Platform.removeStorageSync.bind(Platform),
    },
    lifecycle: { onHide: Platform.onHide.bind(Platform) },
    debug: opts?.debug ?? Platform.isDevtools,
  });

  inited = true;
  console.log(`[analytics] init gameKey=${BASE_GAME_KEY} platform=${mapPlatform()}`);
}

/** 登录拿到 openid 后调用；SDK 内部自动 track login + flush */
export function setAnalyticsUserId(userId: string): void {
  if (!inited) return;
  Analytics.setUserId(userId || '');
  if (userId) {
    console.log(`[analytics] setUserId userId=${userId}`);
  } else {
    console.warn('[analytics] setUserId skipped: empty userId');
  }
}

/** 业务经分门面：SOP 事件与关卡漏斗统一从这里出 */
export const analytics = {
  track,

  trackSessionStart(params: AnalyticsParams = {}): void {
    track(EVENT_NAMES.SESSION_START, {
      entry: 'main',
      with_user_id: false,
      ...params,
    });
  },

  trackSessionEnd(reasonOrParams: string | AnalyticsParams = 'app-hide'): void {
    const params = typeof reasonOrParams === 'string'
      ? { reason: reasonOrParams }
      : reasonOrParams;
    track(EVENT_NAMES.SESSION_END, params);
  },

  trackAppShow(params: AnalyticsParams = {}): void {
    track('app_show', params);
  },

  trackAppError(error: unknown, extra: AnalyticsParams = {}): void {
    const err = error as { message?: string; errMsg?: string; stack?: string; errCode?: number };
    track(EVENT_NAMES.APP_ERROR, {
      err_msg: String(err?.message || err?.errMsg || error || 'unknown').slice(0, 240),
      err_code: err?.errCode == null ? -1 : Number(err.errCode),
      stack: err?.stack ? String(err.stack).slice(0, 500) : '',
      ...extra,
    });
  },

  trackLevelStart(stageId: string, stageName?: string): void {
    track(EVENT_NAMES.LEVEL_START, {
      level_id: stageLevelId(stageId),
      level_name: stageId,
      stage_name: stageName || '',
    });
  },

  trackLevelClear(stageId: string, params: {
    durationMs: number;
    turnsUsed: number;
    stars: number;
    stageName?: string;
  }): void {
    track(EVENT_NAMES.LEVEL_CLEAR, {
      level_id: stageLevelId(stageId),
      level_name: stageId,
      stage_name: params.stageName || '',
      duration_ms: Math.max(0, Math.floor(params.durationMs)),
      turns_used: Math.max(0, Math.floor(params.turnsUsed)),
      stars: Math.max(0, Math.floor(params.stars)),
    });
  },

  trackLevelFail(stageId: string, params: {
    durationMs: number;
    turnsUsed: number;
    reason?: string;
    stageName?: string;
  }): void {
    track(EVENT_NAMES.LEVEL_FAIL, {
      level_id: stageLevelId(stageId),
      level_name: stageId,
      stage_name: params.stageName || '',
      duration_ms: Math.max(0, Math.floor(params.durationMs)),
      turns_used: Math.max(0, Math.floor(params.turnsUsed)),
      reason: params.reason || 'defeat',
    });
  },

  // ── 留存玩法（日循环 / 长线内容）──

  /** 每日签到；day = 七日循环内第几天，streak = 连签天数 */
  trackCheckinSign(params: { day: number; streak: number; totalDays: number }): void {
    track(EVENT_NAMES.CHECKIN_SIGN, {
      day: Math.max(0, Math.floor(params.day)),
      streak: Math.max(0, Math.floor(params.streak)),
      total_days: Math.max(0, Math.floor(params.totalDays)),
    });
  },

  /** 单条日常任务领奖（含全清奖励，quest_id = dq_all_clear） */
  trackDailyQuestClaim(questId: string, params: { questName?: string; reward?: string } = {}): void {
    track(EVENT_NAMES.DAILY_QUEST_CLAIM, {
      quest_id: questId,
      quest_name: params.questName || '',
      reward: params.reward || '',
    });
  },

  /** 召唤抽取（单抽 / 十连） */
  trackFountainDraw(params: {
    drawType: 'single' | 'ten';
    cost: number;
    element?: string;
    highRarityCount?: number;
  }): void {
    track(EVENT_NAMES.FOUNTAIN_DRAW, {
      draw_type: params.drawType,
      cost: Math.max(0, Math.floor(params.cost)),
      element: params.element || 'all',
      high_rarity_count: Math.max(0, Math.floor(params.highRarityCount ?? 0)),
    });
  },

  /** 激励视频曝光；scene 必须稳定，便于按广告位聚合 */
  trackAdShow(scene: string, extra: AnalyticsParams = {}): void {
    track(EVENT_NAMES.AD_SHOW, { scene, ad_type: 'reward', ...extra });
  },

  /**
   * 激励视频关闭。completed 区分「看完发奖」与「中途退出」——
   * 只报曝光会让完播率无从计算，而完播率是激励位值不值得留的唯一判据。
   */
  trackAdClose(scene: string, completed: boolean, extra: AnalyticsParams = {}): void {
    track(EVENT_NAMES.AD_CLOSE, { scene, ad_type: 'reward', completed, ...extra });
  },

  /** 内购发起（IAP 未开启时不会触发，桩先落地保证开付费当天就有数） */
  trackPurchaseInitiate(skuId: string, priceFen: number): void {
    track(EVENT_NAMES.PURCHASE_INITIATE, { sku_id: skuId, price_fen: Math.floor(priceFen) });
  },

  trackPurchaseComplete(skuId: string, priceFen: number): void {
    track(EVENT_NAMES.PURCHASE_COMPLETE, { sku_id: skuId, price_fen: Math.floor(priceFen) });
  },

  trackPurchaseFail(skuId: string, reason: string): void {
    track(EVENT_NAMES.PURCHASE_FAIL, { sku_id: skuId, reason: reason.slice(0, 120) });
  },
};

function mapPlatform(): PlatformName {
  if (Platform.name === 'douyin') return 'douyin';
  if (Platform.name === 'wechat') return 'wechat';
  return Platform.isMinigame ? 'unknown' : 'h5';
}

function buildDeviceInfo(): DeviceInfo {
  const sys = Platform.getSystemInfoSync();
  return {
    brand: String(sys.brand || ''),
    model: String(sys.model || ''),
    system: String(sys.system || sys.platform || ''),
    sdkVersion: String(sys.SDKVersion || sys.sdkVersion || ''),
    screenWidth: Number(sys.screenWidth) || 0,
    screenHeight: Number(sys.screenHeight) || 0,
    network: 'unknown',
  };
}
