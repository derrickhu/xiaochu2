/**
 * 精英模式（纯数据 + 关卡构造，零 UI / 零存档）
 *
 * 要解决两件事：
 * 1. **内容利用率**：128 关打完就没了，但每关的怪物配置、机制、演出都还能再用一轮。
 *    精英变体让同一份关卡数据承担两种难度曲线，等效内容量翻倍。
 * 2. **碎片缺口**：关卡此前完全不掉碎片（本体碎片只能靠抽卡重复），精英档按
 *    stageTypes.shardMult 产通用碎片，把「打关 → 升星」这条闭环补上。
 *
 * 设计取舍：
 * - **不新建关卡数据**，只在原关卡上乘难度并换 type。逐关手配精英版等于再写一遍 128 关。
 * - **3 星解锁**：3 星意味着玩家已经能在回合上限内打完，此时抬 1.35 倍难度是「再挑战一次」
 *   而不是「卡在同一关」。用通关（1 星）解锁会把精英变成劝退墙。
 * - 精英变体走**独立 stageId**，星数与首通里程碑各记一份，主线进度与解锁链完全不受影响。
 */
import { STAGE_MAP, nextMainlineStage, registerExtraStage, type StageDef } from './stages';

export const ELITE_MODE = {
  /** 解锁门槛：普通关达到该星数 */
  unlockStars: 3,
  /** 难度系数倍率（乘在原关卡 difficulty 上，直接进 enemyStats） */
  difficultyMult: 1.35,
  /** id 后缀 */
  idSuffix: '_elite',
  /**
   * 三星回合上限放宽量：难度上去了，星标准还按原样会让精英必然掉星，
   * 玩家读到的信号就变成「精英模式不该打」。
   */
  starTurnLimitBonus: 2,
} as const;

export function eliteStageIdOf(baseStageId: string): string {
  return `${baseStageId}${ELITE_MODE.idSuffix}`;
}

export function isEliteStageId(stageId: string): boolean {
  return stageId.endsWith(ELITE_MODE.idSuffix);
}

/** 精英关 id → 原关 id（非精英关原样返回） */
export function baseStageIdOf(stageId: string): string {
  return isEliteStageId(stageId)
    ? stageId.slice(0, -ELITE_MODE.idSuffix.length)
    : stageId;
}

/**
 * 该关是否有精英变体：主线铺垫关一律走「普通本体 + 精英模式」。
 *
 * 不再把部分铺垫关写成 type=elite（那种关既没有普通档，也锁死了本模式），
 * 精英难度只通过本变体提供。Boss / 已是精英变体 / 秘境塔等不套。
 */
export function hasEliteVariant(stage: StageDef): boolean {
  return stage.type === 'normal' && !stage.isBoss && !isEliteStageId(stage.id);
}

/** 精英模式是否已解锁（starsOf 由调用方注入，保持本模块零存档依赖） */
export function isEliteUnlocked(stage: StageDef, starsOf: (stageId: string) => number): boolean {
  return hasEliteVariant(stage) && starsOf(stage.id) >= ELITE_MODE.unlockStars;
}

/**
 * 构造并注册某关的精英变体（幂等：已注册则直接复用）。
 *
 * 波次沿用原关，因此敌人技、机制、演出全部继承 —— 精英模式的难度来自数值与
 * 更紧的回合预算，不靠额外堆机制，这样玩家在精英关学到的应对方式与普通关一致。
 */
export function buildEliteStage(base: StageDef): StageDef {
  const id = eliteStageIdOf(base.id);
  const existing = STAGE_MAP.get(id);
  if (existing) return existing;
  return registerExtraStage({
    ...base,
    id,
    type: 'elite',
    difficulty: base.difficulty * ELITE_MODE.difficultyMult,
    starTurnLimit: base.starTurnLimit + ELITE_MODE.starTurnLimitBonus,
    name: `${base.name} · 精英`,
    displayLabel: `${base.chapter}-${base.index} ${base.name} · 精英`,
  });
}

/**
 * 精英连打：当前精英关之后、已解锁精英的下一关。
 * 下一关是 Boss / 未三星 / 已是最后一关 → 没有下一关，结算只留回主页。
 */
export function nextUnlockedEliteStage(
  currentId: string,
  starsOf: (stageId: string) => number,
): StageDef | undefined {
  if (!isEliteStageId(currentId)) return undefined;
  const nextBase = nextMainlineStage(baseStageIdOf(currentId));
  if (!nextBase || !isEliteUnlocked(nextBase, starsOf)) return undefined;
  return eliteStageOf(nextBase);
}

/** 取（并按需注册）精英变体；该关不支持精英化时返回 undefined */
export function eliteStageOf(base: StageDef): StageDef | undefined {
  return hasEliteVariant(base) ? buildEliteStage(base) : undefined;
}
