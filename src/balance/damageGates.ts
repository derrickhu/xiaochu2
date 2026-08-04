/**
 * 伤害闸门（硬机制）—— 实战与模拟器共用的唯一求值真源。
 *
 * 与「减伤 / 吸收」这类连续乘区的本质区别：闸门是离散开关。不满足条件伤害直接降为 1，
 * 堆数值无法抵消，玩家只能改阵容或改操作。三条设计约束：
 * - 判定只看首消（MatchGroup.waveIndex === 0），天降不参与，避免随机背刺；
 * - 由敌人技能施加且限时 3~5 回合，始终保留「周旋熬过去」这条第二解法；
 * - 每种闸门的解法都挂在属性/被动/一类宠物上，不绑定单张卡的主动技。
 *
 * 实战侧 battleTurnResolution 与模拟器 simulation 都必须走本模块，
 * 否则两边口径漂移会让配平测试失去意义。
 */

/** 未满足闸门时的伤害乘区。配合结算处既有的 Math.max(1, ...) 即为「伤害降为 1」 */
export const GATE_FAIL_MULT = 0;

/** 锋锐无效的穿透门槛：单组消除达到该数量即可穿透（复用既有 matchCount，无需形状识别） */
export const VOID_PIERCE_MATCH_COUNT = 5;

/** 穿透成功时的额外增伤，作为「练了就会」的操作奖励 */
export const VOID_PIERCE_MULT = 1.5;

/** 各闸门的默认配置，关卡与敌人技能都从这里取值，避免散落魔数 */
export const GATE_TUNING = {
  /** 五行阵盾：首消需覆盖的属性数 */
  elementGate: { normal: 3, boss: 4, turns: 4 },
  /** 连锁盾：首消需达到的 combo，按章递增 */
  comboGate: { early: 4, mid: 6, late: 8, turns: 3 },
  /** 锋锐无效：阈值取敌人 maxHp 的比例 */
  damageVoid: { thresholdPct: 0.12, turns: 4 },
  /** 不灭（根性）：HP 高于该比例时致死伤害留 1 血，每场一次 */
  undying: { hpThresholdPct: 0.3 },
  /** 同源相斥：读队伍属性种类数，形成「3 种属性」甜点区 */
  compPenalty: {
    wideCount: 4,
    wideAtkMult: 1.6,
    narrowCount: 2,
    narrowReduction: 0.4,
  },
} as const;

export type TurnGateKind = 'elementGate' | 'comboGate';

/** 当前生效的闸门快照。0 表示该闸门未生效 */
export interface GateSnapshot {
  /** 五行阵盾：首消需覆盖的最少属性数 */
  elementNeed: number;
  /** 连锁盾：首消需达到的最少 combo */
  comboNeed: number;
  /** 锋锐无效：单次伤害的绝对上限 */
  voidThreshold: number;
}

export const NO_GATES: GateSnapshot = Object.freeze({
  elementNeed: 0,
  comboNeed: 0,
  voidThreshold: 0,
});

/** 首消（第一波消除）统计，天降产生的组不计入 */
export interface FirstWaveStats {
  /** 首消中能造成伤害的不同属性数（未覆盖/被禁用的属性不算） */
  elements: number;
  /** 首消形成的消除组数 */
  combo: number;
}

export interface GateUnmet {
  kind: TurnGateKind;
  need: number;
  actual: number;
}

export interface GateVerdict {
  /** 本回合消珠伤害乘区：1 = 全部通过，GATE_FAIL_MULT = 存在未满足的闸门 */
  turnMult: number;
  unmet: readonly GateUnmet[];
}

const PASSED: GateVerdict = Object.freeze({ turnMult: 1, unmet: Object.freeze([]) });

/**
 * 求值回合级闸门（五行阵盾 / 连锁盾）。
 * 任一闸门未满足即整回合消珠伤害降为 1，未满足项一并返回供 UI 提示「还差多少」。
 */
export function evaluateTurnGates(gates: GateSnapshot, stats: FirstWaveStats): GateVerdict {
  if (gates.elementNeed <= 0 && gates.comboNeed <= 0) return PASSED;

  const unmet: GateUnmet[] = [];
  if (gates.elementNeed > 0 && stats.elements < gates.elementNeed) {
    unmet.push({ kind: 'elementGate', need: gates.elementNeed, actual: stats.elements });
  }
  if (gates.comboNeed > 0 && stats.combo < gates.comboNeed) {
    unmet.push({ kind: 'comboGate', need: gates.comboNeed, actual: stats.combo });
  }
  if (unmet.length === 0) return PASSED;
  return { turnMult: GATE_FAIL_MULT, unmet };
}

export interface VoidOutcome {
  damage: number;
  /** 被无效化（超过阈值且未穿透） */
  voided: boolean;
  /** 达到消除数门槛，穿透并获得额外增伤 */
  pierced: boolean;
}

/**
 * 求值锋锐无效（单次伤害上限）。
 * 超过阈值的一击会被归零，除非该组消除达到 VOID_PIERCE_MATCH_COUNT 颗——
 * 这让「更高的数值」在此处变成负面，而盘面操作成为唯一解。
 */
export function applyDamageVoid(
  damage: number,
  matchCount: number,
  threshold: number,
): VoidOutcome {
  if (threshold <= 0) return { damage, voided: false, pierced: false };
  if (matchCount >= VOID_PIERCE_MATCH_COUNT) {
    return { damage: Math.floor(damage * VOID_PIERCE_MULT), voided: false, pierced: true };
  }
  if (damage > threshold) return { damage: 0, voided: true, pierced: false };
  return { damage, voided: false, pierced: false };
}

/** 同源相斥的求值结果：读队伍属性种类数得出敌方强化幅度 */
export interface CompPenalty {
  /** 敌人攻击乘区 */
  enemyAtkMult: number;
  /** 敌人额外减伤（0~1） */
  enemyReduction: number;
}

export const NO_COMP_PENALTY: CompPenalty = Object.freeze({
  enemyAtkMult: 1,
  enemyReduction: 0,
});

/**
 * 同源相斥：属性种类过多则敌人变强，过少则敌人减伤，形成中间的甜点区。
 * 这条直接打破「五色齐 + 总攻最高」的恒定最优解，且实现成本只是读一次队伍表。
 */
export function evaluateCompPenalty(distinctElements: number): CompPenalty {
  const t = GATE_TUNING.compPenalty;
  if (distinctElements >= t.wideCount) {
    return { enemyAtkMult: t.wideAtkMult, enemyReduction: 0 };
  }
  if (distinctElements <= t.narrowCount) {
    return { enemyAtkMult: 1, enemyReduction: t.narrowReduction };
  }
  return NO_COMP_PENALTY;
}

/** 闸门未满足时的一句话提示，UI 用（战中常驻显示差多少） */
export function describeUnmet(u: GateUnmet): string {
  if (u.kind === 'elementGate') {
    return `五行阵盾：首消还差 ${u.need - u.actual} 种属性（需 ${u.need} 种）`;
  }
  return `连锁盾：首消还差 ${u.need - u.actual} 连（需 ${u.need} 连）`;
}
