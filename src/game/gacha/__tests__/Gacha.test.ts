/**
 * 抽卡引擎契约测试：出货概率、硬保底、十连保底、重复转碎片、
 * 全花名册池、收录 UP 权重、护航包。RNG 注入保证确定性。
 */
import { describe, it, expect } from 'vitest';
import { poolGachaRates, pullOne, pullTen, type GachaState } from '../Gacha';
import { ECONOMY } from '@/balance/economy';
import { PETS, PET_MAP } from '@/balance/pets';
import { RARITIES, getRarity } from '@/balance/rarity';
import { gachaPoolPets, pullGachaSingle } from '@/game/playerGacha';
import { initialData } from '@/game/playerSave';

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

describe('抽卡：全花名册池（可达性修复）', () => {
  it('出货池 = 全部灵宠（不再受收录限制）', () => {
    expect(gachaPoolPets()).toHaveLength(PETS.length);
  });

  it('五行子池只含对应属性且合计覆盖全花名册', () => {
    const total = (['metal', 'wood', 'water', 'fire', 'earth'] as const)
      .reduce((sum, el) => {
        const sub = gachaPoolPets(el);
        for (const p of sub) expect(p.element).toBe(el);
        return sum + sub.length;
      }, 0);
    expect(total).toBe(PETS.length);
  });

  it('未收录宠也能抽到（新号引导池外出货）', () => {
    const data = initialData();
    // rng: 第一发 0.9 → 命中 SSR 档；第二发 0 → 取档内首只（初始必未收录 SSR）
    const outcome = pullGachaSingle(data, seqRng([0.9, 0]))!;
    expect(outcome.rarity).toBe(3);
    expect(data.discovered).toContain(outcome.petId);
    expect(data.ownedPets[outcome.petId]).toBeDefined();
  });

  it('概率公示动态归一化：全池四档之和为 1，缺档子池不虚标', () => {
    const full = poolGachaRates(gachaPoolPets());
    const sum = [...full.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
    for (const t of RARITIES) expect(full.get(t)).toBeCloseTo(getRarity(t).gachaRate, 10);

    // 火系子池无 SR：公示应只含在池档位且和为 1
    const fire = poolGachaRates(gachaPoolPets('fire'));
    expect(fire.has(2)).toBe(false);
    expect([...fire.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
});

describe('抽卡：收录 UP 权重', () => {
  const poolAB = [PET_MAP.get('pet_001')!, PET_MAP.get('pet_003')!]; // 两只 R
  const upWeight = ECONOMY.gacha.discoveryUpWeight;
  const weightOf = (p: { id: string }): number => (p.id === 'pet_001' ? upWeight : 1);

  it('已收录宠按 discoveryUpWeight 加权：权重区间内出 UP 宠', () => {
    const state: GachaState = { sinceHigh: 0 };
    // rng1=0 → R 档；rng2=0.6 → 0.6×3=1.8 ≤ 权重 2 → pet_001
    const o = pullOne(seqRng([0, 0.6]), state, notOwned, 1, poolAB, weightOf);
    expect(o.petId).toBe('pet_001');
  });

  it('权重区间外出普通宠', () => {
    const state: GachaState = { sinceHigh: 0 };
    // rng2=0.9 → 0.9×3=2.7 > 2 → 落到 pet_003
    const o = pullOne(seqRng([0, 0.9]), state, notOwned, 1, poolAB, weightOf);
    expect(o.petId).toBe('pet_003');
  });

  it('不传权重回调时保持等权（回归）', () => {
    const state: GachaState = { sinceHigh: 0 };
    const o = pullOne(seqRng([0, 0.6]), state, notOwned, 1, poolAB);
    expect(o.petId).toBe('pet_003'); // 0.6×2=1.2 → 第二只
  });
});

describe('抽卡：高稀有护航包', () => {
  it('NEW SSR 附赠本体碎片 + 经验包并回写 outcome', () => {
    const data = initialData();
    const expBefore = data.exp;
    const outcome = pullGachaSingle(data, seqRng([0.9, 0]))!;
    expect(outcome.rarity).toBe(3);
    expect(outcome.duplicate).toBe(false);
    expect(outcome.escort).toEqual(ECONOMY.gacha.escort[3]);
    expect(data.ownedPets[outcome.petId].shards).toBe(ECONOMY.gacha.escort[3].shards);
    expect(data.exp - expBefore).toBe(ECONOMY.gacha.escort[3].exp);
  });

  it('重复出货不发护航包', () => {
    const data = initialData();
    const first = pullGachaSingle(data, seqRng([0.9, 0]))!;
    const dup = pullGachaSingle(data, seqRng([0.9, 0]))!;
    expect(dup.petId).toBe(first.petId);
    expect(dup.duplicate).toBe(true);
    expect(dup.escort).toBeUndefined();
  });

  it('NEW R/SR 无护航包', () => {
    const data = initialData();
    // rng1=0.7 → SR 档（0.60~0.865）；rng2=0 → 档内首只
    const outcome = pullGachaSingle(data, seqRng([0.7, 0]))!;
    expect(outcome.rarity).toBe(2);
    expect(outcome.escort).toBeUndefined();
  });
});

describe('抽卡：小池（仅一种 R 宠）', () => {
  const soloPool = [PET_MAP.get('pet_001')!];

  it('出货稀有度与宠本身一致，不会出现「同宠不同框」', () => {
    const state: GachaState = { sinceHigh: 0 };
    const outs = pullTen(seqRng([0.99, 0.5, 0.1, 0.99, 0.5, 0.1, 0.99, 0.5, 0.1, 0.99]), state, allOwned, soloPool);
    expect(outs).toHaveLength(10);
    for (const o of outs) {
      expect(o.petId).toBe('pet_001');
      expect(o.rarity).toBe(1);
      expect(o.shards).toBe(ECONOMY.gacha.duplicateShards[1]);
    }
  });

  it('硬保底触发时仍只出池内最高档（R），不会虚标 SSR', () => {
    const state: GachaState = { sinceHigh: ECONOMY.gacha.pitySSR - 1 };
    const o = pullOne(seqRng([0]), state, notOwned, 1, soloPool);
    expect(o.pity).toBe(true);
    expect(o.rarity).toBe(1);
    expect(o.petId).toBe('pet_001');
  });
});
