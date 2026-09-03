import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    Platform: {
      getStorageSync: (key: string) => hoisted.store.get(key) ?? null,
      setStorageSync: (key: string, value: string) => { hoisted.store.set(key, value); },
      removeStorageSync: (key: string) => { hoisted.store.delete(key); },
    },
  };
});

vi.mock('@/core/PlatformService', () => ({
  Platform: hoisted.Platform,
  detectMinigamePlatform: () => 'unknown' as const,
}));

import { CLOUD_SYNC_META_KEY, LEGACY_SAVE_KEY, SAVE_KEY } from '@/config/CloudConfig';
import { PersistService } from '@/core/PersistService';

describe('PersistService.clearLocalForAccountSwitch', () => {
  beforeEach(() => {
    hoisted.store.clear();
  });

  it('清掉存档和云同步基线，且不标 dirty', () => {
    PersistService.writeRaw(SAVE_KEY, '{"lv":12}', { markDirty: false });
    hoisted.Platform.setStorageSync(LEGACY_SAVE_KEY, '{"old":1}');
    PersistService.touchCloudMeta(123);

    const dirty: string[][] = [];
    const off = PersistService.subscribe((keys) => dirty.push(keys));
    PersistService.clearLocalForAccountSwitch();
    off();

    expect(PersistService.readRaw(SAVE_KEY)).toBeNull();
    expect(hoisted.store.get(LEGACY_SAVE_KEY)).toBeUndefined();
    expect(PersistService.hasAnyLocalCloudData()).toBe(false);
    expect(PersistService.isCloudDirty()).toBe(false);
    expect(PersistService.getCloudSyncMeta()).toEqual({
      updatedAt: 0,
      dirty: false,
      lastSyncAt: 0,
      remoteUpdatedAt: 0,
    });
    expect(dirty).toEqual([]);
    expect(hoisted.store.get(CLOUD_SYNC_META_KEY)).toBeTruthy();
  });
});
