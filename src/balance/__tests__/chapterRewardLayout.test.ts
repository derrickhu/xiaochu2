import { describe, expect, it } from 'vitest';
import { stagesOfChapter } from '@/balance/stages';
import { chapterClearProgress } from '@/balance/chapterGoal';
import {
  CHAPTER_REWARD_SCROLL,
  chapterRewardChromeBottom,
  chapterRewardContentLayout,
  chapterRewardScrollRect,
  chapterRewardScrollSize,
  contentFitsPaper,
} from '@/balance/chapterRewardLayout';

describe('chapterClearProgress', () => {
  const ch1 = stagesOfChapter(1);

  it('全未通是 0/8', () => {
    expect(chapterClearProgress(ch1, () => 0)).toEqual({ cleared: 0, total: 8 });
  });

  it('前 3 关有星是 3/8', () => {
    const cleared = new Set(ch1.filter((s) => s.index <= 3).map((s) => s.id));
    expect(chapterClearProgress(ch1, (id) => (cleared.has(id) ? 3 : 0)))
      .toEqual({ cleared: 3, total: 8 });
  });

  it('全通是 8/8', () => {
    expect(chapterClearProgress(ch1, () => 1)).toEqual({ cleared: 8, total: 8 });
  });
});

describe('chapterRewardScrollRect 避让仙庭', () => {
  const plaqueY = 80;
  const screenW = 750;

  it('右缘不超过仙庭安全线', () => {
    const r = chapterRewardScrollRect(screenW, plaqueY);
    expect(r.right).toBeLessThanOrEqual(screenW * CHAPTER_REWARD_SCROLL.pavilionSafeRightRatio + 0.01);
  });

  it('左缘躲开左栏', () => {
    const r = chapterRewardScrollRect(screenW, plaqueY);
    expect(r.left).toBeGreaterThanOrEqual(CHAPTER_REWARD_SCROLL.leftMin);
  });

  it('落在章匾下方且不超高', () => {
    const r = chapterRewardScrollRect(screenW, plaqueY);
    const { height } = chapterRewardScrollSize();
    expect(r.height).toBe(height);
    expect(r.top).toBeGreaterThan(plaqueY + CHAPTER_REWARD_SCROLL.plaqueHalf);
    expect(r.bottom).toBeLessThan(plaqueY + 280);
  });

  it('chromeBottom 低于卷轴底', () => {
    const r = chapterRewardScrollRect(screenW, plaqueY);
    expect(chapterRewardChromeBottom(screenW, plaqueY)).toBe(r.bottom + CHAPTER_REWARD_SCROLL.chromePad);
  });

  it('奖励图标和灵宠都在宣纸内，不会掉到匾外', () => {
    const { width, height } = chapterRewardScrollSize();
    const inner = chapterRewardContentLayout(width, height);
    expect(contentFitsPaper(inner)).toBe(true);
    expect(inner.slots).toHaveLength(3);
    expect(inner.pet.labelY).toBeLessThanOrEqual(inner.paper.bottom);
  });

  it('匾更高，奖励图标显眼，经验和灵宠不重叠', () => {
    const { width, height } = chapterRewardScrollSize();
    expect(width).toBeGreaterThan(420);
    expect(width).toBeLessThan(470);
    expect(height).toBeGreaterThan(210);
    const inner = chapterRewardContentLayout(width, height);
    expect(inner.slots[0].icon).toBeGreaterThan(50);
    expect(inner.pet.bust).toBeGreaterThan(70);
    const last = inner.slots[2];
    const lastRight = last.x + last.pedW / 2;
    const petLeft = inner.pet.x - inner.pet.ringW / 2;
    expect(petLeft).toBeGreaterThan(lastRight + 8);
  });
});
