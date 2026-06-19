/**
 * 掉落表抽象（纯数据，零逻辑）
 *
 * 与关卡解耦：StageDef 只引用 dropTableId，掉落内容集中在此维护。
 * 经验为升级燃料（跨宠共享池），碎片为指定灵宠的升星材料。
 * 产出公式（按章节/星数/关卡类型放大）见 formulas/economyOutput.ts。
 */

/** 一项碎片掉落：指定灵宠 + 单次通关基础数量 */
export interface ShardDrop {
  petId: string;
  amount: number;
}

export interface DropTable {
  id: string;
  /** 单次通关基础经验（再按章节/类型/星数放大） */
  expBase: number;
  /** 固定碎片掉落（按关卡类型 shardMult 放大） */
  shards: readonly ShardDrop[];
}

/**
 * 第一章掉落：碎片优先喂默认队（金/木/水/火 四色起手宠），
 * Boss 关额外掉招募向高稀有宠碎片，制造「升星 + 收集」双驱动。
 */
export const DROP_TABLES: Readonly<Record<string, DropTable>> = {
  dt_forest_metal: { id: 'dt_forest_metal', expBase: 40, shards: [{ petId: 'pet_metal_001', amount: 3 }] },
  dt_forest_wood: { id: 'dt_forest_wood', expBase: 42, shards: [{ petId: 'pet_wood_001', amount: 3 }] },
  dt_forest_water: { id: 'dt_forest_water', expBase: 44, shards: [{ petId: 'pet_water_001', amount: 3 }] },
  dt_forest_fire: { id: 'dt_forest_fire', expBase: 46, shards: [{ petId: 'pet_fire_001', amount: 3 }] },
  dt_forest_elite: {
    id: 'dt_forest_elite', expBase: 55,
    shards: [{ petId: 'pet_fire_002', amount: 4 }, { petId: 'pet_metal_002', amount: 2 }],
  },
  dt_forest_boss: {
    id: 'dt_forest_boss', expBase: 90,
    shards: [{ petId: 'pet_wood_002', amount: 5 }, { petId: 'pet_water_002', amount: 2 }],
  },

  // 第二章：碎片转向第二/三梯队招募宠
  dt_cave_normal: { id: 'dt_cave_normal', expBase: 60, shards: [{ petId: 'pet_metal_002', amount: 3 }] },
  dt_cave_elite: {
    id: 'dt_cave_elite', expBase: 80,
    shards: [{ petId: 'pet_water_002', amount: 4 }, { petId: 'pet_fire_002', amount: 2 }],
  },
  dt_cave_boss: {
    id: 'dt_cave_boss', expBase: 130,
    shards: [{ petId: 'pet_earth_001', amount: 5 }, { petId: 'pet_wood_002', amount: 3 }],
  },

  // 第三章：高稀有碎片（UR/LR），唯一非招募获取渠道，制造期待
  dt_peak_normal: { id: 'dt_peak_normal', expBase: 90, shards: [{ petId: 'pet_earth_001', amount: 3 }] },
  dt_peak_elite: {
    id: 'dt_peak_elite', expBase: 120,
    shards: [{ petId: 'pet_water_002', amount: 4 }, { petId: 'pet_earth_001', amount: 3 }],
  },
  dt_peak_boss: {
    id: 'dt_peak_boss', expBase: 190,
    shards: [{ petId: 'pet_earth_002', amount: 4 }, { petId: 'pet_water_002', amount: 4 }],
  },

  // 每日资源本：高经验，少量通用碎片
  dt_daily_exp: { id: 'dt_daily_exp', expBase: 150, shards: [] },
  dt_daily_shard: {
    id: 'dt_daily_shard', expBase: 60,
    shards: [{ petId: 'pet_metal_002', amount: 4 }, { petId: 'pet_fire_002', amount: 4 }],
  },
};

export function getDropTable(id: string): DropTable | undefined {
  return DROP_TABLES[id];
}
