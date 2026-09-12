/**
 * 宿主画布的真实矩形，用于把宿主事件坐标换成设计坐标。
 *
 * 微信/抖音/Tap 真机没有 DOM，只能按 getSystemInfoSync 的屏宽比例换算。
 * 华为快游戏有 DOM，事件坐标与 rect 同属一个坐标系（都是 CSS px），
 * 必须用 rect 归一化——按 screenWidth 算会把命中点整体算飞。
 */

export interface HostRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

declare const GameGlobal: { __hostCanvasRect?: () => HostRect } | undefined;

export function readHostCanvasRect(): HostRect | null {
  let raw: HostRect | undefined;
  try {
    raw = GameGlobal?.__hostCanvasRect?.();
  } catch {
    return null;
  }
  return sanitizeHostRect(raw);
}

export function sanitizeHostRect(raw: Partial<HostRect> | null | undefined): HostRect | null {
  if (!raw) return null;
  const width = Number(raw.width) || 0;
  const height = Number(raw.height) || 0;
  if (width <= 0 || height <= 0) return null;
  return {
    left: Number(raw.left) || 0,
    top: Number(raw.top) || 0,
    width,
    height,
  };
}

/**
 * 事件坐标 → 设计坐标（750 宽）。
 * x / y 共用同一缩放，保持长宽比；超出画布的点原样返回，交给 hitTest 判负。
 */
export function clientToDesignByRect(
  cx: number,
  cy: number,
  rect: HostRect,
  designWidth: number,
): { x: number; y: number } {
  const ratio = designWidth / rect.width;
  return {
    x: (cx - rect.left) * ratio,
    y: (cy - rect.top) * ratio,
  };
}
