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
import { petHp, petRcv } from './growth';

export interface TeamMember {
  def: PetDef;
  level: number;
  star: number;
}

/** 队伍总生命 = 英雄基础生命 + Σ宠物 hp */
export function teamMaxHp(members: readonly TeamMember[]): number {
  let sum = COMBAT.heroBaseHp;
  for (const m of members) {
    sum += petHp(m.def, m.level, m.star);
  }
  return sum;
}

/** 队伍总回复 = Σ宠物 rcv */
export function teamRcv(members: readonly TeamMember[]): number {
  let sum = 0;
  for (const m of members) {
    sum += petRcv(m.def, m.level, m.star);
  }
  return sum;
}

/** 队伍属性覆盖（消除未覆盖属性的珠 = 无伤害的无效珠） */
export function teamElements(members: readonly TeamMember[]): Set<Element> {
  return new Set(members.map((m) => m.def.element));
}
