/**
 * 关卡类型单一真源（纯数据，零逻辑）
 *
 * 与 rarity.ts / stageMechanics.ts 同构：把「关卡类型」从散落的 isBoss 布尔
 * 收敛为可扩展的类型表，定义体力消耗、产出倍率、UI 标识色与刷新规则。
 * 实际产出公式见 formulas/economyOutput.ts。
 */

export type StageType = 'normal' | 'elite' | 'boss' | 'dailyResource' | 'event';

/** 刷新规则：常驻 / 每日限次 / 活动限时 */
export type StageRefresh = 'always' | 'daily' | 'event';

export interface StageTypeDef {
  type: StageType;
  name: string;
  /** UI 标识色 */
  color: number;
  /** 体力消耗（体力系统未落地前仅作展示与预留） */
  staminaCost: number;
  /** 灵宠币产出倍率 */
  coinMult: number;
  /** 经验产出倍率 */
  expMult: number;
  /** 碎片产出倍率 */
  shardMult: number;
  /** 刷新规则 */
  refresh: StageRefresh;
}

export const STAGE_TYPE_PROFILES: Readonly<Record<StageType, StageTypeDef>> = {
  normal: {
    type: 'normal', name: '常规', color: 0x6fd86a,
    staminaCost: 6, coinMult: 1.0, expMult: 1.0, shardMult: 1.0, refresh: 'always',
  },
  elite: {
    type: 'elite', name: '精英', color: 0x4aa3ff,
    staminaCost: 9, coinMult: 1.4, expMult: 1.3, shardMult: 1.6, refresh: 'always',
  },
  boss: {
    type: 'boss', name: 'BOSS', color: 0xffb43d,
    staminaCost: 12, coinMult: 2.0, expMult: 1.6, shardMult: 2.2, refresh: 'always',
  },
  dailyResource: {
    type: 'dailyResource', name: '资源', color: 0xb06bff,
    staminaCost: 8, coinMult: 0.4, expMult: 2.4, shardMult: 2.0, refresh: 'daily',
  },
  event: {
    type: 'event', name: '活动', color: 0xff5252,
    staminaCost: 10, coinMult: 1.2, expMult: 1.5, shardMult: 1.8, refresh: 'event',
  },
};

export function getStageType(type: StageType): StageTypeDef {
  return STAGE_TYPE_PROFILES[type] ?? STAGE_TYPE_PROFILES.normal;
}
