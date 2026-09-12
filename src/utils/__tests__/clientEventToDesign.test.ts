import { describe, expect, it, vi } from 'vitest';

vi.mock('@/core/Game', () => ({
  Game: { designWidth: 750, screenWidth: 375 },
}));

import { clientEventToDesign } from '../clientEventToDesign';

describe('clientEventToDesign', () => {
  it('吃 touches.clientX', () => {
    expect(clientEventToDesign({
      touches: [{ clientX: 187.5, clientY: 100 }],
    })).toEqual({ x: 375, y: 200 });
  });

  it('没有 clientX 时用 pageX（部分华为 DOM 事件）', () => {
    expect(clientEventToDesign({
      pageX: 75,
      pageY: 50,
    })).toEqual({ x: 150, y: 100 });
  });

  it('优先 changedTouches', () => {
    expect(clientEventToDesign({
      changedTouches: [{ clientX: 10, clientY: 20 }],
      touches: [{ clientX: 99, clientY: 99 }],
    })).toEqual({ x: 20, y: 40 });
  });
});
