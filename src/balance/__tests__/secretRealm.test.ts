import { describe, expect, it } from 'vitest';
import { MAIN_CHAPTER_COUNT } from '@/balance/stages';
import {
  REALM_TIERS,
  SECRET_REALM,
  resolveRealmTier,
  realmTierUnlockHint,
} from '@/balance/secretRealm';

describe('resolveRealmTier', () => {
  it('初/中阶不随通关章变化', () => {
    const low = resolveRealmTier(1, 16);
    expect(low.scaleChapter).toBe(2);
    expect(low.lingyu).toBe(10);

    const mid = resolveRealmTier(2, 16);
    expect(mid.scaleChapter).toBe(5);
    expect(mid.lingyu).toBe(16);
  });

  it('高阶刚解锁时锚定 highScaleMin', () => {
    const t = resolveRealmTier(3, 5);
    expect(t.scaleChapter).toBe(SECRET_REALM.highScaleMin);
    expect(t.lingyu).toBe(24);
    expect(t.coins).toBe(520);
  });

  it('高阶随 clearedChapters 抬到最终章', () => {
    const mid = resolveRealmTier(3, 12);
    expect(mid.scaleChapter).toBe(12);
    expect(mid.lingyu).toBeGreaterThan(24);
    expect(mid.lingyu).toBeLessThan(SECRET_REALM.highScaleMaxReward.lingyu);

    const max = resolveRealmTier(3, 99);
    expect(max.scaleChapter).toBe(MAIN_CHAPTER_COUNT);
    expect(max.lingyu).toBe(SECRET_REALM.highScaleMaxReward.lingyu);
    expect(max.coins).toBe(SECRET_REALM.highScaleMaxReward.coins);
  });

  it('解锁提示带章节门槛', () => {
    const high = REALM_TIERS.find((t) => t.tier === 3)!;
    expect(realmTierUnlockHint(high)).toContain('第6章');
    expect(realmTierUnlockHint(high)).toContain('高阶');
  });
});
