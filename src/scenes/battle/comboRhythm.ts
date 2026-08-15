/**
 * 连击节奏曲线 —— 「越连越慢、越连越高、越连越重」
 *
 * xiao_chu 的每组消除是恒定 16 帧，靠音阶上行撑爽感；照搬到 xiaochu2 后玩家反馈
 * 「一样的消除节奏、没有变化」。业界（PAD 连锁、Candy Crush cascade）的通行做法是
 * 让后段连击逐拍变慢并加重：停顿拉长制造期待，音高继续上行推情绪，里程碑处再插一个
 * hitstop。每连还要给爆发特效留出「蓄力→炸开」的可读窗，否则只剩一闪。
 * crescendo 提前到 3 / 6 连——日常回合多半到不了 12。
 * 三条曲线放在同一处，是为了让声音、屏震、马达共用同一份 tier 判定。
 */
import { UI } from '@/balance/ui';
import { getComboTier, isComboMilestone } from './ComboDisplay';

export type ComboShakeLevel = 'none' | 'light' | 'medium' | 'heavy';

/** 第 n 连的消除节拍（秒）：起手干脆，越往后越慢 */
export function comboBeat(combo: number): number {
  const { comboBeatBase, comboBeatStep, comboBeatMax } = UI.anim;
  return Math.min(comboBeatMax, comboBeatBase + Math.max(0, combo - 1) * comboBeatStep);
}

/** 里程碑后的额外空拍（秒）：tier 越高停越久，让和弦二段完整落地再进下一连 */
export function comboMilestoneHold(combo: number): number {
  if (!isComboMilestone(combo)) return 0;
  return UI.anim.comboMilestoneHoldBase + getComboTier(combo) * UI.anim.comboMilestoneHoldStep;
}

/**
 * 屏震档位。2 连不震（小爆不必撞屏），破起轻震，里程碑再升级。
 * 弱震会被 ScreenShake 的「强者不被弱者打断」吃掉，长连里里程碑仍能压住场面。
 */
export function comboShake(combo: number): ComboShakeLevel {
  if (isComboMilestone(combo)) {
    const tier = getComboTier(combo);
    return tier >= 5 ? 'heavy' : tier >= 3 ? 'medium' : 'light';
  }
  return combo >= 5 ? 'light' : 'none';
}

/** 马达强度：跟着 tier 走，和屏震同源 */
export function comboVibrate(combo: number): 'light' | 'medium' | 'heavy' {
  const tier = getComboTier(combo);
  return tier >= 4 ? 'heavy' : tier >= 2 ? 'medium' : 'light';
}
