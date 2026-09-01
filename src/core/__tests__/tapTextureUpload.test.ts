import { describe, expect, it, vi } from 'vitest';
import {
  canReadPixels,
  isSyntheticCanvas,
  uploadCanvasPixels,
} from '@/core/tapTextureUpload';

const GL_CONST = {
  TEXTURE_2D: 3553,
  UNPACK_PREMULTIPLY_ALPHA_WEBGL: 37441,
};

function makeGl() {
  return {
    ...GL_CONST,
    pixelStorei: vi.fn(),
    texImage2D: vi.fn(),
  };
}

/** tapTextRaster 那种假 canvas */
function makeWrap(w: number, h: number, data?: Uint8ClampedArray) {
  return {
    __tapTextWrap: true,
    width: w,
    height: h,
    getContext(type: string) {
      if (type !== '2d') return null;
      return {
        getImageData: (_x: number, _y: number, iw: number, ih: number) => ({
          data: data ?? new Uint8ClampedArray(iw * ih * 4),
          width: iw,
          height: ih,
        }),
      };
    },
  };
}

describe('isSyntheticCanvas', () => {
  it('只认 __tapTextWrap 标记', () => {
    expect(isSyntheticCanvas(makeWrap(4, 4))).toBe(true);
    expect(isSyntheticCanvas({ width: 4, height: 4 })).toBe(false);
    expect(isSyntheticCanvas(null)).toBe(false);
  });
});

describe('canReadPixels', () => {
  it('有 getImageData 才算能读', () => {
    expect(canReadPixels(makeWrap(2, 2))).toBe(true);
    expect(canReadPixels({ getContext: () => ({}) })).toBe(false);
    expect(canReadPixels({})).toBe(false);
  });

  it('getContext 抛异常时不炸', () => {
    const bad = { getContext: () => { throw new Error('nope'); } };
    expect(canReadPixels(bad)).toBe(false);
  });
});

describe('uploadCanvasPixels', () => {
  it('走 9 参 texImage2D，不把对象交给 DOM 重载', () => {
    const gl = makeGl();
    const glTexture = { internalFormat: 6408, type: 5121, width: 0, height: 0 };
    const ok = uploadCanvasPixels(
      { gl },
      { alphaMode: 1, format: 6408 },
      glTexture,
      makeWrap(8, 4),
    );

    expect(ok).toBe(true);
    expect(gl.texImage2D).toHaveBeenCalledTimes(1);
    const args = gl.texImage2D.mock.calls[0];
    expect(args).toHaveLength(9);
    expect(args[3]).toBe(8);
    expect(args[4]).toBe(4);
    expect(args[8]).toBeInstanceOf(Uint8Array);
  });

  it('按 alphaMode 设置预乘', () => {
    const gl = makeGl();
    uploadCanvasPixels({ gl }, { alphaMode: 0, format: 6408 }, { internalFormat: 6408, type: 5121 }, makeWrap(2, 2));
    expect(gl.pixelStorei).toHaveBeenCalledWith(GL_CONST.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  });

  it('同步 glTexture 尺寸，避免后续误走 texSubImage2D', () => {
    const glTexture: any = { internalFormat: 6408, type: 5121, width: 0, height: 0 };
    uploadCanvasPixels({ gl: makeGl() }, { alphaMode: 1, format: 6408 }, glTexture, makeWrap(16, 32));
    expect(glTexture.width).toBe(16);
    expect(glTexture.height).toBe(32);
  });

  it('读不到像素就返回 false，不抛', () => {
    const gl = makeGl();
    const ok = uploadCanvasPixels({ gl }, {}, { internalFormat: 6408, type: 5121 }, { width: 4, height: 4 });
    expect(ok).toBe(false);
    expect(gl.texImage2D).not.toHaveBeenCalled();
  });

  it('像素长度不够就返回 false', () => {
    const wrap = makeWrap(8, 8, new Uint8ClampedArray(4));
    const ok = uploadCanvasPixels({ gl: makeGl() }, {}, { internalFormat: 6408, type: 5121 }, wrap);
    expect(ok).toBe(false);
  });

  it('宿主 texImage2D 抛异常也只返回 false', () => {
    const gl = makeGl();
    gl.texImage2D = vi.fn(() => { throw new TypeError('Type error'); });
    const ok = uploadCanvasPixels({ gl }, { format: 6408 }, { internalFormat: 6408, type: 5121 }, makeWrap(4, 4));
    expect(ok).toBe(false);
  });

  it('没有 gl 时返回 false', () => {
    expect(uploadCanvasPixels({}, {}, {}, makeWrap(4, 4))).toBe(false);
  });
});
