/**
 * 体力（纯函数 + 就地结算，零渲染 / 零存档 IO）
 *
 * 恢复采用**惰性结算**而非 ticker：只在读取时按 `now - lastRegenMs` 补点。
 * 好处是「关掉小游戏也在回体」天然成立，且不需要在 Game.update 里养一个后台计时器；
 * 代价是所有读取口都必须先 settle，因此 PlayerData 的 getter 统一走 settleStamina。
 *
 * 上限随进度走，见 ECONOMY.stamina 注释。
 */
import { ECONOMY } from '@/balance/economy';
import { getStageType } from '@/balance/stageTypes';
import type { StageDef } from '@/balance/stages';
import type { BattleContext } from './battleContext';

export interface StaminaState {
  value: number;
  /** 上次结算恢复的时间戳（ms）；跨端只依赖本地时钟 */
  lastRegenMs: number;
}

export function emptyStaminaState(nowMs = Date.now()): StaminaState {
  return { value: staminaCap(1), lastRegenMs: nowMs };
}

/** 体力上限：已通关章数越多，单次上线能玩的场次越多 */
export function staminaCap(clearedChapters: number): number {
  const s = ECONOMY.stamina;
  return s.baseMax + s.perChapterBonus * Math.max(0, clearedChapters - 1);
}

/**
 * 就地补点：返回是否发生变化（调用方据此决定是否落盘）。
 *
 * 超上限时不倒扣（广告回体可以顶破上限，这是常规做法），但也不再自然恢复。
 * 时钟回拨（改系统时间 / 跨时区）只会把 lastRegenMs 往回对齐，不会白送体力。
 */
export function settleStamina(st: StaminaState, cap: number, nowMs = Date.now()): boolean {
  const stepMs = ECONOMY.stamina.regenSeconds * 1000;
  if (!Number.isFinite(st.lastRegenMs) || st.lastRegenMs <= 0 || st.lastRegenMs > nowMs) {
    st.lastRegenMs = nowMs;
    return true;
  }
  if (st.value >= cap) {
    // 已满时把计时基准贴到当前，避免满瓶期间攒下「离线额度」；
    // 但返回 false 不触发落盘 —— UI 每帧都会读体力，写存档会被打成高频 IO。
    st.lastRegenMs = nowMs;
    return false;
  }
  const elapsed = nowMs - st.lastRegenMs;
  const gained = Math.floor(elapsed / stepMs);
  if (gained <= 0) return false;
  st.value = Math.min(cap, st.value + gained);
  // 只推进「已兑现」的整点，余数留给下次，保证不丢秒
  st.lastRegenMs = st.value >= cap ? nowMs : st.lastRegenMs + gained * stepMs;
  return true;
}

/** 距下一点恢复的剩余毫秒（已满返回 0） */
export function msToNextPoint(st: StaminaState, cap: number, nowMs = Date.now()): number {
  if (st.value >= cap) return 0;
  const stepMs = ECONOMY.stamina.regenSeconds * 1000;
  const elapsed = Math.max(0, nowMs - st.lastRegenMs);
  return Math.max(0, stepMs - (elapsed % stepMs));
}

/** 距满瓶的剩余毫秒（已满返回 0） */
export function msToFull(st: StaminaState, cap: number, nowMs = Date.now()): number {
  if (st.value >= cap) return 0;
  const stepMs = ECONOMY.stamina.regenSeconds * 1000;
  return msToNextPoint(st, cap, nowMs) + (cap - st.value - 1) * stepMs;
}

/** 「12:34」式倒计时文案；≥1 小时显示「2 小时 5 分」 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 单场战斗的体力单价（唯一真源）。
 *
 * - 通天塔 0：已被每日重置次数门控，再叠体力等于双重门控，会直接劝退长线玩家
 * - 新手章 0：第 1 章是教学段，不能让新人第一天就卡体力
 * - 其余按 stageTypes.staminaCost（普通 6 / 精英 9 / Boss 12 / 秘境 8 / 活动 10）
 */
export function stageStaminaCost(
  stage: Pick<StageDef, 'chapter' | 'type'>,
  context?: BattleContext,
): number {
  if (context?.kind === 'tower') return 0;
  if (!context && stage.chapter <= ECONOMY.stamina.freeChapters) return 0;
  return getStageType(stage.type).staminaCost;
}
