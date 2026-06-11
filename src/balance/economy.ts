/**
 * 经济数值表（纯数据，零逻辑）
 *
 * 货币收敛为三种：灵宠币（主货币，只做招募）+ 体力 + 碎片（自动转化，不展示为货币）。
 */

export const ECONOMY = {
  /** ── 灵宠币产出 ── */
  coin: {
    /** 单关基础产出（第 1 章基准） */
    stageBase: 30,
    /** 章节产出成长系数（复利） */
    chapterGrowth: 1.25,
    /** 三星追加：每颗星额外产出比例 */
    perStarBonus: 0.2,
    /** Boss 关产出倍率 */
    bossMultiplier: 2.0,
  },

  /** ── 招募定价 ── */
  recruit: {
    /** 首只灵宠定价 */
    basePrice: 100,
    /** 每多招募一只，价格增长系数（复利，前期快后期稳由分段控制） */
    priceGrowth: 1.35,
    /** 价格增长封顶倍数（相对 basePrice） */
    priceCapMultiplier: 50,
    /** 重复招募 → 自动转化碎片数 */
    duplicateShards: 10,
  },

  /** ── 升星碎片消耗：星级 → 所需碎片 ── */
  starUpShards: { 2: 20, 3: 50, 4: 120, 5: 300 } as Readonly<Record<number, number>>,

  /** ── 体力 ── */
  stamina: {
    max: 100,
    perStage: 6,
    /** 恢复 1 点所需秒数 */
    regenSeconds: 360,
  },
} as const;
