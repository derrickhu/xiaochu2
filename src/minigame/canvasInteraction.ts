/**
 * 微信小游戏统一 canvas 交互
 *
 * huahua（direct-webgl） vs xiaochu2（双 canvas）差异见 minigame/index.ts
 *
 * 拖拽事件链（小游戏必须成对，勿混 touchstart + pointerup）：
 *   touchstart → touchmove → touchend   （与 ScrollList / canvasTapRouter 一致）
 * 浏览器 / huahua 单 canvas：
 *   容器 pointerdown → canvas pointermove → pointerup
 */
import * as PIXI from 'pixi.js';
import { Platform } from '@/core/PlatformService';
import { designEventToLocal } from '@/utils/clientEventToDesign';
import { getTouchCanvas, type TouchCanvasLike } from '@/utils/touchCanvas';
import { touchDiag, touchDiagOnce } from '@/utils/touchDiag';

export interface CanvasDragOptions {
  container: PIXI.Container;
  width: number;
  height: number;
  canStart: () => boolean;
  isDragging: () => boolean;
  onDown: (localX: number, localY: number) => void;
  onMove: (localX: number, localY: number) => void;
  onUp: () => void;
  /** canStart=false 时附加诊断（如 busy/state） */
  whyBlocked?: () => string;
  label?: string;
}

export interface CanvasDragHandle {
  destroy(): void;
}

export interface CanvasPointerMoveOptions {
  onMove: (e: unknown) => void;
  onUp: (e?: unknown) => void;
  onDown?: (e: unknown) => void;
  label?: string;
}

export interface CanvasPointerMoveHandle {
  destroy(): void;
}

const useMinigameTouch = (): boolean => Platform.isMinigame && !Platform.isDevtools;

/** 小游戏：touch 三件套；浏览器：pointer move/up（+ 可选 pointer down） */
function attachCanvasMoveUp(
  canvas: TouchCanvasLike,
  opts: CanvasPointerMoveOptions,
): () => void {
  const onDown = opts.onDown
    ? (((e: Event) => opts.onDown!(e)) as EventListener)
    : null;
  const onMove = ((e: Event) => {
    (e as { preventDefault?: () => void }).preventDefault?.();
    opts.onMove(e);
  }) as EventListener;
  const onUp = ((e: Event) => opts.onUp(e)) as EventListener;

  if (useMinigameTouch()) {
    // 对齐 huahua / BoardView：down 可走 touchstart，move/up 必须走 pointer（TouchEvent.js 会 dispatch）
    if (onDown) canvas.addEventListener('touchstart', onDown, { passive: true });
    canvas.addEventListener('pointermove', onMove, { passive: false });
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    return () => {
      if (onDown) canvas.removeEventListener('touchstart', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }

  if (onDown) canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  return () => {
    if (onDown) canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
  };
}

export function bindCanvasDrag(opts: CanvasDragOptions): CanvasDragHandle {
  const {
    container, width, height, label = 'drag',
  } = opts;
  let armed = false;
  let moveLogN = 0;
  const canvas = getTouchCanvas();
  const touchMode = useMinigameTouch();

  const tryDown = (localX: number, localY: number): boolean => {
    if (armed || opts.isDragging()) return false;
    if (!opts.canStart()) {
      const extra = opts.whyBlocked?.() ?? '';
      touchDiag(`${label}.down`, `skip canStart=false ${extra}`.trim());
      return false;
    }
    if (localX < 0 || localY < 0 || localX > width || localY > height) {
      touchDiag(`${label}.down`, `skip OOB ${Math.round(localX)},${Math.round(localY)}`
        + ` area=${width}x${height}`);
      return false;
    }
    armed = true;
    moveLogN = 0;
    touchDiag(`${label}.down`, `OK ${Math.round(localX)},${Math.round(localY)}`);
    opts.onDown(localX, localY);
    return true;
  };

  const release = (): void => {
    if (armed || opts.isDragging()) {
      touchDiag(`${label}.up`, `dragging=${opts.isDragging()}`);
    }
    armed = false;
    if (opts.isDragging()) opts.onUp();
  };

  const handleMove = (e: Event): void => {
    if (!opts.isDragging()) return;
    const p = designEventToLocal(container, e);
    if (moveLogN < 6) {
      moveLogN++;
      touchDiag(`${label}.move`, `#${moveLogN} ${Math.round(p.x)},${Math.round(p.y)}`);
    }
    opts.onMove(p.x, p.y);
  };

  const onCanvasDown = ((e: Event) => {
    const p = designEventToLocal(container, e);
    tryDown(p.x, p.y);
  }) as EventListener;

  const onPixiDown = (e: PIXI.FederatedPointerEvent) => {
    const p = container.toLocal(e.global);
    tryDown(p.x, p.y);
  };

  let detachMoveUp: (() => void) | null = null;

  if (touchMode) {
    container.eventMode = 'none';
    canvas.addEventListener('touchstart', onCanvasDown, { passive: true });
    detachMoveUp = attachCanvasMoveUp(canvas, {
      onMove: handleMove,
      onUp: release,
    });
    touchDiagOnce(label, 'bindCanvasDrag: touchstart + pointermove/up');
  } else {
    container.eventMode = 'static';
    container.hitArea = new PIXI.Rectangle(0, 0, width, height);
    container.interactiveChildren = false;
    container.on('pointerdown', onPixiDown);
    detachMoveUp = attachCanvasMoveUp(canvas, {
      onMove: handleMove,
      onUp: release,
    });
    touchDiagOnce(label, 'bindCanvasDrag: pointerdown + pointermove/up');
  }

  return {
    destroy() {
      if (touchMode) {
        canvas.removeEventListener('touchstart', onCanvasDown);
      } else {
        container.off('pointerdown', onPixiDown);
      }
      detachMoveUp?.();
      armed = false;
    },
  };
}

export function bindCanvasPointerMove(opts: CanvasPointerMoveOptions): CanvasPointerMoveHandle {
  const canvas = getTouchCanvas();
  const detach = attachCanvasMoveUp(canvas, opts);
  if (Platform.isMinigame && opts.label) {
    touchDiagOnce(opts.label, useMinigameTouch()
      ? 'bindCanvasPointerMove: touchstart? + pointermove/up'
      : 'bindCanvasPointerMove: pointermove/up');
  }
  return { destroy: detach };
}
