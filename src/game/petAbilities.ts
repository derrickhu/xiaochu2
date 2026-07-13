/**
 * 宠物能力快照门面（derive 层，纯函数）
 *
 * 战斗与 UI 统一从这里取「一只宠在某个养成进度下的全部能力」：
 * - 主动技（星级 tier × 技能等级 mastery 已折算）+ 下一里程碑
 * - 被动列表（等级/星级双轨解锁状态 + 展示行）
 *
 * 未来觉醒/装备等系统的效果并入本快照即可，消费方零改动。
 */
import type { PetDef } from '@/balance/pets';
import type { SkillDef } from '@/balance/skills';
import {
  resolvePetPassiveBundle,
  type PassiveEffectBundle,
  type PassiveDisplayLine,
} from '@/balance/passiveEffects';
import {
  skillMasteryRank, nextMasteryMilestone, type SkillMasteryMilestone,
} from '@/balance/skillGrowth';
import type { PetProgress } from '@/balance/progression/requirements';
import { skillForPet } from './battle/SkillEngine';

export type { PetProgress };

export interface ResolvedActiveSkill {
  skill: SkillDef;
  /** 技能等级 Lv.1~5（等级里程碑派生） */
  masteryRank: number;
  /** 下一个技能等级里程碑；满级 null */
  nextMilestone: SkillMasteryMilestone | null;
}

export interface ResolvedPetAbilities {
  active: ResolvedActiveSkill;
  /** 被动展示行（含锁定行 + 解锁条件） */
  passiveLines: readonly PassiveDisplayLine[];
  /** 完整被动 bundle（战斗聚合/高级消费方用） */
  bundle: PassiveEffectBundle;
}

/** 单一出口：宠物定义 + 养成进度 → 能力快照 */
export function resolvePetAbilities(pet: PetDef, progress: PetProgress): ResolvedPetAbilities {
  const bundle = resolvePetPassiveBundle(
    pet.role, pet.rarity, progress, { includeStarInDisplay: true },
  );
  return {
    active: {
      skill: skillForPet(pet, progress.star, progress.level),
      masteryRank: skillMasteryRank(progress.level),
      nextMilestone: nextMasteryMilestone(progress.level),
    },
    passiveLines: bundle.displayLines,
    bundle,
  };
}

export interface AbilityUnlockDiff {
  /** 本次新解锁的被动名（displayLines 口径） */
  newPassives: string[];
  /** 技能等级提升；无变化为 null */
  masteryUp: { from: number; to: number } | null;
}

/** 升级/升星前后能力差分（驱动解锁反馈：Toast/特效/事件） */
export function diffAbilityUnlocks(
  pet: PetDef,
  before: PetProgress,
  after: PetProgress,
): AbilityUnlockDiff {
  const a = resolvePetAbilities(pet, before);
  const b = resolvePetAbilities(pet, after);

  const newPassives: string[] = [];
  const beforeEffects = a.bundle.effects;
  const afterEffects = b.bundle.effects;
  // 同一 pet 两次解析的 effects 顺序稳定（signature → ladder → star），按位比较
  for (let i = 0; i < afterEffects.length && i < beforeEffects.length; i++) {
    if (!beforeEffects[i].unlocked && afterEffects[i].unlocked) {
      const name = afterEffects[i].displayName;
      if (name && !newPassives.includes(name)) newPassives.push(name);
    }
  }

  const masteryUp = b.active.masteryRank > a.active.masteryRank
    ? { from: a.active.masteryRank, to: b.active.masteryRank }
    : null;

  return { newPassives, masteryUp };
}
