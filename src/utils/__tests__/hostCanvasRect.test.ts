import { describe, expect, it } from 'vitest';
import { clientToDesignByRect, sanitizeHostRect } from '../hostCanvasRect';

describe('sanitizeHostRect', () => {
  it('宽高为 0 的 rect 不可用（宿主还没布局完）', () => {
    expect(sanitizeHostRect({ left: 0, top: 0, width: 0, height: 100 })).toBeNull();
    expect(sanitizeHostRect(null)).toBeNull();
  });

  it('缺 left/top 当 0', () => {
    expect(sanitizeHostRect({ width: 452, height: 1012 }))
      .toEqual({ left: 0, top: 0, width: 452, height: 1012 });
  });
});

describe('clientToDesignByRect', () => {
  const rect = { left: 0, top: 0, width: 452, height: 1012 };

  it('画布右下角映射到设计右下角', () => {
    const p = clientToDesignByRect(452, 1012, rect, 750);
    expect(Math.round(p.x)).toBe(750);
    // 750/452 与 1012 同比 → 设计高度，不是写死的 1334
    expect(Math.round(p.y)).toBe(Math.round(1012 * (750 / 452)));
  });

  it('x/y 同一缩放，长宽比不被拉歪', () => {
    const p = clientToDesignByRect(226, 226, rect, 750);
    expect(Math.round(p.x)).toBe(Math.round(p.y));
  });

  it('扣掉画布在页面里的偏移', () => {
    const p = clientToDesignByRect(120, 60, { left: 20, top: 10, width: 400, height: 800 }, 750);
    expect(p.x).toBeCloseTo(100 * (750 / 400));
    expect(p.y).toBeCloseTo(50 * (750 / 400));
  });
});
