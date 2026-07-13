/**
 * 通用解锁条件框架（progression 层唯一事实源）
 *
 * 所有养成系统（技能/被动/未来的觉醒、装备、限突等）共用同一套
 * 「条件定义 → 判定 → 提示文案」管线：
 * - 新系统只需扩展 UnlockRequirement 的 kind 与 PetProgress 的字段
 * - UI 与战斗不各自散落判断逻辑
 */

/** 解锁条件（可扩展 discriminated union；预留 chapter/awaken/equip 等） */
export type UnlockRequirement =
  | { kind: 'level'; level: number }
  | { kind: 'star'; star: number };

/** 宠物养成进度快照（未来觉醒/装备加可选字段即可） */
export interface PetProgress {
  level: number;
  star: number;
}

/** 预览/图鉴等无真实进度的场景：视作全解锁 */
export function maxedPetProgress(): PetProgress {
  return { level: Number.MAX_SAFE_INTEGER, star: Number.MAX_SAFE_INTEGER };
}

export function isRequirementMet(req: UnlockRequirement, p: PetProgress): boolean {
  switch (req.kind) {
    case 'level':
      return p.level >= req.level;
    case 'star':
      return p.star >= req.star;
    default:
      return false;
  }
}

export function areRequirementsMet(reqs: readonly UnlockRequirement[], p: PetProgress): boolean {
  return reqs.every((r) => isRequirementMet(r, p));
}

/** 解锁提示文案：「Lv.25解锁」/「★3解锁」（UI 唯一来源） */
export function requirementHint(req: UnlockRequirement): string {
  switch (req.kind) {
    case 'level':
      return `Lv.${req.level}解锁`;
    case 'star':
      return `★${req.star}解锁`;
    default:
      return '未解锁';
  }
}

/** 未满足条件中最近的一条（用于「差一点就解锁」高亮） */
export function nearestPendingRequirement(
  reqs: readonly UnlockRequirement[],
  p: PetProgress,
): UnlockRequirement | null {
  let best: UnlockRequirement | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const req of reqs) {
    if (isRequirementMet(req, p)) continue;
    const gap = req.kind === 'level' ? req.level - p.level : (req.star - p.star) * 20;
    if (gap < bestGap) {
      bestGap = gap;
      best = req;
    }
  }
  return best;
}
