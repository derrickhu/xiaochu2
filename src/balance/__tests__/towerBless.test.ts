/**
 * 通天塔灵机与难度曲线：纯数据层断言，不碰存档与渲染。
 *
 * 重点守两件事：叠加层数封顶（存档被改坏也不能把战斗数值带飞），
 * 以及难度确实随层数单调递增（旧版恒定 0.92 正是塔不难的根因）。
 */
import { describe, it, expect } from 'vitest';
import {
  aggregateBlessModifiers,
  describeOwnedBlesses,
  emptyRunModifiers,
  rollBlessChoices,
  TOWER_BLESSES,
  TOWER_BLESS_MAP,
  BLESS_PICK_COUNT,
} from '../towerBless';
import { TOWER, towerDailyBaseCap, towerDifficulty, towerHealPctFor } from '../tower';

/** 固定序列 rng，保证抽取用例可复现 */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('灵机池定义', () => {
  it('id 唯一且数值类与触发类各占一半以上的多样性', () => {
    expect(TOWER_BLESS_MAP.size).toBe(TOWER_BLESSES.length);
    const triggers = TOWER_BLESSES.filter((b) => b.category === 'trigger');
    expect(triggers.length).toBeGreaterThanOrEqual(10);
    expect(TOWER_BLESSES.length).toBeGreaterThanOrEqual(20);
  });

  it('每条都有正的最大叠加层数与非空描述', () => {
    for (const b of TOWER_BLESSES) {
      expect(b.maxStacks).toBeGreaterThan(0);
      expect(b.desc(1).length).toBeGreaterThan(0);
      expect(b.desc(b.maxStacks).length).toBeGreaterThan(0);
    }
  });
});

describe('灵机聚合', () => {
  it('空持有等于空修正', () => {
    expect(aggregateBlessModifiers({})).toEqual(emptyRunModifiers());
  });

  it('数值类按层数线性叠加', () => {
    const mod = aggregateBlessModifiers({ bless_atk: 2, bless_crit_rate: 3 });
    expect(mod.atkMult).toBeCloseTo(1.24, 5);
    expect(mod.critRateAdd).toBeCloseTo(0.24, 5);
  });

  it('超过 maxStacks 的脏存档被按上限截断', () => {
    const capped = aggregateBlessModifiers({ bless_atk: 99 });
    const atMax = aggregateBlessModifiers({ bless_atk: 3 });
    expect(capped.atkMult).toBeCloseTo(atMax.atkMult, 5);
  });

  it('未知 id 与非正层数一律忽略', () => {
    const mod = aggregateBlessModifiers({ not_a_bless: 5, bless_atk: 0, bless_hp: -3 });
    expect(mod).toEqual(emptyRunModifiers());
  });

  it('五行真意只影响对应属性', () => {
    const mod = aggregateBlessModifiers({ bless_element_fire: 2 });
    expect(mod.elementMult.fire).toBeCloseTo(1.6, 5);
    expect(mod.elementMult.water).toBeUndefined();
  });

  it('破甲叠加后仍封顶在 80%', () => {
    const mod = aggregateBlessModifiers({ bless_def_break: 99 });
    expect(mod.enemyDefBreak).toBeLessThanOrEqual(0.8);
    expect(mod.enemyDefBreak).toBeGreaterThan(0);
  });

  it('触发类落在各自字段上而不是混进通用增伤', () => {
    const mod = aggregateBlessModifiers({
      bless_first_crit: 1, bless_ember: 2, bless_thunder: 1,
    });
    expect(mod.firstMatchCrit).toBe(true);
    expect(mod.killHealPct).toBeCloseTo(0.1, 5);
    expect(mod.thunderTrueDamagePct).toBeCloseTo(0.3, 5);
    expect(mod.atkMult).toBe(1);
  });
});

describe('三选一抽取', () => {
  it('默认给出 3 个互不重复的候选', () => {
    const picks = rollBlessChoices({}, seqRng([0.1, 0.5, 0.9, 0.3]));
    expect(picks).toHaveLength(BLESS_PICK_COUNT);
    expect(new Set(picks.map((p) => p.id)).size).toBe(BLESS_PICK_COUNT);
  });

  it('已叠满的灵机不再进池', () => {
    const owned: Record<string, number> = {};
    for (const b of TOWER_BLESSES) owned[b.id] = b.maxStacks;
    owned['bless_atk'] = 0;
    const picks = rollBlessChoices(owned, seqRng([0.5]));
    expect(picks.map((p) => p.id)).toEqual(['bless_atk']);
  });

  it('全部叠满时返回空数组而不是抛错', () => {
    const owned: Record<string, number> = {};
    for (const b of TOWER_BLESSES) owned[b.id] = b.maxStacks;
    expect(rollBlessChoices(owned, seqRng([0.5]))).toEqual([]);
  });

  it('守关层倾斜后高品质出现率显著提升', () => {
    const rng = seqRng(Array.from({ length: 64 }, (_, i) => (i * 0.137) % 1));
    const count = (guardFloor: boolean): number => {
      let epic = 0;
      for (let i = 0; i < 200; i++) {
        for (const p of rollBlessChoices({}, rng, { guardFloor, count: 1 })) {
          if (p.tier !== 'common') epic++;
        }
      }
      return epic;
    };
    expect(count(true)).toBeGreaterThan(count(false));
  });
});

describe('已得灵机展示', () => {
  it('按层数产出描述，未持有的不出现', () => {
    const rows = describeOwnedBlesses({ bless_atk: 2, bless_hp: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0].def.id).toBe('bless_atk');
    expect(rows[0].stacks).toBe(2);
    expect(rows[0].text).toContain('24%');
  });
});

describe('通天塔难度与回血曲线', () => {
  it('难度随层数严格递增', () => {
    for (let f = 1; f < 100; f++) {
      // 守关层带 1.25 加成，与下一层比较会有回落，故只比同类层
      if ((f + 1) % TOWER.milestoneEvery === 0) continue;
      if (f % TOWER.milestoneEvery === 0) continue;
      expect(towerDifficulty(f + 1)).toBeGreaterThan(towerDifficulty(f));
    }
  });

  it('高层难度明显超过主线基准，低层反而更宽松', () => {
    expect(towerDifficulty(1)).toBeLessThan(0.92);
    expect(towerDifficulty(50)).toBeGreaterThan(1.4);
  });

  it('守关层比相邻普通层更难', () => {
    const guard = TOWER.milestoneEvery;
    expect(towerDifficulty(guard)).toBeGreaterThan(towerDifficulty(guard + 1));
  });

  it('战斗层只回一小口血，守关层才是补给点', () => {
    expect(towerHealPctFor(1)).toBe(TOWER.healPctPerFloor);
    expect(towerHealPctFor(TOWER.milestoneEvery)).toBe(TOWER.healPctPerGuard);
    expect(TOWER.healPctPerGuard).toBeGreaterThan(TOWER.healPctPerFloor * 3);
  });
});

describe('塔币每日上限', () => {
  it('随历史最高层放宽，新号也有保底额度', () => {
    expect(towerDailyBaseCap(0)).toBeGreaterThan(0);
    expect(towerDailyBaseCap(100)).toBeGreaterThan(towerDailyBaseCap(20));
  });
});
