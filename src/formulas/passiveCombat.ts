/**
 * 被动效果战斗聚合（Phase A）—— 从 PassiveEffect bundle + EFFECT_REGISTRY 驱动，
 * 替代 teamPassiveAggregate / teamAttribAggregate / traits 乘区。
 */
import { COMBAT } from '@/balance/combat';
import {
  computePetCombatAttribs,
  resolvePetPassiveBundle,
  type PassiveEffect,
} from '@/balance/passiveEffects';
import type { PetDef } from '@/balance/pets';
import type { StatBlock } from '@/balance/petRoles';
import type { TeamMember } from './team';

type StatKey = keyof StatBlock;

const round4 = (v: number): number => Math.round(v * 10000) / 10000;

export interface TeamEffectBundle {
  damageReduction: number;
  healBonus: number;
  /** 1 + Σ teamDamageBonus（合并原 passives + attrib 两路增伤） */
  teamDamageMult: number;
  startShieldPct: number;
  regenPct: number;
}

/** 队伍级被动效果聚合 */
export function teamEffectAggregate(members: readonly TeamMember[]): TeamEffectBundle {
  let drSum = 0;
  let healSum = 0;
  let dmgBonusSum = 0;
  let shieldSum = 0;
  let regenSum = 0;

  for (const m of members) {
    const attribs = computePetCombatAttribs(m.def.role, m.def.rarity, m.star);
    drSum += attribs.damageReduction;
    healSum += attribs.healBonus;
    dmgBonusSum += attribs.teamDamageBonus;

    const bundle = resolvePetPassiveBundle(m.def.role, m.def.rarity, m.star);
    for (const e of bundle.effects) {
      if (!e.unlocked) continue;
      if (e.kind === 'teamDamageBonus' && e.source === 'ladder') dmgBonusSum += e.value;
      else if (e.kind === 'startShieldPct') shieldSum += e.value;
      else if (e.kind === 'regenPct') regenSum += e.value;
    }
  }

  return {
    damageReduction: round4(Math.min(COMBAT.damageReductionCap, drSum)),
    healBonus: round4(Math.min(COMBAT.healBonusCap, healSum)),
    teamDamageMult: round4(1 + Math.max(0, dmgBonusSum)),
    startShieldPct: round4(shieldSum),
    regenPct: round4(regenSum),
  };
}

/** 个体暴击（不队伍聚合） */
export function petSelfCombatProfile(
  pet: PetDef,
  star: number,
): { critRate: number; critDamage: number } {
  const a = computePetCombatAttribs(pet.role, pet.rarity, star);
  return { critRate: a.critRate, critDamage: a.critDamage };
}

function statBonusMatches(
  e: PassiveEffect, stat: StatKey, target: PetDef, sourcePet: PetDef,
): boolean {
  if (e.kind !== 'statBonus' || !e.stat || e.stat !== stat) return false;
  if (e.statScope === 'self') {
    return sourcePet === target;
  }
  if (e.statScope !== 'team') return false;
  return true;
}

function teamAuraMatches(e: PassiveEffect, stat: StatKey): boolean {
  return e.kind === 'teamAura' && !!e.stat && e.stat === stat;
}

function auraConditionMet(
  e: PassiveEffect, members: readonly TeamMember[],
): boolean {
  if (!e.aura) return false;
  const count = members.filter((m) => {
    if (e.aura!.requireRole && m.def.role !== e.aura!.requireRole) return false;
    if (e.aura!.requireElement && m.def.element !== e.aura!.requireElement) return false;
    return true;
  }).length;
  return count >= e.aura.count;
}

/** 三维/光环乘区（替代 teamTraitMultiplier） */
export function teamStatMultiplier(
  members: readonly TeamMember[],
  target: TeamMember,
  stat: StatKey,
): number {
  let mult = 1;
  for (const source of members) {
    const bundle = resolvePetPassiveBundle(source.def.role, source.def.rarity, source.star);
    for (const e of bundle.statEffects) {
      if (statBonusMatches(e, stat, target.def, source.def)) {
        mult *= 1 + e.value;
      }
      if (teamAuraMatches(e, stat) && auraConditionMet(e, members)) {
        mult *= 1 + e.value;
      }
    }
  }
  return mult;
}

/** 个体 statBonus self 乘区（替代 selfStatTraitMultiplier） */
export function selfStatMultiplier(pet: PetDef, star: number, stat: StatKey): number {
  let mult = 1;
  const bundle = resolvePetPassiveBundle(pet.role, pet.rarity, star);
  for (const e of bundle.statEffects) {
    if (e.kind !== 'statBonus' || e.statScope !== 'self') continue;
    if (e.stat !== stat) continue;
    mult *= 1 + e.value;
  }
  return mult;
}
