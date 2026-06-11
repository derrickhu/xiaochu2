/**
 * 经济产出 / 定价公式（纯函数，零状态）
 */
import { ECONOMY } from '@/balance/economy';

/** 单关灵宠币产出 = 基础 × 章节系数 × (1 + 星数加成) × Boss 倍率 */
export function stageCoinReward(chapter: number, stars: number, isBoss = false): number {
  const c = ECONOMY.coin;
  let coins = c.stageBase * Math.pow(c.chapterGrowth, chapter - 1);
  coins *= 1 + stars * c.perStarBonus;
  if (isBoss) coins *= c.bossMultiplier;
  return Math.floor(coins);
}

/** 第 n 次招募定价（n 从 0 开始 = 已招募数量），复利增长 + 封顶 */
export function recruitPrice(recruitedCount: number): number {
  const r = ECONOMY.recruit;
  const price = r.basePrice * Math.pow(r.priceGrowth, recruitedCount);
  const cap = r.basePrice * r.priceCapMultiplier;
  return Math.floor(Math.min(price, cap));
}

/** 升到 star+1 星所需碎片（不可升返回 null） */
export function starUpShardCost(currentStar: number): number | null {
  return ECONOMY.starUpShards[currentStar + 1] ?? null;
}
