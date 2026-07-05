/**
 * 成长曲线参数表（纯数据，零逻辑）
 */
import type { StatBlock } from './petRoles';
import {
  CHAPTER_POWER,
  getChapterPower,
  POWER_CURVE,
  type ChapterPowerAnchor,
} from './powerBudget';

/** 三维统一倍率：星级对 atk/hp/rcv 一视同仁，后续可按维度差异化 */
function uniform(v: number): StatBlock {
  return { atk: v, hp: v, rcv: v };
}

/**
 * 星级成长档案：星级不再只是单一攻击倍率，而是同时影响
 * - baseMult: 三维初始值倍率
 * - growthMult: 三维每级成长率倍率（高星成长更快）
 * - maxLevel: 等级上限（升星解锁更高上限）
 * - skillTier: 技能强化档位（1 = 基线，无加成）
 *
 * 升星「碎片成本」的单一真源在 economy.ts 的 ECONOMY.starUpShards
 * （由 formulas/economyOutput.ts 的 starUpShardCost 读取），此处不再重复定义，
 * 避免双表漂移。
 *
 * 不变量：1★ 为恒等档（baseMult = 1、growthMult = 1），保证现有 1★ 数值不变。
 */
export interface StarProfile {
  star: number;
  baseMult: StatBlock;
  growthMult: StatBlock;
  maxLevel: number;
  skillTier: number;
}

export const STAR_PROFILES: Readonly<Record<number, StarProfile>> = {
  1: { star: 1, baseMult: uniform(1.0), growthMult: uniform(1.0), maxLevel: 50, skillTier: 1 },
  2: { star: 2, baseMult: uniform(1.25), growthMult: uniform(1.02), maxLevel: 60, skillTier: 1 },
  3: { star: 3, baseMult: uniform(1.6), growthMult: uniform(1.05), maxLevel: 70, skillTier: 2 },
  4: { star: 4, baseMult: uniform(2.1), growthMult: uniform(1.08), maxLevel: 85, skillTier: 2 },
  5: { star: 5, baseMult: uniform(2.8), growthMult: uniform(1.12), maxLevel: 99, skillTier: 3 },
};

/** 取星级档案，越界回退到 1★ 恒等档 */
export function getStarProfile(star: number): StarProfile {
  return STAR_PROFILES[star] ?? STAR_PROFILES[1];
}

/** 宠物星级上限（UI 展示用） */
export const MAX_PET_STAR = 5;

/**
 * ── 功率预算曲线（唯一真源已迁至 powerBudget.ts 的 CHAPTER_POWER）──
 *
 * 此处保留兼容别名：既有代码统一经 CHAPTER_BUDGET / getChapterBudget 读取，
 * 新代码请直接使用 powerBudget.ts 的 CHAPTER_POWER（1~8 章全量锚点）。
 */
export type ChapterBudget = ChapterPowerAnchor;

export const CHAPTER_BUDGET: Readonly<Record<number, ChapterBudget>> = CHAPTER_POWER;

export function getChapterBudget(chapter: number): ChapterBudget {
  return getChapterPower(chapter);
}

/**
 * 等级 / 星级 UI 配色（单一真源）
 *
 * - card：灵宠竖卡（纸札底 + 墨字描边）
 * - panel：编队卷轴列表等浅底面板
 * - inverse：详情页等深底场景
 */
export type GrowthUiVariant = 'card' | 'panel' | 'inverse';

export interface GrowthUiTokens {
  levelColor: number;
  levelStroke: number;
  starFilled: number;
  starEmpty: number;
}

export const GROWTH_UI: Readonly<Record<GrowthUiVariant, GrowthUiTokens>> = {
  card: {
    levelColor: 0x4a2f1a,
    levelStroke: 0xfff0cd,
    starFilled: 0xb5701f,
    starEmpty: 0x787878,
  },
  panel: {
    levelColor: 0x5a4632,
    levelStroke: 0,
    starFilled: 0xb5701f,
    starEmpty: 0x9c8c70,
  },
  inverse: {
    levelColor: 0xffd75e,
    levelStroke: 0,
    starFilled: 0xffd75e,
    starEmpty: 0x6a5a40,
  },
};

export function getGrowthUi(variant: GrowthUiVariant = 'panel'): GrowthUiTokens {
  return GROWTH_UI[variant] ?? GROWTH_UI.panel;
}

export const GROWTH = {
  /** ── 宠物等级 ── */
  pet: {
    /** 默认等级上限兜底；实际上限以星级档案 maxLevel 为准 */
    defaultMaxLevel: 50,
    /**
     * 升到 L+1 级所需经验 = expBase × expGrowth^(L-1)
     *
     * 阶段八调优：原 (100, 1.15) 让 1→50 需 ~62 万经验，与单章 ~800 产出脱节数量级。
     * 改为 (30, 1.08) 后，累计经验大幅压平：到 L12 约 500、L25 约 2000、L40 约 7000、L50 约 15000，
     * 与重做后的关卡产出（见 drops.ts）同量级，使「通关节奏 ≈ 升级节奏」。
     */
    expBase: 30,
    expGrowth: 1.08,
  },

  /**
   * ── 敌人成长 ──
   * 章节成长系数（复利）：数值 = 基值 × chapterGrowth^(章节-1) × 关卡 difficulty。
   * 单一真源在 powerBudget.ts 的 POWER_CURVE.enemy，此处仅作读取别名。
   */
  enemy: {
    chapterGrowthHp: POWER_CURVE.enemy.chapterGrowthHp,
    chapterGrowthAtk: POWER_CURVE.enemy.chapterGrowthAtk,
    chapterGrowthDef: POWER_CURVE.enemy.chapterGrowthDef,
    initialAttackCountdown: POWER_CURVE.enemy.initialAttackCountdown,
  },
} as const;
