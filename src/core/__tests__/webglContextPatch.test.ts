import { describe, expect, it } from 'vitest';
import {
  capTapDevicePixelRatio,
  capTapFramebuffer,
  minigameRendererOpts,
  resolveHuaweiViewSize,
  tapWebGLContextAttempts,
} from '../webglContextPatch';

describe('minigameRendererOpts', () => {
  it('Tap 关闭抗锯齿和 preserveDrawingBuffer', () => {
    const opts = minigameRendererOpts(true);
    expect(opts.antialias).toBe(false);
    expect(opts.preserveDrawingBuffer).toBe(false);
    expect(opts.preferWebGLVersion).toBe(1);
  });

  it('非 Tap 保持原真机选项', () => {
    const opts = minigameRendererOpts(false);
    expect(opts.antialias).toBe(true);
    expect(opts.preserveDrawingBuffer).toBe(true);
  });
});

describe('capTapDevicePixelRatio', () => {
  it('把过高 DPR 压到 2', () => {
    expect(capTapDevicePixelRatio(3)).toBe(2);
    expect(capTapDevicePixelRatio(2)).toBe(2);
    expect(capTapDevicePixelRatio(1)).toBe(1);
  });
});

describe('tapWebGLContextAttempts', () => {
  it('先用不带 stencil/MSAA 的属性，避免宿主直接拒绝', () => {
    const first = tapWebGLContextAttempts()[0];
    expect(first.antialias).toBe(false);
    expect(first.stencil).toBe(false);
    expect(first.preserveDrawingBuffer).toBe(false);
  });
});

describe('resolveHuaweiViewSize', () => {
  it('有宿主主屏尺寸时跟宿主走，不压到 dpr=2', () => {
    expect(resolveHuaweiViewSize({
      canvasWidth: 1084,
      canvasHeight: 2412,
      screenWidth: 425.1,
      screenHeight: 945.9,
      pixelRatio: 2.55,
    })).toEqual({
      width: 1084,
      height: 2412,
      dpr: 1084 / 425.1,
    });
  });

  it('没有宿主尺寸时用 screen * pixelRatio，不封顶', () => {
    expect(resolveHuaweiViewSize({
      screenWidth: 425,
      screenHeight: 946,
      pixelRatio: 2.55,
    })).toEqual({
      width: Math.round(425 * 2.55),
      height: Math.round(946 * 2.55),
      dpr: 2.55,
    });
  });
});

describe('capTapFramebuffer', () => {
  it('超过上限时等比缩小', () => {
    expect(capTapFramebuffer(1260, 2800, 2560)).toEqual({
      width: Math.floor(1260 * (2560 / 2800)),
      height: 2560,
      scale: 2560 / 2800,
    });
  });

  it('已在上限内原样返回', () => {
    expect(capTapFramebuffer(1080, 1920, 2560)).toEqual({
      width: 1080,
      height: 1920,
      scale: 1,
    });
  });
});
