import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  getPlatformScope,
  getPlatformScopeFromBackend,
  getScopedGameKey,
  getScopedGameKeyFromBackend,
  scopedStorageKey,
} from '@/config/gameKeyScope';
import { toBackendPlatformCode } from '@/core/PlatformService';

const require = createRequire(import.meta.url);
const cloudConfig = require('../../../cloudfunctions/petTower-api/lib/config.js') as {
  getPlatformScope: (platform: string) => string | null;
  getScopedGameKey: (platform: string) => string;
  getCollectionName: (suffix: string, platform: string) => string;
};

describe('gameKeyScope 渠道隔离', () => {
  it('本地存档 key 按渠道加命名空间', () => {
    expect(getScopedGameKey('wechat')).toBe('petTower');
    expect(getScopedGameKey('douyin')).toBe('petTower_tt');
    expect(getScopedGameKey('taptap')).toBe('petTower_tap');
    expect(getScopedGameKey('huawei')).toBe('petTower_hw');
    expect(scopedStorageKey('save_v2', 'huawei')).toBe('petTower_hw_save_v2');
  });

  it('后端 platform 码映射到同一套命名空间', () => {
    expect(getPlatformScope('huawei')).toBe('hw');
    expect(getPlatformScopeFromBackend('hw')).toBe('hw');
    expect(getScopedGameKeyFromBackend('hw')).toBe('petTower_hw');
    expect(getScopedGameKeyFromBackend('wx')).toBe('petTower');
    expect(getScopedGameKeyFromBackend('anon')).toBe('petTower');
  });

  it('宿主名转到后端 login 字段', () => {
    expect(toBackendPlatformCode('wechat')).toBe('wx');
    expect(toBackendPlatformCode('douyin')).toBe('dy');
    expect(toBackendPlatformCode('taptap')).toBe('tap');
    expect(toBackendPlatformCode('huawei')).toBe('hw');
    expect(toBackendPlatformCode('unknown')).toBe('anon');
  });

  it('云函数集合名与客户端命名空间对齐', () => {
    expect(cloudConfig.getPlatformScope('hw')).toBe('hw');
    expect(cloudConfig.getPlatformScope('huawei')).toBe('hw');
    expect(cloudConfig.getCollectionName('playerData', 'hw')).toBe(`${cloudConfig.getScopedGameKey('hw')}_playerData`);
    expect(cloudConfig.getCollectionName('playerData', 'wx')).toBe(`${cloudConfig.getScopedGameKey('wx')}_playerData`);
    expect(cloudConfig.getCollectionName('playerData', 'hw')).not.toBe(cloudConfig.getCollectionName('playerData', 'wx'));
  });
});
