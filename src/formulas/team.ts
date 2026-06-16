/**
 * 队伍聚合公式（纯函数，零状态）
 *
 * 三维模型的队伍口径：
 * - 总生命 = 英雄基础 + Σ宠物 hp
 * - 总回复 = Σ宠物 rcv（心珠回复的基数）
 * - 属性覆盖 = 队伍中出现过的属性集合（有效珠判定）
 */
import { COMBAT, type Element } from '@/balance/combat';
import type { PetDef } from '@/balance/pets';
import type { StatBlock } from '@/balance/petRoles';
import { petAtk, petHp, petRcv } from './growth';

export interface TeamMember {
  def: PetDef;
  level: number;
  star: number;
}

type StatKey = keyof StatBlock;

function teamTraitMultiplier(members: readonly TeamMember[], target: TeamMember, stat: StatKey): number {
  let mult = 1;
  for (const source of members) {
    for (const trait of source.def.traits ?? []) {
      if (trait.type === 'statBonus') {
        if (trait.scope !== 'team') continue;
        if (trait.stat !== stat) continue;
        if (trait.element && trait.element !== target.def.element) continue;
        if (trait.role && trait.role !== target.def.role) continue;
        mult *= 1 + trait.pct;
      }
      if (trait.type === 'teamAura') {
        if (trait.stat !== stat) continue;
        const count = members.filter((m) => {
          if (trait.requireRole && m.def.role !== trait.requireRole) return false;
          if (trait.requireElement && m.def.element !== trait.requireElement) return false;
          return true;
        }).length;
        if (count >= trait.count) mult *= 1 + trait.pct;
      }
    }
  }
  return mult;
}

export function petAtkInTeam(members: readonly TeamMember[], target: TeamMember): number {
  return Math.floor(petAtk(target.def, target.level, target.star) * teamTraitMultiplier(members, target, 'atk'));
}

export function petHpInTeam(members: readonly TeamMember[], target: TeamMember): number {
  return Math.floor(petHp(target.def, target.level, target.star) * teamTraitMultiplier(members, target, 'hp'));
}

export function petRcvInTeam(members: readonly TeamMember[], target: TeamMember): number {
  return Math.floor(petRcv(target.def, target.level, target.star) * teamTraitMultiplier(members, target, 'rcv'));
}

/** 队伍总生命 = 英雄基础生命 + Σ宠物 hp */
export function teamMaxHp(members: readonly TeamMember[]): number {
  let sum = COMBAT.heroBaseHp;
  for (const m of members) {
    sum += petHpInTeam(members, m);
  }
  return sum;
}

/** 队伍总回复 = Σ宠物 rcv */
export function teamRcv(members: readonly TeamMember[]): number {
  let sum = 0;
  for (const m of members) {
    sum += petRcvInTeam(members, m);
  }
  return sum;
}

/** 队伍属性覆盖（消除未覆盖属性的珠 = 无伤害的无效珠） */
export function teamElements(members: readonly TeamMember[]): Set<Element> {
  return new Set(members.map((m) => m.def.element));
}
