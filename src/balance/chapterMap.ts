/**
 * 章节路径地图 — 背景图路径折线 + 弧长等距插值放关卡节点
 */
import type { StageDef } from './stages';
import { nextMainlineStage, STAGES } from './stages';

/** 背景设计稿尺寸（9:16） */
export const CHAPTER_MAP_DESIGN = {
  width: 750,
  height: 1334,
} as const;

/**
 * 路径中心线（归一化 0~1，起点=第 1 关，终点=最后一关）
 * 对齐 title_screen.jpg + GM 标定的 8 关点（无 bundled 时的插值兜底）
 */
export const CHAPTER_MAP_PATH = [
  { x: 0.5884, y: 0.7816 },
  { x: 0.4193, y: 0.7027 },
  { x: 0.5403, y: 0.6153 },
  { x: 0.694, y: 0.544 },
  { x: 0.5192, y: 0.4965 },
  { x: 0.404, y: 0.4349 },
  { x: 0.669, y: 0.3669 },
  { x: 0.7478, y: 0.2632 },
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

export interface HomeDisplay {
  chapter: number;
  /** 地图高亮关；整章已通且只是在浏览时为 null */
  stageId: string | null;
}

/**
 * 上次选中的关若已通关，只在同一章内走到下一关未通关。
 * 不跨章：回主页必须停在刚才点的那一章，不能被全局进度章抢走。
 */
export function walkHomeStage(
  stageId: string,
  starsOf: (id: string) => number,
  isUnlocked: (s: StageDef) => boolean,
  stayInChapter?: number,
): StageDef | undefined {
  const start = STAGES.find((s) => s.id === stageId);
  if (!start) return undefined;
  const chapter = stayInChapter ?? start.chapter;
  if (start.chapter !== chapter) return undefined;
  let cur: StageDef = start;
  const seen = new Set<string>();
  while (!seen.has(cur.id)) {
    seen.add(cur.id);
    if (starsOf(cur.id) === 0) return cur;
    const next = nextMainlineStage(cur.id);
    if (!next || next.chapter !== chapter || !isUnlocked(next)) return cur;
    cur = next;
  }
  return cur;
}

function firstOpenStageId(
  chapter: number,
  stagesOfChapter: (ch: number) => readonly StageDef[],
  starsOf: (id: string) => number,
  isUnlocked: (s: StageDef) => boolean,
): string | null {
  const idx = chapterMapProgressIndex(stagesOfChapter(chapter), starsOf, isUnlocked);
  if (idx == null) return null;
  return stagesOfChapter(chapter)[idx]?.id ?? null;
}

/**
 * 主页落点：章永远跟「刚才点的那一章」。
 * 编队返回、战斗返回、结算返回主页都走这里，不允许跳到全局进度章。
 * 选过关且已打过 → 只在该章内高亮下一关；整章已通则停在该章、不高亮进度点。
 */
export function resolveHomeDisplay(opts: {
  preferred?: number;
  rememberedChapter: number;
  rememberedStageId: string;
  latestUnlocked: number;
  chapters: readonly number[];
  isChapterUnlocked: (ch: number) => boolean;
  stagesOfChapter: (ch: number) => readonly StageDef[];
  starsOf: (id: string) => number;
  isUnlocked: (s: StageDef) => boolean;
}): HomeDisplay {
  const {
    preferred, rememberedChapter, rememberedStageId, latestUnlocked, chapters,
    isChapterUnlocked, stagesOfChapter, starsOf, isUnlocked,
  } = opts;

  const ofChapter = (ch: number): HomeDisplay => ({
    chapter: ch,
    stageId: firstOpenStageId(ch, stagesOfChapter, starsOf, isUnlocked),
  });

  const chapter = (typeof preferred === 'number' && chapters.includes(preferred)
    && isChapterUnlocked(preferred))
    ? preferred
    : (rememberedChapter > 0 && isChapterUnlocked(rememberedChapter)
      ? rememberedChapter
      : latestUnlocked);

  if (rememberedStageId) {
    const cursor = walkHomeStage(rememberedStageId, starsOf, isUnlocked, chapter);
    if (cursor && cursor.chapter === chapter) {
      if (starsOf(cursor.id) === 0) {
        return { chapter, stageId: cursor.id };
      }
      // 章内已无下一关（整章打完）：停在该章，不要跨到进度章
    }
  }

  return ofChapter(chapter);
}

/** @deprecated 仅返回章号；新代码用 resolveHomeDisplay */
export function resolveHomeDisplayChapter(opts: {
  preferred?: number;
  remembered: number;
  rememberedStageId?: string;
  latestUnlocked: number;
  chapters: readonly number[];
  isChapterUnlocked: (ch: number) => boolean;
  stagesOfChapter: (ch: number) => readonly StageDef[];
  starsOf: (id: string) => number;
  isUnlocked: (s: StageDef) => boolean;
}): number {
  return resolveHomeDisplay({
    ...opts,
    rememberedChapter: opts.remembered,
    rememberedStageId: opts.rememberedStageId ?? '',
  }).chapter;
}

export function chapterMapActiveIndex(
  stages: readonly StageDef[],
  starsOf: (id: string) => number,
  isUnlocked: (s: StageDef) => boolean,
): number {
  return chapterMapProgressIndex(stages, starsOf, isUnlocked) ?? -1;
}
