import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  Platform: { isMinigame: true, isDevtools: false, isHuawei: false },
  registered: [] as string[],
  removed: [] as string[],
}));

vi.mock('@/core/PlatformService', () => ({ Platform: hoisted.Platform }));

vi.mock('@/utils/touchCanvas', () => ({
  getTouchCanvas: () => ({
    addEventListener: (type: string) => { hoisted.registered.push(type); },
    removeEventListener: (type: string) => { hoisted.removed.push(type); },
  }),
}));

import { bindCanvasPointerMove } from '../canvasInteraction';

describe('bindCanvasPointerMove 事件通路', () => {
  beforeEach(() => {
    hoisted.registered.length = 0;
    hoisted.removed.length = 0;
  });

  it('微信/抖音/Tap 保持 touchstart + pointer 链', () => {
    hoisted.Platform.isHuawei = false;
    const handle = bindCanvasPointerMove({ onMove: () => {}, onUp: () => {}, onDown: () => {} });
    expect(hoisted.registered).toEqual(['touchstart', 'pointermove', 'pointerup', 'pointercancel']);
    handle.destroy();
    expect(hoisted.removed).toEqual(['touchstart', 'pointermove', 'pointerup', 'pointercancel']);
  });

  it('华为宿主只派发 touch 系事件，move/up 必须走 touch', () => {
    hoisted.Platform.isHuawei = true;
    const handle = bindCanvasPointerMove({ onMove: () => {}, onUp: () => {}, onDown: () => {} });
    expect(hoisted.registered).toEqual(['touchstart', 'touchmove', 'touchend', 'touchcancel']);
    expect(hoisted.registered).not.toContain('pointermove');
    handle.destroy();
    expect(hoisted.removed).toEqual(['touchstart', 'touchmove', 'touchend', 'touchcancel']);
  });
});
