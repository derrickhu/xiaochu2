import { describe, expect, it } from 'vitest';
import { pickTeamStageDrop, TEAM_STAGE_DROP_RADIUS } from '../teamStageDrop';

const HOMES = [0, 1, 2, 3, 4].map((visual) => ({
  visual,
  teamIndex: [3, 1, 0, 2, 4][visual]!,
  occupied: true,
  x: visual * 130,
  y: 0,
}));

describe('pickTeamStageDrop', () => {
  it('落到邻座中心即换到该座', () => {
    expect(pickTeamStageDrop(130, 0, 2, HOMES)).toEqual({ visual: 1, teamIndex: 1 });
    expect(pickTeamStageDrop(260, 0, 1, HOMES)).toEqual({ visual: 2, teamIndex: 0 });
  });

  it('空座与过远落点不接', () => {
    const withHole = HOMES.map((h) => (h.visual === 0 ? { ...h, occupied: false } : h));
    expect(pickTeamStageDrop(0, 0, 2, withHole)).toBeNull();
    expect(pickTeamStageDrop(260 + TEAM_STAGE_DROP_RADIUS + 8, 80, 2, HOMES)).toBeNull();
  });

  it('不落到自己原来的座', () => {
    expect(pickTeamStageDrop(260, 0, 2, HOMES)).toBeNull();
  });
});
