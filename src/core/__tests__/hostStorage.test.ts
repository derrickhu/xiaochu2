import { describe, expect, it } from 'vitest';
import { readHostStorage, removeHostStorage, writeHostStorage, type HostLocalStorage } from '../hostStorage';

function memoryLs(): HostLocalStorage & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value); },
    removeItem: (key) => { store.delete(key); },
  };
}

describe('hostStorage', () => {
  it('微信风格 (key, value) 能读写', () => {
    const store = new Map<string, string>();
    const api = {
      getStorageSync: (key: string) => store.get(key) ?? '',
      setStorageSync: (key: string, value: string) => { store.set(key, value); },
      removeStorageSync: (key: string) => { store.delete(key); },
    };
    writeHostStorage(api, 'k', 'v', null);
    expect(readHostStorage(api, 'k', null)).toBe('v');
    removeHostStorage(api, 'k', null);
    expect(readHostStorage(api, 'k', null)).toBeNull();
  });

  it('华为 qg 风格 { key, value } 能读写', () => {
    const store = new Map<string, string>();
    const api = {
      getStorageSync: (arg: { key: string }) => {
        if (typeof arg === 'string') throw new Error('qg wants object');
        return { value: store.get(arg.key) || '' };
      },
      setStorageSync: (arg: { key: string; value: string }) => {
        if (typeof arg === 'string') throw new Error('qg wants object');
        store.set(arg.key, arg.value);
      },
      deleteStorageSync: (arg: { key: string }) => { store.delete(arg.key); },
    };
    writeHostStorage(api, 'k', 'hw', null);
    expect(store.get('k')).toBe('hw');
    expect(readHostStorage(api, 'k', null)).toBe('hw');
    removeHostStorage(api, 'k', null);
    expect(readHostStorage(api, 'k', null)).toBeNull();
  });

  it('没有原生存储时退回 localStorage', () => {
    const ls = memoryLs();
    writeHostStorage({}, 'petTower_hw_save_v2', '{"lv":2}', ls);
    expect(readHostStorage({}, 'petTower_hw_save_v2', ls)).toBe('{"lv":2}');
    removeHostStorage({}, 'petTower_hw_save_v2', ls);
    expect(ls.store.has('petTower_hw_save_v2')).toBe(false);
  });
});
