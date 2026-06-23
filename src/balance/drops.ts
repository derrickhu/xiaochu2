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
/**
 * 阶段八经验产出重做：expBase 整体上调 ~2.5×，与压平后的经验曲线（growth.ts）对齐，
 * 使「首通一章 ≈ 把主队推进数级」。碎片产出不变（升星节奏单独由 ECONOMY 控制）。
 */
import { CREATURE_IDS } from './creatures';

const MAIN_DROP_TABLES: Readonly<Record<string, DropTable>> = {
  // 第一章：碎片优先喂初始五行起手宠（_003）
  dt_forest_metal: { id: 'dt_forest_metal', expBase: 100, shards: [{ petId: 'pet_metal_003', amount: 3 }] },
  dt_forest_wood: { id: 'dt_forest_wood', expBase: 105, shards: [{ petId: 'pet_wood_003', amount: 3 }] },
  dt_forest_water: { id: 'dt_forest_water', expBase: 110, shards: [{ petId: 'pet_water_003', amount: 3 }] },
  dt_forest_fire: { id: 'dt_forest_fire', expBase: 115, shards: [{ petId: 'pet_fire_003', amount: 3 }] },
  dt_forest_elite: {
    id: 'dt_forest_elite', expBase: 140,
    shards: [{ petId: 'pet_fire_004', amount: 4 }, { petId: 'pet_metal_004', amount: 2 }],
  },
  dt_forest_boss: {
    id: 'dt_forest_boss', expBase: 230,
    shards: [{ petId: 'pet_wood_004', amount: 5 }, { petId: 'pet_water_004', amount: 2 }],
  },

  // 第二章：碎片转向进阶宠
  dt_cave_normal: { id: 'dt_cave_normal', expBase: 150, shards: [{ petId: 'pet_metal_004', amount: 3 }] },
  dt_cave_elite: {
    id: 'dt_cave_elite', expBase: 200,
    shards: [{ petId: 'pet_water_004', amount: 4 }, { petId: 'pet_fire_004', amount: 2 }],
  },
  dt_cave_boss: {
    id: 'dt_cave_boss', expBase: 325,
    shards: [{ petId: 'pet_earth_003', amount: 5 }, { petId: 'pet_wood_004', amount: 3 }],
  },

  // 第三章：高稀有碎片
  dt_peak_normal: { id: 'dt_peak_normal', expBase: 225, shards: [{ petId: 'pet_earth_003', amount: 3 }] },
  dt_peak_elite: {
    id: 'dt_peak_elite', expBase: 300,
    shards: [{ petId: 'pet_water_004', amount: 4 }, { petId: 'pet_earth_003', amount: 3 }],
  },
  dt_peak_boss: {
    id: 'dt_peak_boss', expBase: 475,
    shards: [{ petId: 'pet_earth_004', amount: 4 }, { petId: 'pet_water_004', amount: 4 }],
  },

  // 每日资源本：高经验，少量通用碎片
  dt_daily_exp: { id: 'dt_daily_exp', expBase: 375, shards: [] },
  dt_daily_shard: {
    id: 'dt_daily_shard', expBase: 150,
    shards: [{ petId: 'pet_metal_004', amount: 4 }, { petId: 'pet_fire_004', amount: 4 }],
  },
};

/**
 * 历练章掉落（阶段九）：每个收录关掉落「该生物本体」的碎片——
 * 击败高级形态收录后，刷本即可攒碎片直接拥有，形成「打怪→收录→碎片拥有」闭环。
 */
const TRIAL_DROP_TABLES: Record<string, DropTable> = Object.fromEntries(
  CREATURE_IDS.map((cid): [string, DropTable] => [
    `dt_trial_${cid}`,
    { id: `dt_trial_${cid}`, expBase: 320, shards: [{ petId: cid, amount: 4 }] },
  ]),
);

export const DROP_TABLES: Readonly<Record<string, DropTable>> = {
  ...MAIN_DROP_TABLES,
  ...TRIAL_DROP_TABLES,
};

export function getDropTable(id: string): DropTable | undefined {
  return DROP_TABLES[id];
}
