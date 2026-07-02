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
  | 'gravity'
  | 'haste'
  | 'purify'
  | 'utility'
  | 'enemyGuard'
  | 'enemyHeal'
  | 'enemyDebuff';

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
  | 'gravity'
  | 'haste'
  | 'purify'
  | 'extraTime'
  | 'critBoost'
  | 'elementBuff'
  | 'delayAttack'
  | 'enemyCharge'
  | 'enemyAttack'
  | 'enemyHeal'
  | 'enemyShield'
  | 'enemySeal'
  | 'enemyPoison'
  | 'enemySqueeze'
  | 'enemyHealBlock'
  | 'enemyEnrage'
  | 'enemySkillSeal';

/** 转珠形状：random=随机若干颗，row=整行，col=整列，cross=十字 */
export type ConvertShape = 'random' | 'row' | 'col' | 'cross';

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
      /** 定向转珠：仅将该颜色珠转为 to（缺省不限来源色） */
      from?: OrbType;
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
    }
  | {
      kind: 'gravity';
      /** 按目标当前 HP 百分比造成伤害（无视防御/减伤，PAD「重力」） */
      pct: number;
    }
  | {
      kind: 'haste';
      /** 全队其他宠物技能 CD -amount（不含施法者） */
      amount: number;
    }
  | {
      kind: 'purify';
      /** 解除全部棋盘封印珠 + 清除我方 debuff（毒/时间压缩/禁疗/技能封印） */
      unsealBoard: boolean;
      cleanseTeam: boolean;
    }
  | {
      kind: 'delayEnemyAttack';
      /** 敌人普攻倒计时 +turns（PAD「威吓」） */
      turns: number;
    }
  | {
      kind: 'extraDragTime';
      /** 转珠时限 +seconds 秒，持续 turns 回合 */
      seconds: number;
      turns: number;
    }
  | {
      kind: 'guaranteedCrit';
      /** turns 回合内全队消珠出手必定暴击 */
      turns: number;
    }
  | {
      kind: 'elementDamageBuff';
      /** turns 回合内该属性伤害 ×mult（区别于全队增伤） */
      element: Element;
      mult: number;
      turns: number;
    }
  | {
      kind: 'sealOrbs';
      /** 敌方扰盘：战斗中随机封印 count 颗珠（邻格消除或净化技解封） */
      count: number;
    }
  | {
      kind: 'timeSqueeze';
      /** 敌方压缩转珠时限 -seconds 秒，持续 turns 回合 */
      seconds: number;
      turns: number;
    }
  | {
      kind: 'healBlock';
      /** 敌方禁疗：turns 回合内心珠回复 ×mult（如 0.5 = 减半） */
      mult: number;
      turns: number;
    }
  | {
      kind: 'enrage';
      /** 敌方低血狂暴：HP 低于 threshold 时攻击永久 ×atkMult（每场一次） */
      atkMult: number;
      threshold: number;
    }
  | {
      kind: 'skillSeal';
      /** 敌方技能封印：随机封印一只宠物主动技 turns 回合 */
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
