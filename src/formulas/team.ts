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
import { petCombatAttribs } from './attribs';

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

/**
 * 队伍总攻击 = Σ宠物 atk（纸面聚合参考；实战伤害按属性逐组结算，非此单值）
 */
export function teamAtk(members: readonly TeamMember[]): number {
  let sum = 0;
  for (const m of members) {
    sum += petAtkInTeam(members, m);
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

/** 触发/常驻数值类被动的队伍聚合（开局护盾 / 每回合回血 / 全队增伤） */
export interface TeamPassiveAggregate {
  /** 开局护盾占队伍最大生命的比例之和 */
  startShieldPct: number;
  /** 每回合回血占队伍最大生命的比例之和 */
  regenPct: number;
  /** 全队增伤总乘区 = 1 + Σ teamDamagePct */
  teamDamageMult: number;
}

/**
 * 队伍「全队属性」聚合（阶段十二）：
 * - damageReduction（坦克招牌）：各宠贡献求和后封顶 COMBAT.damageReductionCap。
 * - healBonus（治疗招牌）：各宠贡献求和后封顶 COMBAT.healBonusCap。
 * - teamDamageBonus（辅助招牌）：各宠贡献求和（不单独封顶，与被动 teamDamage 同口径）。
 *
 * 暴击率 / 暴击伤害是「个体属性」，只作用于各宠自身攻击，不在此聚合——
 * 由 petCombatAttribs(pet) 在出手宠 / 施法宠维度单独读取。
 */
export interface TeamAttribAggregate {
  damageReduction: number;
  healBonus: number;
  teamDamageBonus: number;
}

export function teamAttribAggregate(members: readonly TeamMember[]): TeamAttribAggregate {
  let drSum = 0;
  let healSum = 0;
  let dmgSum = 0;
  for (const m of members) {
    const a = petCombatAttribs(m.def, m.level, m.star);
    drSum += a.damageReduction;
    healSum += a.healBonus;
    dmgSum += a.teamDamageBonus;
  }
  const round4 = (v: number): number => Math.round(v * 10000) / 10000;
  return {
    damageReduction: round4(Math.min(COMBAT.damageReductionCap, drSum)),
    healBonus: round4(Math.min(COMBAT.healBonusCap, healSum)),
    teamDamageBonus: round4(Math.max(0, dmgSum)),
  };
}

/** 队伍受击减伤（兼容旧调用，等价 teamAttribAggregate(...).damageReduction） */
export function teamDamageReduction(members: readonly TeamMember[]): number {
  return teamAttribAggregate(members).damageReduction;
}

/** 聚合队伍内所有宠的触发型被动（签名被动 ×稀有度 + 专属，已在 pet.passive 解析） */
export function teamPassiveAggregate(
  members: readonly { def: Pick<PetDef, 'passive'> }[],
): TeamPassiveAggregate {
  let startShieldPct = 0;
  let regenPct = 0;
  let teamDamagePct = 0;
  for (const m of members) {
    const p = m.def.passive;
    if (!p) continue;
    startShieldPct += p.startShieldPct;
    regenPct += p.regenPct;
    teamDamagePct += p.teamDamagePct;
  }
  return { startShieldPct, regenPct, teamDamageMult: 1 + teamDamagePct };
}
