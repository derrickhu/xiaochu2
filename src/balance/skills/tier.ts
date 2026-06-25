import { PET_SKILL_IDS } from './ids';

/**
 * 技能星级分档强化：宠物星级（StarProfile.skillTier）越高，技能数值越强、CD 越短。
 * tier 1 = 基线（无加成），保证 1★ 技能数值与配置一致。
 */
export interface SkillTierBonus {
  /** 效果增幅（叠加到伤害倍率 / 回复护盾百分比） */
  effectPct: number;
  /** 冷却调整（负数缩短，最终不低于 1） */
  cdDelta: number;
}

export const SKILL_TIER_BONUS: Readonly<Record<number, SkillTierBonus>> = {
  1: { effectPct: 0, cdDelta: 0 },
  2: { effectPct: 0.1, cdDelta: 0 },
  3: { effectPct: 0.2, cdDelta: -1 },
};

export function getSkillTierBonus(tier: number): SkillTierBonus {
  return SKILL_TIER_BONUS[tier] ?? SKILL_TIER_BONUS[1];
}

/**
 * 星级质变覆写（借鉴 xiao_chu STAR3/STAR5 override）。
 *
 * 与 SKILL_TIER_BONUS 的平 % 不同：这里可对「指定技能 + 指定 skillTier」做质变，
 * 例如 ★5 大幅拉高倍率、缩短 CD 或改写文案，给升星「质变感」。
 */
export interface SkillStarOverride {
  effectMult?: number;
  cdDelta?: number;
  desc?: string;
}

export const SKILL_STAR_OVERRIDE: Readonly<Record<string, Readonly<Record<number, SkillStarOverride>>>> = {
  // 示例签名技能：★5 质变（Phase 3 扩宠时按需补充）
  [PET_SKILL_IDS.fireBurst]: {
    3: { effectMult: 1.5, cdDelta: -1, desc: '引爆燎原烈焰，对敌人造成自身攻击 1050% 的火属性伤害' },
  },
};

export function getSkillStarOverride(skillId: string, tier: number): SkillStarOverride | null {
  return SKILL_STAR_OVERRIDE[skillId]?.[tier] ?? null;
}
