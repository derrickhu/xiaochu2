/**
 * 队长技（纯数据 + 纯函数）
 *
 * 编队第一位（team[0]）额外提供一条全队加成。它解决的是「编队只看总战力」的老问题：
 * 五只宠谁在首位原本毫无差别，于是编队页没有决策，只有排序。
 *
 * 设计约束：
 * - **per-pet 分配，但走格式池**。早期版本按 `role × rarity` 派生，全表只有 4 种队长技，
 *   于是「换队长」退化成「换一个数值」。现在每只宠指定一种格式 + 参数：格式池只有 16 种，
 *   不需要手写 100 份文案，但同 role 同稀有度的两只宠可以是完全不同的玩法。
 * - 强度乘 RARITY_PASSIVE_POWER，与被动阶梯同一把尺子，天然满足「高稀有不弱于低稀有」。
 * - 每个 role 的 4 种格式刻意互不重叠，且尽量复用既有战斗管线：
 *   静态类折进 teamEffectAggregate / teamStatMultiplier，条件类折进已有的增伤乘区，
 *   只有 Combo 阶梯与大消除需要新开一路参数。
 * - 五色令 / 同源令直接对话「同源相斥」这条反构筑机制：闸门制造需求，这两条提供供给。
 */
import type { Element } from './combat';
import { PET_ROLE_NAME, STAT_UI, type PetRole, type StatKey } from './petRoles';
import { getRarityPassivePower, type Rarity } from './rarity';
import { ELEMENT_NAME } from './ui';

/**
 * 队长技效果格式。
 *
 * 前七种是「静态」：开局即可定值，分别折进三维乘区与 teamEffectAggregate 的既有字段。
 * 后五种是「条件」：每回合按盘面/血线求值，走 battleTurnResolution 的 leader 参数。
 * 最后两种读队伍构成，同样开局定值，但折进的是全队增伤。
 */
export type LeaderEffect =
  // ── 静态：零新增管线 ──
  | { kind: 'statTeam'; stat: StatKey }
  | { kind: 'teamDamage' }
  | { kind: 'damageReduction' }
  | { kind: 'healBonus' }
  | { kind: 'startShield' }
  | { kind: 'regen' }
  | { kind: 'comboBonus' }
  // ── 条件：战斗期求值 ──
  /** 本宠自身属性的消珠伤害提升（参数取自持有者，故同格式的两只宠也不同） */
  | { kind: 'elementDamage'; element: Element }
  /** 首消 combo 达门槛后全队增伤 */
  | { kind: 'comboStep'; threshold: number }
  /** 高血量时增伤（顺风越滚越快） */
  | { kind: 'hpHigh'; threshold: number }
  /** 低血量时增伤（背水） */
  | { kind: 'hpLow'; threshold: number }
  /** 单组消除达到指定颗数时该组增伤 —— 与「锋锐无效」的 5 连穿透同一套操作 */
  | { kind: 'bigMatch'; matchCount: number }
  // ── 读队伍构成：与「同源相斥」互为供给 ──
  /** 队伍属性种类达标时全队增伤 */
  | { kind: 'elementSpread'; count: number }
  /** 队伍全为同一属性时全队增伤 */
  | { kind: 'monoElement' };

export interface LeaderSkillDef {
  name: string;
  effect: LeaderEffect;
  /** R 基线强度，实际值 × RARITY_PASSIVE_POWER */
  base: number;
}

/** 队长技持有者需要的最小信息（PetDef / CreatureDef 都满足） */
export interface LeaderSkillOwner {
  id: string;
  element: Element;
  role: PetRole;
  rarity: Rarity;
}

type LeaderFormat = (owner: LeaderSkillOwner) => LeaderSkillDef;

const fixed = (name: string, effect: LeaderEffect, base: number): LeaderFormat =>
  () => ({ name, effect, base });

/**
 * 每个 role 四种格式，同 role 内按宠物 id 轮转分配。
 *
 * 四种之间刻意拉开「生效条件」而不只是「加成方向」：一条无条件、一条看盘面、
 * 一条看血线、一条看队伍构成。这样换队长换掉的是打法，不是数字大小。
 */
const FORMATS_BY_ROLE: Readonly<Record<PetRole, readonly LeaderFormat[]>> = {
  attacker: [
    fixed('破军令', { kind: 'statTeam', stat: 'atk' }, 0.05),
    // 参数取持有者自身属性：火宠的焚天令强化火，木宠的强化木
    (o) => ({ name: '专精令', effect: { kind: 'elementDamage', element: o.element }, base: 0.25 }),
    fixed('疾锋令', { kind: 'bigMatch', matchCount: 5 }, 0.30),
    fixed('血战令', { kind: 'hpLow', threshold: 0.4 }, 0.35),
  ],
  tank: [
    fixed('山岳令', { kind: 'statTeam', stat: 'hp' }, 0.08),
    fixed('磐石令', { kind: 'damageReduction' }, 0.05),
    fixed('玄甲令', { kind: 'startShield' }, 0.10),
    fixed('昂扬令', { kind: 'hpHigh', threshold: 0.8 }, 0.18),
  ],
  healer: [
    fixed('灵泉令', { kind: 'statTeam', stat: 'rcv' }, 0.10),
    fixed('回春令', { kind: 'healBonus' }, 0.12),
    fixed('长生令', { kind: 'regen' }, 0.02),
    fixed('五色令', { kind: 'elementSpread', count: 3 }, 0.15),
  ],
  support: [
    fixed('合鸣令', { kind: 'comboBonus' }, 0.015),
    fixed('连锋令', { kind: 'comboStep', threshold: 6 }, 0.20),
    fixed('同源令', { kind: 'monoElement' }, 0.30),
    fixed('共鸣令', { kind: 'teamDamage' }, 0.06),
  ],
};

/**
 * 指定宠物的队长技格式覆写。
 *
 * 轮转分配已经能给出足够的差异度，这张表的用处是让策划把标志性宠物钉在特定玩法上，
 * 而不必为此改动轮转规则。key = 宠物 id，value = 该 role 格式池的下标。
 */
const LEADER_FORMAT_OVERRIDE: Readonly<Record<string, number>> = {
  // 初始队三只覆盖三种生效条件，让新玩家第一次换队长就能感到「打法变了」
  pet_001: 0,
  pet_002: 0,
  pet_003: 1,
};

/** 从 pet_037 这类 id 取序号；非数字 id 退化为字符和，保证任何 id 都有稳定分配 */
function rotationSeed(petId: string): number {
  const m = /(\d+)\s*$/.exec(petId);
  if (m) return Number(m[1]);
  let sum = 0;
  for (let i = 0; i < petId.length; i++) sum += petId.charCodeAt(i);
  return sum;
}

/** 该宠使用的队长技格式（不含稀有度缩放） */
export function leaderSkillDefOf(owner: LeaderSkillOwner): LeaderSkillDef {
  const pool = FORMATS_BY_ROLE[owner.role] ?? FORMATS_BY_ROLE.attacker;
  const override = LEADER_FORMAT_OVERRIDE[owner.id];
  const index = override ?? (rotationSeed(owner.id) % pool.length);
  return pool[index % pool.length](owner);
}

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
export function resolveLeaderSkill(owner: LeaderSkillOwner): ResolvedLeaderSkill {
  const def = leaderSkillDefOf(owner);
  const value = round4(def.base * getRarityPassivePower(owner.rarity));
  return { name: def.name, effect: def.effect, value, text: describeLeader(def, value) };
}

function describeLeader(def: LeaderSkillDef, value: number): string {
  const e = def.effect;
  const head = `${def.name}：`;
  switch (e.kind) {
    case 'statTeam':
      return `${head}全队${STAT_UI[e.stat].longLabel} +${toPct(value)}`;
    case 'teamDamage':
      return `${head}全队伤害 +${toPct(value)}`;
    case 'damageReduction':
      return `${head}全队减伤 +${toPct(value)}`;
    case 'healBonus':
      return `${head}全队治疗 +${toPct(value)}`;
    case 'startShield':
      return `${head}开局护盾 = 血上限 ${toPct(value)}`;
    case 'regen':
      return `${head}每回合回复血上限 ${toPct(value)}`;
    case 'comboBonus':
      return `${head}每 1 Combo 额外伤害 +${toPct(value)}`;
    case 'elementDamage':
      return `${head}${ELEMENT_NAME[e.element]}属性伤害 +${toPct(value)}`;
    case 'comboStep':
      return `${head}首消达 ${e.threshold} 连时全队伤害 +${toPct(value)}`;
    case 'hpHigh':
      return `${head}生命高于 ${toPct(e.threshold)} 时全队伤害 +${toPct(value)}`;
    case 'hpLow':
      return `${head}生命低于 ${toPct(e.threshold)} 时全队伤害 +${toPct(value)}`;
    case 'bigMatch':
      return `${head}${e.matchCount} 连及以上的消除伤害 +${toPct(value)}`;
    case 'elementSpread':
      return `${head}队伍属性达 ${e.count} 种时全队伤害 +${toPct(value)}`;
    case 'monoElement':
      return `${head}队伍属性全部相同时全队伤害 +${toPct(value)}`;
  }
}

/** 队长技定位说明（编队页引导用） */
export function leaderRoleHint(role: PetRole): string {
  return `${PET_ROLE_NAME[role]}队长`;
}
