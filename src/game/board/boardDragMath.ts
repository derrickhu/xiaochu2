/**
 * 转珠拖动纯函数：换格滞回 + 限时步进封顶。
 * 从 BoardView 拆出，避免「格缝来回抽」和「卡顿一帧拖珠直接超时」只能靠真机碰。
 */

/** 邻格必须比当前格更近至少这么多（格子边长比例），越过中线还不够 */
export const SWAP_HYSTERESIS_FRAC = 0.16;

/** 拖珠限时单帧最多计入的秒数，避免 ticker 回补把整段卡顿一次性扣完 */
export const DRAG_DT_CAP = 0.05;

/** 起手后这么多毫秒内的 cancel 先观察，不立刻收手（震动/系统误发） */
export const DRAG_CANCEL_GRACE_MS = 100;

export function cappedDragStep(dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.min(dt, DRAG_DT_CAP);
}

export function advanceDragTimer(
  timer: number,
  dt: number,
  limit: number,
): { timer: number; expired: boolean } {
  const next = timer + cappedDragStep(dt);
  return { timer: next, expired: limit > 0 && next >= limit };
}

/** 起手后立刻到来的 cancel：多半是震动/手势误报，应先宽限而不是收手 */
export function shouldDeferDragCancel(ageMs: number, didMove: boolean): boolean {
  return !didMove && ageMs >= 0 && ageMs < DRAG_CANCEL_GRACE_MS;
}

/** 宽限期结束时：cancel 之后又有过 move 才续拖 */
export function shouldKeepDragAfterCancelGrace(lastMoveMs: number, cancelMs: number): boolean {
  return lastMoveMs > cancelMs && cancelMs > 0;
}

export interface SwapTargetOpts {
  rows: number;
  cols: number;
  cell: number;
  isBlocked?: (r: number, c: number) => boolean;
  hysteresisFrac?: number;
}

/**
 * 当前格 + 四正交邻格里选换格目标。
 * 邻格必须比当前格明显更近（滞回），避免指尖在格缝时珠子来回抽。
 */
export function pickOrthoSwapTarget(
  px: number,
  py: number,
  dragR: number,
  dragC: number,
  opts: SwapTargetOpts,
): { r: number; c: number } | null {
  const { rows, cols, cell } = opts;
  const hyst = (opts.hysteresisFrac ?? SWAP_HYSTERESIS_FRAC) * cell;
  const centerX = (c: number) => c * cell + cell / 2;
  const centerY = (r: number) => r * cell + cell / 2;
  const inBounds = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols;
  const dist = (r: number, c: number) => Math.hypot(px - centerX(c), py - centerY(r));

  let bestR = dragR;
  let bestC = dragC;
  let bestD = dist(dragR, dragC);
  const neigh = [
    [dragR - 1, dragC],
    [dragR + 1, dragC],
    [dragR, dragC - 1],
    [dragR, dragC + 1],
  ];
  for (const [nr, nc] of neigh) {
    if (!inBounds(nr, nc)) continue;
    if (opts.isBlocked?.(nr, nc)) continue;
    const d = dist(nr, nc);
    if (d + hyst < bestD) {
      bestD = d;
      bestR = nr;
      bestC = nc;
    }
  }

  if (Math.abs(bestR - dragR) + Math.abs(bestC - dragC) !== 1) return null;
  return { r: bestR, c: bestC };
}
