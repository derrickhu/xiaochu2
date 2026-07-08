/**
 * GameKey 平台命名空间 — 多平台数据隔离标准
 *
 * - 微信：petTower_{suffix}（与历史一致）
 * - 抖音：petTower_tt_{suffix}
 * - CloudBase API 路由仍用 BASE_GAME_KEY（petTower-api），集合/存档/JWT 用 SCOPED_GAME_KEY
 */
import { detectMinigamePlatform, type PlatformName } from '@/core/PlatformService';

/** 游戏根标识（CloudBase 函数名 / HTTP 前缀，不含平台段） */
export const BASE_GAME_KEY = 'petTower';

/** 非微信宿主在 GAME_KEY 与 suffix 之间插入的平台段（当前仅抖音 tt） */
export type PlatformScopeSegment = 'tt';

const PLATFORM_SCOPE: Partial<Record<PlatformName, PlatformScopeSegment>> = {
  douyin: 'tt',
};

/** 后端 platform 字段 → 命名空间（wx / dy / anon） */
export type BackendPlatformCode = 'wx' | 'dy' | 'anon';

const BACKEND_SCOPE: Partial<Record<BackendPlatformCode, PlatformScopeSegment>> = {
  dy: 'tt',
};

export function getPlatformScope(platform: PlatformName = detectMinigamePlatform()): PlatformScopeSegment | null {
  return PLATFORM_SCOPE[platform] ?? null;
}

export function getPlatformScopeFromBackend(platform: string): PlatformScopeSegment | null {
  const code = String(platform || '').toLowerCase() as BackendPlatformCode;
  return BACKEND_SCOPE[code] ?? null;
}

/** 存档 / 集合 / JWT gameKey 使用的命名空间 */
export function getScopedGameKey(platform: PlatformName = detectMinigamePlatform()): string {
  const scope = getPlatformScope(platform);
  return scope ? `${BASE_GAME_KEY}_${scope}` : BASE_GAME_KEY;
}

export function getScopedGameKeyFromBackend(platform: string): string {
  const scope = getPlatformScopeFromBackend(platform);
  return scope ? `${BASE_GAME_KEY}_${scope}` : BASE_GAME_KEY;
}

/** petTower_save_v2 / petTower_tt_save_v2 */
export function scopedStorageKey(suffix: string, platform: PlatformName = detectMinigamePlatform()): string {
  return `${getScopedGameKey(platform)}_${suffix}`;
}
