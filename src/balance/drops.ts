/**
 * 掉落表抽象（纯数据，零逻辑）
 *
 * 关卡战斗仅产经验；碎片不在关卡掉落（防无限刷，见 formulas/economyOutput.stageDrops）。
 */
export interface ShardDrop {
  petId: string;
  amount: number;
}

export interface DropTable {
  id: string;
  expBase: number;
  /** 保留字段供策划/面板扩展；当前关卡结算不读此列 */
  shards: readonly ShardDrop[];
}

/**
 * v0.5 经济收紧：各表 expBase 约 -25%~30%，配合升级涨价与重复经验衰减，
 * 目标约 4–5 天到第 7 章。章内/跨章相对梯度保持。
 */
const MAIN_DROP_TABLES: Readonly<Record<string, DropTable>> = {
  dt_forest_metal: { id: 'dt_forest_metal', expBase: 95, shards: [] },
  dt_forest_wood: { id: 'dt_forest_wood', expBase: 100, shards: [] },
  dt_forest_water: { id: 'dt_forest_water', expBase: 105, shards: [] },
  dt_forest_fire: { id: 'dt_forest_fire', expBase: 105, shards: [] },
  dt_forest_boss: { id: 'dt_forest_boss', expBase: 230, shards: [] },

  dt_cave_normal: { id: 'dt_cave_normal', expBase: 110, shards: [] },
  dt_cave_elite: { id: 'dt_cave_elite', expBase: 145, shards: [] },
  dt_cave_boss: { id: 'dt_cave_boss', expBase: 235, shards: [] },

  dt_peak_normal: { id: 'dt_peak_normal', expBase: 165, shards: [] },
  dt_peak_elite: { id: 'dt_peak_elite', expBase: 220, shards: [] },
  dt_peak_boss: { id: 'dt_peak_boss', expBase: 345, shards: [] },

  dt_daily_exp: { id: 'dt_daily_exp', expBase: 270, shards: [] },
  dt_daily_shard: { id: 'dt_daily_shard', expBase: 110, shards: [] },

  /** 历练铺垫关通用 */
  dt_trial_normal: { id: 'dt_trial_normal', expBase: 180, shards: [] },
  dt_trial_elite: { id: 'dt_trial_elite', expBase: 210, shards: [] },

  /** 4～16 章 Boss 收录关（每章 1 只）：经验按章递进，终章额外加码 */
  dt_ch4_boss: { id: 'dt_ch4_boss', expBase: 245, shards: [] },
  dt_ch5_boss: { id: 'dt_ch5_boss', expBase: 260, shards: [] },
  dt_ch6_boss: { id: 'dt_ch6_boss', expBase: 275, shards: [] },
  dt_ch7_boss: { id: 'dt_ch7_boss', expBase: 290, shards: [] },
  dt_ch8_boss: { id: 'dt_ch8_boss', expBase: 325, shards: [] },
  dt_ch9_boss: { id: 'dt_ch9_boss', expBase: 340, shards: [] },
  dt_ch10_boss: { id: 'dt_ch10_boss', expBase: 355, shards: [] },
  dt_ch11_boss: { id: 'dt_ch11_boss', expBase: 370, shards: [] },
  dt_ch12_boss: { id: 'dt_ch12_boss', expBase: 385, shards: [] },
  dt_ch13_boss: { id: 'dt_ch13_boss', expBase: 400, shards: [] },
  dt_ch14_boss: { id: 'dt_ch14_boss', expBase: 415, shards: [] },
  dt_ch15_boss: { id: 'dt_ch15_boss', expBase: 430, shards: [] },
  dt_ch16_boss: { id: 'dt_ch16_boss', expBase: 465, shards: [] },
};

export const DROP_TABLES: Readonly<Record<string, DropTable>> = {
  ...MAIN_DROP_TABLES,
};

export function getDropTable(id: string): DropTable | undefined {
  return DROP_TABLES[id];
}
