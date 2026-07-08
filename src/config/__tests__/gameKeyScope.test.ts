import { describe, it, expect } from 'vitest';
import {
  BASE_GAME_KEY,
  getPlatformScope,
  getPlatformScopeFromBackend,
  getScopedGameKey,
  getScopedGameKeyFromBackend,
  scopedStorageKey,
} from '@/config/gameKeyScope';

describe('gameKeyScope 多平台命名', () => {
  it('微信宿主不加平台段', () => {
    expect(getPlatformScope('wechat')).toBeNull();
    expect(getScopedGameKey('wechat')).toBe('petTower');
    expect(scopedStorageKey('save_v2', 'wechat')).toBe('petTower_save_v2');
  });

  it('抖音宿主插入 _tt_', () => {
    expect(getPlatformScope('douyin')).toBe('tt');
    expect(getScopedGameKey('douyin')).toBe('petTower_tt');
    expect(scopedStorageKey('save_v2', 'douyin')).toBe('petTower_tt_save_v2');
    expect(scopedStorageKey('token', 'douyin')).toBe('petTower_tt_token');
  });

  it('后端 dy 与客户端 douyin 对齐', () => {
    expect(getPlatformScopeFromBackend('dy')).toBe('tt');
    expect(getScopedGameKeyFromBackend('dy')).toBe('petTower_tt');
    expect(getScopedGameKeyFromBackend('wx')).toBe('petTower');
    expect(getScopedGameKeyFromBackend('anon')).toBe('petTower');
  });

  it('BASE_GAME_KEY 用于 API 路由，不含平台段', () => {
    expect(BASE_GAME_KEY).toBe('petTower');
  });
});
