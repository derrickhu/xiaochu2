/**
 * 灵宠数值表（纯数据，零逻辑）
 *
 * 单一真源：数值与文案内聚在同一条记录，
 * 修正 xiao_chu 的 pets.js 字面量 + petBase.js merge 双写问题。
 *
 * 骨架阶段只放 5 只首发灵宠（每属性 1 只），后续扩表。
 */
import type { Element } from './combat';

export type Rarity = 1 | 2 | 3 | 4 | 5;

export interface PetDef {
  id: string;
  name: string;
  element: Element;
  rarity: Rarity;
  /** 1 级基础攻击 */
  baseAtk: number;
  /** 每级攻击成长率（复利） */
  atkGrowth: number;
  /** 技能（骨架阶段仅占位描述，数值与文案内聚） */
  skill?: {
    desc: string;
    /** 触发所需同色消除数 */
    triggerMatch: number;
    /** 技能伤害倍率 */
    multiplier: number;
  };
}

export const PETS: readonly PetDef[] = [
  {
    id: 'pet_metal_001',
    name: '银爪幼狸',
    element: 'metal',
    rarity: 1,
    baseAtk: 50,
    atkGrowth: 0.06,
    skill: { desc: '5 连消金珠时，追加 200% 金属性斩击', triggerMatch: 5, multiplier: 2.0 },
  },
  {
    id: 'pet_wood_001',
    name: '青藤小鹿',
    element: 'wood',
    rarity: 1,
    baseAtk: 48,
    atkGrowth: 0.06,
    skill: { desc: '5 连消木珠时，追加 200% 木属性缠击', triggerMatch: 5, multiplier: 2.0 },
  },
  {
    id: 'pet_water_001',
    name: '碧波灵鲤',
    element: 'water',
    rarity: 1,
    baseAtk: 46,
    atkGrowth: 0.065,
    skill: { desc: '5 连消水珠时，追加 200% 水属性激流', triggerMatch: 5, multiplier: 2.0 },
  },
  {
    id: 'pet_fire_001',
    name: '赤焰雀',
    element: 'fire',
    rarity: 1,
    baseAtk: 54,
    atkGrowth: 0.055,
    skill: { desc: '5 连消火珠时，追加 200% 火属性爆燃', triggerMatch: 5, multiplier: 2.0 },
  },
  {
    id: 'pet_earth_001',
    name: '岩甲幼龟',
    element: 'earth',
    rarity: 1,
    baseAtk: 44,
    atkGrowth: 0.07,
    skill: { desc: '5 连消土珠时，追加 200% 土属性碎岩', triggerMatch: 5, multiplier: 2.0 },
  },
];

export const PET_MAP: ReadonlyMap<string, PetDef> = new Map(PETS.map((p) => [p.id, p]));

/** 可玩 Demo：固定队伍的等级/星级（招募养成上线后由 PlayerData 接管） */
export const DEMO_TEAM_LEVEL = 5;
export const DEMO_TEAM_STAR = 1;
