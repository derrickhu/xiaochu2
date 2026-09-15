/**
 * 成长曲线公式（纯函数，零状态）
 */
import { GROWTH, getStarProfile } from '@/balance/growth';
import type { PetDef } from '@/balance/pets';
import type { EnemyDef } from '@/balance/enemies';
import { PET_ROLE_PROFILES, type StatBlock } from '@/balance/petRoles';
import { getRarity } from '@/balance/rarity';
import {
  NO_TUTORIAL_GRACE,
  tutorialGraceFor,
  type TutorialGrace,
} from '@/balance/powerBudget';
import { selfStatMultiplier } from './passiveCombat';

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
    * selfStatMultiplier(pet, star, stat, effLevel),
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

/**
 * 敌人实际数值 = 模板基值 × 全局血量基准 × 章节成长^(章节-1) × 关卡难度系数 × 新手保护
 *
 * `grace` 只在教学期前几关不为 1，见 powerBudget.TUTORIAL_GRACE。
 * 拿着 StageDef 的调用方一律走 `enemyStatsForStage`，别自己传 grace ——
 * 编队页敌情卡与实际战斗必须读同一份数值，两处各算一次早晚会漂。
 */
export function enemyStats(
  enemy: EnemyDef,
  chapter: number,
  difficulty: number,
  grace: TutorialGrace = NO_TUTORIAL_GRACE,
): EnemyStats {
  const g = GROWTH.enemy;
  const ch = chapter - 1;
  return {
    hp: Math.max(1, Math.floor(
      enemy.baseHp * g.hpScale * Math.pow(g.chapterGrowthHp, ch) * difficulty * grace.hp,
    )),
    atk: Math.max(1, Math.floor(
      enemy.baseAtk * Math.pow(g.chapterGrowthAtk, ch) * difficulty * grace.atk,
    )),
    def: Math.floor(enemy.baseDef * Math.pow(g.chapterGrowthDef, ch) * difficulty),
  };
}

/** 按关卡取敌人数值：自动带上该关的新手保护系数 */
export function enemyStatsForStage(
  enemy: EnemyDef,
  stage: { id: string; chapter: number; difficulty: number },
): EnemyStats {
  return enemyStats(enemy, stage.chapter, stage.difficulty, tutorialGraceFor(stage.id));
}
