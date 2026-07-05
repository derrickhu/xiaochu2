import { describe, it, expect } from 'vitest';
import { stageCoinReward, recruitPrice, starUpShardCost, stageDrops } from '../economyOutput';
import { petExpToNext } from '../growth';
import { STAGES } from '@/balance/stages';
import { ECONOMY } from '@/balance/economy';
import { CHAPTER_POWER } from '@/balance/powerBudget';

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

describe('高稀有护航包：有护航感但不破坏首日经济', () => {
  /** 单宠从 1 升到 N 级累计经验 */
  const cumExp = (toLevel: number): number => {
    let s = 0;
    for (let l = 1; l < toLevel; l++) s += petExpToNext(l);
    return s;
  };
  const escort = ECONOMY.gacha.escort;

  it('SSR/UR 均配置护航包，且 UR 明显厚于 SSR', () => {
    expect(escort[3]).toBeDefined();
    expect(escort[4]).toBeDefined();
    expect(escort[4].shards).toBeGreaterThanOrEqual(escort[3].shards * 2);
    expect(escort[4].exp).toBeGreaterThan(escort[3].exp);
  });

  it('SSR 护航碎片恰好覆盖 1★→2★ 升星成本（出货即可升星的体感锚点）', () => {
    expect(escort[3].shards).toBe(starUpShardCost(1));
  });

  it('护航经验不超过预算曲线：SSR ≤ 单宠升至 L12（第 2 章进章预算），UR ≤ 其 2 倍', () => {
    const budgetExp = cumExp(CHAPTER_POWER[2].enterLevel);
    expect(escort[3].exp).toBeLessThanOrEqual(budgetExp);
    expect(escort[4].exp).toBeLessThanOrEqual(budgetExp * 2);
  });

  it('护航经验不碾压关卡产出：UR 经验包 ≤ 第一章一轮首通（2★）经验总产出', () => {
    const chapter1Exp = STAGES
      .filter((s) => s.chapter === 1)
      .reduce((sum, s) => sum + stageDrops(s.dropTableId, s.chapter, 2, s.type).exp, 0);
    expect(escort[4].exp).toBeLessThanOrEqual(chapter1Exp);
  });
});
