/**
 * 列表滚动：视口行窗 + 松手惯性。
 * 旧版图鉴只画落在裁切区内的格子；这里用同样的行窗决定哪些卡要建成完整节点。
 */

export interface RowWindow {
  contentY: number;
  viewportTop: number;
  viewportH: number;
  /** 第一张卡的 content 本地 y */
  cardGap: number;
  rowH: number;
  rowCount: number;
  /** 视口外再多留几行，避免刚滑进来才开始建卡 */
  buffer: number;
}

/** 比这慢的松手不滑行（设计像素 / 毫秒） */
export const FLING_MIN_SPEED = 0.35;
/** 滑行速度上限，避免一帧甩出屏外 */
export const FLING_MAX_SPEED = 2.4;
/** 速度衰减时间常数（毫秒） */
export const INERTIA_TAU_MS = 280;
export const INERTIA_STOP_SPEED = 0.02;

export function visibleRowRange(opts: RowWindow): { first: number; last: number } {
  if (opts.rowCount <= 0 || opts.rowH <= 0) return { first: 0, last: -1 };
  const localTop = opts.viewportTop - opts.contentY;
  const localBot = localTop + opts.viewportH;
  let first = Math.floor((localTop - opts.cardGap) / opts.rowH) - opts.buffer;
  let last = Math.floor((localBot - opts.cardGap) / opts.rowH) + opts.buffer;
  if (first < 0) first = 0;
  if (last >= opts.rowCount) last = opts.rowCount - 1;
  if (last < first) return { first: 0, last: -1 };
  return { first, last };
}

/** 用最近一段位移估 content.y 的速度（像素/毫秒）。样本不足返回 0。 */
export function flingVelocity(samples: readonly { y: number; t: number }[]): number {
  if (samples.length < 2) return 0;
  const b = samples[samples.length - 1];
  let a = samples[0];
  for (let i = samples.length - 2; i >= 0; i--) {
    if (b.t - samples[i].t >= 70) {
      a = samples[i];
      break;
    }
  }
  const dt = b.t - a.t;
  if (dt < 12) return 0;
  const v = (b.y - a.y) / dt;
  if (v > FLING_MAX_SPEED) return FLING_MAX_SPEED;
  if (v < -FLING_MAX_SPEED) return -FLING_MAX_SPEED;
  return v;
}

export function shouldFling(v: number): boolean {
  return Math.abs(v) >= FLING_MIN_SPEED;
}

export function stepInertia(
  y: number,
  v: number,
  dtMs: number,
  min: number,
  max: number,
): { y: number; v: number; stop: boolean } {
  const dt = dtMs > 48 ? 48 : dtMs < 0 ? 0 : dtMs;
  let next = y + v * dt;
  let nv = v * Math.exp(-dt / INERTIA_TAU_MS);
  let stop = false;
  if (next < min) {
    next = min;
    nv = 0;
    stop = true;
  } else if (next > max) {
    next = max;
    nv = 0;
    stop = true;
  }
  if (Math.abs(nv) < INERTIA_STOP_SPEED) {
    nv = 0;
    stop = true;
  }
  return { y: next, v: nv, stop };
}
