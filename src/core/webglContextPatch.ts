/**
 * iOS 微信小游戏 WebGL2 上下文不完整（instanceof 失败、无 uint32 index），
 * Sprite/Graphics 静默不绘制。须让 Pixi 走纯 WebGL1：
 * - settings.PREFER_ENV = WEBGL（Pixi7 已忽略 preferWebGLVersion）
 * - getContext('webgl2') 返回 null（勿把 webgl2 降级成 webgl，会与 Pixi 内部版本检测冲突）
 *
 * Tap Android 的 libwebglhost 对第二块 WebGL canvas / MSAA 会直接 abort，
 * 渲染选项和 framebuffer 尺寸也在这里收口。
 */
import { Renderer } from '@pixi/core';
import { ENV } from '@pixi/constants';
import { settings } from '@pixi/settings';
import { Platform, getNativePlatformApi } from '@/core/PlatformService';

declare const GameGlobal: any;

function platformApi(): any {
  return getNativePlatformApi();
}

export function iosPlatform(): boolean {
  try {
    return platformApi()?.getSystemInfoSync?.()?.platform === 'ios';
  } catch {
    return false;
  }
}

/** 解析 getSystemInfoSync().system，如 "iOS 26.5" → 26 */
export function iosMajorVersion(): number {
  try {
    const sys = platformApi()?.getSystemInfoSync?.()?.system ?? '';
    const m = String(sys).match(/iOS\s+(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  } catch {
    return 0;
  }
}

export function minigameRendererOpts(isTaptap: boolean): {
  backgroundColor: number;
  resolution: number;
  antialias: boolean;
  preserveDrawingBuffer: boolean;
  preferWebGLVersion: 1;
} {
  return {
    backgroundColor: 0x1a1126,
    resolution: 1,
    antialias: !isTaptap,
    preserveDrawingBuffer: !isTaptap,
    preferWebGLVersion: 1,
  };
}

export function capTapDevicePixelRatio(pixelRatio: number): number {
  const dpr = Number(pixelRatio) || 2;
  return Math.min(dpr, 2);
}

export function capTapFramebuffer(
  width: number,
  height: number,
  maxEdge = 2560,
): { width: number; height: number; scale: number } {
  const edge = Math.max(width, height);
  if (edge <= maxEdge) return { width, height, scale: 1 };
  const scale = maxEdge / edge;
  return {
    width: Math.floor(width * scale),
    height: Math.floor(height * scale),
    scale,
  };
}

/** Tap 宿主对 stencil / MSAA / 第二块 WebGL canvas 很脆，探测从最简属性开始 */
export function tapWebGLContextAttempts(): Record<string, unknown>[] {
  return [
    { antialias: false, preserveDrawingBuffer: false, stencil: false, depth: true, alpha: true },
    { antialias: false, preserveDrawingBuffer: false },
    {},
  ];
}

export function acquireMainWebGLContext(canvas: unknown): any {
  const c = canvas as {
    getContext?: (type: string, opts?: object) => unknown;
  } | null;
  if (!c?.getContext) return null;
  const attempts = Platform.isTaptap
    ? tapWebGLContextAttempts()
    : [
      { antialias: true, preserveDrawingBuffer: true, stencil: true, depth: true, alpha: true },
      { antialias: false, stencil: true },
      {},
    ];
  for (const opts of attempts) {
    try {
      const gl = c.getContext('webgl', opts) || c.getContext('experimental-webgl', opts);
      if (gl) return gl;
    } catch { /* 换下一组属性 */ }
  }
  return null;
}

/**
 * Pixi 的 isWebGLSupported 会再开一块 canvas 做探测，失败就报
 * Unable to auto-detect a suitable renderer；Tap 上还可能 loseContext 把主屏搞死。
 */
export function forcePixiWebGLRenderer(): void {
  try { Renderer.test = () => true; } catch { /* */ }
}

export function rememberSharedWebGL(gl: unknown): void {
  try {
    if (typeof GameGlobal !== 'undefined') GameGlobal.__tapGL = gl;
  } catch { /* */ }
}

/** iOS / Tap：强制 Pixi 走 WebGL1 */
export function configurePixiWebGLEnvForPlatform(platform?: string): void {
  if (platform !== 'ios' && !iosPlatform() && !Platform.isTaptap) return;
  settings.PREFER_ENV = ENV.WEBGL;
}

/** 主屏 / 离屏 canvas：webgl2 请求返回 null，让 Pixi 正确降级 */
export function blockWebGL2OnCanvas(canvas: unknown): void {
  const c = canvas as {
    getContext?: (type: string, opts?: object) => unknown;
    __webgl2Blocked?: boolean;
  } | null;
  if (!c?.getContext || c.__webgl2Blocked) return;

  const orig = c.getContext.bind(c);
  c.getContext = (type: string, opts?: object) => {
    if (type === 'webgl2') return null;
    return orig(type, opts);
  };
  c.__webgl2Blocked = true;
}

/** 只包 iOS 的 createCanvas。Tap 上包一层会和 document.createElement 互相重入，直接栈溢出。 */
export function installBlockWebGL2OnPlatform(): void {
  if (!iosPlatform() || Platform.isTaptap) return;

  const api = platformApi();
  if (!api?.createCanvas || api.__webgl2BlockedCreateCanvas) return;
  api.__webgl2BlockedCreateCanvas = true;

  const origCreate = api.createCanvas.bind(api);
  api.createCanvas = (...args: unknown[]) => {
    const c = origCreate(...args);
    blockWebGL2OnCanvas(c);
    return c;
  };
}
