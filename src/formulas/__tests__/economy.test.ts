import { describe, it, expect } from 'vitest';
import { stageCoinReward, recruitPrice, starUpShardCost } from '../economyOutput';
import { STAGES } from '@/balance/stages';

describe('stageCoinReward', () => {
  it('第 1 章 0 星基础产出', () => {
    expect(stageCoinReward(1, 0)).toBe(30);
  });

  it('三星加成 +60%', () => {
    expect(stageCoinReward(1, 3)).toBe(48);
  });

  it('Boss 关 ×2', () => {
    expect(stageCoinReward(1, 0, true)).toBe(60);
  });

  it('章节产出递增', () => {
    expect(stageCoinReward(3, 0)).toBeGreaterThan(stageCoinReward(1, 0));
  });
});

describe('recruitPrice', () => {
  it('首只定价 100', () => {
    expect(recruitPrice(0)).toBe(100);
  });

  it('定价单调递增', () => {
    expect(recruitPrice(3)).toBeGreaterThan(recruitPrice(1));
  });

  it('定价封顶', () => {
    expect(recruitPrice(100)).toBe(100 * 50);
  });
});

describe('starUpShardCost', () => {
  it('1★→2★ 消耗 20 碎片', () => {
    expect(starUpShardCost(1)).toBe(20);
  });

  it('5★ 已满不可升', () => {
    expect(starUpShardCost(5)).toBeNull();
  });
});

describe('产出/消耗平衡约束', () => {
  it('第一章全三星通关总产出 ≥ 前 2 只招募定价（保证首日能招到第 2~3 只）', () => {
    const totalOutput = STAGES
      .filter((s) => s.chapter === 1)
      .reduce((sum, s) => sum + stageCoinReward(s.chapter, 3, s.isBoss), 0);
    const firstTwoPrices = recruitPrice(0) + recruitPrice(1);
    expect(totalOutput).toBeGreaterThanOrEqual(firstTwoPrices);
  });
});
