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

const MAIN_DROP_TABLES: Readonly<Record<string, DropTable>> = {
  dt_forest_metal: { id: 'dt_forest_metal', expBase: 130, shards: [] },
  dt_forest_wood: { id: 'dt_forest_wood', expBase: 135, shards: [] },
  dt_forest_water: { id: 'dt_forest_water', expBase: 140, shards: [] },
  dt_forest_fire: { id: 'dt_forest_fire', expBase: 145, shards: [] },
  dt_forest_boss: { id: 'dt_forest_boss', expBase: 320, shards: [] },

  dt_cave_normal: { id: 'dt_cave_normal', expBase: 150, shards: [] },
  dt_cave_elite: { id: 'dt_cave_elite', expBase: 200, shards: [] },
  dt_cave_boss: { id: 'dt_cave_boss', expBase: 325, shards: [] },

  dt_peak_normal: { id: 'dt_peak_normal', expBase: 225, shards: [] },
  dt_peak_elite: { id: 'dt_peak_elite', expBase: 300, shards: [] },
  dt_peak_boss: { id: 'dt_peak_boss', expBase: 475, shards: [] },

  dt_daily_exp: { id: 'dt_daily_exp', expBase: 375, shards: [] },
  dt_daily_shard: { id: 'dt_daily_shard', expBase: 150, shards: [] },

  /** 历练铺垫关通用 */
  dt_trial_normal: { id: 'dt_trial_normal', expBase: 260, shards: [] },
  dt_trial_elite: { id: 'dt_trial_elite', expBase: 300, shards: [] },

  /** 4～8 章 Boss 收录关（每章 1 只） */
  dt_ch4_boss: { id: 'dt_ch4_boss', expBase: 340, shards: [] },
  dt_ch5_boss: { id: 'dt_ch5_boss', expBase: 360, shards: [] },
  dt_ch6_boss: { id: 'dt_ch6_boss', expBase: 380, shards: [] },
  dt_ch7_boss: { id: 'dt_ch7_boss', expBase: 400, shards: [] },
  dt_ch8_boss: { id: 'dt_ch8_boss', expBase: 450, shards: [] },
};

export const DROP_TABLES: Readonly<Record<string, DropTable>> = {
  ...MAIN_DROP_TABLES,
};

export function getDropTable(id: string): DropTable | undefined {
  return DROP_TABLES[id];
}
