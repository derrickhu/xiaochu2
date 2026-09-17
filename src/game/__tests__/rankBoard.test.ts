import { describe, expect, it } from 'vitest';
import {
  buildRankPresentation,
  localSelfEntry,
  parseRankFloor,
} from '@/game/rankBoard';
import { layoutRankBoard } from '@/game/rankPageLayout';

describe('通天塔总榜条目', () => {
  it('只收正层数', () => {
    expect(parseRankFloor('36')).toBe(36);
    expect(parseRankFloor(0)).toBe(0);
    expect(parseRankFloor('x')).toBe(0);
  });

  it('层数高的排前面，不信接口下标或假名次', () => {
    const items = [
      { rank: 1, name: '艳', floor: 1, isSelf: false },
      { rank: 4, name: 'Dktukeke', floor: 33, isSelf: true },
    ];
    const view = buildRankPresentation({ items, self: items[1] });
    expect(view.podium[1]).toMatchObject({ name: 'Dktukeke', rank: 1, floor: 33 });
    expect(view.podium[0]).toMatchObject({ name: '艳', rank: 2, floor: 1 });
    expect(view.list.filter(Boolean)).toEqual([]);
  });

  it('领奖台从左到右是 2、1、3；自己不在前排就进列表末格', () => {
    const items = [1, 2, 3, 4, 5, 6, 8].map((rank) => ({
      rank, name: `n${rank}`, floor: 40 - rank, isSelf: false,
    }));
    const self = { rank: 12, name: '我', floor: 36, isSelf: true };
    const view = buildRankPresentation({ items, self, listSlots: 4 });
    expect(view.podium.map((p) => p?.name)).toEqual(['n2', 'n1', 'n3']);
    expect(view.list.map((p) => p?.name)).toEqual(['n4', '我', 'n5', 'n6']);
    expect(view.list.some((p) => p?.isSelf)).toBe(true);
  });

  it('没爬过不上本地自己这一行；只有自己且已破层则上台第 1', () => {
    expect(localSelfEntry(0)).toBeNull();
    const placeholder = localSelfEntry(0, true);
    expect(buildRankPresentation({ items: [], self: placeholder }).podium[1]).toMatchObject({
      isSelf: true, floor: 0, rank: 1,
    });
    const self = localSelfEntry(1);
    expect(self?.floor).toBe(1);
    const view = buildRankPresentation({ items: self ? [self] : [], self, listSlots: 4 });
    expect(view.podium[1]).toMatchObject({ isSelf: true, floor: 1, rank: 1 });
    expect(view.list.filter(Boolean)).toEqual([]);
  });

  it('有别人在榜、自己不知名次时进列表末格', () => {
    const items = [1, 2, 3, 4].map((rank) => ({
      rank, name: `n${rank}`, floor: 40 - rank, isSelf: false,
    }));
    const self = { rank: 0, name: '我', floor: 1, isSelf: true };
    const view = buildRankPresentation({ items, self, listSlots: 4 });
    expect(view.list.some((p) => p?.isSelf && p.floor === 1)).toBe(true);
  });

  it('现场版式是紧凑 2-1-3 台座加前 10 名单', () => {
    const layout = layoutRankBoard(750);
    expect(layout.podium.map((s) => s.place)).toEqual([2, 1, 3]);
    expect(layout.list.map((s) => s.rank)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(layout.podium[1].r).toBeGreaterThan(layout.podium[0].r);
    expect(layout.podium[1].y).toBeLessThan(layout.podium[0].y);
    expect(layout.listX).toBeGreaterThanOrEqual(48);
    expect(layout.contentH).toBeLessThan(920);
    expect(layout.podium[1].blockH).toBeGreaterThan(layout.podium[0].blockH);
    expect(layout.podium[0].blockH).toBeGreaterThan(layout.podium[2].blockH);
  });

  it('台上已有同一个人时，不再把无名次的自己塞进第4', () => {
    const items = [{ rank: 1, name: 'Dktukeke', floor: 33, isSelf: false, avatarUrl: 'https://a' }];
    const self = { rank: 0, name: 'Dktukeke', floor: 33, isSelf: true, avatarUrl: 'https://a' };
    const view = buildRankPresentation({ items, self });
    expect(view.podium[1]).toMatchObject({ name: 'Dktukeke', rank: 1, isSelf: true });
    expect(view.list.filter(Boolean)).toEqual([]);
  });

  it('官方给了第4但前三没人，压成第一', () => {
    const self = { rank: 4, name: 'Dktukeke', floor: 33, isSelf: true };
    const view = buildRankPresentation({ items: [self], self });
    expect(view.podium[1]).toMatchObject({ name: 'Dktukeke', rank: 1 });
    expect(view.list.filter(Boolean)).toEqual([]);
  });

  it('自己是第10时仍占名单最后一格，并带着名次', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rank) => ({
      rank, name: rank === 10 ? '游戏人生' : `n${rank}`, floor: rank <= 3 ? 40 - rank : 1, isSelf: rank === 10,
    }));
    const view = buildRankPresentation({ items, self: items[9] });
    expect(view.list.map((p) => p?.rank)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(view.list[6]).toMatchObject({ name: '游戏人生', rank: 10, isSelf: true });
  });

  it('默认展示前 10：领奖台 3 + 名单 7', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((rank) => ({
      rank, name: `n${rank}`, floor: 40 - rank, isSelf: false,
    }));
    const view = buildRankPresentation({ items });
    expect(view.podium.map((p) => p?.rank)).toEqual([2, 1, 3]);
    expect(view.list.map((p) => p?.rank)).toEqual([4, 5, 6, 7, 8, 9, 10]);
  });
});
