/**
 * UI 动效/反馈工具（全局复用，零业务依赖）。
 *
 * 统一走 TweenManager（已由 Game.ticker 全局驱动），保证与战斗 HUD / 队伍面板同一时间轴。
 * 场景禁止再裸写 requestAnimationFrame 做 UI 动画，一律调用这里的工具。
 */
import * as PIXI from 'pixi.js';
import { TweenManager, Ease } from '@/core/TweenManager';

/** 面板/卡片回弹入场：缩放 + 淡入（easeOutBack）。 */
export function popIn(
  target: PIXI.Container,
  opts?: { delay?: number; duration?: number; fromScale?: number },
): void {
  const delay = opts?.delay ?? 0;
  const duration = opts?.duration ?? 0.32;
  const fromScale = opts?.fromScale ?? 0.82;
  TweenManager.cancelTarget(target);
  TweenManager.cancelTarget(target.scale);
  target.alpha = 0;
  target.scale.set(fromScale);
  TweenManager.to({
    target, props: { alpha: 1 }, duration: duration * 0.65, delay, ease: Ease.easeOutQuad,
  });
  TweenManager.to({
    target: target.scale, props: { x: 1, y: 1 }, duration, delay, ease: Ease.easeOutBack,
  });
}

/** 浮层淡入（用于 scrim/遮罩等不缩放的整体浮层）。 */
export function fadeIn(
  target: PIXI.Container,
  opts?: { delay?: number; duration?: number; to?: number },
): void {
  const delay = opts?.delay ?? 0;
  const duration = opts?.duration ?? 0.22;
  const to = opts?.to ?? 1;
  TweenManager.cancelTarget(target);
  target.alpha = 0;
  TweenManager.to({ target, props: { alpha: to }, duration, delay, ease: Ease.easeOutQuad });
}

/** 淡出后回调（通常用于关闭浮层后 destroy）。 */
export function fadeOut(
  target: PIXI.Container,
  opts?: { duration?: number; onComplete?: () => void },
): void {
  const duration = opts?.duration ?? 0.18;
  TweenManager.cancelTarget(target);
  TweenManager.to({
    target, props: { alpha: 0 }, duration, ease: Ease.easeOutQuad,
    onComplete: opts?.onComplete,
  });
}

/**
 * 按钮按下缩放反馈：按下缩小、抬起/点击回弹。
 * 由 makeButton 默认接入；也可手动给任意可交互容器附加。
 *
 * 只在 pointerup / pointerupoutside 回弹，不在 pointertap 上回弹：
 * tap 回调常切场景或 destroy 按钮，若再 tween scale 会读到 null。
 */
export function pressFeedback(target: PIXI.Container, opts?: { scale?: number }): void {
  const downScale = opts?.scale ?? 0.94;
  const alive = (): boolean => {
    if (target.destroyed) return false;
    // 勿读 target.scale 做探测：destroy 后 transform 为 null，getter 会抛错
    return (target as PIXI.Container & { transform?: unknown }).transform != null;
  };

  const press = (): void => {
    if (!alive()) return;
    try {
      TweenManager.cancelTarget(target.scale);
      TweenManager.to({
        target: target.scale, props: { x: downScale, y: downScale },
        duration: 0.08, ease: Ease.easeOutQuad,
      });
    } catch {
      /* 节点已销毁 */
    }
  };
  const release = (): void => {
    if (!alive()) return;
    try {
      TweenManager.cancelTarget(target.scale);
      TweenManager.to({
        target: target.scale, props: { x: 1, y: 1 },
        duration: 0.22, ease: Ease.easeOutBack,
      });
    } catch {
      /* 节点已销毁 */
    }
  };
  target.on('pointerdown', press);
  target.on('pointerup', release);
  target.on('pointerupoutside', release);
}

/** 列表逐项入场：每项淡入 + 轻微上移，按序错峰。 */
export function staggerIn(
  items: readonly PIXI.Container[],
  opts?: { stepDelay?: number; duration?: number; offsetY?: number; baseDelay?: number },
): void {
  const step = opts?.stepDelay ?? 0.05;
  const duration = opts?.duration ?? 0.3;
  const offsetY = opts?.offsetY ?? 18;
  const baseDelay = opts?.baseDelay ?? 0;
  items.forEach((item, i) => {
    const baseY = item.y;
    TweenManager.cancelTarget(item);
    item.alpha = 0;
    item.y = baseY + offsetY;
    TweenManager.to({
      target: item, props: { alpha: 1, y: baseY },
      duration, delay: baseDelay + i * step, ease: Ease.easeOutCubic,
    });
  });
}

/** 数值滚动：from → to，逐帧回调取整值（用于货币/经验/战力等爽感）。 */
export function countUp(opts: {
  from: number;
  to: number;
  duration?: number;
  delay?: number;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
}): void {
  const state = { v: opts.from };
  opts.onUpdate(opts.from);
  TweenManager.cancelTarget(state);
  TweenManager.to({
    target: state, props: { v: opts.to },
    duration: opts.duration ?? 0.5, delay: opts.delay ?? 0, ease: Ease.easeOutCubic,
    onUpdate: () => opts.onUpdate(Math.round(state.v)),
    onComplete: () => { opts.onUpdate(opts.to); opts.onComplete?.(); },
  });
}

/** 强调脉冲：放大回弹（数值变化提示，复用自队伍总览 pulse）。 */
export function pulse(target: PIXI.Container, opts?: { peak?: number; duration?: number }): void {
  const peak = opts?.peak ?? 1.16;
  TweenManager.cancelTarget(target.scale);
  target.scale.set(peak);
  TweenManager.to({
    target: target.scale, props: { x: 1, y: 1 },
    duration: opts?.duration ?? 0.34, ease: Ease.easeOutBack,
  });
}
