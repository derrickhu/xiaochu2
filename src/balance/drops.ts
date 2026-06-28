/**
 * 掉落表抽象（纯数据，零逻辑）
 */
export interface ShardDrop {
  petId: string;
  amount: number;
}

export interface DropTable {
  id: string;
  expBase: number;
  shards: readonly ShardDrop[];
}

const MAIN_DROP_TABLES: Readonly<Record<string, DropTable>> = {
  dt_forest_metal: { id: 'dt_forest_metal', expBase: 130, shards: [{ petId: 'pet_001', amount: 3 }] },
  dt_forest_wood: { id: 'dt_forest_wood', expBase: 135, shards: [{ petId: 'pet_003', amount: 3 }] },
  dt_forest_water: { id: 'dt_forest_water', expBase: 140, shards: [{ petId: 'pet_005', amount: 3 }] },
  dt_forest_fire: { id: 'dt_forest_fire', expBase: 145, shards: [{ petId: 'pet_007', amount: 3 }] },
  dt_forest_boss: {
    id: 'dt_forest_boss', expBase: 320,
    shards: [{ petId: 'pet_017', amount: 5 }],
  },

  dt_cave_normal: { id: 'dt_cave_normal', expBase: 150, shards: [{ petId: 'pet_017', amount: 3 }] },
  dt_cave_elite: {
    id: 'dt_cave_elite', expBase: 200,
    shards: [{ petId: 'pet_004', amount: 4 }, { petId: 'pet_020', amount: 2 }],
  },
  dt_cave_boss: {
    id: 'dt_cave_boss', expBase: 325,
    shards: [{ petId: 'pet_004', amount: 5 }],
  },

  dt_peak_normal: { id: 'dt_peak_normal', expBase: 225, shards: [{ petId: 'pet_009', amount: 3 }] },
  dt_peak_elite: {
    id: 'dt_peak_elite', expBase: 300,
    shards: [{ petId: 'pet_020', amount: 4 }, { petId: 'pet_009', amount: 3 }],
  },
  dt_peak_boss: {
    id: 'dt_peak_boss', expBase: 475,
    shards: [{ petId: 'pet_028', amount: 5 }],
  },

  dt_daily_exp: { id: 'dt_daily_exp', expBase: 375, shards: [] },
  dt_daily_shard: {
    id: 'dt_daily_shard', expBase: 150,
    shards: [{ petId: 'pet_002', amount: 4 }, { petId: 'pet_008', amount: 4 }],
  },

  /** 历练铺垫关通用 */
  dt_trial_normal: { id: 'dt_trial_normal', expBase: 260, shards: [{ petId: 'pet_011', amount: 2 }] },
  dt_trial_elite: { id: 'dt_trial_elite', expBase: 300, shards: [{ petId: 'pet_010', amount: 3 }] },

  /** 4～8 章 Boss 收录关（每章 1 只） */
  dt_ch4_boss: { id: 'dt_ch4_boss', expBase: 340, shards: [{ petId: 'pet_014', amount: 5 }] },
  dt_ch5_boss: { id: 'dt_ch5_boss', expBase: 360, shards: [{ petId: 'pet_011', amount: 5 }] },
  dt_ch6_boss: { id: 'dt_ch6_boss', expBase: 380, shards: [{ petId: 'pet_010', amount: 5 }] },
  dt_ch7_boss: { id: 'dt_ch7_boss', expBase: 400, shards: [{ petId: 'pet_030', amount: 5 }] },
  dt_ch8_boss: { id: 'dt_ch8_boss', expBase: 450, shards: [{ petId: 'pet_026', amount: 5 }] },
};

export const DROP_TABLES: Readonly<Record<string, DropTable>> = {
  ...MAIN_DROP_TABLES,
};

export function getDropTable(id: string): DropTable | undefined {
  return DROP_TABLES[id];
}
