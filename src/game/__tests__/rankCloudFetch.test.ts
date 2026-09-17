/**
 * 云榜是全平台唯一数据源，这里钉住「拿到什么就画什么」。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRankPresentation } from '@/game/rankBoard';
import { HOME_GUEST_NAME } from '@/game/rankHostProfile';

const listTowerRank = vi.fn();
const reportTowerRank = vi.fn();

vi.mock('@/core/BackendService', () => ({
  BackendService: {
    get available() { return true; },
    ensureToken: () => Promise.resolve({}),
    listTowerRank: (limit: number) => listTowerRank(limit),
    reportTowerRank: (body: { floor: number }) => reportTowerRank(body),
  },
}));

const {
  fetchCloudTowerRank,
  isCloudRankDirty,
  parseRankListCache,
  rememberCloudRankSnapshot,
  reportCloudTowerRankIfDirty,
  resetRankCloudStateForTest,
  refreshCloudTowerRank,
} = await import('@/game/rankCloud');

describe('云榜取数', () => {
  // 别写成 `() => mockReset()`：返回值会被 vitest 当成清理函数再调一次
  beforeEach(() => {
    resetRankCloudStateForTest();
    listTowerRank.mockReset();
    reportTowerRank.mockReset();
    reportTowerRank.mockResolvedValue({ ok: true });
  });

  it('层数高的进第一，0 层的记录丢掉', async () => {
    listTowerRank.mockResolvedValue({
      items: [
        { rank: 1, name: '仙灵Mdan', floor: 89, isSelf: false },
        { rank: 2, name: 'Dktukeke', floor: 33, isSelf: true },
        { rank: 3, name: '艳', floor: 0, isSelf: false },
      ],
      self: { rank: 2, name: 'Dktukeke', floor: 33, isSelf: true },
    });
    const res = await fetchCloudTowerRank(33);
    expect(res.items.map((r) => r.floor)).toEqual([89, 33]);
    expect(res.self).toMatchObject({ name: 'Dktukeke', rank: 2 });

    const view = buildRankPresentation({ items: res.items, self: res.self });
    expect(view.podium[1]).toMatchObject({ name: '仙灵Mdan', rank: 1 });
    expect(view.podium[0]).toMatchObject({ name: 'Dktukeke', rank: 2, isSelf: true });
    // 同一个人只能出现一次：台上有了就不再进名单
    expect(view.list.filter(Boolean)).toEqual([]);
  });

  it('掉出前 10 时自己带着真实名次进名单末格', async () => {
    listTowerRank.mockResolvedValue({
      items: Array.from({ length: 10 }, (_, i) => ({
        rank: i + 1, name: `n${i + 1}`, floor: 100 - i, isSelf: false,
      })),
      self: { rank: 42, name: '我', floor: 7, isSelf: true },
    });
    const res = await fetchCloudTowerRank(7);
    const view = buildRankPresentation({ items: res.items, self: res.self });
    const shown = view.list.filter(Boolean);
    expect(shown[shown.length - 1]).toMatchObject({ isSelf: true, floor: 7 });
  });

  it('打开排行只拉榜，不上报', async () => {
    const calls: string[] = [];
    reportTowerRank.mockImplementation(async (body: { floor: number }) => {
      calls.push(`report:${body.floor}`);
      return { ok: true, floor: body.floor };
    });
    listTowerRank.mockImplementation(async () => {
      calls.push('list');
      return { items: [], self: null };
    });
    await fetchCloudTowerRank(5);
    expect(calls).toEqual(['list']);
  });

  it('手动刷新先同步自己再拉最新', async () => {
    const calls: string[] = [];
    reportTowerRank.mockImplementation(async (body: { floor: number }) => {
      calls.push(`report:${body.floor}`);
      return { ok: true, floor: body.floor };
    });
    listTowerRank.mockImplementation(async () => {
      calls.push('list');
      return { items: [], self: null };
    });
    await refreshCloudTowerRank(0);
    expect(calls).toEqual(['report:0', 'list']);
  });

  it('层数没变不重复上报', async () => {
    rememberCloudRankSnapshot({ floor: 5, name: HOME_GUEST_NAME, avatarUrl: '' });
    await reportCloudTowerRankIfDirty(5);
    expect(reportTowerRank).not.toHaveBeenCalled();
  });

  it('层数变了才上报', async () => {
    rememberCloudRankSnapshot({ floor: 4, name: HOME_GUEST_NAME, avatarUrl: '' });
    await reportCloudTowerRankIfDirty(5);
    expect(reportTowerRank).toHaveBeenCalledWith(expect.objectContaining({ floor: 5 }));
  });

  it('从没上报过且是 0 层，不算脏', () => {
    expect(isCloudRankDirty({ floor: 0, name: HOME_GUEST_NAME, avatarUrl: '' }, null)).toBe(false);
    expect(isCloudRankDirty({ floor: 3, name: HOME_GUEST_NAME, avatarUrl: '' }, null)).toBe(true);
  });

  it('昵称或头像变了也要上报', () => {
    const last = { floor: 5, name: '旧名', avatarUrl: '' };
    expect(isCloudRankDirty({ floor: 5, name: '新名', avatarUrl: '' }, last)).toBe(true);
    expect(isCloudRankDirty({ floor: 5, name: '旧名', avatarUrl: 'https://a' }, last)).toBe(true);
    expect(isCloudRankDirty({ floor: 5, name: '旧名', avatarUrl: '' }, last)).toBe(false);
  });

  it('拉榜成功写入缓存，下次失败用缓存', async () => {
    listTowerRank.mockResolvedValueOnce({
      items: [{ rank: 1, name: '仙灵Mdan', floor: 89, isSelf: false }],
      self: { rank: 8, name: '我', floor: 5, isSelf: true },
    });
    await fetchCloudTowerRank(5);
    listTowerRank.mockImplementation(async () => { throw new Error('boom'); });
    const cached = await fetchCloudTowerRank(5);
    expect(cached.items).toMatchObject([{ floor: 89, name: '仙灵Mdan' }]);
    expect(cached.self).toMatchObject({ floor: 5, isSelf: true });
  });

  it('没有缓存且接口挂了，退回本地层数', async () => {
    listTowerRank.mockImplementation(async () => { throw new Error('boom'); });
    const res = await fetchCloudTowerRank(5);
    expect(res.items).toMatchObject([{ floor: 5, isSelf: true }]);
    expect(res.self).toMatchObject({ floor: 5, isSelf: true });
  });

  it('坏缓存当没有', () => {
    expect(parseRankListCache(null)).toBeNull();
    expect(parseRankListCache({ items: 'nope' })).toBeNull();
    expect(parseRankListCache({ items: [{ floor: 0, name: '空' }] })?.items).toEqual([]);
  });
});
