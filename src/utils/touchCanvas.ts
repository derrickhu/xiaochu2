/**
 * 微信双 canvas：TouchEvent 桥接挂在 GameGlobal.canvas（pixi-primary）。
 */
import { Game } from '@/core/Game';

declare const GameGlobal: { canvas?: TouchCanvasLike & { __diagId?: string } } | undefined;

export type TouchCanvasLike = {
  addEventListener: (type: string, handler: EventListener, options?: boolean | AddEventListenerOptions) => void;
  removeEventListener: (type: string, handler: EventListener, options?: boolean | AddEventListenerOptions) => void;
  __diagId?: string;
};

export function getTouchCanvas(): TouchCanvasLike {
  const bridged = GameGlobal?.canvas;
  if (bridged && typeof bridged.addEventListener === 'function') {
    return bridged;
  }
  return Game.app.view as unknown as TouchCanvasLike;
}

/** adapter 自定义 addEventListener 会累积 handler；noop stub 则字符串无意义 */
export function touchCanvasBridgeKind(c: TouchCanvasLike): string {
  const fn = c.addEventListener;
  const src = fn ? String(fn).slice(0, 80) : 'none';
  if (src.indexOf('_listeners') !== -1 || src.indexOf('push') !== -1) return 'adapter-bridge';
  if (src.indexOf('function') !== -1 && src.length < 40) return 'noop-stub?';
  return src.slice(0, 40);
}
