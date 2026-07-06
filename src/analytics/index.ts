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

import { ANALYTICS_ENDPOINT, GAME_KEY } from '@/config/CloudConfig';
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

  Analytics.init({
    endpoint: opts?.endpoint || ANALYTICS_ENDPOINT,
    gameKey: GAME_KEY,
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
  console.log(`[analytics] init gameKey=${GAME_KEY} platform=${mapPlatform()}`);
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
