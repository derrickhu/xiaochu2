/**
 * 通天塔一轮登塔的存档闭环：灵机领取、重置重掷、塔币结算与每日上限。
 *
 * 塔币这套的设计意图是「奖励爬得更高，而不是奖励刷得更久」，
 * 所以这里主要防三件事：低层反复刷能无限产币、突破奖励被日限吃掉、
 * 以及灵机在新一轮开始时没被清干净。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkpointFloorOf, towerDailyBaseCap, towerEntryFloor, TOWER, TOWER_COIN,
} from '@/balance/tower';
import { STAGES } from '@/balance/stages';
import { TOWER_BLESSES, TOWER_BLESS_MAP } from '@/balance/towerBless';
import { SAVE_KEY } from '../playerSave';
import { PlayerData } from '../PlayerData';
import { PersistService } from '@/core/PersistService';

function freshSave(): void {
  PersistService.remove(SAVE_KEY);
  PlayerData.reloadFromStorage('test');
}

/** 直接推进到指定层（跳过战斗），用于构造塔币与灵机场景 */
function climbTo(floor: number): void {
  for (let f = 1; f <= floor; f++) {
    PlayerData.towerSettleCoins(f);
    PlayerData.towerAdvance(f, 1);
  }
}

beforeEach(() => {
  freshSave();
});

describe('灵机领取', () => {
  it('同名可叠到上限，叠满后拒绝', () => {
    const def = TOWER_BLESS_MAP.get('bless_atk')!;
    for (let i = 0; i < def.maxStacks; i++) {
      expect(PlayerData.grantTowerBless('bless_atk')).toBe(true);
    }
    expect(PlayerData.grantTowerBless('bless_atk')).toBe(false);
    expect(PlayerData.towerBlesses['bless_atk']).toBe(def.maxStacks);
  });

  it('未知 id 不会写进存档', () => {
    expect(PlayerData.grantTowerBless('not_a_bless')).toBe(false);
    expect(PlayerData.towerBlesses['not_a_bless']).toBeUndefined();
  });

  it('聚合出的战斗修正跟随已领灵机变化', () => {
    expect(PlayerData.towerRunModifiers().atkMult).toBe(1);
    PlayerData.grantTowerBless('bless_atk');
    expect(PlayerData.towerRunModifiers().atkMult).toBeCloseTo(1.12, 5);
  });

  it('候选池排除已叠满的灵机', () => {
    const def = TOWER_BLESS_MAP.get('bless_first_crit')!;
    for (let i = 0; i < def.maxStacks; i++) PlayerData.grantTowerBless(def.id);
    for (let i = 0; i < 40; i++) {
      const picks = PlayerData.rollTowerBlessChoices(false);
      expect(picks.map((p) => p.id)).not.toContain(def.id);
    }
  });
});

describe('按主线进度直登', () => {
  /** 把前 n 章的 Boss 关记为已通，从而抬高 PlayerData.clearedChapters */
  function clearChapters(n: number): void {
    for (const s of STAGES) {
      if (s.isBoss && s.chapter >= 1 && s.chapter <= n) PlayerData.recordClear(s.id, 3, 0);
    }
  }

  it('新号没得跳：塔的曲线本来就是配着他的进度走的', () => {
    expect(PlayerData.towerSkipTarget).toBeNull();
    expect(PlayerData.towerSkipToEntryFloor()).toBeNull();
  });

  it('推了很久主线才进塔的玩家能一步跳到相称的高度', () => {
    clearChapters(8);
    const target = PlayerData.towerSkipTarget;
    expect(target).toBe(towerEntryFloor(8));
    expect(target!).toBeGreaterThan(20);
    expect(PlayerData.towerSkipToEntryFloor()).toBe(target);
    expect(PlayerData.tower.runFloor).toBe(target);
    expect(PlayerData.tower.runHpPct).toBe(1);
  });

  it('跳过的层一律不发奖：塔币、突破、守关全部按已结算处理', () => {
    clearChapters(8);
    const target = PlayerData.towerSkipToEntryFloor()!;
    expect(PlayerData.towerCoins).toBe(0);
    // 打过直登层后只该拿到「爬升 1 层」的量，而不是从第 1 层一路补发
    const settle = PlayerData.towerSettleCoins(target);
    expect(settle.base).toBe(TOWER_COIN.perFloor);
    expect(settle.breakthrough).toBe(TOWER_COIN.perBreakthrough);
    for (let f = TOWER.milestoneEvery; f < target; f += TOWER.milestoneEvery) {
      expect(PlayerData.isTowerMilestoneClaimed(f), `第 ${f} 层守关`).toBe(true);
    }
  });

  it('按层数补发随机灵机，否则空手站上高层不可能过', () => {
    clearChapters(8);
    const target = PlayerData.towerSkipToEntryFloor()!;
    // 一次抽取内每种灵机只出一次，所以补发量封顶在灵机种类数
    const total = Object.values(PlayerData.towerBlesses).reduce((a, b) => a + b, 0);
    expect(total).toBe(Math.min(target - 1, TOWER_BLESSES.length));
  });

  it('已经爬得比直登点更高时不再提供直登', () => {
    clearChapters(8);
    climbTo(towerEntryFloor(8) + 5);
    expect(PlayerData.towerSkipTarget).toBeNull();
  });
});

describe('重置开启新一轮', () => {
  it('清空上一轮灵机，并按起始层数补发等量随机灵机', () => {
    climbTo(12);
    PlayerData.grantTowerBless('bless_atk');
    PlayerData.towerEndRun();

    expect(PlayerData.towerReset()).toBe(true);
    const startFloor = PlayerData.tower.runFloor;
    const total = Object.values(PlayerData.towerBlesses).reduce((a, b) => a + b, 0);
    expect(startFloor).toBe(checkpointFloorOf(13));
    expect(total).toBe(startFloor - 1);
  });

  it('第 1 层起步的新号重置后不补发灵机', () => {
    PlayerData.towerEndRun();
    expect(PlayerData.towerReset()).toBe(true);
    expect(Object.keys(PlayerData.towerBlesses)).toHaveLength(0);
  });

  it('次数用尽后拒绝重置', () => {
    for (let i = 0; i < TOWER.dailyResets; i++) {
      expect(PlayerData.towerReset()).toBe(true);
    }
    expect(PlayerData.towerReset()).toBe(false);
  });
});

describe('塔币结算', () => {
  it('首轮爬到第 N 层，基础部分累计等于 N', () => {
    const n = 8;
    let base = 0;
    for (let f = 1; f <= n; f++) {
      base += PlayerData.towerSettleCoins(f).base;
      PlayerData.towerAdvance(f, 1);
    }
    expect(base).toBe(n * TOWER_COIN.perFloor);
  });

  it('突破历史最高层才有额外奖励，重爬同一层没有', () => {
    const first = PlayerData.towerSettleCoins(1);
    expect(first.breakthrough).toBe(TOWER_COIN.perBreakthrough);
    PlayerData.towerAdvance(1, 1);

    // 同一层再结算一次：既不给基础也不给突破
    const again = PlayerData.towerSettleCoins(1);
    expect(again.base).toBe(0);
    expect(again.breakthrough).toBe(0);
  });

  it('守关层首过给一次性大额，且不吃每日基础上限', () => {
    climbTo(TOWER.milestoneEvery - 1);
    const guard = PlayerData.towerSettleCoins(TOWER.milestoneEvery, { guardFirstClear: true });
    expect(guard.guard).toBe(TOWER_COIN.perGuardFirstClear);
  });

  it('基础部分吃每日上限，低层反复刷不能无限产币', () => {
    const cap = towerDailyBaseCap(0);
    let base = 0;
    // 反复「重置 → 重爬」制造重复的基础结算
    for (let round = 0; round < 6; round++) {
      const t = PlayerData.tower;
      // 直接把本轮已计层归零，模拟新一轮从头爬
      (t as { runReachedFloor: number }).runReachedFloor = 0;
      for (let f = 1; f <= 20; f++) base += PlayerData.towerSettleCoins(f).base;
    }
    expect(base).toBe(cap);
    expect(PlayerData.towerCoinBaseLeft).toBe(0);
  });

  it('突破奖励在基础额度耗尽后依然发放', () => {
    const t = PlayerData.tower as { coinBaseToday: number };
    t.coinBaseToday = towerDailyBaseCap(PlayerData.tower.bestFloor);
    const got = PlayerData.towerSettleCoins(5);
    expect(got.base).toBe(0);
    expect(got.breakthrough).toBe(5 * TOWER_COIN.perBreakthrough);
    expect(PlayerData.towerCoins).toBe(got.total);
  });
});
