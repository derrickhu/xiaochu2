/**
 * 变现契约：8 个广告位都有日限、计数按位隔离且跨日归零、秘境广告位直接换算成次数，
 * 以及 IAP 桩「未开启时绝不发货」。
 *
 * 重点防的是两类静默事故：广告位漏配日限（等于无限白嫖），
 * 以及付费桩在没接支付回调的情况下先发了货。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AD_PLACEMENTS, AD_PLACEMENT_IDS, AD_REWARD_MULT, ECONOMY_IAP } from '@/balance/monetization';
import { SECRET_REALM } from '@/balance/secretRealm';
import { ECONOMY } from '@/balance/economy';
import { emptyDailyState, initialData, parseSaveData, SAVE_KEY } from '../playerSave';
import { ensureDailyFresh } from '../dailyReset';
import { PlayerData } from '../PlayerData';
import { MonetizationService } from '../MonetizationService';
import { PersistService } from '@/core/PersistService';

/** 回到新号状态：PlayerData 是单例，逐用例显式清档重载（测试环境无本地存储） */
function freshSave(): void {
  PersistService.remove(SAVE_KEY);
  PlayerData.reloadFromStorage('test');
}

describe('广告位配置', () => {
  it('8 个位，key 与 id 一致（埋点 scene 直接用 id，错位会让数据对不上）', () => {
    expect(AD_PLACEMENT_IDS.length).toBe(8);
    for (const id of AD_PLACEMENT_IDS) {
      expect(AD_PLACEMENTS[id].id).toBe(id);
    }
  });

  it('每个位都有正日限：漏配等于该位无限白嫖', () => {
    for (const id of AD_PLACEMENT_IDS) {
      expect(AD_PLACEMENTS[id].dailyLimit, id).toBeGreaterThan(0);
      expect(AD_PLACEMENTS[id].name.length, id).toBeGreaterThan(0);
    }
  });

  it('战败复活有日限（此前无限复活可硬过任何关）', () => {
    expect(AD_PLACEMENTS.battle_revive.dailyLimit).toBeLessThanOrEqual(5);
    expect(AD_PLACEMENTS.battle_revive.gatedElsewhere).toBeUndefined();
  });

  it('只有通天塔重置由别处次数代管（其余位必须自己算日限）', () => {
    const gated = AD_PLACEMENT_IDS.filter((id) => AD_PLACEMENTS[id].gatedElsewhere);
    expect(gated).toEqual(['tower_reset']);
  });

  it('翻倍位倍率为 2（结算 / 签到 / 日常共用一个口径）', () => {
    expect(AD_REWARD_MULT).toBe(2);
  });
});

describe('广告日计数', () => {
  beforeEach(() => {
    freshSave();
  });

  it('按位隔离：看体力广告不吃掉免费单抽次数', () => {
    const before = PlayerData.adUsesLeft('free_gacha_pull');
    expect(PlayerData.consumeAdUse('stamina_refill')).toBe(true);
    expect(PlayerData.adUsesLeft('stamina_refill'))
      .toBe(AD_PLACEMENTS.stamina_refill.dailyLimit - 1);
    expect(PlayerData.adUsesLeft('free_gacha_pull')).toBe(before);
  });

  it('用满即拒，不会出现负数余量', () => {
    const limit = AD_PLACEMENTS.checkin_double.dailyLimit;
    for (let i = 0; i < limit; i++) {
      expect(PlayerData.consumeAdUse('checkin_double')).toBe(true);
    }
    expect(PlayerData.consumeAdUse('checkin_double')).toBe(false);
    expect(PlayerData.adUsesLeft('checkin_double')).toBe(0);
  });

  it('体力回体的余量就是 stamina_refill 计数（不再有第二份存档字段）', () => {
    expect(PlayerData.staminaAdLeft).toBe(PlayerData.adUsesLeft('stamina_refill'));
    const before = PlayerData.stamina;
    expect(PlayerData.claimStaminaAd()).toBe(true);
    expect(PlayerData.stamina - before).toBe(ECONOMY.stamina.adRefill);
    expect(PlayerData.staminaAdLeft).toBe(AD_PLACEMENTS.stamina_refill.dailyLimit - 1);
  });

  it('跨日随日循环整体归零', () => {
    const data = initialData();
    data.daily = emptyDailyState('2026-07-25');
    data.daily.adUsage.victory_double = 5;
    expect(ensureDailyFresh(data, '2026-07-26')).toBe(true);
    expect(data.daily.adUsage.victory_double).toBeUndefined();
  });

  it('存档里的脏计数被清洗（负数与非数字不进内存）', () => {
    const data = parseSaveData({
      version: 7,
      daily: { ...emptyDailyState('2026-07-26'), adUsage: { a: -3, b: 2 } as never },
    });
    expect(data.daily.adUsage).toEqual({ b: 2 });
  });
});

describe('秘境广告加次数', () => {
  beforeEach(() => {
    freshSave();
  });

  it('每看一次即多一次可玩次数，且封顶于该位日限', () => {
    const base = SECRET_REALM.dailyRuns;
    expect(PlayerData.realmRunsLeft).toBe(base);
    expect(PlayerData.consumeAdUse('realm_extra_run')).toBe(true);
    expect(PlayerData.realmRunsLeft).toBe(base + 1);

    const limit = AD_PLACEMENTS.realm_extra_run.dailyLimit;
    for (let i = 1; i < limit; i++) {
      expect(PlayerData.consumeAdUse('realm_extra_run')).toBe(true);
    }
    expect(PlayerData.consumeAdUse('realm_extra_run')).toBe(false);
    expect(PlayerData.realmRunsLeft).toBe(base + limit);
  });

  it('加的次数能被真正消费掉（不是只改显示）', () => {
    PlayerData.consumeAdUse('realm_extra_run');
    const total = SECRET_REALM.dailyRuns + 1;
    for (let i = 0; i < total; i++) {
      expect(PlayerData.consumeRealmRun(), `第 ${i + 1} 次`).toBe(true);
    }
    expect(PlayerData.consumeRealmRun()).toBe(false);
  });
});

describe('IAP 预留（桩）', () => {
  it('首发关闭付费', () => {
    expect(ECONOMY_IAP.enabled).toBe(false);
    expect(MonetizationService.enabled).toBe(false);
  });

  it('SKU id 唯一、定价为正，月卡有周期与每日份', () => {
    const ids = ECONOMY_IAP.skus.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const sku of ECONOMY_IAP.skus) {
      expect(sku.priceFen, sku.id).toBeGreaterThan(0);
      expect(Object.keys(sku.instant).length, sku.id).toBeGreaterThan(0);
    }
    const monthly = ECONOMY_IAP.skus.find((s) => s.kind === 'monthly')!;
    expect(monthly.durationDays).toBeGreaterThan(0);
    expect(monthly.daily).toBeDefined();
  });

  it('未开启时购买返回 disabled 且一分钱货都不发', () => {
    freshSave();
    const before = { lingyu: PlayerData.lingyu, universal: PlayerData.universalShards };
    return MonetizationService.purchase('iap_first_pay').then((r) => {
      expect(r).toBe('disabled');
      expect(PlayerData.lingyu).toBe(before.lingyu);
      expect(PlayerData.universalShards).toBe(before.universal);
    });
  });

  it('未知商品直接失败', async () => {
    expect(await MonetizationService.purchase('iap_not_exist')).toBe('failed');
  });
});
