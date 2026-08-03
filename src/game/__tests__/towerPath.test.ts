/**
 * 分支路径与事件层。
 *
 * 最关键的一条：分支层必须至少留一个战斗选项。否则玩家可以靠连续的
 * 事件层与休整层无伤刷层，塔的「资源损耗战」定位当场作废。
 * 其次是路径落盘 —— 退出重进若能重抽，「选哪条」就退化成「重开到出好路为止」。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TOWER } from '@/balance/tower';
import {
  rollTowerEvent, rollTowerPaths, TOWER_BRANCH_FROM_FLOOR,
  TOWER_EVENTS, TOWER_FLOOR_KINDS, TOWER_PATH_COUNT, TOWER_REST_HEAL_PCT,
} from '@/balance/towerPath';
import { SAVE_KEY } from '../playerSave';
import { PlayerData } from '../PlayerData';
import { resolveTowerEvent, resolveTowerRest } from '../towerEventResolve';
import { PersistService } from '@/core/PersistService';

function freshSave(): void {
  PersistService.remove(SAVE_KEY);
  PlayerData.reloadFromStorage('test');
}

function setFloor(floor: number, hpPct = 1): void {
  const t = PlayerData.tower as { runFloor: number; runHpPct: number };
  t.runFloor = floor;
  t.runHpPct = hpPct;
}

/** 覆盖多组 rng 序列，避免单点巧合掩盖问题 */
function rngSeries(): Array<() => number> {
  return Array.from({ length: 24 }, (_, seed) => {
    let x = seed + 1;
    return () => {
      x = (x * 9301 + 49297) % 233280;
      return x / 233280;
    };
  });
}

beforeEach(() => {
  freshSave();
});

describe('路径抽取', () => {
  it('守关层不给分支', () => {
    expect(rollTowerPaths(TOWER.milestoneEvery, () => 0.5)).toEqual(['guard']);
  });

  it('前几层固定为寻常道，先把基本节奏走顺', () => {
    for (let f = 1; f < TOWER_BRANCH_FROM_FLOOR; f++) {
      expect(rollTowerPaths(f, () => 0.5)).toEqual(['battle']);
    }
  });

  it('分支层给出定量且互不重复的路径', () => {
    for (const rng of rngSeries()) {
      const paths = rollTowerPaths(TOWER_BRANCH_FROM_FLOOR + 1, rng);
      expect(paths).toHaveLength(TOWER_PATH_COUNT);
      expect(new Set(paths).size).toBe(TOWER_PATH_COUNT);
    }
  });

  it('分支层始终至少有一个战斗选项', () => {
    for (const rng of rngSeries()) {
      for (let f = TOWER_BRANCH_FROM_FLOOR; f < TOWER_BRANCH_FROM_FLOOR + 12; f++) {
        if (f % TOWER.milestoneEvery === 0) continue;
        const paths = rollTowerPaths(f, rng);
        expect(paths.some((k) => TOWER_FLOOR_KINDS[k].combat), `floor ${f}`).toBe(true);
      }
    }
  });

  it('险径确实更难且回报更高', () => {
    expect(TOWER_FLOOR_KINDS.elite.difficultyMult)
      .toBeGreaterThan(TOWER_FLOOR_KINDS.battle.difficultyMult);
    expect(TOWER_FLOOR_KINDS.elite.coinBonus)
      .toBeGreaterThan(TOWER_FLOOR_KINDS.battle.coinBonus);
    expect(TOWER_FLOOR_KINDS.elite.richBless).toBe(true);
  });

  it('择路文案用玩家语言，统一叫机缘、不塞开发者术语', () => {
    for (const def of Object.values(TOWER_FLOOR_KINDS)) {
      expect(def.badge.length).toBeGreaterThan(0);
      expect(def.summary.length).toBeGreaterThan(0);
      expect(def.payoff.length).toBeGreaterThan(0);
      expect(def.summary + def.payoff).not.toMatch(/×|品质↑|1\.35/);
    }
    expect(TOWER_FLOOR_KINDS.battle.payoff).toContain('机缘');
    expect(TOWER_FLOOR_KINDS.elite.payoff).toMatch(/罕有|奇珍/);
    expect(TOWER_FLOOR_KINDS.event.badge).toBe('不打架');
  });
});

describe('路径落盘', () => {
  it('同一层重复读取拿到同一组路径', () => {
    setFloor(TOWER_BRANCH_FROM_FLOOR + 2);
    const first = PlayerData.towerPaths();
    for (let i = 0; i < 10; i++) {
      expect(PlayerData.towerPaths()).toEqual(first);
    }
  });

  it('推进层数后重新抽取', () => {
    setFloor(TOWER_BRANCH_FROM_FLOOR + 2);
    PlayerData.towerPaths();
    const before = PlayerData.tower.runPathsFloor;
    PlayerData.towerAdvance(TOWER_BRANCH_FROM_FLOOR + 2, 1);
    PlayerData.towerPaths();
    expect(PlayerData.tower.runPathsFloor).toBeGreaterThan(before);
  });

  it('未选择时按寻常道结算，选定后可读回', () => {
    setFloor(TOWER_BRANCH_FROM_FLOOR + 2);
    PlayerData.towerPaths();
    expect(PlayerData.towerPathKind).toBe('battle');
    PlayerData.chooseTowerPath('elite');
    expect(PlayerData.towerPathKind).toBe('elite');
  });

  it('层数变化后旧的选择不再生效', () => {
    setFloor(TOWER_BRANCH_FROM_FLOOR + 2);
    PlayerData.chooseTowerPath('elite');
    PlayerData.towerAdvance(TOWER_BRANCH_FROM_FLOOR + 2, 1);
    expect(PlayerData.towerPathKind).toBe('battle');
  });
});

describe('事件定义', () => {
  it('id 唯一且权重为正', () => {
    expect(new Set(TOWER_EVENTS.map((e) => e.id)).size).toBe(TOWER_EVENTS.length);
    for (const e of TOWER_EVENTS) expect(e.weight).toBeGreaterThan(0);
  });

  it('抽取结果始终落在事件池内', () => {
    for (const rng of rngSeries()) {
      for (let i = 0; i < 20; i++) {
        expect(TOWER_EVENTS).toContain(rollTowerEvent(rng));
      }
    }
  });
});

describe('事件结算', () => {
  it('灵泉回血并推进层数', () => {
    setFloor(6, 0.4);
    const event = TOWER_EVENTS.find((e) => e.id === 'ev_spring')!;
    const out = resolveTowerEvent(event, 6, () => 0.5);
    expect(out.hpPct).toBeGreaterThan(0.4);
    expect(PlayerData.tower.runFloor).toBe(7);
    expect(out.lines.length).toBeGreaterThan(0);
  });

  it('凶兆以生命换机缘', () => {
    setFloor(6, 0.9);
    const event = TOWER_EVENTS.find((e) => e.id === 'ev_omen')!;
    resolveTowerEvent(event, 6, () => 0.5);
    expect(PlayerData.tower.runHpPct).toBeLessThan(0.9);
    const total = Object.values(PlayerData.towerBlesses).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('试炼碑成功给机缘、失败扣血', () => {
    const event = TOWER_EVENTS.find((e) => e.id === 'ev_gamble')!;

    setFloor(6, 0.9);
    resolveTowerEvent(event, 6, () => 0.01);
    expect(PlayerData.tower.runHpPct).toBe(0.9);
    expect(Object.keys(PlayerData.towerBlesses).length).toBeGreaterThan(0);

    freshSave();
    setFloor(6, 0.9);
    resolveTowerEvent(event, 6, () => 0.99);
    expect(PlayerData.tower.runHpPct).toBeLessThan(0.9);
    expect(Object.keys(PlayerData.towerBlesses)).toHaveLength(0);
  });

  it('秘藏直接给印记', () => {
    setFloor(6);
    const before = PlayerData.towerCoins;
    const event = TOWER_EVENTS.find((e) => e.id === 'ev_cache')!;
    resolveTowerEvent(event, 6, () => 0.5);
    expect(PlayerData.towerCoins).toBeGreaterThan(before);
  });

  it('淬炼炉舍一换二；身无机缘时不报错', () => {
    setFloor(6);
    const event = TOWER_EVENTS.find((e) => e.id === 'ev_reforge')!;
    expect(() => resolveTowerEvent(event, 6, () => 0.5)).not.toThrow();

    freshSave();
    setFloor(6);
    PlayerData.grantTowerBless('bless_atk');
    PlayerData.grantTowerBless('bless_atk');
    resolveTowerEvent(event, 6, () => 0.5);
    const total = Object.values(PlayerData.towerBlesses).reduce((a, b) => a + b, 0);
    // 舍去 1 层、补回 2 道
    expect(total).toBe(3);
  });

  it('休整层回血并推进层数，但不给机缘', () => {
    setFloor(6, 0.3);
    const out = resolveTowerRest(6);
    expect(out.hpPct).toBeCloseTo(0.3 + TOWER_REST_HEAL_PCT, 5);
    expect(PlayerData.tower.runFloor).toBe(7);
    expect(Object.keys(PlayerData.towerBlesses)).toHaveLength(0);
  });

  it('事件层同样计入历史最高层，跳过战斗不等于跳过进度', () => {
    setFloor(6);
    resolveTowerRest(6);
    expect(PlayerData.tower.bestFloor).toBe(6);
  });
});
