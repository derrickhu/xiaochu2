import { describe, expect, it } from 'vitest';
import { rankFloorLabel, rankPrimaryCta, rankSelfSubtitle } from '@/game/rankCopy';

describe('排行榜未上榜文案', () => {
  it('塔没开时不提爬塔，指向通关第一章', () => {
    expect(rankSelfSubtitle(0, 0, false)).toBe('通关第一章后就能上榜');
    expect(rankFloorLabel({ floor: 0, isSelf: true }, false)).toBe('通关第一章');
    expect(rankPrimaryCta(0, false)).toEqual({ title: '继续主线', kind: 'story' });
  });

  it('塔开了但还没爬，才指路去通天塔', () => {
    expect(rankSelfSubtitle(0, 0, true)).toBe('还没上榜 · 爬1层就能看见自己');
    expect(rankSelfSubtitle(0, 10, true)).toBe('还没上榜 · 爬1层就能看见自己');
    expect(rankFloorLabel({ floor: 0, isSelf: true }, true)).toBe('爬1层上榜');
    expect(rankPrimaryCta(0, true)).toEqual({ title: '去通天塔', kind: 'tower' });
  });

  it('上榜后显示历史最高层和名次，按钮改炫耀', () => {
    expect(rankSelfSubtitle(7, 4, true)).toBe('历史最高层 · 我第4名');
    expect(rankSelfSubtitle(3, 0, true)).toBe('历史最高层');
    expect(rankFloorLabel({ floor: 12, isSelf: true }, true)).toBe('12层');
    expect(rankPrimaryCta(1, false)).toEqual({ title: '炫耀一下', kind: 'share' });
    expect(rankPrimaryCta(1, true)).toEqual({ title: '炫耀一下', kind: 'share' });
  });

  it('别人没层数仍是还没爬塔', () => {
    expect(rankFloorLabel({ floor: 0, isSelf: false }, false)).toBe('还没爬塔');
    expect(rankFloorLabel({ floor: 0, isSelf: false }, true)).toBe('还没爬塔');
  });
});
