/** 右上角宿主菜单胶囊（微信 ··· / 抖音收起），屏幕逻辑像素 */

export interface MenuButtonRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

/**
 * 微信是 getMenuButtonBoundingClientRect，抖音是 getMenuButtonLayout。
 * 开发者工具里胶囊常在首帧之后才就绪，调用方应延迟再读一次。
 */
export function readMenuButtonRect(api: unknown): MenuButtonRect | null {
  const raw = pickRawRect(api);
  if (!raw) return null;
  const width = Number(raw.width) || 0;
  const height = Number(raw.height) || 0;
  if (width <= 0 && height <= 0) return null;
  const top = Number(raw.top) || 0;
  const left = Number(raw.left) || 0;
  const bottom = Number(raw.bottom) > 0 ? Number(raw.bottom) : top + (height || 32);
  const right = Number(raw.right) > 0 ? Number(raw.right) : left + (width || 88);
  return {
    top,
    bottom,
    left,
    right,
    width: width || Math.max(1, right - left),
    height: height || Math.max(1, bottom - top),
  };
}

function pickRawRect(api: unknown): Record<string, unknown> | null {
  if (!api || typeof api !== 'object') return null;
  const host = api as {
    getMenuButtonBoundingClientRect?: () => unknown;
    getMenuButtonLayout?: () => unknown;
  };
  const first = tryCall(host.getMenuButtonBoundingClientRect);
  if (isPlausible(first)) return first;
  const second = tryCall(host.getMenuButtonLayout);
  if (isPlausible(second)) return second;
  return null;
}

function tryCall(fn?: () => unknown): Record<string, unknown> | null {
  if (typeof fn !== 'function') return null;
  try {
    const value = fn();
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function isPlausible(rect: Record<string, unknown> | null): rect is Record<string, unknown> {
  if (!rect) return false;
  return (Number(rect.height) || 0) > 0 || (Number(rect.width) || 0) > 0;
}
