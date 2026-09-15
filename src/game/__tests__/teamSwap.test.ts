import { describe, expect, it } from 'vitest';
import { swapTeamEntries } from '../teamSwap';

describe('swapTeamEntries', () => {
  it('对调队长与队员，其余槽位不动', () => {
    expect(swapTeamEntries(['a', 'b', 'c'], 0, 2)).toEqual(['c', 'b', 'a']);
  });

  it('对调两名非队长', () => {
    expect(swapTeamEntries(['a', 'b', 'c', 'd'], 1, 3)).toEqual(['a', 'd', 'c', 'b']);
  });

  it('同一槽 / 空槽 / 越界返回 null', () => {
    expect(swapTeamEntries(['a', 'b'], 1, 1)).toBeNull();
    expect(swapTeamEntries(['a', 'b'], 0, 2)).toBeNull();
    expect(swapTeamEntries(['a', 'b'], -1, 0)).toBeNull();
    expect(swapTeamEntries(['a', ''], 0, 1)).toBeNull();
  });
});
