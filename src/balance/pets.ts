/**
 * 灵宠数值表 —— 阶段九起收敛为「统一生物体系」的宠物面视图（纯数据，零逻辑）
 *
 * 单一真源是 balance/creatures.ts 的 CreatureDef；本文件只把它投影成 PetDef（宠物面），
 * 并保留 `PETS` / `PET_MAP` / `DEFAULT_TEAM` 等历史导出名以减少改动面。
 * 严禁在此另维护第二套宠物数据——新增/改宠一律改 creatures.ts。
 *
 * 三维数值模型（atk / hp / rcv）：
 * - 同 role + 同 rarity + 同星级 → 初始三维与成长曲线一致（R = petRoles.ts 模板基准）
 * - 稀有度决定初始三维档位（见 balance/rarity.ts 的 statMult）
 * - 个体差异仅来自 skillId + 战斗向 traits
 */
import type { Element } from './combat';
import type { PetRole, PetTraitDef, StatBlock, GrowthBlock } from './petRoles';
import type { Rarity } from './rarity';
import { CREATURES, STARTER_CREATURE_IDS, type CreatureDef } from './creatures';
import { resolvePassiveForCreature, type ResolvedPassive } from './passives';
export { PET_ROLE_NAME, getPetRole, getStatUi, STAT_UI, type PetRole, type PetTraitDef, type StatKey, type StatUiDef } from './petRoles';
export type { Rarity } from './rarity';
export type { ResolvedPassive } from './passives';

export interface PetDef {
  id: string;
  name: string;
  element: Element;
  /** 天生稀有度（引用键），行为见 balance/rarity.ts；与养成进度 star 正交 */
  rarity: Rarity;
  role: PetRole;
  /** 相对 role 模板的个体倍率；默认 1 */
  statProfile?: Partial<StatBlock>;
  /** 相对 role 模板的成长率覆盖；默认用模板 */
  growthProfile?: Partial<GrowthBlock>;
  /** 主动技能引用，具体效果在 balance/skills.ts */
  skillId: string;
  /**
   * 已解析的 stat 类被动（= 签名被动的 stat 部分 + 专属修饰），供既有运行时钩子读取
   * （growth.ts / team.ts / BattleController / SkillEngine）。由 petView 统一计算。
   */
  traits?: readonly PetTraitDef[];
  /** 统一被动（签名 ×稀有度 + 专属）。展示与触发型战斗钩子的唯一来源 */
  passive: ResolvedPassive;
}

/** 生物 → 宠物面视图（剥离怪物面，仅保留养成/战斗用的宠物字段） */
function petView(c: CreatureDef): PetDef {
  const passive = resolvePassiveForCreature(c.role, c.rarity);
  return {
    id: c.id,
    name: c.name,
    element: c.element,
    rarity: c.rarity,
    role: c.role,
    statProfile: c.statProfile,
    growthProfile: c.growthProfile,
    skillId: c.skillId,
    traits: passive.traits,
    passive,
  };
}

/** 宠物最终被动的唯一读取入口（展示 / 战斗共用） */
export function passiveForPet(pet: PetDef): ResolvedPassive {
  return pet.passive;
}

export const PETS: readonly PetDef[] = CREATURES.map(petView);

export const PET_MAP: ReadonlyMap<string, PetDef> = new Map(PETS.map((p) => [p.id, p]));

/**
 * 默认编队 = 初始赠送阵容（五行各 1）。
 * 阶段九：退役旧 10 只 pet_*_001/002，初始队改由 creatures.ts 的 STARTER_CREATURE_IDS 提供。
 */
export const DEFAULT_TEAM: readonly string[] = [...STARTER_CREATURE_IDS];

/** 编队槽位数 */
export const TEAM_SIZE = 5;

/** 新拥有灵宠的初始等级/星级 */
export const INITIAL_PET_LEVEL = 1;
export const INITIAL_PET_STAR = 1;
