import { describe, expect, it } from 'vitest';
import {
  CHAPTER_MAP_DESIGN,
  CHAPTER_MAP_PATH,
  chapterMapActiveIndex,
  chapterMapProgressIndex,
  playerProgressChapter,
  chapterMapDesignFit,
  chapterMapNodePointsNormalized,
  chapterMapNodePositions,
  sampleChapterMapPath,
} from '../chapterMap';
import { STAGES } from '../stages';

describe('chapterMap', () => {
  it('路径折线与 8 关标定点数一致', () => {
    expect(CHAPTER_MAP_PATH).toHaveLength(8);
  });

  it('节点数与关卡数一致', () => {
    expect(chapterMapNodePointsNormalized(5)).toHaveLength(5);
    expect(chapterMapNodePointsNormalized(8)).toHaveLength(8);
  });

  it('弧长等距：首关=路径起点，末关=路径终点', () => {
    const five = chapterMapNodePointsNormalized(5);
    expect(five[0]).toEqual({ ...CHAPTER_MAP_PATH[0] });
    expect(five[4].x).toBeCloseTo(CHAPTER_MAP_PATH[CHAPTER_MAP_PATH.length - 1].x, 3);
    expect(five[4].y).toBeCloseTo(CHAPTER_MAP_PATH[CHAPTER_MAP_PATH.length - 1].y, 3);
  });

  it('不同关卡数均沿同一条路径插值', () => {
    const t05 = sampleChapterMapPath(CHAPTER_MAP_PATH, 0.5);
    const mid5 = chapterMapNodePointsNormalized(5)[2];
    expect(mid5.x).toBeCloseTo(t05.x, 3);
    expect(mid5.y).toBeCloseTo(t05.y, 3);
  });

  it('sampleChapterMapPath 端点正确', () => {
    expect(sampleChapterMapPath(CHAPTER_MAP_PATH, 0)).toEqual({ ...CHAPTER_MAP_PATH[0] });
    expect(sampleChapterMapPath(CHAPTER_MAP_PATH, 1)).toEqual({
      ...CHAPTER_MAP_PATH[CHAPTER_MAP_PATH.length - 1],
    });
  });

  it('像素坐标基于 750×1334 设计稿', () => {
    const pts = chapterMapNodePositions(5);
    expect(pts[0].x).toBeCloseTo(CHAPTER_MAP_PATH[0].x * CHAPTER_MAP_DESIGN.width, 0);
    expect(pts[0].y).toBeCloseTo(CHAPTER_MAP_PATH[0].y * CHAPTER_MAP_DESIGN.height, 0);
  });

  it('cover 铺满时纵向无留白', () => {
    const tallH = Math.round((CHAPTER_MAP_DESIGN.height / CHAPTER_MAP_DESIGN.width) * 750 * 1.2);
    const fit = chapterMapDesignFit(750, tallH);
    expect(fit.offsetY).toBeCloseTo(0, 5);
    expect(CHAPTER_MAP_DESIGN.height * fit.scale).toBeGreaterThanOrEqual(tallH - 1);
  });

  it('activeIndex 指向首个未通关；整章已通为 -1', () => {
    const ch1 = STAGES.filter((s) => s.chapter === 1);
    expect(chapterMapActiveIndex(ch1, () => 0, () => true)).toBe(0);
    expect(chapterMapActiveIndex(ch1, () => 3, () => true)).toBe(-1);
    expect(chapterMapProgressIndex(ch1, () => 3, () => true)).toBeNull();
  });

  it('playerProgressChapter 指向全局下一关所在章', () => {
    const ch1 = STAGES.filter((s) => s.chapter === 1);
    const ch1Ids = new Set(ch1.map((s) => s.id));
    const ch2First = STAGES.find((s) => s.chapter === 2 && s.index === 1)!;
    expect(playerProgressChapter(
      (id) => (ch1Ids.has(id) ? 3 : 0),
      (s) => ch1Ids.has(s.id) || s.id === ch2First.id,
    )).toBe(2);
  });
});
