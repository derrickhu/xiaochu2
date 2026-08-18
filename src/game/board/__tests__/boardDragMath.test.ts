import { describe, expect, it } from 'vitest';
import {
  advanceDragTimer,
  DRAG_CANCEL_GRACE_MS,
  DRAG_DT_CAP,
  pickOrthoSwapTarget,
  shouldDeferDragCancel,
  shouldKeepDragAfterCancelGrace,
  SWAP_HYSTERESIS_FRAC,
} from '../boardDragMath';

const CELL = 116;
const opts = { rows: 5, cols: 6, cell: CELL };

function at(r: number, c: number, dx = 0, dy = 0): { x: number; y: number } {
  return { x: c * CELL + CELL / 2 + dx, y: r * CELL + CELL / 2 + dy };
}

describe('advanceDragTimer', () => {
  it('正常帧按 dt 累加，未到限时不超时', () => {
    const a = advanceDragTimer(0, 1 / 60, 12);
    expect(a.timer).toBeCloseTo(1 / 60, 6);
    expect(a.expired).toBe(false);
  });

  it('卡顿回补的超大 dt 只计入一帧上限，不会刚拨就超时', () => {
    const a = advanceDragTimer(0, 8, 5);
    expect(a.timer).toBe(DRAG_DT_CAP);
    expect(a.expired).toBe(false);
  });
});

describe('shouldDeferDragCancel', () => {
  it('起手未换格且在宽限内的 cancel 先观察', () => {
    expect(shouldDeferDragCancel(0, false)).toBe(true);
    expect(shouldDeferDragCancel(DRAG_CANCEL_GRACE_MS - 1, false)).toBe(true);
  });

  it('已经换过格，或过了宽限，按真松手处理', () => {
    expect(shouldDeferDragCancel(16, true)).toBe(false);
    expect(shouldDeferDragCancel(DRAG_CANCEL_GRACE_MS, false)).toBe(false);
  });
});

describe('shouldKeepDragAfterCancelGrace', () => {
  it('cancel 之后又收到 move 则续拖', () => {
    expect(shouldKeepDragAfterCancelGrace(1200, 1100)).toBe(true);
  });

  it('只有起手时的时间戳、cancel 后没 move，则收手', () => {
    expect(shouldKeepDragAfterCancelGrace(1000, 1000)).toBe(false);
    expect(shouldKeepDragAfterCancelGrace(1000, 1080)).toBe(false);
  });
});

describe('pickOrthoSwapTarget', () => {
  it('停在当前格中心不换格', () => {
    const p = at(2, 2);
    expect(pickOrthoSwapTarget(p.x, p.y, 2, 2, opts)).toBeNull();
  });

  it('刚过中线还不够，避免格缝来回抽', () => {
    const pastMid = CELL * 0.5 + 2;
    const p = at(2, 2, pastMid, 0);
    expect(pickOrthoSwapTarget(p.x, p.y, 2, 2, opts)).toBeNull();
  });

  it('明显偏向邻格才换过去', () => {
    const far = CELL * (0.5 + SWAP_HYSTERESIS_FRAC + 0.05);
    const p = at(2, 2, far, 0);
    expect(pickOrthoSwapTarget(p.x, p.y, 2, 2, opts)).toEqual({ r: 2, c: 3 });
  });

  it('封印邻格不会被选中', () => {
    const far = CELL * 0.8;
    const p = at(2, 2, far, 0);
    expect(pickOrthoSwapTarget(p.x, p.y, 2, 2, {
      ...opts,
      isBlocked: (r, c) => r === 2 && c === 3,
    })).toBeNull();
  });
});
