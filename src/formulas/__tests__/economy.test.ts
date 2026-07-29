import { describe, it, expect } from 'vitest';
import {
  stageCoinReward, recruitPrice, starUpShardCost, stageDrops, stageUniversalReward,
} from '../economyOutput';
import { petExpToNext } from '../growth';
import { STAGES } from '@/balance/stages';
import { ECONOMY } from '@/balance/economy';
import { getStageType } from '@/balance/stageTypes';
import { staminaCap } from '@/game/staminaService';
import { AD_PLACEMENTS } from '@/balance/monetization';
import {
  CHAPTER_POWER, DAILY_TARGET_TOLERANCE, getDailyTarget,
} from '@/balance/powerBudget';

describe('stageCoinReward', () => {
  it('第 1 章 0 星基础产出', () => {
    expect(stageCoinReward(1, 0)).toBe(30);
  });

  it('三星加成 +60%', () => {
    expect(stageCoinReward(1, 3)).toBe(48);
  });

  it('关卡类型倍率接通 stageTypes：精英 ×1.4 / Boss ×2 / 资源关 ×0.4', () => {
    expect(stageCoinReward(1, 0, 'elite')).toBe(42);
    expect(stageCoinReward(1, 0, 'boss')).toBe(60);
    expect(stageCoinReward(1, 0, 'dailyResource')).toBe(12);
  });

  it('章节产出递增', () => {
    expect(stageCoinReward(3, 0)).toBeGreaterThan(stageCoinReward(1, 0));
  });
});

describe('通用碎片产出（关卡侧）', () => {
  it('普通关不产（保住抽卡与商店的位置），精英档起按 shardMult 折算', () => {
    expect(stageUniversalReward('normal')).toBe(0);
    expect(stageUniversalReward('elite')).toBeGreaterThan(0);
    expect(stageUniversalReward('boss')).toBeGreaterThan(stageUniversalReward('elite'));
  });

  it('stageDrops 带出通用碎片，且本体碎片仍不从关卡掉（防定向无限刷）', () => {
    const elite = stageDrops('dt_trial_elite', 5, 3, 'elite');
    expect(elite.universal).toBe(stageUniversalReward('elite'));
    expect(elite.shards).toEqual([]);
    expect(stageDrops('dt_trial_normal', 5, 3, 'normal').universal).toBe(0);
  });
});

describe('每日产出目标框架', () => {
  /** 普通关占比（其余为精英关）；与 DAILY_TARGET 注释里的口径同源 */
  const NORMAL_SHARE = 0.8;
  const ELITE_SHARE = 1 - NORMAL_SHARE;

  /** 一天的体力预算能打的场次：满瓶 ×2 次登录 + 广告回体 ×3 */
  const dailyRuns = (chapter: number): number => {
    const s = ECONOMY.stamina;
    const budget = staminaCap(chapter) * 2
      + s.adRefill * AD_PLACEMENTS.stamina_refill.dailyLimit;
    return Math.floor(budget / getStageType('normal').staminaCost);
  };

  const estimateDaily = (chapter: number): { coins: number; exp: number; universal: number } => {
    const runs = dailyRuns(chapter);
    const mix = (normal: number, elite: number): number =>
      normal * NORMAL_SHARE + elite * ELITE_SHARE;
    return {
      coins: mix(
        stageCoinReward(chapter, 2, 'normal'),
        stageCoinReward(chapter, 2, 'elite'),
      ) * runs * ECONOMY.coin.repeatClearPct,
      exp: mix(
        stageDrops('dt_trial_normal', chapter, 2, 'normal').exp,
        stageDrops('dt_trial_elite', chapter, 2, 'elite').exp,
      ) * runs,
      universal: stageUniversalReward('elite') * ELITE_SHARE * runs
        + ECONOMY.universal.dailyAllClear,
    };
  };

  it('目标逐章递增，币产靠场次成长（缓）、经验追敌人强度（陡）', () => {
    for (let ch = 2; ch <= 16; ch++) {
      expect(getDailyTarget(ch).coins).toBeGreaterThan(getDailyTarget(ch - 1).coins);
      expect(getDailyTarget(ch).exp).toBeGreaterThan(getDailyTarget(ch - 1).exp);
    }
    const coinRatio = getDailyTarget(16).coins / getDailyTarget(1).coins;
    const expRatio = getDailyTarget(16).exp / getDailyTarget(1).exp;
    expect(expRatio).toBeGreaterThan(coinRatio);
  });

  it('超出末章线性外推而非钳住（扩章后校验不会静默失效）', () => {
    expect(getDailyTarget(20).coins).toBeGreaterThan(getDailyTarget(16).coins);
    expect(getDailyTarget(20).exp).toBeGreaterThan(getDailyTarget(16).exp);
  });

  it('实际产出落在日产目标容差内（币 / 经验 / 通用碎片三线）', () => {
    for (let ch = 1; ch <= 16; ch++) {
      const est = estimateDaily(ch);
      const target = getDailyTarget(ch);
      for (const key of ['coins', 'exp', 'universal'] as const) {
        expect(est[key], `ch${ch} ${key}`).toBeGreaterThan(target[key] * (1 - DAILY_TARGET_TOLERANCE));
        expect(est[key], `ch${ch} ${key}`).toBeLessThan(target[key] * (1 + DAILY_TARGET_TOLERANCE));
      }
    }
  });

  it('日产能支撑消耗端：第 16 章一天的币产 ≥ 一个 UR 碎片包（不能出现攒一周买一包）', () => {
    expect(estimateDaily(16).coins).toBeGreaterThanOrEqual(ECONOMY.shop.shardPackCost[4]);
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
      .reduce((sum, s) => sum + stageCoinReward(s.chapter, 3, s.type), 0);
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
