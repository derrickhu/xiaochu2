/**
 * 通天塔总榜：把云端条目收成领奖台 + 列表。
 * 数据一律来自 rankCloud，没有好友榜，进页就是这个榜。
 */
export interface RankEntry {
  rank: number;
  name: string;
  floor: number;
  isSelf: boolean;
  avatarUrl?: string;
  openid?: string;
}

export const RANK_BOARD = {
  /** 领奖台 1–3 + 名单 4–10 */
  listSlots: 7,
  rowH: 68,
  podiumH: 290,
} as const;

export function parseRankFloor(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** 自己那条可能来自本地兜底，openid 对不上就用头像 / 昵称+层数认人 */
export function sameRankPerson(a: RankEntry, b: RankEntry): boolean {
  const ao = a.openid?.trim();
  const bo = b.openid?.trim();
  if (ao && bo) return ao === bo;
  const av = a.avatarUrl?.trim();
  const bv = b.avatarUrl?.trim();
  if (av && bv) return av === bv;
  const an = a.name.trim();
  const bn = b.name.trim();
  if (!an || !bn || an === '我' || bn === '我') return false;
  return an === bn && a.floor > 0 && a.floor === b.floor;
}

export function dedupeRankEntries(items: RankEntry[], self?: RankEntry | null): RankEntry[] {
  const marked = items.map((item) => (
    self && sameRankPerson(item, self) ? { ...item, isSelf: true } : item
  ));
  if (self && self.floor > 0 && !marked.some((item) => item.isSelf || sameRankPerson(item, self))) {
    marked.push(self);
  }
  const out: RankEntry[] = [];
  for (const item of marked) {
    const idx = out.findIndex((row) => sameRankPerson(row, item));
    if (idx < 0) {
      out.push(item);
      continue;
    }
    const prev = out[idx];
    const ranks = [prev.rank, item.rank].filter((r) => r > 0).sort((a, b) => a - b);
    const pickName = (left: RankEntry, right: RankEntry): string => {
      if (right.isSelf && right.name && right.name !== '我') return right.name;
      if (left.name && left.name !== '我' && left.name !== '玩家') return left.name;
      return right.name || left.name;
    };
    out[idx] = {
      ...prev,
      rank: ranks[0] ?? 0,
      name: pickName(prev, item),
      floor: Math.max(prev.floor, item.floor),
      isSelf: prev.isSelf || item.isSelf,
      avatarUrl: item.avatarUrl || prev.avatarUrl,
      openid: item.openid || prev.openid,
    };
  }
  return out;
}

/** 展示名次只认层数：本地兜底那条没有 rank，直接信 rank 会把 1 层排到 33 层前面。 */
export function densifyRankEntries(items: RankEntry[]): RankEntry[] {
  return items
    .filter((item) => item.floor > 0)
    .sort((a, b) => b.floor - a.floor || (a.rank || 999) - (b.rank || 999))
    .map((item, i) => ({ ...item, rank: i + 1 }));
}

/**
 * 领奖台按画面从左到右：第2、第1、第3。
 * 自己若不在可见名次里，挤进列表最后一格，避免总榜上看不到自己。
 */
export function buildRankPresentation(opts: {
  items: RankEntry[];
  self?: RankEntry | null;
  listSlots?: number;
}): { podium: [RankEntry | null, RankEntry | null, RankEntry | null]; list: Array<RankEntry | null> } {
  const slots = opts.listSlots ?? RANK_BOARD.listSlots;
  const items = densifyRankEntries(dedupeRankEntries(opts.items, opts.self));
  if (items.length === 0 && opts.self) {
    return {
      podium: [null, { ...opts.self, rank: 1 }, null],
      list: Array.from({ length: slots }, () => null),
    };
  }
  const byRank = new Map<number, RankEntry>();
  for (const item of items) {
    if (item.rank > 0) byRank.set(item.rank, item);
  }
  const p1 = byRank.get(1) ?? null;
  const p2 = byRank.get(2) ?? null;
  const p3 = byRank.get(3) ?? null;

  let list = items
    .filter((item) => item.rank > 3)
    .sort((a, b) => a.rank - b.rank);

  const self = items.find((item) => item.isSelf) ?? opts.self ?? null;
  const others = items.filter((item) => !item.isSelf && item.rank > 0);
  if (self && self.floor > 0 && others.length === 0 && !p1) {
    const first = { ...self, rank: 1 };
    return {
      podium: [null, first, null],
      list: Array.from({ length: slots }, () => null),
    };
  }

  const visible = [p1, p2, p3, ...list];
  const selfShown = self
    ? visible.some((item) => item && (item.isSelf || sameRankPerson(item, self)
      || (self.rank > 0 && item.rank === self.rank)))
    : false;
  if (self && !selfShown && (self.rank > 3 || self.rank === 0)) {
    list = [...list.filter((item) => item.rank !== self.rank), self]
      .sort((a, b) => {
        if (a.rank === 0) return 1;
        if (b.rank === 0) return -1;
        return a.rank - b.rank;
      });
  }

  if (list.length > slots) {
    const keep = self && (self.rank > 3 || self.rank === 0)
      ? list.find((item) => item.isSelf || item.rank === self.rank)
      : undefined;
    list = list.slice(0, slots);
    if (keep && !list.some((item) => item.rank === keep.rank && item.isSelf === keep.isSelf)) {
      list = [...list.slice(0, slots - 1), keep];
    }
  }

  const padded: Array<RankEntry | null> = Array.from({ length: slots }, () => null);
  const known = list.filter((item) => item.rank > 0);
  const unknownSelf = list.find((item) => item.isSelf && item.rank === 0) ?? null;
  known.forEach((item, i) => { if (i < slots) padded[i] = item; });
  if (unknownSelf) padded[slots - 1] = unknownSelf;

  return { podium: [p2, p1, p3], list: padded };
}

export function localSelfEntry(bestFloor: number, force = false): RankEntry | null {
  if (bestFloor <= 0 && !force) return null;
  return { rank: 0, name: '我', floor: Math.max(0, bestFloor), isSelf: true };
}

/** 榜上头像：有平台头像用平台的，不用队长灵宠 */
export function rankAvatarPath(entry: RankEntry, fallback: string): string {
  const remote = entry.avatarUrl?.trim();
  return remote || fallback;
}
