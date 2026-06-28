import { describe, expect, it } from 'vitest';
import { formatStarTurnHint, starTurnThresholds, starsFromTurns } from '../stars';

describe('starsFromTurns', () => {
  it('按回合数三档：1★ 通关 · 2★ ≤limit · 3★ ≤ceil(limit/2)', () => {
    expect(starTurnThresholds(14)).toEqual({ star2: 14, star3: 7 });
    expect(starsFromTurns(15, 14)).toBe(1);
    expect(starsFromTurns(14, 14)).toBe(2);
    expect(starsFromTurns(8, 14)).toBe(2);
    expect(starsFromTurns(7, 14)).toBe(3);
    expect(starsFromTurns(5, 14)).toBe(3);
  });

  it('formatStarTurnHint 用于结算展示', () => {
    expect(formatStarTurnHint(14)).toBe('三星 ≤7 · 二星 ≤14');
  });
});
