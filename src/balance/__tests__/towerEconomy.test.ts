import { describe, expect, it } from 'vitest';
import {
  TOWER_COIN,
  towerBreakthroughCoins,
  towerCoinsForRange,
  towerCoinsPerFloor,
  towerDailyBaseCap,
  towerDifficulty,
  towerGuardFirstClearCoins,
  towerMilestoneReward,
  towerScaledFlatCoins,
} from '../tower';
import { TOWER_EXCHANGES, TOWER_EXCHANGE_MAP } from '../towerLegacy';

describe('通天塔印记经济', () => {
  it('日常两轮爬到 15 层（含日限）至少能换商店最便宜一档', () => {
    const uncapped = 2 * towerCoinsForRange(0, 15);
    const daily = Math.min(uncapped, towerDailyBaseCap(15));
    const cheapest = Math.min(...TOWER_EXCHANGES.map((e) => e.cost));
    expect(cheapest).toBe(40);
    expect(daily).toBeGreaterThanOrEqual(cheapest);
  });

  it('灵宠币包不超过第 4 章日产目标太多', () => {
    const pack = TOWER_EXCHANGE_MAP.get('tex_coins');
    expect(pack?.reward.coins).toBeLessThanOrEqual(1000);
    expect(pack?.cost).toBe(40);
  });

  it('灵玉档对齐 F30 日限，避免差 10 点买不起', () => {
    const pack = TOWER_EXCHANGE_MAP.get('tex_lingyu');
    expect(pack?.cost).toBe(90);
    expect(towerDailyBaseCap(30)).toBeGreaterThanOrEqual(pack!.cost);
  });

  it('单层印记随层段上涨：F41 至少是 F1 的 3 倍', () => {
    expect(towerCoinsPerFloor(1)).toBe(TOWER_COIN.perFloor);
    expect(towerCoinsPerFloor(10)).toBe(TOWER_COIN.perFloor);
    expect(towerCoinsPerFloor(11)).toBe(TOWER_COIN.perFloor + 1);
    expect(towerCoinsPerFloor(41)).toBeGreaterThanOrEqual(TOWER_COIN.perFloor * 3);
    expect(towerCoinsPerFloor(41)).toBe(6);
  });

  it('40 层后难度涨了，里程碑不能还是 F10 那一包', () => {
    const f10 = towerMilestoneReward(10);
    const f40 = towerMilestoneReward(40);
    expect(f10.lingyu).toBe(60);
    expect(f10.shards).toBe(12);
    expect(f10.universal).toBe(12);
    expect(f40.lingyu).toBe(120);
    expect(f40.shards).toBe(24);
    expect(f40.universal).toBe(24);
    expect((f40.lingyu ?? 0)).toBeGreaterThan((f10.lingyu ?? 0));
  });

  it('守关首过与突破也按层段加，F40 首过明显高于 F10', () => {
    expect(towerGuardFirstClearCoins(10)).toBe(30);
    expect(towerGuardFirstClearCoins(40)).toBe(60);
    expect(towerBreakthroughCoins(39, 40)).toBeGreaterThan(towerBreakthroughCoins(9, 10));
  });

  it('险径固定印记后期放大，F1 仍是原值', () => {
    expect(towerScaledFlatCoins(15, 1)).toBe(15);
    expect(towerScaledFlatCoins(15, 41)).toBe(30);
    expect(towerScaledFlatCoins(18, 41)).toBe(36);
  });

  it('日限仍能卡住全程复刷：F40 两轮基础印记超过日限', () => {
    const twoRuns = 2 * towerCoinsForRange(0, 40);
    expect(twoRuns).toBeGreaterThan(towerDailyBaseCap(40));
  });

  it('F40 相对 F10：难度涨一倍以上，单层基础印记也必须涨', () => {
    const diffRatio = towerDifficulty(40) / towerDifficulty(10);
    const coinRatio = towerCoinsPerFloor(40) / towerCoinsPerFloor(10);
    expect(diffRatio).toBeGreaterThan(2);
    expect(coinRatio).toBeGreaterThanOrEqual(2);
  });
});
