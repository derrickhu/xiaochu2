/**
 * 通天塔排行榜：只测纯规则。
 * 真正打 tt.setImRankData 的路径在真机上验，这里钉住「写不写 / 写到哪」。
 */
import { describe, expect, it } from 'vitest';
import { resolveRankZoneId, shouldWriteTowerBest, towerRankFloor } from '@/game/rankService';

describe('通天塔排行榜写入规则', () => {
  it('没爬过（0 层）不上榜', () => {
    expect(shouldWriteTowerBest(0, Number.NaN)).toBe(false);
    expect(shouldWriteTowerBest(0, 0)).toBe(false);
  });

  it('从未同步过的正层数要写', () => {
    expect(shouldWriteTowerBest(12, Number.NaN)).toBe(true);
  });

  it('和上次成功写入相同则跳过，避免进塔页反复打接口', () => {
    expect(shouldWriteTowerBest(12, 12)).toBe(false);
  });

  it('破纪录或直登抬高层数后要再写', () => {
    expect(shouldWriteTowerBest(13, 12)).toBe(true);
  });

  it('开发者工具走 test 分区，真机走 default', () => {
    expect(resolveRankZoneId(true)).toBe('test');
    expect(resolveRankZoneId(false)).toBe('default');
  });

  it('上榜层取历史最高和本轮已达的较大值', () => {
    expect(towerRankFloor({ bestFloor: 0, runReachedFloor: 0 })).toBe(0);
    expect(towerRankFloor({ bestFloor: 8, runReachedFloor: 3 })).toBe(8);
    expect(towerRankFloor({ bestFloor: 0, runReachedFloor: 5 })).toBe(5);
  });
});
