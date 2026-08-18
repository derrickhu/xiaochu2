import { describe, expect, it } from 'vitest';
import {
  rollTowerPaths, TOWER_EVENTS, TOWER_FLOOR_KINDS, TOWER_REST_HEAL_PCT, towerLastWasSkip,
} from '@/balance/towerPath';

describe('通天塔择路', () => {
  it('刚走完奇遇或静室，下一层只给战斗路', () => {
    for (let i = 0; i < 40; i++) {
      const afterEvent = rollTowerPaths(8, Math.random, 'event');
      const afterRest = rollTowerPaths(8, Math.random, 'rest');
      expect(afterEvent.every((k) => TOWER_FLOOR_KINDS[k].combat)).toBe(true);
      expect(afterRest.every((k) => TOWER_FLOOR_KINDS[k].combat)).toBe(true);
      expect(afterEvent.includes('event') || afterEvent.includes('rest')).toBe(false);
    }
  });

  it('战斗之后奇遇是偶发，不是每层必出', () => {
    let eventHits = 0;
    const n = 200;
    for (let i = 0; i < n; i++) {
      const paths = rollTowerPaths(8, Math.random, 'battle');
      if (paths.includes('event')) eventHits++;
    }
    expect(eventHits / n).toBeGreaterThan(0.08);
    expect(eventHits / n).toBeLessThan(0.38);
  });

  it('守关层与前 3 层不给分支', () => {
    expect(rollTowerPaths(10)).toEqual(['guard']);
    expect(rollTowerPaths(3)).toEqual(['battle']);
  });

  it('上一层是否歇过用同一判断', () => {
    expect(towerLastWasSkip('event')).toBe(true);
    expect(towerLastWasSkip('rest')).toBe(true);
    expect(towerLastWasSkip('battle')).toBe(false);
  });

  it('灵泉回血低于静室，大补给留给休整格', () => {
    const spring = TOWER_EVENTS.find((e) => e.id === 'ev_spring');
    expect(spring?.effect).toEqual({ kind: 'heal', pct: 0.16 });
    expect(TOWER_REST_HEAL_PCT).toBe(0.25);
    expect(TOWER_REST_HEAL_PCT).toBeGreaterThan(0.16);
  });
});
