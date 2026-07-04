/**
 * 章节路径地图 — 背景图路径折线 + 弧长等距插值放关卡节点
 */
import type { StageDef } from './stages';
import { STAGES } from './stages';

/** 背景设计稿尺寸（9:16） */
export const CHAPTER_MAP_DESIGN = {
  width: 750,
  height: 1334,
} as const;

/**
 * 路径中心线（归一化 0~1，起点=第 1 关，终点=最后一关）
 * 对齐 title_screen.jpg — Q版 S 形石径，左下起点 → 右上终点
 */
export const CHAPTER_MAP_PATH = [
  { x: 0.210, y: 0.885 },
  { x: 0.300, y: 0.825 },
  { x: 0.400, y: 0.760 },
  { x: 0.510, y: 0.700 },
  { x: 0.560, y: 0.655 },
  { x: 0.480, y: 0.605 },
  { x: 0.360, y: 0.555 },
  { x: 0.260, y: 0.490 },
  { x: 0.340, y: 0.420 },
  { x: 0.470, y: 0.360 },
  { x: 0.600, y: 0.300 },
  { x: 0.680, y: 0.265 },
] as const;

/** @deprecated 兼容旧名，等同 CHAPTER_MAP_PATH */
export const CHAPTER_MAP_PAGE_POINTS = CHAPTER_MAP_PATH;

export type MapPoint = { x: number; y: number };

/** 9:16 设计稿 cover 铺满视口（等高填满，两侧可裁切，避免顶栏露底色） */
export function chapterMapDesignFit(
  viewportW: number,
  viewportH: number,
): { scale: number; offsetX: number; offsetY: number } {
  const { width: designW, height: designH } = CHAPTER_MAP_DESIGN;
  const scale = Math.max(viewportW / designW, viewportH / designH);
  return {
    scale,
    offsetX: (viewportW - designW * scale) / 2,
    offsetY: (viewportH - designH * scale) / 2,
  };
}

/** 沿路径折线按弧长比例 t∈[0,1] 取点 */
export function sampleChapterMapPath(
  path: readonly MapPoint[],
  t: number,
): MapPoint {
  if (path.length === 0) return { x: 0, y: 0 };
  if (path.length === 1 || t <= 0) return { ...path[0] };
  if (t >= 1) return { ...path[path.length - 1] };

  const segLens: number[] = [];
  for (let i = 1; i < path.length; i++) {
    segLens.push(Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  }
  const total = segLens.reduce((a, b) => a + b, 0);
  if (total <= 0) return { ...path[0] };

  let target = t * total;
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i] || i === segLens.length - 1) {
      const segT = segLens[i] > 0 ? target / segLens[i] : 0;
      const a = path[i];
      const b = path[i + 1];
      return {
        x: a.x + (b.x - a.x) * segT,
        y: a.y + (b.y - a.y) * segT,
      };
    }
    target -= segLens[i];
  }
  return { ...path[path.length - 1] };
}

/** 按关卡数沿路径起点→终点弧长等距取点 */
export function chapterMapNodePointsNormalized(stageCount: number): MapPoint[] {
  const path = CHAPTER_MAP_PATH;
  if (stageCount <= 0) return [];
  if (stageCount === 1) return [{ ...path[0] }];
  const out: MapPoint[] = [];
  for (let i = 0; i < stageCount; i++) {
    const t = i / (stageCount - 1);
    out.push(sampleChapterMapPath(path, t));
  }
  return out;
}

/** 归一化坐标 → 设计稿像素坐标（750×1334） */
export function chapterMapNodePositions(
  stageCount: number,
  mapW: number = CHAPTER_MAP_DESIGN.width,
  mapH: number = CHAPTER_MAP_DESIGN.height,
): MapPoint[] {
  return chapterMapNodePointsNormalized(stageCount).map((p) => ({
    x: p.x * mapW,
    y: p.y * mapH,
  }));
}

/** 章节内下一关待挑战索引；整章已通返回 null */
export function chapterMapProgressIndex(
  stages: readonly StageDef[],
  starsOf: (id: string) => number,
  isUnlocked: (s: StageDef) => boolean,
): number | null {
  for (let i = 0; i < stages.length; i++) {
    if (!isUnlocked(stages[i])) return Math.max(0, i - 1);
    if (starsOf(stages[i].id) === 0) return i;
  }
  return null;
}

/** 全局进度所在章节（首个已解锁但未通关的关）；全部通关返回 null */
export function playerProgressChapter(
  starsOf: (id: string) => number,
  isUnlocked: (s: StageDef) => boolean,
): number | null {
  for (const stage of STAGES) {
    if (isUnlocked(stage) && starsOf(stage.id) === 0) return stage.chapter;
  }
  return null;
}

export function chapterMapActiveIndex(
  stages: readonly StageDef[],
  starsOf: (id: string) => number,
  isUnlocked: (s: StageDef) => boolean,
): number {
  return chapterMapProgressIndex(stages, starsOf, isUnlocked) ?? -1;
}
