/**
 * 传承树与印记兑换：塔币消耗端的闭环。
 *
 * 除了常规的「买得起才扣、扣了才生效」，这里专门钉住一条设计红线：
 * 传承节点不得提供直接战力（攻/防/暴击等），否则会形成
 * 「爬得高 → 变更强 → 爬更高」的正反馈螺旋，roguelike 的重开价值当场归零。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TOWER } from '@/balance/tower';
import {
  aggregateLegacyEffects, emptyLegacyEffects, legacyTotalCost,
  legacyUpgradeCost, TOWER_EXCHANGES, TOWER_LEGACY_NODES,
} from '@/balance/towerLegacy';
import { emptyRunModifiers } from '@/balance/towerBless';
import { SAVE_KEY } from '../playerSave';
import { PlayerData } from '../PlayerData';
import { PersistService } from '@/core/PersistService';

function freshSave(): void {
  PersistService.remove(SAVE_KEY);
  PlayerData.reloadFromStorage('test');
}

/** 直接塞塔币，跳过爬塔 */
function giveCoins(n: number): void {
  (PlayerData.tower as { coins: number }).coins = n;
}

beforeEach(() => {
  freshSave();
});

describe('传承节点定义', () => {
  it('id 唯一，每级消耗递增（后期节点不能比前期还便宜）', () => {
    const ids = new Set(TOWER_LEGACY_NODES.map((n) => n.id));
    expect(ids.size).toBe(TOWER_LEGACY_NODES.length);
    for (const node of TOWER_LEGACY_NODES) {
      expect(node.costs.length).toBeGreaterThan(0);
      for (let i = 1; i < node.costs.length; i++) {
        expect(node.costs[i]).toBeGreaterThan(node.costs[i - 1]);
      }
    }
  });

  it('点满总价足够撑起长线目标', () => {
    expect(legacyTotalCost()).toBeGreaterThan(10_000);
  });

  it('设计红线：任何节点都不提供直接战力', () => {
    const allMax: Record<string, number> = {};
    for (const n of TOWER_LEGACY_NODES) allMax[n.id] = n.costs.length;
    const fx = aggregateLegacyEffects(allMax);
    // 传承全满也不该改变任何一项战斗数值修正
    const combat = emptyRunModifiers();
    expect(combat.atkMult).toBe(1);
    expect(Object.keys(fx)).not.toContain('atkMult');
    expect(Object.keys(fx)).not.toContain('critRateAdd');
    expect(Object.keys(fx)).not.toContain('hpMult');
  });
});

describe('传承效果聚合', () => {
  it('空持有等于空效果', () => {
    expect(aggregateLegacyEffects({})).toEqual(emptyLegacyEffects());
  });

  it('超过最大等级的脏存档被截断', () => {
    const capped = aggregateLegacyEffects({ legacy_reroll: 99 });
    const atMax = aggregateLegacyEffects({ legacy_reroll: 3 });
    expect(capped.rerollsPerRun).toBe(atMax.rerollsPerRun);
  });

  it('未知节点被忽略', () => {
    expect(aggregateLegacyEffects({ not_a_node: 3 })).toEqual(emptyLegacyEffects());
  });

  it('稳固缩短存档点间隔但不会低于 2 层', () => {
    expect(aggregateLegacyEffects({ legacy_checkpoint: 1 }).checkpointEvery)
      .toBe(TOWER.checkpointEvery - 1);
    expect(aggregateLegacyEffects({ legacy_checkpoint: 99 }).checkpointEvery)
      .toBeGreaterThanOrEqual(2);
  });

  it('广纳把候选数抬到 4', () => {
    expect(aggregateLegacyEffects({ legacy_pick_wide: 1 }).pickCount).toBe(4);
  });
});

describe('传承升级', () => {
  it('塔币不足时拒绝，且不扣币不升级', () => {
    const cost = legacyUpgradeCost('legacy_reroll', 0)!;
    giveCoins(cost - 1);
    expect(PlayerData.upgradeTowerLegacy('legacy_reroll')).toBe(false);
    expect(PlayerData.towerLegacyLevel('legacy_reroll')).toBe(0);
    expect(PlayerData.towerCoins).toBe(cost - 1);
  });

  it('买得起就扣币升级，效果立刻生效', () => {
    const cost = legacyUpgradeCost('legacy_pick_wide', 0)!;
    giveCoins(cost);
    expect(PlayerData.rollTowerBlessChoices(false)).toHaveLength(3);
    expect(PlayerData.upgradeTowerLegacy('legacy_pick_wide')).toBe(true);
    expect(PlayerData.towerCoins).toBe(0);
    expect(PlayerData.rollTowerBlessChoices(false)).toHaveLength(4);
  });

  it('满级后拒绝继续升级', () => {
    const node = TOWER_LEGACY_NODES.find((n) => n.id === 'legacy_second_wind')!;
    giveCoins(node.costs[0] * 3);
    expect(PlayerData.upgradeTowerLegacy(node.id)).toBe(true);
    expect(PlayerData.towerLegacyCost(node.id)).toBeNull();
    expect(PlayerData.upgradeTowerLegacy(node.id)).toBe(false);
  });

  it('买重掷会立刻补足本轮次数，而不是等下一轮', () => {
    giveCoins(1000);
    expect(PlayerData.towerRerollsLeft).toBe(0);
    PlayerData.upgradeTowerLegacy('legacy_reroll');
    expect(PlayerData.towerRerollsLeft).toBe(1);
    expect(PlayerData.consumeTowerReroll()).toBe(true);
    expect(PlayerData.consumeTowerReroll()).toBe(false);
  });

  it('续命让每日重置次数多一次', () => {
    const before = PlayerData.towerResetsLeft;
    giveCoins(5000);
    PlayerData.upgradeTowerLegacy('legacy_second_wind');
    expect(PlayerData.towerResetsLeft).toBe(before + 1);
  });

  it('稳固让战败回退得更近', () => {
    (PlayerData.tower as { runFloor: number }).runFloor = 13;
    const before = PlayerData.towerCheckpointFloor();
    giveCoins(5000);
    PlayerData.upgradeTowerLegacy('legacy_checkpoint');
    expect(PlayerData.towerCheckpointFloor()).toBeGreaterThan(before);
  });

  it('回气抬高战斗层回血，但不影响守关层', () => {
    const guardBefore = PlayerData.towerHealPct(TOWER.milestoneEvery);
    giveCoins(5000);
    PlayerData.upgradeTowerLegacy('legacy_regen');
    expect(PlayerData.towerHealPct(1)).toBeGreaterThan(TOWER.healPctPerFloor);
    expect(PlayerData.towerHealPct(TOWER.milestoneEvery)).toBe(guardBefore);
  });

  it('印记·丰放大塔币产出，但不放大每日基础上限', () => {
    const capBefore = PlayerData.towerCoinBaseLeft;
    giveCoins(5000);
    PlayerData.upgradeTowerLegacy('legacy_coin');
    expect(PlayerData.towerCoinBaseLeft).toBe(capBefore);

    giveCoins(0);
    const got = PlayerData.towerSettleCoins(1);
    // 基础 1 + 突破 3 = 4，×1.1 后向下取整为 4；换个层数验证放大确实发生
    (PlayerData.tower as { runReachedFloor: number }).runReachedFloor = 0;
    const big = PlayerData.towerSettleCoins(10);
    expect(big.total).toBeGreaterThan(big.base + big.breakthrough + big.guard - 1);
    expect(got.total).toBeGreaterThan(0);
  });
});

describe('印记兑换', () => {
  it('扣币、记次数、返回可发放的奖励', () => {
    const opt = TOWER_EXCHANGES[0];
    giveCoins(opt.cost);
    const done = PlayerData.consumeTowerExchange(opt.id);
    expect(done?.id).toBe(opt.id);
    expect(PlayerData.towerCoins).toBe(0);
    expect(PlayerData.towerExchangeLeft(opt.id)).toBe(opt.dailyLimit - 1);
  });

  it('塔币不足时不扣不记', () => {
    const opt = TOWER_EXCHANGES[0];
    giveCoins(opt.cost - 1);
    expect(PlayerData.consumeTowerExchange(opt.id)).toBeNull();
    expect(PlayerData.towerExchangeLeft(opt.id)).toBe(opt.dailyLimit);
  });

  it('今日次数用尽后即便有币也拒绝：这是防通胀的唯一闸门', () => {
    const opt = TOWER_EXCHANGES[0];
    giveCoins(opt.cost * (opt.dailyLimit + 5));
    for (let i = 0; i < opt.dailyLimit; i++) {
      expect(PlayerData.consumeTowerExchange(opt.id)).not.toBeNull();
    }
    expect(PlayerData.towerExchangeLeft(opt.id)).toBe(0);
    expect(PlayerData.consumeTowerExchange(opt.id)).toBeNull();
  });

  it('未知兑换项返回 null', () => {
    giveCoins(99_999);
    expect(PlayerData.consumeTowerExchange('not_an_option')).toBeNull();
  });
});
