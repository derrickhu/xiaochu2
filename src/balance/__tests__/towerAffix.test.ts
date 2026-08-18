import { describe, expect, it } from 'vitest';
import { resolveTowerAffix, towerAffixSummary } from '@/balance/towerAffix';
import { buildTowerStage } from '@/balance/tower';
import { TOWER_FLOOR_KINDS } from '@/balance/towerPath';

describe('通天塔本层试炼', () => {
  it('寻常道前 7 层没有试炼，8 层起极轻盘面规则', () => {
    expect(resolveTowerAffix(1, 'battle')).toBeNull();
    expect(resolveTowerAffix(7, 'battle')).toBeNull();
    const mid = resolveTowerAffix(8, 'battle');
    expect(mid).not.toBeNull();
    expect(mid?.extraMob).toBeUndefined();
    expect(['seal', 'rock']).toContain(mid?.id);
    const late = resolveTowerAffix(20, 'battle');
    expect(late).not.toBeNull();
    expect(late?.extraMob).toBeUndefined();
  });

  it('险径从第 4 层起必有试炼，前段寻常道仍干净', () => {
    const elite = resolveTowerAffix(5, 'elite');
    const normal = resolveTowerAffix(5, 'battle');
    expect(elite).not.toBeNull();
    expect(normal).toBeNull();
    expect(towerAffixSummary(5, 'elite', TOWER_FLOOR_KINDS.elite.summary)).toContain('试炼：');
  });

  it('同一层同一条路规则稳定，换路会换规则池', () => {
    const a = resolveTowerAffix(24, 'elite');
    const b = resolveTowerAffix(24, 'elite');
    expect(a?.id).toBe(b?.id);
    const guard = resolveTowerAffix(20, 'guard');
    expect(guard).not.toBeNull();
  });

  it('险径关卡会写入 mechanics，前段寻常道同层不会', () => {
    const eliteStage = buildTowerStage(6, {
      difficultyMult: TOWER_FLOOR_KINDS.elite.difficultyMult,
      extraWaves: TOWER_FLOOR_KINDS.elite.extraWaves,
      kind: 'elite',
    });
    const normalStage = buildTowerStage(6, { kind: 'battle' });
    expect(eliteStage.mechanics?.length).toBeGreaterThan(0);
    expect(eliteStage.hintTags?.[0]).toBeTruthy();
    expect(normalStage.mechanics).toBeUndefined();
  });

  it('守关层始终带具名试炼', () => {
    const guard = buildTowerStage(10, {
      extraWaves: TOWER_FLOOR_KINDS.guard.extraWaves,
      kind: 'guard',
    });
    expect(guard.isBoss).toBe(true);
    expect(guard.hintTags?.length).toBeGreaterThan(0);
    expect(guard.mechanics?.length).toBeGreaterThan(0);
  });

  it('闸门怪占用险径已有额外波，不拆成四波', () => {
    const stage = buildTowerStage(28, {
      extraWaves: 1,
      kind: 'elite',
    });
    const affix = resolveTowerAffix(28, 'elite');
    expect(stage.encounters.length).toBe(3);
    if (affix?.extraMob) {
      expect(stage.encounters.some((e) => e.kind === 'mob' && e.id === affix.extraMob)).toBe(true);
    }
  });
});
