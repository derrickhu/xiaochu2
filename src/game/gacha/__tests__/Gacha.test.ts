/**
 * 抽卡引擎契约测试：出货概率、硬保底、UR 天井、十连保底、重复转碎片、
 * 全花名册池、UP 池、通用碎片、护航包。RNG 注入保证确定性。
 */
import { describe, it, expect } from 'vitest';
import {
  bannerWeightFn, poolGachaRates, pullOne, pullTen, type GachaState,
} from '../Gacha';
import { ECONOMY } from '@/balance/economy';
import { PETS, PET_MAP } from '@/balance/pets';
import { RARITIES, getRarity } from '@/balance/rarity';
import {
  CURRENT_BANNER, featuredPetRate, upWeightOf, validateBanner,
} from '@/balance/gachaBanner';
import { gachaPoolPets, pullGachaSingle } from '@/game/playerGacha';
import { initialData } from '@/game/playerSave';

/** 固定序列 rng：循环取用 */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const notOwned = () => false;
const allOwned = () => true;

/**
 * 建一个「够抽」的新号：开局灵玉（ECONOMY.gacha.starterLingyu）是会随运营调整的数值，
 * 抽卡引擎契约不该依赖它，这里显式发放货币把两件事解耦。
 */
function richData() {
  const data = initialData();
  data.lingyu = 10_000;
  return data;
}

describe('抽卡：基础出货', () => {
  it('rng=0 命中最低稀有档（R）', () => {
    const state: GachaState = { sinceHigh: 0, sinceUr: 0 };
    const o = pullOne(seqRng([0]), state, notOwned);
    expect(o.rarity).toBe(1);
    expect(o.duplicate).toBe(false);
    expect(o.shards).toBe(0);
    expect(state.sinceHigh).toBe(1); // 未出 SSR+，计数 +1
  });
});

describe('抽卡：硬保底', () => {
  it('达到 pitySSR 前一抽强制 SSR+ 并重置计数', () => {
    const state: GachaState = { sinceHigh: ECONOMY.gacha.pitySSR - 1, sinceUr: 0 };
    const o = pullOne(seqRng([0]), state, notOwned); // rng=0 本应出 R
    expect(o.pity).toBe(true);
    expect(o.rarity).toBeGreaterThanOrEqual(3);
    expect(state.sinceHigh).toBe(0);
  });
});

describe('抽卡：重复转碎片', () => {
  it('抽到已拥有宠 → duplicate 且按稀有度给碎片', () => {
    const state: GachaState = { sinceHigh: 0, sinceUr: 0 };
    const o = pullOne(seqRng([0]), state, allOwned);
    expect(o.duplicate).toBe(true);
    expect(o.shards).toBe(ECONOMY.gacha.duplicateShards[o.rarity]);
  });
});

describe('抽卡：十连保底', () => {
  it('十连必出至少一只 SR+（rarity≥2）', () => {
    // 全 rng=0 时单抽恒为 R，靠保底兜底最后一发
    const state: GachaState = { sinceHigh: 0, sinceUr: 0 };
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

  it('未拥有宠也能抽到（全池出货）', () => {
    const data = richData();
    const outcome = pullGachaSingle(data, seqRng([0.9, 0]))!;
    expect(outcome.rarity).toBe(3);
    expect(data.ownedPets[outcome.petId]).toBeDefined();
  });

  it('五行子池各档齐全（100 宠金字塔后不再有缺档属性）', () => {
    for (const el of ['metal', 'wood', 'water', 'fire', 'earth'] as const) {
      const rates = poolGachaRates(gachaPoolPets(el));
      for (const t of RARITIES) expect(rates.has(t), `${el} 缺 r${t}`).toBe(true);
    }
  });

  it('概率公示动态归一化：全池四档之和为 1，缺档池不虚标', () => {
    const full = poolGachaRates(gachaPoolPets());
    const sum = [...full.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
    for (const t of RARITIES) expect(full.get(t)).toBeCloseTo(getRarity(t).gachaRate, 10);

    // 缺档池（此处用纯 R 合成池，不依赖名录构成）：公示只含在池档位且和为 1
    const rOnly = poolGachaRates(PETS.filter((p) => p.rarity === 1));
    expect(rOnly.has(2)).toBe(false);
    expect(rOnly.get(1)).toBeCloseTo(1, 10);
    expect([...rOnly.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
});

describe('抽卡：高稀有护航包', () => {
  it('NEW SSR 附赠本体碎片 + 经验包并回写 outcome', () => {
    const data = richData();
    const expBefore = data.exp;
    const outcome = pullGachaSingle(data, seqRng([0.9, 0]))!;
    expect(outcome.rarity).toBe(3);
    expect(outcome.duplicate).toBe(false);
    expect(outcome.escort).toEqual(ECONOMY.gacha.escort[3]);
    expect(data.ownedPets[outcome.petId].shards).toBe(ECONOMY.gacha.escort[3].shards);
    expect(data.exp - expBefore).toBe(ECONOMY.gacha.escort[3].exp);
  });

  it('重复出货不发护航包', () => {
    const data = richData();
    const first = pullGachaSingle(data, seqRng([0.9, 0]))!;
    const dup = pullGachaSingle(data, seqRng([0.9, 0]))!;
    expect(dup.petId).toBe(first.petId);
    expect(dup.duplicate).toBe(true);
    expect(dup.escort).toBeUndefined();
  });

  it('NEW R/SR 无护航包', () => {
    const data = richData();
    // rng1=0.7 → SR 档（R 0~0.55 / SR 0.55~0.85）；rng2=0 → 档内首只
    const outcome = pullGachaSingle(data, seqRng([0.7, 0]))!;
    expect(outcome.rarity).toBe(2);
    expect(outcome.escort).toBeUndefined();
  });
});

describe('抽卡：UR 天井', () => {
  it('达到 pityUR 前一抽强制 UR，并只重置 UR 计数不影响 SSR 计数口径', () => {
    const state: GachaState = { sinceHigh: 3, sinceUr: ECONOMY.gacha.pityUR - 1 };
    const o = pullOne(seqRng([0]), state, notOwned); // rng=0 本应出 R
    expect(o.urPity).toBe(true);
    expect(o.rarity).toBe(4);
    expect(state.sinceUr).toBe(0);
    // UR 也算 SSR+，两条计数同时清空
    expect(state.sinceHigh).toBe(0);
  });

  it('SSR 出货清 SSR 保底但不清 UR 天井（否则天井会被 SSR 无限推后）', () => {
    const state: GachaState = { sinceHigh: 10, sinceUr: 10 };
    const o = pullOne(seqRng([0.9, 0]), state, notOwned);
    expect(o.rarity).toBe(3);
    expect(state.sinceHigh).toBe(0);
    expect(state.sinceUr).toBe(11);
  });

  it('天井计数跨抽持久化到存档', () => {
    const data = richData();
    data.gachaSinceUr = ECONOMY.gacha.pityUR - 1;
    const o = pullGachaSingle(data, seqRng([0, 0]))!;
    expect(o.rarity).toBe(4);
    expect(data.gachaSinceUr).toBe(0);
  });
});

describe('抽卡：UP 池', () => {
  it('当期池配置合法（UP 宠存在且档位正确）', () => {
    expect(validateBanner()).toEqual([]);
  });

  it('UP 宠在档内占 featuredTierShare，非 UP 宠等权分剩余', () => {
    const tier = ['a', 'b', 'c', 'd'];
    const banner = {
      ...CURRENT_BANNER, featuredUr: 'a', featuredSsr: [], featuredTierShare: 0.5,
    };
    const wUp = upWeightOf('a', tier, banner);
    const wPlain = upWeightOf('b', tier, banner);
    // a 权重 = 3、其余各 1 → a 命中率 3/6 = 50%
    expect(wUp / (wUp + wPlain * 3)).toBeCloseTo(0.5, 10);
  });

  it('档内全是 UP 或全无 UP 时退化为等权（不除零）', () => {
    const banner = { ...CURRENT_BANNER, featuredUr: 'a', featuredSsr: ['b'] };
    expect(upWeightOf('a', ['a', 'b'], banner)).toBe(1);
    expect(upWeightOf('x', ['x', 'y'], banner)).toBe(1);
  });

  it('UP UR 单抽绝对概率 = UR 档率 × 份额（公示口径）', () => {
    const urCount = PETS.filter((p) => p.rarity === 4).length;
    const rate = featuredPetRate(CURRENT_BANNER.featuredUr, getRarity(4).gachaRate, urCount);
    expect(rate).toBeCloseTo(getRarity(4).gachaRate * CURRENT_BANNER.featuredTierShare, 10);
    // 均等池下单只只有 1/urCount，UP 必须显著更高才有目标感
    expect(rate).toBeGreaterThan(getRarity(4).gachaRate / urCount);
  });

  it('实际出货频次贴近公示：UP UR 在 UR 出货中占比约 featuredTierShare', () => {
    const pool = gachaPoolPets();
    const weightOf = bannerWeightFn(pool);
    let seed = 12345;
    const rng = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const state: GachaState = { sinceHigh: 0, sinceUr: 0 };
    let ur = 0;
    let upUr = 0;
    for (let i = 0; i < 60_000; i++) {
      const o = pullOne(rng, state, notOwned, 1, pool, weightOf);
      if (o.rarity !== 4) continue;
      ur++;
      if (o.petId === CURRENT_BANNER.featuredUr) upUr++;
    }
    expect(ur).toBeGreaterThan(500);
    expect(upUr / ur).toBeCloseTo(CURRENT_BANNER.featuredTierShare, 1);
  });
});

describe('抽卡：通用碎片', () => {
  it('重复 SSR/UR 额外产出通用碎片并落库', () => {
    const data = richData();
    const first = pullGachaSingle(data, seqRng([0.9, 0]))!;
    expect(first.rarity).toBe(3);
    const before = data.universalShards;
    const dup = pullGachaSingle(data, seqRng([0.9, 0]))!;
    expect(dup.duplicate).toBe(true);
    expect(dup.universal).toBe(ECONOMY.gacha.duplicateUniversal[3]);
    expect(data.universalShards - before).toBe(ECONOMY.gacha.duplicateUniversal[3]);
  });

  it('重复低稀有不产通用碎片（留给高稀有死结）', () => {
    const data = richData();
    pullGachaSingle(data, seqRng([0, 0]));
    const before = data.universalShards;
    const dup = pullGachaSingle(data, seqRng([0, 0]))!;
    expect(dup.duplicate).toBe(true);
    expect(dup.universal).toBeUndefined();
    expect(data.universalShards).toBe(before);
  });
});

describe('抽卡：小池（仅一种 R 宠）', () => {
  const soloPool = [PET_MAP.get('pet_001')!];

  it('出货稀有度与宠本身一致，不会出现「同宠不同框」', () => {
    const state: GachaState = { sinceHigh: 0, sinceUr: 0 };
    const outs = pullTen(seqRng([0.99, 0.5, 0.1, 0.99, 0.5, 0.1, 0.99, 0.5, 0.1, 0.99]), state, allOwned, soloPool);
    expect(outs).toHaveLength(10);
    for (const o of outs) {
      expect(o.petId).toBe('pet_001');
      expect(o.rarity).toBe(1);
      expect(o.shards).toBe(ECONOMY.gacha.duplicateShards[1]);
    }
  });

  it('硬保底触发时仍只出池内最高档（R），不会虚标 SSR', () => {
    const state: GachaState = { sinceHigh: ECONOMY.gacha.pitySSR - 1, sinceUr: 0 };
    const o = pullOne(seqRng([0]), state, notOwned, 1, soloPool);
    expect(o.pity).toBe(true);
    expect(o.rarity).toBe(1);
    expect(o.petId).toBe('pet_001');
  });
});
