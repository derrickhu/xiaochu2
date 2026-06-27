/**
 * 抽卡引擎契约测试：出货概率、硬保底、十连保底、重复转碎片。
 * RNG 注入保证确定性。
 */
import { describe, it, expect } from 'vitest';
import { pullOne, pullTen, type GachaState } from '../Gacha';
import { ECONOMY } from '@/balance/economy';
import { PET_MAP } from '@/balance/pets';

/** 固定序列 rng：循环取用 */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const notOwned = () => false;
const allOwned = () => true;

describe('抽卡：基础出货', () => {
  it('rng=0 命中最低稀有档（R）', () => {
    const state: GachaState = { sinceHigh: 0 };
    const o = pullOne(seqRng([0]), state, notOwned);
    expect(o.rarity).toBe(1);
    expect(o.duplicate).toBe(false);
    expect(o.shards).toBe(0);
    expect(state.sinceHigh).toBe(1); // 未出 SSR+，计数 +1
  });
});

describe('抽卡：硬保底', () => {
  it('达到 pitySSR 前一抽强制 SSR+ 并重置计数', () => {
    const state: GachaState = { sinceHigh: ECONOMY.gacha.pitySSR - 1 };
    const o = pullOne(seqRng([0]), state, notOwned); // rng=0 本应出 R
    expect(o.pity).toBe(true);
    expect(o.rarity).toBeGreaterThanOrEqual(3);
    expect(state.sinceHigh).toBe(0);
  });
});

describe('抽卡：重复转碎片', () => {
  it('抽到已拥有宠 → duplicate 且按稀有度给碎片', () => {
    const state: GachaState = { sinceHigh: 0 };
    const o = pullOne(seqRng([0]), state, allOwned);
    expect(o.duplicate).toBe(true);
    expect(o.shards).toBe(ECONOMY.gacha.duplicateShards[o.rarity]);
  });
});

describe('抽卡：十连保底', () => {
  it('十连必出至少一只 SR+（rarity≥2）', () => {
    // 全 rng=0 时单抽恒为 R，靠保底兜底最后一发
    const state: GachaState = { sinceHigh: 0 };
    const outs = pullTen(seqRng([0]), state, notOwned);
    expect(outs).toHaveLength(10);
    expect(outs.some((o) => o.rarity >= ECONOMY.gacha.tenPullFloorRarity)).toBe(true);
  });
});

describe('抽卡：小池（仅一种 R 宠）', () => {
  const soloPool = [PET_MAP.get('pet_metal_003')!];

  it('出货稀有度与宠本身一致，不会出现「同宠不同框」', () => {
    const state: GachaState = { sinceHigh: 0 };
    const outs = pullTen(seqRng([0.99, 0.5, 0.1, 0.99, 0.5, 0.1, 0.99, 0.5, 0.1, 0.99]), state, allOwned, soloPool);
    expect(outs).toHaveLength(10);
    for (const o of outs) {
      expect(o.petId).toBe('pet_metal_003');
      expect(o.rarity).toBe(1);
      expect(o.shards).toBe(ECONOMY.gacha.duplicateShards[1]);
    }
  });

  it('硬保底触发时仍只出池内最高档（R），不会虚标 SSR', () => {
    const state: GachaState = { sinceHigh: ECONOMY.gacha.pitySSR - 1 };
    const o = pullOne(seqRng([0]), state, notOwned, 1, soloPool);
    expect(o.pity).toBe(true);
    expect(o.rarity).toBe(1);
    expect(o.petId).toBe('pet_metal_003');
  });
});
