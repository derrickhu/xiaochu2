import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ChapterMapLayoutStore } from '../chapterMapLayoutStore';

const storage: Record<string, string> = {};

vi.mock('@/core/PlatformService', () => ({
  Platform: {
    getStorageSync: (k: string) => storage[k] ?? '',
    setStorageSync: (k: string, v: string) => { storage[k] = v; },
    isDevtools: true,
  },
}));

describe('ChapterMapLayoutStore', () => {
  beforeEach(() => {
    for (const k of Object.keys(storage)) delete storage[k];
    ChapterMapLayoutStore.clearAll();
  });

  it('按关卡数保存并读取', () => {
    const custom = [
      { x: 0.1, y: 0.9 },
      { x: 0.2, y: 0.8 },
      { x: 0.3, y: 0.7 },
    ];
    const result = ChapterMapLayoutStore.saveByCount(3, custom);
    expect(result.ok).toBe(true);
    expect(ChapterMapLayoutStore.getNormalized(3)).toEqual(custom);
  });

  it('同关数复用，不同关数互不影响', () => {
    ChapterMapLayoutStore.saveByCount(6, [
      { x: 0.1, y: 0.2 },
      { x: 0.3, y: 0.4 },
      { x: 0.5, y: 0.6 },
      { x: 0.7, y: 0.8 },
      { x: 0.2, y: 0.3 },
      { x: 0.4, y: 0.5 },
    ]);
    expect(ChapterMapLayoutStore.getNormalized(6)?.length).toBe(6);
    // 未保存且无 bundled 的关数 → null；运营默认仅打包 8 关布局
    expect(ChapterMapLayoutStore.getNormalized(5)).toBeNull();
    expect(ChapterMapLayoutStore.getNormalized(8)?.length).toBe(8);
  });

  it('clearByCount 后无记录', () => {
    ChapterMapLayoutStore.saveByCount(2, [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }]);
    ChapterMapLayoutStore.clearByCount(2);
    expect(ChapterMapLayoutStore.getNormalized(2)).toBeNull();
  });

  it('兼容 v2 byChapter 迁移为 byCount', () => {
    storage.xiaochu2_chapter_map_layouts = JSON.stringify({
      v: 2,
      byChapter: {
        '2': [
          { x: 0.11, y: 0.22 },
          { x: 0.33, y: 0.44 },
          { x: 0.55, y: 0.66 },
          { x: 0.77, y: 0.88 },
          { x: 0.12, y: 0.34 },
          { x: 0.56, y: 0.78 },
        ],
      },
    });
    const pts = ChapterMapLayoutStore.getNormalized(6);
    expect(pts?.length).toBe(6);
    expect(pts?.[0]).toEqual({ x: 0.11, y: 0.22 });
  });

  it('storage 优先于 bundled', () => {
    const custom = [
      { x: 0.99, y: 0.11 },
      { x: 0.88, y: 0.22 },
      { x: 0.77, y: 0.33 },
      { x: 0.66, y: 0.44 },
      { x: 0.55, y: 0.55 },
    ];
    ChapterMapLayoutStore.saveByCount(5, custom);
    expect(ChapterMapLayoutStore.getNormalized(5)).toEqual(custom);
  });

  it('listSavedCounts 与 exportBundledTs', () => {
    ChapterMapLayoutStore.saveByCount(5, [
      { x: 0.1, y: 0.2 },
      { x: 0.3, y: 0.4 },
      { x: 0.5, y: 0.6 },
      { x: 0.7, y: 0.8 },
      { x: 0.2, y: 0.3 },
    ]);
    expect(ChapterMapLayoutStore.listSavedCounts()).toEqual([5]);
    expect(ChapterMapLayoutStore.exportBundledTs()).toContain('5: [');
  });
});
