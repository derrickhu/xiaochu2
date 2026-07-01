/**
 * @deprecated 请使用 @/minigame/canvasInteraction.bindCanvasPointerMove
 * 保留此文件仅为兼容旧 import 路径。
 */
import {
  bindCanvasPointerMove,
  type CanvasPointerMoveHandle,
} from '@/minigame/canvasInteraction';

export type CanvasPointerBridge = CanvasPointerMoveHandle;

export function bindCanvasPointerBridge(opts: {
  onDown?: (e: unknown) => void;
  onMove: (e: unknown) => void;
  onUp: (e?: unknown) => void;
}): CanvasPointerBridge {
  return bindCanvasPointerMove({
    onDown: opts.onDown,
    onMove: opts.onMove,
    onUp: opts.onUp,
    label: 'petSwipe',
  });
}
