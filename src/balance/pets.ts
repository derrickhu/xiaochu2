/**
 * 灵宠数值表 —— 阶段九起收敛为「统一生物体系」的宠物面视图（纯数据，零逻辑）
 */
import type { Element } from './combat';
import type { PetRole, SkillTraitDef, StatBlock, GrowthBlock } from './petRoles';
import type { Rarity } from './rarity';
import { CREATURES, STARTER_CREATURE_IDS, type CreatureDef } from './creatures';
import { resolvePetPassiveBundle, type PassiveEffectBundle } from './passiveEffects';
export { PET_ROLE_NAME, getPetRole, getStatUi, STAT_UI, type PetRole, type PetTraitDef, type SkillTraitDef, type StatKey, type StatUiDef } from './petRoles';
export type { Rarity } from './rarity';
export type { PassiveEffectBundle } from './passiveEffects';

export interface PetDef {
  id: string;
  name: string;
  element: Element;
  rarity: Rarity;
  role: PetRole;
  statProfile?: Partial<StatBlock>;
  growthProfile?: Partial<GrowthBlock>;
  skillId: string;
  /** 专属技能修饰 / 元素克制（非 PassiveEffect 管线） */
  skillTraits?: readonly SkillTraitDef[];
}

function petView(c: CreatureDef): PetDef {
  return {
    id: c.id,
    name: c.name,
    element: c.element,
    rarity: c.rarity,
    role: c.role,
    statProfile: c.statProfile,
    growthProfile: c.growthProfile,
    skillId: c.skillId,
    skillTraits: c.skillTraits,
  };
}

/** 按 runtime star 解析 PassiveEffect bundle */
export function passiveBundleFor(pet: PetDef, star: number, options?: { includeStarInDisplay?: boolean }) {
  return resolvePetPassiveBundle(pet.role, pet.rarity, star, options);
}

export { resolvePetPassiveBundle };

export const PETS: readonly PetDef[] = CREATURES.map(petView);

export const PET_MAP: ReadonlyMap<string, PetDef> = new Map(PETS.map((p) => [p.id, p]));

export const DEFAULT_TEAM: readonly string[] = [...STARTER_CREATURE_IDS];

export const TEAM_SIZE = 5;

export const INITIAL_PET_LEVEL = 1;
export const INITIAL_PET_STAR = 1;
