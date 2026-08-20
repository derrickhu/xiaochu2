import { describe, expect, it } from 'vitest';
import {
  formatBattleStarTurnValue,
  formatStarTurnHint,
  starsFromTurns,
  starTurnPace,
  starTurnThresholds,
} from '../stars';

describe('starTurnThresholds', () => {
  it('三星线是二星上限的一半（向上取整）', () => {
    expect(starTurnThresholds(14)).toEqual({ star2: 14, star3: 7 });
    expect(starTurnThresholds(15)).toEqual({ star2: 15, star3: 8 });
    expect(starTurnThresholds(1)).toEqual({ star2: 1, star3: 1 });
  });
});

describe('starsFromTurns', () => {
  it('按两档上限折 3/2/1 星', () => {
    expect(starsFromTurns(7, 14)).toBe(3);
    expect(starsFromTurns(8, 14)).toBe(2);
    expect(starsFromTurns(14, 14)).toBe(2);
    expect(starsFromTurns(15, 14)).toBe(1);
  });
});

describe('starTurnPace / formatBattleStarTurnValue', () => {
  it('战斗胶囊分母钉死三星线，色档随当前回合掉档', () => {
    expect(formatBattleStarTurnValue(0, 14)).toBe('0/7');
    expect(starTurnPace(0, 14)).toBe('onTrack');
    expect(formatBattleStarTurnValue(2, 14)).toBe('2/7');
    expect(starTurnPace(2, 14)).toBe('onTrack');
    expect(starTurnPace(7, 14)).toBe('onTrack');
    expect(starTurnPace(8, 14)).toBe('twoStar');
    expect(starTurnPace(14, 14)).toBe('twoStar');
    expect(starTurnPace(15, 14)).toBe('oneStar');
  });

  it('结算提示仍同时写出两档', () => {
    expect(formatStarTurnHint(14)).toBe('三星 ≤7 · 二星 ≤14');
  });
});
