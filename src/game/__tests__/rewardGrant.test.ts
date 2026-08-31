import { describe, expect, it } from 'vitest';
import {
  concreteRewardHasValue,
  formatConcreteRewardBrief,
  scaleConcreteReward,
} from '../rewardGrant';

describe('ConcreteReward 印记字段', () => {
  it('scale / 文案 / 有值判定都认 towerMarks', () => {
    const raw = {
      coins: 8, exp: 64, lingyu: 0, universal: 0, shards: [], towerMarks: 5,
    };
    const bonus = scaleConcreteReward(raw, 1);
    expect(bonus.towerMarks).toBe(5);
    expect(concreteRewardHasValue({ coins: 0, exp: 0, lingyu: 0, universal: 0, shards: [], towerMarks: 5 })).toBe(true);
    expect(formatConcreteRewardBrief(raw)).toContain('印记 +5');
  });
});
