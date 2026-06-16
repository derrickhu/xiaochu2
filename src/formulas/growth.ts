/**
 * 成长曲线公式（纯函数，零状态）
 */
import { GROWTH } from '@/balance/growth';
import type { PetDef } from '@/balance/pets';
import type { EnemyDef } from '@/balance/enemies';
import { PET_ROLE_PROFILES, type StatBlock } from '@/balance/petRoles';

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

/** 宠物当前攻击 = 基础攻击 × (1+成长率)^(Lv-1) × 星级倍率 */
export function petAtk(pet: PetDef, level: number, star: number): number {
  const starMult = GROWTH.pet.starMultiplier[star] ?? 1.0;
  return Math.floor(
    petBaseStat(pet, 'atk')
    * Math.pow(1 + petGrowth(pet, 'atk'), level - 1)
    * starMult
    * selfStatTraitMultiplier(pet, 'atk'),
  );
}

/** 宠物当前生命（曲线同攻击，使用 hp 维度参数） */
export function petHp(pet: PetDef, level: number, star: number): number {
  const starMult = GROWTH.pet.starMultiplier[star] ?? 1.0;
  return Math.floor(
    petBaseStat(pet, 'hp')
    * Math.pow(1 + petGrowth(pet, 'hp'), level - 1)
    * starMult
    * selfStatTraitMultiplier(pet, 'hp'),
  );
}

/** 宠物当前回复（曲线同攻击，使用 rcv 维度参数） */
export function petRcv(pet: PetDef, level: number, star: number): number {
  const starMult = GROWTH.pet.starMultiplier[star] ?? 1.0;
  return Math.floor(
    petBaseStat(pet, 'rcv')
    * Math.pow(1 + petGrowth(pet, 'rcv'), level - 1)
    * starMult
    * selfStatTraitMultiplier(pet, 'rcv'),
  );
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
