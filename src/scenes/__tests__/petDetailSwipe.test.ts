import { describe, expect, it } from 'vitest';
import { isPetDetailSwipeStartBlocked } from '../petDetailSwipe';

const band = { headerBottom: 100, dockTop: 1400 };

describe('isPetDetailSwipeStartBlocked', () => {
  it('顶栏区域不进横滑', () => {
    expect(isPetDetailSwipeStartBlocked({ y: 80, ...band, hitsTapTarget: false })).toBe(true);
  });

  it('底栏升级区不进横滑', () => {
    expect(isPetDetailSwipeStartBlocked({ y: 1450, ...band, hitsTapTarget: false })).toBe(true);
  });

  it('中部空白可以横滑', () => {
    expect(isPetDetailSwipeStartBlocked({ y: 600, ...band, hitsTapTarget: false })).toBe(false);
  });

  it('点在按钮上不进横滑', () => {
    expect(isPetDetailSwipeStartBlocked({ y: 600, ...band, hitsTapTarget: true })).toBe(true);
  });

  it('底栏上沿刚好也算底栏', () => {
    expect(isPetDetailSwipeStartBlocked({ y: 1400, ...band, hitsTapTarget: false })).toBe(true);
  });
});
