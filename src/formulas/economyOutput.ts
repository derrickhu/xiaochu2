/**
 * 经济产出 / 定价公式（纯函数，零状态）
 */
import { ECONOMY } from '@/balance/economy';
import { getDropTable } from '@/balance/drops';
import { getStageType, type StageType } from '@/balance/stageTypes';

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

/** 单次通关掉落（经验 + 指定灵宠碎片） */
export interface StageDrops {
  exp: number;
  shards: { petId: string; count: number }[];
}

/**
 * 关卡掉落结算：经验/碎片按 章节成长 × 关卡类型倍率 × (1 + 星数加成) 放大。
 * 经验为升级燃料（跨宠共享）；碎片仅精英/Boss/资源关等产出，常规关不掉碎片。
 */
export function stageDrops(
  dropTableId: string | undefined,
  chapter: number,
  stars: number,
  type: StageType = 'normal',
): StageDrops {
  const table = dropTableId ? getDropTable(dropTableId) : undefined;
  if (!table) return { exp: 0, shards: [] };

  const st = getStageType(type);
  const chapterMult = Math.pow(ECONOMY.coin.chapterGrowth, chapter - 1);
  const starBonus = 1 + stars * ECONOMY.coin.perStarBonus;

  const exp = Math.floor(table.expBase * st.expMult * chapterMult * starBonus);
  const shards = type === 'normal' ? [] : table.shards.map((s) => ({
    petId: s.petId,
    count: Math.max(1, Math.floor(s.amount * st.shardMult * starBonus)),
  }));
  return { exp, shards };
}
