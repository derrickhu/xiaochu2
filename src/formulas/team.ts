/**
 * 队伍聚合公式（纯函数，零状态）
 */
import { COMBAT, type Element } from '@/balance/combat';
import type { PetDef } from '@/balance/pets';
import type { StatBlock } from '@/balance/petRoles';
import { petAtk, petHp, petRcv } from './growth';
import {
  teamEffectAggregate,
  teamStatMultiplier,
  type TeamEffectBundle,
} from './passiveCombat';

export interface TeamMember {
  def: PetDef;
  level: number;
  star: number;
}

type StatKey = keyof StatBlock;

export type { TeamEffectBundle };
export { teamEffectAggregate, teamStatMultiplier, selfStatMultiplier, petSelfCombatProfile } from './passiveCombat';

export function petAtkInTeam(members: readonly TeamMember[], target: TeamMember): number {
  return Math.floor(petAtk(target.def, target.level, target.star) * teamStatMultiplier(members, target, 'atk'));
}

export function petHpInTeam(members: readonly TeamMember[], target: TeamMember): number {
  return Math.floor(petHp(target.def, target.level, target.star) * teamStatMultiplier(members, target, 'hp'));
}

export function petRcvInTeam(members: readonly TeamMember[], target: TeamMember): number {
  return Math.floor(petRcv(target.def, target.level, target.star) * teamStatMultiplier(members, target, 'rcv'));
}

export function teamMaxHp(members: readonly TeamMember[]): number {
  let sum = COMBAT.heroBaseHp;
  for (const m of members) {
    sum += petHpInTeam(members, m);
  }
  return sum;
}

export function teamAtk(members: readonly TeamMember[]): number {
  let sum = 0;
  for (const m of members) {
    sum += petAtkInTeam(members, m);
  }
  return sum;
}

export function teamRcv(members: readonly TeamMember[]): number {
  let sum = 0;
  for (const m of members) {
    sum += petRcvInTeam(members, m);
  }
  return sum;
}

export function teamElements(members: readonly TeamMember[]): Set<Element> {
  return new Set(members.map((m) => m.def.element));
}

export function teamDamageReduction(members: readonly TeamMember[]): number {
  return teamEffectAggregate(members).damageReduction;
}
