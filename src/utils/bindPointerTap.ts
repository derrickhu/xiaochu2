/**
 * 可点击绑定（见 @/minigame/index.ts 统一交互层）：
 * - 微信小游戏：canvasTapRouter（touchstart/touchend + 设计坐标 hitTest）
 * - 纯浏览器：pointerdown + pointerup
 */
import * as PIXI from 'pixi.js';
import { Platform } from '@/core/PlatformService';
import { deferAfterPointerEvent } from './deferAfterPointer';
import { registerCanvasTap } from './canvasTapRouter';

export function bindPointerTap(
  target: PIXI.Container,
  fn: () => void,
  opts?: { guard?: () => boolean; blockTap?: () => boolean; label?: string },
): void {
  let fired = false;
  const run = (): void => {
    if (fired) return;
    if (opts?.guard && !opts.guard()) return;
    if (opts?.blockTap?.()) return;
    fired = true;
    deferAfterPointerEvent(() => {
      fired = false;
      fn();
    });
  };

  if (Platform.isMinigame) {
    if (target.eventMode === 'none' || !target.eventMode) {
      target.eventMode = 'static';
    }
    registerCanvasTap({
      target,
      fn: run,
      guard: opts?.guard,
      blockTap: opts?.blockTap,
      label: opts?.label,
    });
    return;
  }

  target.eventMode = target.eventMode === 'none' ? 'static' : (target.eventMode || 'static');
  let armed = false;
  target.on('pointerdown', () => { armed = true; });
  target.on('pointerup', () => {
    if (!armed) return;
    armed = false;
    run();
  });
  target.on('pointerupoutside', () => { armed = false; });
  target.on('pointercancel', () => { armed = false; });
}
