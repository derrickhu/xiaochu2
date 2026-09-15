/**
 * 编队槽位对调（纯函数）。
 * 只互换两个已上阵下标，不压缩、不补空 —— 站台视觉下标才不会被整体平移洗牌。
 */
export function swapTeamEntries(
  team: readonly string[],
  a: number,
  b: number,
): string[] | null {
  if (a === b) return null;
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
  if (a < 0 || b < 0 || a >= team.length || b >= team.length) return null;
  const left = team[a];
  const right = team[b];
  if (!left || !right) return null;
  const next = team.slice();
  next[a] = right;
  next[b] = left;
  return next;
}
