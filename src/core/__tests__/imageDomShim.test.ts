import { describe, expect, it, vi } from 'vitest';
import {
  isImageShimApplied,
  isImageUploadable,
  markImageLoaded,
  shimImageDomContract,
} from '@/core/imageDomShim';

/** Tap Android 那种裸 Image：只有 src/width/height/onload，没有 complete/naturalWidth */
function makeBareHostImage(): any {
  return {
    src: '',
    width: 0,
    height: 0,
    onload: null,
    onerror: null,
  };
}

/** 微信/抖音那种已按标准实现的 Image */
function makeStandardImage(): any {
  return {
    src: '',
    width: 64,
    height: 64,
    complete: true,
    naturalWidth: 64,
    naturalHeight: 64,
    onload: null,
    onerror: null,
  };
}

describe('shimImageDomContract', () => {
  it('裸宿主 Image 补出 complete / naturalWidth，加载前为假', () => {
    const img = shimImageDomContract(makeBareHostImage());
    expect(isImageShimApplied(img)).toBe(true);
    expect(img.complete).toBe(false);
    expect(img.naturalWidth).toBe(0);
    expect(isImageUploadable(img)).toBe(false);
  });

  it('markImageLoaded 后满足 Pixi 上传条件', () => {
    const img = shimImageDomContract(makeBareHostImage());
    img.width = 128;
    img.height = 256;

    markImageLoaded(img);

    expect(img.complete).toBe(true);
    expect(img.naturalWidth).toBe(128);
    expect(img.naturalHeight).toBe(256);
    expect(isImageUploadable(img)).toBe(true);
  });

  it('绝不接管 onload/onerror：宿主可能在赋值时就登记进原生侧，覆盖 setter 会永久收不到回调', () => {
    const img = shimImageDomContract(makeBareHostImage());
    const onload = vi.fn();
    const onerror = vi.fn();
    img.onload = onload;
    img.onerror = onerror;

    // 读回来必须是业务自己那个函数，中间没有包装层
    expect(img.onload).toBe(onload);
    expect(img.onerror).toBe(onerror);
    expect(Object.getOwnPropertyDescriptor(img, 'onload')?.get).toBeUndefined();
  });

  it('markImageLoaded 对未 shim 的宿主对象是空操作', () => {
    const std = makeStandardImage();
    expect(() => markImageLoaded(std)).not.toThrow();
    expect(() => markImageLoaded(null)).not.toThrow();
  });

  it('宿主已按标准实现时原样返回，不接管', () => {
    const img = shimImageDomContract(makeStandardImage());
    expect(isImageShimApplied(img)).toBe(false);
    expect(img.complete).toBe(true);
    expect(isImageUploadable(img)).toBe(true);
  });

  it('重复 shim 不叠加包装', () => {
    const once = shimImageDomContract(makeBareHostImage());
    const twice = shimImageDomContract(once);
    expect(twice).toBe(once);
    twice.width = 8;
    twice.height = 8;
    markImageLoaded(twice);
    expect(twice.complete).toBe(true);
  });

  it('返回同一个对象，避免破坏 instanceof HTMLImageElement 分支', () => {
    const raw = makeBareHostImage();
    expect(shimImageDomContract(raw)).toBe(raw);
  });

  it('不可扩展的宿主对象不抛错，只是 shim 不生效', () => {
    const frozen = Object.freeze(makeBareHostImage());
    const out = shimImageDomContract(frozen);
    expect(out).toBe(frozen);
    expect(isImageShimApplied(out)).toBe(false);
  });
});
