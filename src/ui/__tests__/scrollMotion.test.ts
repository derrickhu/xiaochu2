import { describe, expect, it } from 'vitest';
import {
  flingVelocity,
  shouldFling,
  stepInertia,
  visibleRowRange,
} from '../scrollMotion';

describe('visibleRowRange', () => {
  const base = {
    viewportTop: 280,
    viewportH: 1000,
    cardGap: 16,
    rowH: 316,
    rowCount: 40,
    buffer: 1,
  };

  it('未滚动时从第 0 行开始', () => {
    const r = visibleRowRange({ ...base, contentY: 280 });
    expect(r.first).toBe(0);
    expect(r.last).toBeGreaterThanOrEqual(3);
    expect(r.last).toBeLessThan(8);
  });

  it('上滑后窗口下移，不会把整个表都算进来', () => {
    const r = visibleRowRange({ ...base, contentY: 280 - 1200 });
    expect(r.first).toBeGreaterThan(1);
    expect(r.last - r.first).toBeLessThan(10);
  });

  it('空列表', () => {
    expect(visibleRowRange({ ...base, contentY: 280, rowCount: 0 })).toEqual({ first: 0, last: -1 });
  });
});

describe('fling', () => {
  it('慢拖不滑行', () => {
    const v = flingVelocity([
      { y: 200, t: 0 },
      { y: 196, t: 80 },
    ]);
    expect(shouldFling(v)).toBe(false);
  });

  it('快速上滑速度为负且封顶', () => {
    const v = flingVelocity([
      { y: 400, t: 0 },
      { y: 40, t: 40 },
    ]);
    expect(v).toBeLessThan(0);
    expect(v).toBeGreaterThanOrEqual(-2.4);
    expect(shouldFling(v)).toBe(true);
  });

  it('撞到边界就停', () => {
    const stepped = stepInertia(-10, -1, 16, 0, 280);
    expect(stepped.y).toBe(0);
    expect(stepped.stop).toBe(true);
    expect(stepped.v).toBe(0);
  });

  it('滑行速度会衰减', () => {
    const stepped = stepInertia(100, -1, 16, -800, 280);
    expect(stepped.y).toBeLessThan(100);
    expect(Math.abs(stepped.v)).toBeLessThan(1);
    expect(stepped.stop).toBe(false);
  });
});
