/**
 * 伤害公式（纯函数，零状态）
 *
 * 管线：基础攻击 × 消除数倍率 → × Combo 倍率 → × 克制 → - 防御 → 暴击
 */
import { COMBAT, ELEMENT_COUNTERS, type Element } from '@/balance/combat';

/** Combo 总倍率（递减分段，1 Combo = ×1.0） */
export function comboMultiplier(combo: number): number {
  if (combo <= 1) return 1.0;
  let mult = 1.0;
  for (const tier of COMBAT.comboTiers) {
    if (combo < tier.from) break;
    const upper = Math.min(combo, tier.to);
    mult += (upper - tier.from + 1) * tier.perCombo;
  }
  return Math.round(mult * 100) / 100;
}

/** 消除数倍率：3 连 ×1.0，4 连 ×1.5，5+ 连 ×2.0 */
export function matchCountMultiplier(matchCount: number): number {
  const table = COMBAT.matchCountMultiplier;
  if (matchCount >= 5) return table[5];
  return table[matchCount] ?? 1.0;
}

/** 属性克制倍率 */
export function elementMultiplier(attacker: Element, defender: Element): number {
  if (ELEMENT_COUNTERS[attacker] === defender) return COMBAT.counterMultiplier;
  if (ELEMENT_COUNTERS[defender] === attacker) return COMBAT.counteredMultiplier;
  return 1.0;
}

/** 防御减伤：减伤比 = def / (def + defenseScale) */
export function defenseReduction(def: number): number {
  if (def <= 0) return 0;
  return def / (def + COMBAT.defenseScale);
}

export interface DamageInput {
  /** 同属性宠物攻击合计 */
  atk: number;
  /** 单组消除的珠子数 */
  matchCount: number;
  /** 本次拖珠总 Combo 数 */
  combo: number;
  attackerElement: Element;
  defenderElement: Element;
  defenderDef: number;
  /** 是否暴击（由逻辑层掷骰后传入，保证公式纯函数） */
  isCrit?: boolean;
}

/** 最终伤害（向下取整，至少 1 点） */
export function calcDamage(input: DamageInput): number {
  let dmg = input.atk
    * matchCountMultiplier(input.matchCount)
    * comboMultiplier(input.combo)
    * elementMultiplier(input.attackerElement, input.defenderElement);

  dmg *= 1 - defenseReduction(input.defenderDef);

  if (input.isCrit) dmg *= COMBAT.critMultiplier;

  return Math.max(1, Math.floor(dmg));
}

/** 心珠回复量 */
export function calcHeal(maxHp: number, heartCount: number): number {
  return Math.floor(maxHp * COMBAT.heartHealRatio * heartCount);
}
