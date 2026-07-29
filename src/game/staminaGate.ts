/**
 * 体力门禁（进战斗前的唯一拦截口）
 *
 * 拦截点有三处：编队页「开始战斗」、结算页「再打一次」、结算页「下一关」。
 * 判定与扣减都收在这里，避免三处各写一遍口径漂移（尤其是新手章免费与塔不耗）。
 *
 * 判定与扣减分离：checkStaminaFor 在按钮上做拦截（体力不足弹面板），
 * consumeStaminaFor 在 BattleScene.onEnter 真正开打时才扣 —— 与秘境次数同一套时序，
 * 保证「进编队页看一眼又退出」不白吃体力。
 */
import { EventBus } from '@/core/EventBus';
import type { StageDef } from '@/balance/stages';
import type { BattleContext } from './battleContext';
import { PlayerData } from './PlayerData';
import { stageStaminaCost } from './staminaService';

/**
 * 体力是否够开这一场；不够时弹体力面板（含广告回体入口）。
 * @returns true = 可以进战斗
 */
export function checkStaminaFor(stage: StageDef, context?: BattleContext): boolean {
  const cost = stageStaminaCost(stage, context);
  if (PlayerData.hasStamina(cost)) return true;
  EventBus.emit('stamina:open', cost);
  return false;
}

/**
 * 真正开打时扣体力。
 * @returns false = 扣不动（调用方应当已经被 checkStaminaFor 拦住，属于兜底）
 */
export function consumeStaminaFor(stage: StageDef, context?: BattleContext): boolean {
  return PlayerData.consumeStamina(stageStaminaCost(stage, context));
}
