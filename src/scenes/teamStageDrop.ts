/** 与 canvasTapRouter TAP_SLOP 对齐：小于此位移仍算点按（下阵 / 换队长） */
export const TEAM_STAGE_DRAG_SLOP = 14;
/** 站台座距 130，半径取约 60% 以免同时咬住两座 */
export const TEAM_STAGE_DROP_RADIUS = 78;

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
