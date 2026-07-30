/**
 * 具体奖励包契约：结算广告翻倍必须整包缩放，不能只翻币/经验。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AD_REWARD_MULT } from '@/balance/monetization';
import { PersistService } from '@/core/PersistService';
import { PlayerData } from '../PlayerData';
import { SAVE_KEY } from '../playerSave';
import {
  concreteRewardHasValue,
  formatConcreteRewardBrief,
  grantConcreteReward,
  scaleConcreteReward,
  type ConcreteReward,
} from '../rewardGrant';

function freshSave(): void {
  PersistService.remove(SAVE_KEY);
  PlayerData.reloadFromStorage('test');
}

const sampleGranted: ConcreteReward = {
  coins: 96,
  exp: 416,
  lingyu: 20,
  universal: 4,
  shards: [{ petId: 'pet_placeholder', count: 3 }],
};

describe('ConcreteReward 结算翻倍', () => {
  it('×2 差额覆盖实发包全部非零字段（防再漏翻灵玉/碎片）', () => {
    const bonus = scaleConcreteReward(sampleGranted, AD_REWARD_MULT - 1);
    expect(bonus.coins).toBe(sampleGranted.coins);
    expect(bonus.exp).toBe(sampleGranted.exp);
    expect(bonus.lingyu).toBe(sampleGranted.lingyu);
    expect(bonus.universal).toBe(sampleGranted.universal);
    expect(bonus.shards).toEqual(sampleGranted.shards);
    expect(concreteRewardHasValue(bonus)).toBe(true);
  });

  it('副标题含灵玉，避免按钮只写币/经验让玩家以为没翻其它项', () => {
    const brief = formatConcreteRewardBrief(
      scaleConcreteReward(sampleGranted, AD_REWARD_MULT - 1),
    );
    expect(brief).toContain('灵宠币');
    expect(brief).toContain('经验');
    // 前两项之后用「等」收口，但灵玉必须出现在完整 parts 逻辑里被计入
    expect(formatConcreteRewardBrief(
      { coins: 0, exp: 0, lingyu: 20, universal: 0, shards: [] },
    )).toBe('灵玉 +20');
  });

  it('空包不算有奖励', () => {
    expect(concreteRewardHasValue({
      coins: 0, exp: 0, lingyu: 0, universal: 0, shards: [],
    })).toBe(false);
  });
});

describe('grantConcreteReward', () => {
  beforeEach(() => {
    freshSave();
  });

  it('落账币/经验/灵玉/通用碎片', () => {
    const before = {
      coins: PlayerData.coins,
      exp: PlayerData.exp,
      lingyu: PlayerData.lingyu,
      universal: PlayerData.universalShards,
    };
    grantConcreteReward({
      coins: 10,
      exp: 20,
      lingyu: 5,
      universal: 3,
      shards: [],
    });
    expect(PlayerData.coins).toBe(before.coins + 10);
    expect(PlayerData.exp).toBe(before.exp + 20);
    expect(PlayerData.lingyu).toBe(before.lingyu + 5);
    expect(PlayerData.universalShards).toBe(before.universal + 3);
  });
});
