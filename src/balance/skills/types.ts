import type { Element, OrbType } from '../combat';

export type SkillOwner = 'pet' | 'enemy' | 'both';
export type SkillTrigger = 'manual' | 'enemyCooldown' | 'chargedRelease';
export type SkillTarget = 'enemy' | 'self' | 'team' | 'board';

/** 技能分类：决定表现兜底与 UI 归类，不参与数值结算。 */
export type SkillCategory =
  | 'nuke'
  | 'teamNuke'
  | 'multiNuke'
  | 'dot'
  | 'control'
  | 'debuff'
  | 'heal'
  | 'shield'
  | 'buff'
  | 'convert'
  | 'charge'
  | 'enemyGuard'
  | 'enemyHeal';

export type SkillVfxId =
  | 'petProjectile'
  | 'teamVolley'
  | 'multiHit'
  | 'dotApply'
  | 'stun'
  | 'defenseBreak'
  | 'heal'
  | 'shield'
  | 'damageBoost'
  | 'convertOrbs'
  | 'enemyCharge'
  | 'enemyAttack'
  | 'enemyHeal'
  | 'enemyShield';

/** 转珠形状：random=随机若干颗，row=整行，col=整列 */
export type ConvertShape = 'random' | 'row' | 'col';

export type DamageSource = 'casterAtk' | 'teamAtk' | 'enemyAtk';

export type SkillEffectDef =
  | {
      kind: 'damage';
      source: DamageSource;
      multiplier: number;
      /** 默认取施法者属性；敌人蓄力等可不填 */
      element?: Element;
      applyDefense?: boolean;
      applyDmgBuff?: boolean;
      applyEnemyReduction?: boolean;
      applyCounter?: boolean;
    }
  | {
      kind: 'heal';
      source: 'teamMaxHp' | 'teamRcv' | 'enemyMaxHp';
      pct: number;
      /** 满血不浪费，常用于敌人自疗 */
      onlyIfDamaged?: boolean;
    }
  | {
      kind: 'shield';
      source: 'teamMaxHp';
      pct: number;
      stack: 'max' | 'add';
    }
  | {
      kind: 'status';
      status: 'teamDamageBuff' | 'enemyDamageReduction';
      mult?: number;
      reduction?: number;
      turns: number;
      stack: 'replace' | 'ignoreIfPresent';
    }
  | {
      kind: 'convertOrbs';
      to: OrbType;
      count: number;
      /** 转珠形状，缺省 random（随机 count 颗） */
      shape?: ConvertShape;
    }
  | {
      kind: 'charge';
      multiplier: number;
      releaseVfx: SkillVfxId;
    }
  | {
      kind: 'multiHit';
      source: DamageSource;
      /** 每段倍率 */
      multiplier: number;
      /** 段数 */
      hits: number;
      element?: Element;
      applyDefense?: boolean;
      applyDmgBuff?: boolean;
      applyEnemyReduction?: boolean;
    }
  | {
      kind: 'dot';
      source: DamageSource;
      /** 每回合伤害 = 来源值 × multiplier */
      multiplier: number;
      turns: number;
      element?: Element;
    }
  | {
      kind: 'stun';
      /** 眩晕回合数（敌人跳过行动） */
      turns: number;
    }
  | {
      kind: 'defenseBreak';
      /** 防御降低比例（0~1） */
      pct: number;
      turns: number;
    };

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  category: SkillCategory;
  /** 冷却回合数（释放后重置为该值） */
  cd: number;
  owner: SkillOwner;
  trigger: SkillTrigger;
  target: SkillTarget;
  /** 表现 id；不填时按 category 兜底（见 CATEGORY_DEFAULT_VFX） */
  vfx?: SkillVfxId;
  effects: readonly SkillEffectDef[];
  tags?: readonly string[];
  /**
   * R 基线下的标称强度（蓝图工厂按参数自动推导，不手填）。
   * 实战有效强度 = basePower × RARITY_SKILL_POWER × (1+星级 tier 加成)。
   */
  basePower: number;
}
