/**
 * 经济产出 / 定价公式（纯函数，零状态）
 */
import { ECONOMY } from '@/balance/economy';
import { getDropTable } from '@/balance/drops';
import { getStageType, type StageType } from '@/balance/stageTypes';

/**
 * 单关灵宠币产出 = 基础 × 章节系数 × (1 + 星数加成) × 关卡类型 coinMult。
 *
 * 类型倍率统一读 stageTypes（此前只认 isBoss 布尔，精英与资源关的 coinMult 是死配置）。
 * boss 档 coinMult = 2.0 与旧 bossMultiplier 同值，故既有 Boss 产出不变。
 */
export function stageCoinReward(
  chapter: number,
  stars: number,
  type: StageType = 'normal',
): number {
  const c = ECONOMY.coin;
  let coins = c.stageBase * Math.pow(c.chapterGrowth, chapter - 1);
  coins *= 1 + stars * c.perStarBonus;
  coins *= getStageType(type).coinMult;
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

/** 单次通关掉落（经验 + 指定灵宠碎片 + 通用碎片） */
export interface StageDrops {
  exp: number;
  shards: { petId: string; count: number }[];
  /** 通用碎片（精英关唯一的关卡侧碎片来源） */
  universal: number;
}

/**
 * 关卡掉落结算：经验按 章节成长 × 关卡类型 expMult × (1 + 星数加成) 放大。
 *
 * 碎片口径：本体碎片仍然**不从关卡掉**（防定向无限刷单只宠），
 * 但精英/资源关按 shardMult 产**通用碎片** —— 补上「关卡完全不掉碎片、
 * 碎片只能靠抽卡重复」的缺口，同时因为通用碎片不指向具体宠，刷关不会崩单只养成曲线。
 */
export function stageDrops(
  dropTableId: string | undefined,
  chapter: number,
  stars: number,
  type: StageType = 'normal',
): StageDrops {
  const table = dropTableId ? getDropTable(dropTableId) : undefined;
  if (!table) return { exp: 0, shards: [], universal: 0 };

  const st = getStageType(type);
  const chapterMult = Math.pow(ECONOMY.exp.chapterGrowth, chapter - 1);
  const starBonus = 1 + stars * ECONOMY.exp.perStarBonus;

  const exp = Math.floor(table.expBase * st.expMult * chapterMult * starBonus);
  return { exp, shards: [], universal: stageUniversalReward(type) };
}

/**
 * 关卡产出的通用碎片：普通关不产（保住抽卡与商店的位置），
 * 精英档起按 shardMult 折算，量级对齐「一天精英若干场 ≈ 推动一次低星升星」。
 */
export function stageUniversalReward(type: StageType): number {
  const st = getStageType(type);
  if (st.shardMult <= 1) return 0;
  return Math.floor(ECONOMY.universal.stageEliteBase * st.shardMult);
}
