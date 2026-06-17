import { describe, it, expect } from 'vitest';
import {
  RARITY_PROFILES, RARITIES, getRarity, rarityProbabilities, type Rarity,
} from '../rarity';
import { PETS } from '../pets';

describe('稀有度抽象', () => {
  it('每档都有 code/name/color/gachaWeight', () => {
    for (const tier of RARITIES) {
      const def = RARITY_PROFILES[tier];
      expect(def.tier).toBe(tier);
      expect(def.code.length).toBeGreaterThan(0);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.gachaWeight).toBeGreaterThan(0);
    }
  });

  it('越高稀有度抽卡权重越低', () => {
    for (let i = 1; i < RARITIES.length; i++) {
      const lower = getRarity(RARITIES[i - 1]);
      const higher = getRarity(RARITIES[i]);
      expect(higher.gachaWeight).toBeLessThan(lower.gachaWeight);
    }
  });

  it('getRarity 越界回退到最低档', () => {
    expect(getRarity(99 as Rarity).tier).toBe(1);
  });
});

describe('抽卡概率（两段式第一段）', () => {
  it('按池内档位权重归一，概率和为 1', () => {
    const probs = rarityProbabilities([1, 2, 3]);
    const sum = [...probs.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
    // 低稀有概率更高
    expect(probs.get(1)!).toBeGreaterThan(probs.get(3)!);
  });

  it('档内宠数量不影响档命中率（重复档位去重）', () => {
    const single = rarityProbabilities([1, 2]);
    const manyTier1 = rarityProbabilities([1, 1, 1, 2]);
    expect(manyTier1.get(1)).toBeCloseTo(single.get(1)!, 6);
    expect(manyTier1.get(2)).toBeCloseTo(single.get(2)!, 6);
  });

  it('空池返回空表', () => {
    expect(rarityProbabilities([]).size).toBe(0);
  });

  it('首发宠稀有度均在合法档位内', () => {
    for (const pet of PETS) {
      expect(RARITIES).toContain(pet.rarity);
    }
  });
});
