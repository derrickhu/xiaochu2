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
  /** 额外暴击伤害（队伍聚合 critDamage），暴击倍率 = critBase + critDamage；默认 0 */
  critDamage?: number;
  /** 增伤 buff 乘区（技能 dmgBoost 等，默认 1.0） */
  buffMult?: number;
}

/** 最终伤害（向下取整，至少 1 点） */
export function calcDamage(input: DamageInput): number {
  let dmg = input.atk
    * matchCountMultiplier(input.matchCount)
    * comboMultiplier(input.combo)
    * elementMultiplier(input.attackerElement, input.defenderElement)
    * (input.buffMult ?? 1.0);

  dmg *= 1 - defenseReduction(input.defenderDef);

  if (input.isCrit) dmg *= COMBAT.critBase + (input.critDamage ?? 0);

  return Math.max(1, Math.floor(dmg));
}

/**
 * 期望暴击系数（确定性，双模型镜像用）：
 *   1 + critRate × ((critBase + critDamage) - 1)
 * 用于模拟器消珠伤害与技能直伤的期望暴击放大，避免给纯函数注入随机数。
 */
export function expectedCritFactor(critRate: number, critDamage = 0): number {
  const cr = Math.max(0, Math.min(1, critRate));
  return 1 + cr * (COMBAT.critBase + critDamage - 1);
}

/** 受击减伤结算：amount × (1 - 封顶后的减伤)，向下取整（至少 0） */
export function applyDamageReduction(amount: number, damageReduction: number): number {
  const dr = Math.max(0, Math.min(COMBAT.damageReductionCap, damageReduction));
  return Math.max(0, Math.floor(amount * (1 - dr)));
}

/**
 * 心珠回复量 = 队伍总 RCV × 心珠系数 × 心珠数 × Combo 倍率 × (1 + 治疗强化)
 * healBonus 为全队属性（治疗招牌），默认 0 不影响现有调用。
 */
export function calcHeal(
  teamRcvTotal: number,
  heartCount: number,
  combo: number,
  healBonus = 0,
): number {
  const bonus = 1 + Math.max(0, healBonus);
  return Math.floor(
    teamRcvTotal * COMBAT.rcvPerHeartOrb * heartCount * comboMultiplier(combo) * bonus,
  );
}
