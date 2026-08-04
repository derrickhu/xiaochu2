/**
 * 被动效果战斗聚合（Phase A）—— 从 PassiveEffect bundle + EFFECT_REGISTRY 驱动，
 * 替代 teamPassiveAggregate / teamAttribAggregate / traits 乘区。
 */
import { COMBAT, type Element } from '@/balance/combat';
import {
  computePetCombatAttribs,
  resolvePetPassiveBundle,
  type PassiveEffect,
} from '@/balance/passiveEffects';
import type { PetDef } from '@/balance/pets';
import type { StatBlock } from '@/balance/petRoles';
import { resolveLeaderSkill, type ResolvedLeaderSkill } from '@/balance/leaderSkill';
import {
  KILLER_MULT, resolveBonds, resolveResists,
  type BondSummary, type ResistQuota,
} from '@/balance/petTags';
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

/** 队伍级被动效果聚合（被动按 level+star 双轨解锁，并合入队长技的静态档） */
export function teamEffectAggregate(members: readonly TeamMember[]): TeamEffectBundle {
  let drSum = 0;
  let healSum = 0;
  let dmgBonusSum = 0;
  let shieldSum = 0;
  let regenSum = 0;

  // 队长技的静态格式折进同一批字段：挂在这里而不是各自开一路乘区，
  // 战斗/模拟器/战力展示/敌情卡就会同时正确，不需要各处记得再叠一次。
  const leader = teamLeaderSkill(members);
  if (leader) {
    switch (leader.effect.kind) {
      case 'damageReduction': drSum += leader.value; break;
      case 'healBonus': healSum += leader.value; break;
      case 'teamDamage': dmgBonusSum += leader.value; break;
      case 'startShield': shieldSum += leader.value; break;
      case 'regen': regenSum += leader.value; break;
      // 读队伍构成的两条同样是开局定值，折进全队增伤
      case 'elementSpread':
        if (countTeamElements(members) >= leader.effect.count) dmgBonusSum += leader.value;
        break;
      case 'monoElement':
        if (countTeamElements(members) === 1) dmgBonusSum += leader.value;
        break;
      default: break;
    }
  }

  for (const m of members) {
    const attribs = computePetCombatAttribs(m.def.role, m.def.rarity, m.star, m.level);
    drSum += attribs.damageReduction;
    healSum += attribs.healBonus;
    dmgBonusSum += attribs.teamDamageBonus;

    const bundle = resolvePetPassiveBundle(m.def.role, m.def.rarity, { level: m.level, star: m.star });
    for (const e of bundle.effects) {
      if (!e.unlocked) continue;
      if (e.kind === 'teamDamageBonus' && e.source === 'ladder') dmgBonusSum += e.value;
      else if (e.kind === 'startShieldPct') shieldSum += e.value;
      else if (e.kind === 'regenPct') regenSum += e.value;
    }
  }

  // 羁绊：属性宗 / 职能宗抱团的奖励，与「同源相斥」正面对撞，逼出真实的编队权衡
  dmgBonusSum += teamBonds(members).damageBonus;

  return {
    damageReduction: round4(Math.min(COMBAT.damageReductionCap, drSum)),
    healBonus: round4(Math.min(COMBAT.healBonusCap, healSum)),
    teamDamageMult: round4(1 + Math.max(0, dmgBonusSum)),
    startShieldPct: round4(shieldSum),
    regenPct: round4(regenSum),
  };
}

/** 个体暴击（不队伍聚合）；level 缺省为预览口径（等级门槛全开） */
export function petSelfCombatProfile(
  pet: PetDef,
  star: number,
  level = Number.MAX_SAFE_INTEGER,
): { critRate: number; critDamage: number } {
  const a = computePetCombatAttribs(pet.role, pet.rarity, star, level);
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

/**
 * 队长技解析：编队首位生效，没人上阵时返回 null。
 * 战斗、模拟器、编队 UI 全部经此读取，避免「显示的队长技和实际生效的不是一回事」。
 */
export function teamLeaderSkill(members: readonly TeamMember[]): ResolvedLeaderSkill | null {
  const leader = members[0];
  if (!leader) return null;
  return resolveLeaderSkill(leader.def);
}

/** 队伍覆盖的属性种类数（五色令 / 同源令 与「同源相斥」共用同一口径） */
function countTeamElements(members: readonly TeamMember[]): number {
  return new Set(members.map((m) => m.def.element)).size;
}

/** 队伍羁绊（编队页展示与战斗结算共用一个出口） */
export function teamBonds(members: readonly TeamMember[]): BondSummary {
  return resolveBonds(members.map((m) => m.def.tags.bondTags));
}

/** 队伍抗性配额：同抗性 5 只凑满 100% 才免疫 */
export function teamResists(members: readonly TeamMember[]): ResistQuota {
  return resolveResists(members.map((m) => m.def.tags.resist));
}

/**
 * 出手宠对当前敌人的特攻乘区。
 *
 * 挂在这里而不是 calcDamage 里：特攻是「宠 × 敌人」的对位关系，和克制同层但独立，
 * 让实战与模拟器都从这一个出口取值，配平时只有一处要看。
 */
export function killerMult(pet: PetDef, enemyElement: Element): number {
  return pet.tags.killerElement === enemyElement ? KILLER_MULT : 1;
}

/** 队长技提供的每 Combo 额外倍率（非合鸣令队长为 0） */
export function leaderComboBonus(members: readonly TeamMember[]): number {
  const skill = teamLeaderSkill(members);
  return skill && skill.effect.kind === 'comboBonus' ? skill.value : 0;
}

/**
 * 队长技里需要战斗期求值的部分。
 *
 * 静态档已经在 teamEffectAggregate / teamStatMultiplier 里折掉了，这里只剩
 * 「看盘面」和「看血线」两类。血线条件不在这里判定 —— 求值时机在每回合，
 * 故只把阈值与倍率交出去，由控制器按当时血量决定是否生效。
 */
export interface LeaderTurnMods {
  /** 指定属性的消珠增伤乘区（专精令） */
  elementMult: { element: Element; mult: number } | null;
  /** 首消 combo 达门槛后的全队增伤（连锋令） */
  comboStep: { threshold: number; mult: number } | null;
  /** 单组消除达标时的该组增伤（疾锋令） */
  bigMatch: { matchCount: number; mult: number } | null;
  /** 血线条件增伤（昂扬令 / 血战令） */
  hpConditional: { mode: 'high' | 'low'; threshold: number; mult: number } | null;
}

export const NO_LEADER_TURN_MODS: LeaderTurnMods = Object.freeze({
  elementMult: null, comboStep: null, bigMatch: null, hpConditional: null,
});

export function leaderTurnMods(members: readonly TeamMember[]): LeaderTurnMods {
  const skill = teamLeaderSkill(members);
  if (!skill) return NO_LEADER_TURN_MODS;
  const e = skill.effect;
  const mult = 1 + skill.value;
  switch (e.kind) {
    case 'elementDamage':
      return { ...NO_LEADER_TURN_MODS, elementMult: { element: e.element, mult } };
    case 'comboStep':
      return { ...NO_LEADER_TURN_MODS, comboStep: { threshold: e.threshold, mult } };
    case 'bigMatch':
      return { ...NO_LEADER_TURN_MODS, bigMatch: { matchCount: e.matchCount, mult } };
    case 'hpHigh':
      return { ...NO_LEADER_TURN_MODS, hpConditional: { mode: 'high', threshold: e.threshold, mult } };
    case 'hpLow':
      return { ...NO_LEADER_TURN_MODS, hpConditional: { mode: 'low', threshold: e.threshold, mult } };
    default:
      return NO_LEADER_TURN_MODS;
  }
}

/** 队长技提供的三维乘区（非对应 stat 返回 1） */
function leaderStatMultiplier(members: readonly TeamMember[], stat: StatKey): number {
  const skill = teamLeaderSkill(members);
  if (!skill || skill.effect.kind !== 'statTeam' || skill.effect.stat !== stat) return 1;
  return 1 + skill.value;
}

/**
 * 三维/光环乘区（替代 teamTraitMultiplier）。
 *
 * 队长技的三维加成挂在这里而不是单独开一路乘区：petAtkInTeam / petHpInTeam / petRcvInTeam
 * 都收口在此，挂进来后战斗、模拟器、战力展示、敌情卡会同时正确，不需要各自记得叠一次。
 */
export function teamStatMultiplier(
  members: readonly TeamMember[],
  target: TeamMember,
  stat: StatKey,
): number {
  let mult = leaderStatMultiplier(members, stat);
  for (const source of members) {
    const bundle = resolvePetPassiveBundle(
      source.def.role, source.def.rarity, { level: source.level, star: source.star },
    );
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

/** 个体 statBonus self 乘区（替代 selfStatTraitMultiplier）；level 缺省为预览口径 */
export function selfStatMultiplier(
  pet: PetDef,
  star: number,
  stat: StatKey,
  level = Number.MAX_SAFE_INTEGER,
): number {
  let mult = 1;
  const bundle = resolvePetPassiveBundle(pet.role, pet.rarity, { level, star });
  for (const e of bundle.statEffects) {
    if (e.kind !== 'statBonus' || e.statScope !== 'self') continue;
    if (e.stat !== stat) continue;
    mult *= 1 + e.value;
  }
  return mult;
}
