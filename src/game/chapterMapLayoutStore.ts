/**
 * 主界面章节地图 — GM 手动调整的关卡节点布局（按关卡数量存储，同关数复用）
 */
import { CHAPTER_MAP_BUNDLED_BY_COUNT } from '@/balance/chapterMapBundledLayouts';
import { Platform } from '@/core/PlatformService';
import type { MapPoint } from '@/balance/chapterMap';

const STORAGE_KEY = 'xiaochu2_chapter_map_layouts';

interface StoreData {
  v: 1;
  byCount: Record<string, MapPoint[]>;
}

function emptyStore(): StoreData {
  return { v: 1, byCount: {} };
}

function normalizeLegacy(raw: unknown): StoreData {
  if (!raw) return emptyStore();
  try {
    const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
    if (data?.v === 1 && typeof data.byCount === 'object' && data.byCount) {
      return { v: 1, byCount: data.byCount as Record<string, MapPoint[]> };
    }
    // 兼容 v2 byChapter：按数组长度合并进 byCount
    const byCount: Record<string, MapPoint[]> = {};
    const legacyByCount = data.byCount as Record<string, MapPoint[]> | undefined;
    if (legacyByCount) Object.assign(byCount, legacyByCount);
    const byChapter = data.byChapter as Record<string, MapPoint[]> | undefined;
    if (byChapter) {
      for (const pts of Object.values(byChapter)) {
        if (pts?.length) byCount[String(pts.length)] = pts;
      }
    }
    if (Object.keys(byCount).length) return { v: 1, byCount };
  } catch {
    /* ignore */
  }
  return emptyStore();
}

function loadStore(): StoreData {
  try {
    return normalizeLegacy(Platform.getStorageSync(STORAGE_KEY));
  } catch {
    return emptyStore();
  }
}

function persistStore(data: StoreData): boolean {
  try {
    Platform.setStorageSync(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('[ChapterMapLayoutStore] 写入 storage 失败', e);
    return false;
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function clonePoints(points: readonly MapPoint[]): MapPoint[] {
  return points.map((p) => ({ x: p.x, y: p.y }));
}

function matchLength(points: readonly MapPoint[] | undefined, stageCount: number): MapPoint[] | null {
  if (!points || points.length !== stageCount) return null;
  return clonePoints(points);
}

function formatBundledSnippet(stageCount: number, points: readonly MapPoint[]): string {
  const lines = points.map((p) => `    { x: ${p.x}, y: ${p.y} },`);
  return [
    '// 粘贴到 src/balance/chapterMapBundledLayouts.ts',
    `${stageCount}: [`,
    ...lines,
    '  ],',
  ].join('\n');
}

export const ChapterMapLayoutStore = {
  /** 读取归一化坐标：storage（GM 即时生效）→ bundled（真机默认）→ null */
  getNormalized(stageCount: number): MapPoint[] | null {
    if (stageCount <= 0) return null;

    const store = loadStore();
    const saved = matchLength(store.byCount[String(stageCount)], stageCount);
    if (saved) return saved;

    return matchLength(CHAPTER_MAP_BUNDLED_BY_COUNT[stageCount], stageCount);
  },

  /** 按关卡数量保存（同关数各章复用） */
  saveByCount(
    stageCount: number,
    points: readonly MapPoint[],
  ): { ok: boolean; bundledSnippet: string; message: string } {
    if (stageCount <= 0 || points.length !== stageCount) {
      return { ok: false, bundledSnippet: '', message: '保存失败：坐标数量不匹配' };
    }
    const normalized = points.map((p) => ({ x: round4(p.x), y: round4(p.y) }));
    const data = loadStore();
    data.byCount[String(stageCount)] = normalized;
    const ok = persistStore(data);
    const bundledSnippet = formatBundledSnippet(stageCount, normalized);

    const verify = ok ? matchLength(loadStore().byCount[String(stageCount)], stageCount) : null;
    if (!ok) {
      return { ok: false, bundledSnippet, message: '保存失败：storage 写入异常' };
    }
    if (!verify) {
      return { ok: false, bundledSnippet, message: '保存失败：回读校验未通过' };
    }

    console.log('[ChapterMapLayoutStore] 已保存', stageCount, '关布局\n', bundledSnippet);
    return {
      ok: true,
      bundledSnippet,
      message: Platform.isDevtools
        ? `${stageCount}关布局已存本地（同关数章节共用，立即生效）。满意后请导出写入 bundled 再构建上传真机`
        : `${stageCount}关布局已保存`,
    };
  },

  clearByCount(stageCount: number): void {
    const data = loadStore();
    delete data.byCount[String(stageCount)];
    persistStore(data);
  },

  clearAll(): void {
    persistStore(emptyStore());
  },

  listSavedCounts(): number[] {
    const store = loadStore();
    return Object.keys(store.byCount)
      .map(Number)
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
  },

  exportJson(): string {
    return JSON.stringify(loadStore(), null, 2);
  },

  exportBundledTs(): string {
    const merged: Record<number, MapPoint[]> = {};
    for (const [k, pts] of Object.entries(CHAPTER_MAP_BUNDLED_BY_COUNT)) {
      merged[Number(k)] = clonePoints(pts);
    }
    for (const [k, pts] of Object.entries(loadStore().byCount)) {
      merged[Number(k)] = clonePoints(pts);
    }
    const keys = Object.keys(merged).map(Number).sort((a, b) => a - b);
    if (!keys.length) {
      return 'export const CHAPTER_MAP_BUNDLED_BY_COUNT = {};';
    }
    const parts: string[] = ['export const CHAPTER_MAP_BUNDLED_BY_COUNT = {'];
    for (const count of keys) {
      parts.push(`  ${count}: [`);
      for (const p of merged[count]) parts.push(`    { x: ${p.x}, y: ${p.y} },`);
      parts.push('  ],');
    }
    parts.push('};');
    return parts.join('\n');
  },

  /** 合并为一条控制台输出（JSON + bundled TS） */
  exportReport(): string {
    const counts = this.listSavedCounts();
    const json = this.exportJson();
    const ts = this.exportBundledTs();
    return [
      '========== 关卡地图布局导出 ==========',
      counts.length ? `关数: ${counts.join(' / ')}` : '关数: （暂无 GM 保存，仅 bundled 默认）',
      '',
      '--- storage JSON ---',
      json,
      '',
      '--- 粘贴到 src/balance/chapterMapBundledLayouts.ts ---',
      ts,
      '========================================',
    ].join('\n');
  },
};
