/**
 * 成长曲线公式（纯函数，零状态）
 */
import { GROWTH, getStarProfile } from '@/balance/growth';
import type { PetDef } from '@/balance/pets';
import type { EnemyDef } from '@/balance/enemies';
import { PET_ROLE_PROFILES, type StatBlock } from '@/balance/petRoles';
import { getRarity } from '@/balance/rarity';

type StatKey = keyof StatBlock;

function petBaseStat(pet: PetDef, stat: StatKey): number {
  const profile = PET_ROLE_PROFILES[pet.role];
  const mult = pet.statProfile?.[stat] ?? 1;
  return profile.base[stat] * mult;
}

function petGrowth(pet: PetDef, stat: StatKey): number {
  const profile = PET_ROLE_PROFILES[pet.role];
  return pet.growthProfile?.[stat] ?? profile.growth[stat];
}

function selfStatTraitMultiplier(pet: PetDef, stat: StatKey): number {
  let mult = 1;
  for (const trait of pet.traits ?? []) {
    if (trait.type !== 'statBonus') continue;
    if (trait.scope !== 'self') continue;
    if (trait.stat !== stat) continue;
    if (trait.element && trait.element !== pet.element) continue;
    if (trait.role && trait.role !== pet.role) continue;
    mult *= 1 + trait.pct;
  }
  return mult;
}

/**
 * 三维统一成长公式：
 *   role 基础 × 稀有度面板倍率 × 星级初始倍率 × (1 + role 成长率 × 星级成长倍率)^(有效等级-1) × 自身 trait 倍率
 * - 同 role + 同 rarity + 同星 + 同等级数值一致（R = 模板基准）
 * - 稀有度决定初始三维档位（明显递增）；星级同时影响初始值与成长率，并通过 maxLevel 限制等级上限
 */
function petStat(pet: PetDef, stat: StatKey, level: number, star: number): number {
  const sp = getStarProfile(star);
  const rarityMult = getRarity(pet.rarity).statMult;
  const effLevel = Math.min(Math.max(level, 1), sp.maxLevel);
  const base = petBaseStat(pet, stat) * rarityMult * sp.baseMult[stat];
  const growth = petGrowth(pet, stat) * sp.growthMult[stat];
  return Math.floor(
    base
    * Math.pow(1 + growth, effLevel - 1)
    * selfStatTraitMultiplier(pet, stat),
  );
}

/** 宠物当前攻击 */
export function petAtk(pet: PetDef, level: number, star: number): number {
  return petStat(pet, 'atk', level, star);
}

/** 宠物当前生命 */
export function petHp(pet: PetDef, level: number, star: number): number {
  return petStat(pet, 'hp', level, star);
}

/** 宠物当前回复 */
export function petRcv(pet: PetDef, level: number, star: number): number {
  return petStat(pet, 'rcv', level, star);
}

/** 宠物升到 level+1 所需经验 */
export function petExpToNext(level: number): number {
  return Math.floor(GROWTH.pet.expBase * Math.pow(GROWTH.pet.expGrowth, level - 1));
}

export interface EnemyStats {
  hp: number;
  atk: number;
  def: number;
}

/** 敌人实际数值 = 模板基值 × 章节成长^(章节-1) × 关卡难度系数 */
export function enemyStats(enemy: EnemyDef, chapter: number, difficulty: number): EnemyStats {
  const g = GROWTH.enemy;
  const ch = chapter - 1;
  return {
    hp: Math.floor(enemy.baseHp * Math.pow(g.chapterGrowthHp, ch) * difficulty),
    atk: Math.floor(enemy.baseAtk * Math.pow(g.chapterGrowthAtk, ch) * difficulty),
    def: Math.floor(enemy.baseDef * Math.pow(g.chapterGrowthDef, ch) * difficulty),
  };
}
