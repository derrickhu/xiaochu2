/**
 * Tap Android 的纹理上传通道。
 *
 * gl.texImage2D 有两种重载：DOM 元素版（6 参，直接吃 canvas/image 对象）和
 * 像素版（9 参，吃 TypedArray）。Pixi 的 BaseImageResource.upload 走前者，
 * 而 tapTextRaster 给 Text 用的是纯 JS 假 canvas —— 骗得过 CanvasResource.test，
 * 骗不过宿主 WebGL，texImage2D 直接抛 TypeError，整帧渲染就此中断。
 *
 * 这里提供像素版通道：先 getImageData 拿到 RGBA，再走 9 参重载。
 */

/** tapTextRaster 造的假 canvas，宿主 WebGL 不认 */
export function isSyntheticCanvas(source: any): boolean {
  return !!source && source.__tapTextWrap === true;
}

/** 能不能读出像素——只有能读，像素通道才有意义 */
export function canReadPixels(source: any): boolean {
  if (!source || typeof source.getContext !== 'function') return false;
  try {
    const ctx = source.getContext('2d');
    return !!ctx && typeof ctx.getImageData === 'function';
  } catch {
    return false;
  }
}

function toUint8(data: any): Uint8Array | null {
  if (!data) return null;
  if (data instanceof Uint8Array) return data;
  if (data.buffer) return new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength || undefined);
  if (typeof data.length === 'number') return new Uint8Array(data as ArrayLike<number>);
  return null;
}

/**
 * 走 9 参 texImage2D 上传。
 * @returns 是否真的上传成功；false 时调用方应当认为纹理未就绪，但绝不该抛
 */
export function uploadCanvasPixels(
  renderer: any,
  baseTexture: any,
  glTexture: any,
  source: any,
): boolean {
  try {
    const gl = renderer?.gl;
    if (!gl || !canReadPixels(source)) return false;

    const w = Math.max(1, Number(source.width) | 0);
    const h = Math.max(1, Number(source.height) | 0);
    const ctx = source.getContext('2d');
    const pixels = toUint8(ctx.getImageData(0, 0, w, h)?.data);
    if (!pixels || pixels.length < w * h * 4) return false;

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, baseTexture?.alphaMode > 0 ? 1 : 0);
    glTexture.width = w;
    glTexture.height = h;
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      glTexture.internalFormat,
      w,
      h,
      0,
      baseTexture.format,
      glTexture.type,
      pixels,
    );
    return true;
  } catch {
    return false;
  }
}
