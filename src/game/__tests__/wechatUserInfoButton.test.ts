import { describe, expect, it } from 'vitest';
import { rendererRectToCss } from '@/game/wechatUserInfoButton';

describe('微信授权按钮坐标', () => {
  it('渲染像素除以 dpr 得到 CSS 像素', () => {
    expect(rendererRectToCss({ x: 90, y: 150, width: 180, height: 96 }, 3)).toEqual({
      left: 30,
      top: 50,
      width: 60,
      height: 32,
    });
  });
});
