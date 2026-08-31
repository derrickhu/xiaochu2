import { describe, expect, it } from 'vitest';
import { TOWER_COIN, towerDailyBaseCap } from '../tower';
import { TOWER_EXCHANGES, TOWER_EXCHANGE_MAP } from '../towerLegacy';

describe('通天塔印记经济', () => {
  it('日常两轮爬到 15 层（含日限）至少能换商店最便宜一档', () => {
    const uncapped = 15 * 2 * TOWER_COIN.perFloor;
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
});
