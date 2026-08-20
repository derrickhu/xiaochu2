import { describe, expect, it } from 'vitest';
import { readMenuButtonRect } from '../menuButtonRect';

describe('readMenuButtonRect', () => {
  it('读微信 getMenuButtonBoundingClientRect', () => {
    const rect = readMenuButtonRect({
      getMenuButtonBoundingClientRect: () => ({
        top: 48, bottom: 80, left: 281, right: 367, width: 86, height: 32,
      }),
    });
    expect(rect).toEqual({
      top: 48, bottom: 80, left: 281, right: 367, width: 86, height: 32,
    });
  });

  it('微信没有时回落到抖音 getMenuButtonLayout', () => {
    const rect = readMenuButtonRect({
      getMenuButtonLayout: () => ({
        top: 52, bottom: 84, left: 270, right: 360, width: 90, height: 32,
      }),
    });
    expect(rect?.left).toBe(270);
    expect(rect?.height).toBe(32);
  });

  it('抖音模拟器首帧全 0 视为未就绪', () => {
    expect(readMenuButtonRect({
      getMenuButtonLayout: () => ({
        top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0,
      }),
    })).toBeNull();
  });
});
