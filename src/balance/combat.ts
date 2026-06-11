/**
 * 战斗数值表（纯数据，零逻辑）
 *
 * 单一真源：所有战斗相关数值只在此处定义，逻辑层禁止 magic number。
 */

/** 五行属性 */
export type Element = 'metal' | 'wood' | 'water' | 'fire' | 'earth';

/** 珠子类型 = 五行 + 心珠 */
export type OrbType = Element | 'heart';

export const ELEMENTS: readonly Element[] = ['metal', 'wood', 'water', 'fire', 'earth'];
export const ORB_TYPES: readonly OrbType[] = [...ELEMENTS, 'heart'];

/** 五行相克：克制方 → 被克方（金克木、木克土、土克水、水克火、火克金） */
export const ELEMENT_COUNTERS: Readonly<Record<Element, Element>> = {
  metal: 'wood',
  wood: 'earth',
  earth: 'water',
  water: 'fire',
  fire: 'metal',
};

export const COMBAT = {
  /** 棋盘尺寸 */
  boardCols: 6,
  boardRows: 6,

  /** 拖珠限时（秒） */
  dragTimeLimit: 8,

  /** 最小消除数 */
  minMatch: 3,

  /** 消除数倍率：3 连 ×1.0，4 连 ×1.5，5+ 连 ×2.0 */
  matchCountMultiplier: { 3: 1.0, 4: 1.5, 5: 2.0 } as Readonly<Record<number, number>>,

  /**
   * Combo 倍率递减分段：[起始 Combo（含）, 每段增量]
   * 2~6 每连 +20%，7~10 每连 +15%，11+ 每连 +8%
   */
  comboTiers: [
    { from: 2, to: 6, perCombo: 0.20 },
    { from: 7, to: 10, perCombo: 0.15 },
    { from: 11, to: Infinity, perCombo: 0.08 },
  ] as ReadonlyArray<{ from: number; to: number; perCombo: number }>,

  /** 克制伤害倍率 */
  counterMultiplier: 1.6,
  /** 被克伤害倍率 */
  counteredMultiplier: 0.5,

  /** 暴击 */
  critChance: 0.05,
  critMultiplier: 1.5,

  /** 防御减伤系数：减伤比 = def / (def + defScale) */
  defenseScale: 300,

  /** 英雄基础生命 */
  heroBaseHp: 1000,

  /** 心珠每颗回复（占最大生命比例） */
  heartHealRatio: 0.05,
} as const;
