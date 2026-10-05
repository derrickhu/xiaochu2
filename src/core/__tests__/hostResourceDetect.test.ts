import { describe, expect, it } from 'vitest';
import { autoDetectResource, CanvasResource, ImageResource } from '@pixi/core';
import { installHostResourceDetect, isHostCanvasSource, isHostImageSource } from '@/core/hostResourceDetect';

installHostResourceDetect();

describe('鸿蒙宿主资源识别', () => {
  it('有 getContext 的画布算 canvas', () => {
    const canvas = { width: 4, height: 4, getContext: () => null };
    expect(isHostCanvasSource(canvas)).toBe(true);
    expect(CanvasResource.test(canvas)).toBe(true);
    expect(autoDetectResource(canvas)).toBeInstanceOf(CanvasResource);
  });

  it('带 src 的图片对象算 image', () => {
    const img = { src: 'images/a.png', width: 8, height: 8, complete: true, onload: null };
    expect(isHostImageSource(img)).toBe(true);
    expect(ImageResource.test(img)).toBe(true);
    expect(autoDetectResource(img)).toBeInstanceOf(ImageResource);
  });

  it('普通对象两边都不认', () => {
    expect(isHostCanvasSource({ width: 1 })).toBe(false);
    expect(isHostImageSource({})).toBe(false);
    expect(isHostImageSource({ src: 'a.png' })).toBe(false);
    expect(() => autoDetectResource({ foo: 1 })).toThrow(/Unrecognized source type/);
  });
});
