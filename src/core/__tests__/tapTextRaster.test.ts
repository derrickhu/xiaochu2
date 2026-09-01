import { describe, expect, it, vi } from 'vitest';
import { installTapTextRaster } from '@/core/tapTextRaster';

/**
 * 假的真实 canvas：模拟规范行为——给 width/height 赋值会清空内容并复位变换。
 * 记录 transform 便于断言 scale 是否被叠加。
 */
function makeHost() {
  const calls: string[] = [];
  const state = { scaleX: 1, scaleY: 1, cleared: 0 };
  const ctx: any = {
    setTransform: vi.fn((a: number, _b: number, _c: number, d: number) => {
      state.scaleX = a;
      state.scaleY = d;
      calls.push('setTransform');
    }),
    scale: vi.fn((x: number, y: number) => {
      state.scaleX *= x;
      state.scaleY *= y;
      calls.push('scale');
    }),
    clearRect: vi.fn(() => { state.cleared += 1; calls.push('clearRect'); }),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 42 })),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    translate: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4).fill(7),
      width: w,
      height: h,
    })),
  };
  const canvas = {
    _w: 1,
    _h: 1,
    get width() { return this._w; },
    set width(v: number) {
      this._w = v;
      // 规范行为：改尺寸复位变换并清空
      state.scaleX = 1;
      state.scaleY = 1;
    },
    get height() { return this._h; },
    set height(v: number) { this._h = v; },
  };
  ctx.canvas = canvas;
  return { host: { canvas, ctx }, state, calls };
}

describe('tapTextRaster 假 canvas', () => {
  it('尺寸相同的连续 Text 不会叠加 scale', () => {
    const { host, state } = makeHost();
    const createWrap = installTapTextRaster(() => host as any);

    // 第一个 Text：设成 100x40 后 scale(1.5)
    const a = createWrap();
    a.width = 100;
    a.height = 40;
    a.getContext('2d').scale(1.5, 1.5);
    expect(state.scaleX).toBeCloseTo(1.5);

    // 第二个 Text 尺寸恰好相同——host canvas 不会被重设，
    // 若不手动复位，scale 就会叠成 2.25
    const b = createWrap();
    b.width = 100;
    b.height = 40;
    b.getContext('2d').scale(1.5, 1.5);
    expect(state.scaleX).toBeCloseTo(1.5);
    expect(state.scaleY).toBeCloseTo(1.5);
  });

  it('同一个 Text 内多次绘制只复位一次，不打断已设的 scale', () => {
    const { host, state } = makeHost();
    const createWrap = installTapTextRaster(() => host as any);

    const wrap = createWrap();
    wrap.width = 60;
    wrap.height = 20;
    const ctx = wrap.getContext('2d');
    ctx.scale(2, 2);
    ctx.fillText('甲', 0, 0);
    ctx.fillText('乙', 0, 0);

    expect(state.scaleX).toBeCloseTo(2);
  });

  it('改尺寸会丢弃旧快照', () => {
    const { host } = makeHost();
    const createWrap = installTapTextRaster(() => host as any);

    const wrap = createWrap();
    wrap.width = 4;
    wrap.height = 4;
    // 真实流程里 updateText 先绘制（顺带把 host 尺寸对齐）再 updateTexture 抓快照
    wrap.getContext('2d').fillText('x', 0, 0);
    wrap.__tapSnap();
    expect(wrap.getContext('2d').getImageData(0, 0, 4, 4).data[0]).toBe(7);

    wrap.width = 8;
    // 快照失效，且 host 尺寸与请求不符时返回透明而非别人的像素
    const data = wrap.getContext('2d').getImageData(0, 0, 8, 4).data;
    expect(data[0]).toBe(0);
  });

  it('host 尺寸被别的 Text 改过时放弃抓快照，不覆盖成错像素', () => {
    const { host } = makeHost();
    const createWrap = installTapTextRaster(() => host as any);

    const wrap = createWrap();
    wrap.width = 10;
    wrap.height = 10;
    wrap.getContext('2d').fillText('x', 0, 0);
    wrap.__tapSnap();

    // 模拟另一个 Text 抢走 host
    host.canvas.width = 99;
    host.canvas.height = 99;
    wrap.__tapSnap();

    // 仍是先前抓到的 10x10 快照
    const data = wrap.getContext('2d').getImageData(0, 0, 10, 10).data;
    expect(data.length).toBe(10 * 10 * 4);
    expect(data[0]).toBe(7);
  });

  it('拿不到 host 时降级为透明像素，不抛', () => {
    const createWrap = installTapTextRaster(() => null);
    const wrap = createWrap();
    wrap.width = 3;
    wrap.height = 3;
    expect(() => wrap.getContext('2d').fillText('无', 0, 0)).not.toThrow();
    expect(wrap.getContext('2d').getImageData(0, 0, 3, 3).data[0]).toBe(0);
  });

  it('measureText 拿不到 host 时给出兜底宽度', () => {
    const createWrap = installTapTextRaster(() => null);
    const wrap = createWrap();
    expect(wrap.getContext('2d').measureText('abc').width).toBeGreaterThan(0);
  });

  it('假 canvas 带 __tapTextWrap 标记，供上传通道识别', () => {
    const { host } = makeHost();
    const createWrap = installTapTextRaster(() => host as any);
    expect(createWrap().__tapTextWrap).toBe(true);
  });
});
