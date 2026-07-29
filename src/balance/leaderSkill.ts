/**
 * 队长技（纯数据 + 纯函数）
 *
 * 编队第一位（team[0]）额外提供一条全队加成。它解决的是「编队只看总战力」的老问题：
 * 五只宠谁在首位原本毫无差别，于是编队页没有决策，只有排序。
 *
 * 设计约束：
 * - **按 role + rarity 阶梯派生，不逐只手写**。100 只宠若各写一条队长技，等于再来一遍技能表，
 *   而队长技的信息量只有「一个方向 + 一个强度」，配表收益远低于维护成本。
 * - 强度乘 RARITY_PASSIVE_POWER，与被动阶梯同一把尺子，天然满足「高稀有不弱于低稀有」。
 * - 四个 role 的方向刻意互不重叠：输出 / 血量 / 回复 / 连击，让「换队长」是真选择而非数值大小比较。
 *   辅助走连击加成而不是又一条增伤，是因为辅助在被动阶梯里已经给增伤了，
 *   再叠一条只会让辅助队长退化成「加得更多的输出队长」。
 */
import { PET_ROLE_NAME, STAT_UI, type PetRole, type StatKey } from './petRoles';
import { getRarityPassivePower, type Rarity } from './rarity';

/**
 * 队长技效果：
 * - statTeam：全队三维乘区（与 statBonus/team 同乘区，走 teamStatMultiplier）
 * - comboBonus：每 1 Combo 额外倍率（叠在 comboMultiplier 之上，奖励高连操作）
 */
export type LeaderEffect =
  | { kind: 'statTeam'; stat: StatKey; base: number }
  | { kind: 'comboBonus'; base: number };

export interface LeaderSkillDef {
  name: string;
  effect: LeaderEffect;
}

/** role → 队长技（强度基线，实际值 × RARITY_PASSIVE_POWER） */
export const LEADER_SKILL_BY_ROLE: Readonly<Record<PetRole, LeaderSkillDef>> = {
  attacker: { name: '破军令', effect: { kind: 'statTeam', stat: 'atk', base: 0.05 } },
  tank: { name: '山岳令', effect: { kind: 'statTeam', stat: 'hp', base: 0.08 } },
  healer: { name: '灵泉令', effect: { kind: 'statTeam', stat: 'rcv', base: 0.10 } },
  support: { name: '合鸣令', effect: { kind: 'comboBonus', base: 0.015 } },
};

export interface ResolvedLeaderSkill {
  name: string;
  effect: LeaderEffect;
  /** 已乘稀有度强度的实际值 */
  value: number;
  /** UI 单行描述 */
  text: string;
}

const round4 = (v: number): number => Math.round(v * 10000) / 10000;
const toPct = (v: number): string => `${Math.round(v * 1000) / 10}%`;

/** 解析某只宠作为队长时的实际加成（纯函数，战斗 / 模拟器 / UI 同一出口） */
export function resolveLeaderSkill(role: PetRole, rarity: Rarity): ResolvedLeaderSkill {
  const def = LEADER_SKILL_BY_ROLE[role] ?? LEADER_SKILL_BY_ROLE.attacker;
  const value = round4(def.effect.base * getRarityPassivePower(rarity));
  return { name: def.name, effect: def.effect, value, text: describeLeader(def, value) };
}

function describeLeader(def: LeaderSkillDef, value: number): string {
  if (def.effect.kind === 'statTeam') {
    return `${def.name}：全队${STAT_UI[def.effect.stat].longLabel} +${toPct(value)}`;
  }
  return `${def.name}：每 1 Combo 额外伤害 +${toPct(value)}`;
}

/** 队长技定位说明（编队页引导用） */
export function leaderRoleHint(role: PetRole): string {
  return `${PET_ROLE_NAME[role]}队长`;
}
