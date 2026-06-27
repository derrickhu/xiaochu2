/**
 * 星级特性阶梯（阶段十二，纯数据 + 纯解析函数）—— 与 passives.ts 刻意分离
 *
 * 两条独立的能力线，UI 命名必须区分：
 * - 「被动」（passives.ts）：role + rarity 常驻层，获取时即确定，升星不变。
 * - 「星级特性」（本文件）：role + star 成长节点，升星逐级解锁/强化招牌战斗属性。
 *
 * 解锁模型（仅星级单轴）：
 * - 星级（layer.star）决定「何时」解锁；**所有稀有度**升到对应星级都能解锁，无稀有度门槛。
 * - 数值再 × RARITY_ATTRIB_POWER 缩放（见 formulas/attribs.ts），高稀有数值更大但低稀有不被永久锁。
 *
 * 与 attribBase 叠加方式：最终战斗属性 = role.attribBase + Σ已解锁星级特性，
 * 再统一 × RARITY_ATTRIB_POWER[rarity]。保证「高稀有/高星属性不弱于低档」单调。
 *
 * 每个定位只在「自身招牌属性」上成长（输出=暴击、坦克=减伤、治疗=治疗强化、辅助=全队增伤）。
 *
 * 策划调参：改本表的 star 与 base 常数即可，不动战斗/UI 逻辑。
 */
import type { AttribKey, PetRole } from './petRoles';

/** 单条星级特性：在 star 解锁，给 attrib 叠加 base（未缩放的蓝图基线） */
export interface StarTraitLayer {
  /** 解锁所需星级（达到即解锁，所有稀有度通用） */
  star: number;
  /** 展示名 */
  name: string;
  /** 作用的战斗属性键 */
  attrib: AttribKey;
  /** 蓝图基线增量（实际值 × RARITY_ATTRIB_POWER[rarity]） */
  base: number;
}

/**
 * role → 星级特性阶梯（按 star 升序）。每条只追加正向增量，绝不削弱低星，保证单调。
 *
 * 个体属性（critRate/critDamage）只作用于该宠自身攻击；全队属性按队伍聚合。
 *
 * - 输出 attacker：★3 解锁暴击伤害、★5 再提升暴击率（个体，作用于自身高攻）。
 * - 坦克 tank：★3 / ★5 逐级叠加全队减伤（受全局封顶约束）。
 * - 治疗 healer：★3 / ★5 逐级叠加全队治疗强化。
 * - 辅助 support：★3 / ★5 逐级叠加全队增伤。
 */
export const ROLE_STAR_TRAITS: Readonly<Record<PetRole, readonly StarTraitLayer[]>> = {
  attacker: [
    { star: 3, name: '会心', attrib: 'critDamage', base: 0.30 },
    { star: 5, name: '狂暴', attrib: 'critRate', base: 0.06 },
  ],
  tank: [
    { star: 3, name: '铁壁', attrib: 'damageReduction', base: 0.04 },
    { star: 5, name: '不动如山', attrib: 'damageReduction', base: 0.04 },
  ],
  healer: [
    { star: 3, name: '守护', attrib: 'healBonus', base: 0.10 },
    { star: 5, name: '庇心', attrib: 'healBonus', base: 0.10 },
  ],
  support: [
    { star: 3, name: '锐眼', attrib: 'teamDamageBonus', base: 0.04 },
    { star: 5, name: '激励', attrib: 'teamDamageBonus', base: 0.04 },
  ],
};

/** 一条星级特性当前是否已解锁（仅看星级达标，所有稀有度通用） */
export function isStarTraitUnlocked(layer: StarTraitLayer, star: number): boolean {
  return star >= layer.star;
}

/** 星级特性的解锁态（供 UI 展示已解锁 / 未达星级锁定） */
export interface StarTraitState {
  layer: StarTraitLayer;
  unlocked: boolean;
}

/** 解析某 role 下所有星级特性在当前 star 的解锁态（按 star 升序） */
export function resolveStarTraitStates(role: PetRole, star: number): StarTraitState[] {
  const ladder = ROLE_STAR_TRAITS[role] ?? ROLE_STAR_TRAITS.attacker;
  return ladder.map((layer) => ({
    layer,
    unlocked: isStarTraitUnlocked(layer, star),
  }));
}

/** 已解锁的星级特性列表（star 升序），用于属性叠加与详情展示 */
export function unlockedStarTraits(role: PetRole, star: number): StarTraitLayer[] {
  const ladder = ROLE_STAR_TRAITS[role] ?? ROLE_STAR_TRAITS.attacker;
  return ladder.filter((layer) => isStarTraitUnlocked(layer, star));
}
