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
  /** 棋盘尺寸（与 xiao_chu 一致：6 列 × 5 行） */
  boardCols: 6,
  boardRows: 5,

  /** 拖珠限时（秒） */
  dragTimeLimit: 12,

  /** 拖珠限时下限/上限（秒）：加时 buff / 时间压缩 debuff 叠加后的夹取范围 */
  dragTimeMin: 5,
  dragTimeMax: 20,

  /** 最小消除数 */
  minMatch: 3,

  /**
   * 消除数倍率：3 连 ×1.0，4 连 ×1.25，5+ 连 ×1.5
   *
   * v0.8 从 1.0/1.5/2.0 压平。旧档下多消一颗珠直接 +50% 伤害，这个乘区又会和
   * 「连击数更多」「出手组数更多」连乘，导致高手每回合输出是中手的 2.7 倍——
   * 没有任何一档血量能同时让两者落进 3~8 回合的难度带，配平只能二选一。
   */
  matchCountMultiplier: { 3: 1.0, 4: 1.25, 5: 1.5 } as Readonly<Record<number, number>>,

  /**
   * Combo 倍率递减分段：[起始 Combo（含）, 每段增量]
   * 2~6 每连 +13%，7~10 每连 +10%，11+ 每连 +5%
   *
   * v0.8 从 20/15/8 压平，与 matchCountMultiplier 同一个目的：收窄技巧带宽。
   * 操作好依然明显更强（这是消除游戏的核心乐趣，不能抹平），
   * 但不再强到让关卡血量失去意义。
   */
  comboTiers: [
    { from: 2, to: 6, perCombo: 0.13 },
    { from: 7, to: 10, perCombo: 0.10 },
    { from: 11, to: Infinity, perCombo: 0.05 },
  ] as ReadonlyArray<{ from: number; to: number; perCombo: number }>,

  /**
   * 克制伤害倍率。
   *
   * v0.7 拉开分离度 1.6/0.4 → 1.75/0.32：五色均摊下的期望值几乎不变（1.0 → 1.01），
   * 但「专注拖克制色」与「见珠就拖」的差距明显变大。配合封克制色（counterSeal）
   * 与属性吸收，这个乘区才真正参与决策，而不是被五行齐全的队伍自动吃满。
   */
  counterMultiplier: 1.75,
  /** 被克伤害倍率（v0.3 0.5→0.4；v0.7 0.4→0.32 继续加重错属性惩罚） */
  counteredMultiplier: 0.32,

  /**
   * 技能瞬发直伤的克制乘区（v0.9 新增，独立于消珠的 1.75 / 0.32）。
   *
   * 技能原本不吃任何乘区，放技的手感只是「又一次平 A」。接上克制这一层之后，
   * 「为这只 Boss 带对色核爆」第一次有了回报。档位比消珠收敛，是难度门禁逼出来的：
   * 直接套 1.75 / 0.32 会让高手在第 4 章 Boss 打出 7 回合，跌破 boss 秒推下限 8 ——
   * 技能是「一次性一大口」，同样的乘区放在它身上，方差比逐回合摊开的消珠大得多。
   *
   * 五色均摊下期望仍是 (1.5 + 0.5 + 3) / 5 = 1.0，因此 TTK 预算不受影响。
   */
  skillCounterMultiplier: 1.5,
  skillCounteredMultiplier: 0.5,

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
