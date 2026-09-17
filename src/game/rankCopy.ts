/**
 * 通天塔榜文案：按「已上榜 / 塔已开 / 塔未开」换一句提示 + 主按钮。
 * 塔没解锁时不把人送进通天塔，指向通关第一章。
 */
import type { RankEntry } from './rankBoard';

export type RankCtaKind = 'share' | 'tower' | 'story';

export function rankSelfSubtitle(floor: number, rank: number, towerOpen: boolean): string {
  if (floor > 0) {
    return rank > 0 ? `历史最高层 · 我第${rank}名` : '历史最高层';
  }
  if (towerOpen) return '还没上榜 · 爬1层就能看见自己';
  return '通关第一章后就能上榜';
}

export function rankFloorLabel(
  entry: Pick<RankEntry, 'floor' | 'isSelf'>,
  towerOpen: boolean,
): string {
  if (entry.floor > 0) return `${entry.floor}层`;
  if (!entry.isSelf) return '还没爬塔';
  return towerOpen ? '爬1层上榜' : '通关第一章';
}

export function rankPrimaryCta(
  floor: number,
  towerOpen: boolean,
): { title: string; kind: RankCtaKind } {
  if (floor > 0) return { title: '炫耀一下', kind: 'share' };
  if (towerOpen) return { title: '去通天塔', kind: 'tower' };
  return { title: '继续主线', kind: 'story' };
}
