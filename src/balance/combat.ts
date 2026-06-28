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

/**
 * 珠子状态（机制轴之「棋盘/珠子」）：在颜色之上叠加的特殊状态，单一真源。
 * - normal：普通珠（默认）。
 * - sealed：封印珠，锁定不可拖/不可消，相邻发生消除后解封为普通珠。
 *   （顽石/毒珠等更多状态为后续扩展点，先落地封印珠这一最高价值机制。）
 */
export type OrbState = 'normal' | 'sealed';

/** 五行相克：克制方 → 被克方（金克木、木克土、土克水、水克火、火克金） */
export const ELEMENT_COUNTERS: Readonly<Record<Element, Element>> = {
  metal: 'wood',
  wood: 'earth',
  earth: 'water',
  water: 'fire',
  fire: 'metal',
};

/** 克制 enemyElement 的珠子属性（拖此色珠 × counterMultiplier） */
export function counterElementOf(enemyElement: Element): Element {
  for (const el of ELEMENTS) {
    if (ELEMENT_COUNTERS[el] === enemyElement) return el;
  }
  return enemyElement;
}

/** enemyElement 克制的珠子属性（拖此色珠 × counteredMultiplier） */
export function resistedElementOf(enemyElement: Element): Element {
  return ELEMENT_COUNTERS[enemyElement];
}

export const COMBAT = {
  /** 棋盘尺寸 */
  boardCols: 6,
  boardRows: 6,

  /** 拖珠限时（秒） */
  dragTimeLimit: 10,

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
  /** 被克伤害倍率（v0.3 加重错属性惩罚 0.5→0.4） */
  counteredMultiplier: 0.4,

  /**
   * 暴击：
   * - critChance 为「无队伍暴击属性可用时」的全局兜底暴击率；
   *   实战消珠暴击改用队伍聚合 critRate（见 BattleController）。
   * - critBase 为暴击基础倍率；最终暴击倍率 = critBase + critDamage（队伍聚合暴伤）。
   */
  critChance: 0.05,
  critBase: 1.5,

  /** 队伍受击减伤聚合封顶（阶段十二，避免叠加过高免伤） */
  damageReductionCap: 0.6,

  /** 队伍治疗强化聚合封顶（阶段十二，避免叠加过高续航） */
  healBonusCap: 1.0,

  /** 防御减伤系数：减伤比 = def / (def + defScale) */
  defenseScale: 300,

  /** 英雄基础生命（队伍总生命 = 此值 + Σ宠物 hp） */
  heroBaseHp: 600,

  /** 心珠每颗回复 = 队伍总 RCV × 此系数（再乘 Combo 倍率）
   *  v0.3 压制续航 1.0→0.6：治疗位价值体现，而非无脑回满 */
  rcvPerHeartOrb: 0.6,
} as const;
