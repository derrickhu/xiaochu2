/** 与 canvasTapRouter TAP_SLOP 对齐：小于此位移仍算点按（下阵 / 换队长） */
export const TEAM_STAGE_DRAG_SLOP = 14;
/** 站台座距 130，半径取约 60% 以免同时咬住两座 */
export const TEAM_STAGE_DROP_RADIUS = 78;
/** ticker 超过该间隔没跑，视为被 touchmove 挤掉 */
export const TEAM_STAGE_TICK_STARVE_MS = 32;
/** 补帧最短间隔，避免 touchmove 里无节制整屏 render */
export const TEAM_STAGE_PRESENT_MIN_MS = 16;

/** 仅当 ticker 停滞且距上次补帧够久，才允许同步上屏 */
export function teamStageDragNeedsPresent(
  nowMs: number,
  lastTickWallMs: number,
  lastPresentMs: number,
): boolean {
  if (nowMs - lastTickWallMs < TEAM_STAGE_TICK_STARVE_MS) return false;
  return nowMs - lastPresentMs >= TEAM_STAGE_PRESENT_MIN_MS;
}

export interface TeamStageDropHome {
  visual: number;
  teamIndex: number;
  occupied: boolean;
  x: number;
  y: number;
}

/** 松手落点：离哪只已上阵宠的家最近（空座不接，compact team[] 对不上视觉空位） */
export function pickTeamStageDrop(
  x: number,
  y: number,
  fromVisual: number,
  homes: readonly TeamStageDropHome[],
  radius = TEAM_STAGE_DROP_RADIUS,
): { visual: number; teamIndex: number } | null {
  const maxD = radius * radius;
  let best: { visual: number; teamIndex: number } | null = null;
  let bestD = maxD;
  for (const h of homes) {
    if (h.visual === fromVisual || !h.occupied) continue;
    const dx = x - h.x;
    const dy = y - h.y;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = { visual: h.visual, teamIndex: h.teamIndex };
    }
  }
  return best;
}
