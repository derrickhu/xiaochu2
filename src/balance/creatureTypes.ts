/**
 * 生物体系类型与怪物面数值工厂（叶子模块，不依赖 balance 内其他运行时值）
 *
 * 单独成文件的原因：`creatures.ts`（手写核心生物 + 组装）与 `creatureRoster.ts`（量产名录）
 * 都要用这里的类型与 monsterPair，若放在 creatures.ts 会形成
 * creatures → creatureRoster → creatures 的运行时循环依赖。
 */
import { ELEMENT_COUNTERS, type Element } from './combat';
// 仅类型导入：enemies.ts 反向依赖 creatures.ts，这里若引入运行时值就会成环。
import type { EnemyPhaseDef } from './enemies';
import type { PetRole, SkillTraitDef, StatBlock, GrowthBlock } from './petRoles';
import type { Rarity } from './rarity';

/** 怪物单形态战斗模板（数值口径同 enemies.ts 的 MobDef，供 enemyStats 缩放） */
export interface CreatureMonsterTier {
  /** 该形态独立命名（缺省用生物名 + 形态后缀） */
  name?: string;
  baseHp: number;
  baseAtk: number;
  baseDef: number;
  attackInterval: number;
  /** 敌人技能引用（balance/skills.ts owner:'enemy'），无 = 纯普攻 */
  skillIds?: readonly string[];
  /** Boss 多阶段（仅高级形态用）：血线递减，见 enemies.ts EnemyPhaseDef */
  phases?: readonly EnemyPhaseDef[];
}

export interface CreatureDef {
  id: string;
  name: string;
  element: Element;
  /** 天生稀有度（引用键，行为见 balance/rarity.ts）；与养成 star 正交 */
  rarity: Rarity;
  role: PetRole;
  statProfile?: Partial<StatBlock>;
  growthProfile?: Partial<GrowthBlock>;
  /** 宠物主动技引用，效果在 balance/skills.ts */
  skillId: string;
  /** 专属技能修饰 / 元素克制（非 PassiveEffect 管线） */
  skillTraits?: readonly SkillTraitDef[];
  /**
   * 被动由 role + 稀有度阶梯统一派生（见 passives.ts 的 ROLE_PASSIVE_LADDER），
   * 此处不再承载专属被动；新增/调整被动一律改阶梯表，保证单调与超集成立。
   */
  /** 怪物面：初级怪 / 高级怪 两形态 */
  monster: {
    tier1: CreatureMonsterTier;
    tier2: CreatureMonsterTier;
  };
}

/**
 * SSR / UR 的专属技能修饰（唯一真源，手写宠与量产宠共用同一口径）：
 * - SSR：对「本属性所克制的属性」额外 +15% 伤害，奖励正确配色；
 * - UR：增伤提到 +22%，并让招牌技自带 CD -1，坐实队伍核心定位。
 *
 * R / SR 一律返回 undefined —— 低档差异只由稀有度倍率与蓝图承担，避免全表 100 只都要手填 trait。
 */
export function signatureSkillTraits(
  element: Element,
  rarity: Rarity,
  skillId: string,
): readonly SkillTraitDef[] | undefined {
  if (rarity < 3) return undefined;
  const bonus: SkillTraitDef = {
    type: 'elementDamageBonus', element, vs: ELEMENT_COUNTERS[element], pct: rarity >= 4 ? 0.22 : 0.15,
  };
  if (rarity < 4) return [bonus];
  return [bonus, { type: 'skillModifier', skillId, cdDelta: -1 }];
}

/**
 * 怪物两形态数值生成器：按 power rank 平滑铺出初级/高级基值（第 1 章基准，
 * 关卡按章节成长 × difficulty 再放大，见 formulas/growth.ts enemyStats）。
 */
export function monsterPair(
  rank: number,
  opts: {
    t1Skills?: readonly string[];
    t2Skills?: readonly string[];
    ai1?: number;
    ai2?: number;
    /** 攻击基值倍率（章 Boss 波用）：HP 预算收敛后由攻压承担养成门槛 */
    atkScale?: number;
    /** 高级形态的 Boss 阶段（血线递减）；初级形态不配阶段，保持杂兵手感 */
    t2Phases?: readonly EnemyPhaseDef[];
  } = {},
): { tier1: CreatureMonsterTier; tier2: CreatureMonsterTier } {
  const atkScale = opts.atkScale ?? 1;
  /*
   * 初级形态默认继承高级形态的**第一手**技能（v0.7）。
   *
   * 以前不写 t1Skills 就等于「这只杂兵只会平A」，而前八章的铺垫关几乎清一色用初级形态，
   * 结果是 128 关里 22 关纯拼数值：关卡之间毫无辨识度，玩家也学不到任何要在 Boss 关用上的东西。
   * 用高级形态的主技做兜底，杂兵关就成了 Boss 机制的预告片——先在低压环境见一次，
   * 到章末再连招遇到，这正是「可读的难度」该有的教学顺序。
   */
  const t1Skills = opts.t1Skills
    ?? (opts.t2Skills && opts.t2Skills.length > 0 ? [opts.t2Skills[0]] : undefined);
  const t1Hp = Math.round(600 + rank * 70);
  const t1Atk = Math.round((118 + rank * 7) * atkScale);
  const t1Def = Math.round(8 + rank * 2);
  return {
    tier1: {
      baseHp: t1Hp,
      baseAtk: t1Atk,
      baseDef: t1Def,
      attackInterval: opts.ai1 ?? 1,
      skillIds: t1Skills,
    },
    tier2: {
      baseHp: Math.round(t1Hp * 1.75),
      baseAtk: Math.round(t1Atk * 1.28),
      baseDef: Math.round(t1Def * 1.6) + 12,
      attackInterval: opts.ai2 ?? 2,
      skillIds: opts.t2Skills,
      phases: opts.t2Phases,
    },
  };
}
