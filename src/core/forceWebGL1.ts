/**
 * 微信 iOS 真机（尤其 iOS 26+）Pixi 可能创建 WebGL2 且无 OES_element_index_uint，
 * Sprite/Graphics 静默不绘制。开发者工具不能 patch，否则会整屏黑屏。
 */
declare const wx: any;
declare const tt: any;

const WEBGL1_ATTRS = {
  stencil: true,
  antialias: true,
  alpha: true,
  depth: true,
  preserveDrawingBuffer: true,
};

function platformApi(): any {
  return typeof wx !== 'undefined' ? wx : typeof tt !== 'undefined' ? tt : null;
}

/** 仅 iOS 真机需要强制 WebGL1（devtools / 安卓等不 patch） */
export function shouldForceWebGL1(): boolean {
  try {
    const info = platformApi()?.getSystemInfoSync?.();
    return info?.platform === 'ios';
  } catch {
    return false;
  }
}

export function patchCanvasForceWebGL1(canvas: unknown): void {
  if (!shouldForceWebGL1()) return;

  const c = canvas as {
    getContext?: (type: string, opts?: object) => unknown;
    __forceWebGL1?: boolean;
  } | null;
  if (!c?.getContext || c.__forceWebGL1) return;

  const orig = c.getContext.bind(c);
  c.getContext = (type: string, opts?: object) => {
    if (type === 'webgl2') type = 'webgl';
    if (type === 'webgl' || type === 'experimental-webgl') {
      return orig('webgl', { ...WEBGL1_ATTRS, ...opts });
    }
    return orig(type, opts);
  };
  c.__forceWebGL1 = true;
}

/** iOS 真机：patch wx.createCanvas 新建 canvas */
export function installForceWebGL1OnPlatform(): void {
  if (!shouldForceWebGL1()) return;

  const api = platformApi();
  if (!api?.createCanvas || api.__createCanvasWebGL1Patched) return;
  api.__createCanvasWebGL1Patched = true;

  const origCreate = api.createCanvas.bind(api);
  api.createCanvas = (...args: unknown[]) => {
    const canvas = origCreate(...args);
    patchCanvasForceWebGL1(canvas);
    return canvas;
  };
  console.log('[forceWebGL1] iOS 真机 createCanvas 已 patch');
}
