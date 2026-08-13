/**
 * 三星线占二星线的比例。
 *
 * 数值没变（仍是 1/2），变的是被它折算的基数。
 *
 * 旧的 starTurnLimit 是一批手填常量，普遍两三倍于实际通关回合，于是 128 关**全部满三星**，
 * 星级评价完全不携带信息——玩家无论打得好坏都看到三颗星，「随便打」的手感有一半来自这里。
 * 现在 starTurnLimit 改为关卡 TTK 目标带的上限（见 powerBudget.starTurnLimitFor），
 * 同一个比例折出来的三星线就落在了有意义的位置：实测高手拿三星约六成、中手约一成。
 */
const STAR3_RATIO = 0.5;

/**
 * 关卡星级：仅按回合数判定（通关 1★，二星/三星为两档回合上限）。
 *
 * - 二星上限：stage.starTurnLimit（= TTK 目标带上限，与选关/结算展示一致）
 * - 三星上限：二星上限 × STAR3_RATIO（向上取整，至少 1 回合）
 */
export function starTurnThresholds(starTurnLimit: number): { star2: number; star3: number } {
  const star2 = starTurnLimit;
  const star3 = Math.max(1, Math.ceil(starTurnLimit * STAR3_RATIO));
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

/** 战斗 HUD 三星线节奏：绿 / 琥珀 / 锈红 */
export type StarTurnPace = 'onTrack' | 'twoStar' | 'oneStar';

/** 当前回合相对三星/二星线的档位（分母永远是三星上限） */
export function starTurnPace(currentTurn: number, starTurnLimit: number): StarTurnPace {
  const { star2, star3 } = starTurnThresholds(starTurnLimit);
  if (currentTurn <= star3) return 'onTrack';
  if (currentTurn <= star2) return 'twoStar';
  return 'oneStar';
}

/** 战斗胶囊右侧数字：「2/7」= 当前回合 / 三星上限 */
export function formatBattleStarTurnValue(currentTurn: number, starTurnLimit: number): string {
  const { star3 } = starTurnThresholds(starTurnLimit);
  return `${currentTurn}/${star3}`;
}
