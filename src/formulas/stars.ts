/**
 * 关卡星级：仅按回合数判定（通关 1★，二星/三星为两档回合上限）。
 *
 * - 二星上限：stage.starTurnLimit（与选关/结算展示一致）
 * - 三星上限：二星上限的一半（向上取整，至少 1 回合）
 */
export function starTurnThresholds(starTurnLimit: number): { star2: number; star3: number } {
  const star2 = starTurnLimit;
  const star3 = Math.max(1, Math.ceil(starTurnLimit / 2));
  return { star2, star3 };
}

/** 通关后按已用回合数计算 1~3 星 */
export function starsFromTurns(turnsUsed: number, starTurnLimit: number): number {
  const { star2, star3 } = starTurnThresholds(starTurnLimit);
  if (turnsUsed <= star3) return 3;
  if (turnsUsed <= star2) return 2;
  return 1;
}

/** 结算面板用：「三星 ≤7 · 二星 ≤14」 */
export function formatStarTurnHint(starTurnLimit: number): string {
  const { star2, star3 } = starTurnThresholds(starTurnLimit);
  return `三星 ≤${star3} · 二星 ≤${star2}`;
}
