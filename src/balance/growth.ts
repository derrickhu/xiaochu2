/**
 * 成长曲线参数表（纯数据，零逻辑）
 */

export const GROWTH = {
  /** ── 宠物等级 ── */
  pet: {
    maxLevel: 50,
    /** 升到 L+1 级所需经验 = expBase × expGrowth^(L-1) */
    expBase: 100,
    expGrowth: 1.15,
    /** 星级攻击倍率：1★~5★ */
    starMultiplier: { 1: 1.0, 2: 1.25, 3: 1.6, 4: 2.1, 5: 2.8 } as Readonly<Record<number, number>>,
  },

  /** ── 敌人成长 ── */
  enemy: {
    /** 章节成长系数（复利）：数值 = 基值 × chapterGrowth^(章节-1) × 关卡 difficulty */
    chapterGrowthHp: 1.45,
    chapterGrowthAtk: 1.35,
    chapterGrowthDef: 1.30,
  },
} as const;
