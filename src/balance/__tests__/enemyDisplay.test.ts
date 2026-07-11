import { describe, it, expect } from 'vitest';
import { MOBS } from '@/balance/enemies';
import { STAGES } from '@/balance/stages';
import { resolveEncounter } from '@/balance/enemies';
import {
  enemyDisplaySize,
  enemyDisplayTierOf,
  enemySpriteCenterY,
  enemySpriteScale,
  formatEnemyBattleName,
  inferCreatureDisplayTier,
} from '@/balance/enemyDisplay';

describe('敌人表现分级', () => {
  it('杂兵档小于 Boss 档立绘尺寸', () => {
    expect(enemyDisplaySize('mob')).toBeLessThan(enemyDisplaySize('boss'));
    expect(enemyDisplaySize('miniBoss')).toBeLessThan(enemyDisplaySize('boss'));
  });

  it('横图与竖图按高度对齐，视觉体量接近（修复 1-3 火蝠偏小）', () => {
    // 1-1 史莱姆竖图 / 1-3 火蝠横图（真实资源像素）
    const slime = enemySpriteScale(528, 579, 'mob');
    const bat = enemySpriteScale(489, 288, 'mob');
    const slimeH = 579 * slime;
    const batH = 288 * bat;
    // 高度应对齐到同一目标
    expect(slimeH).toBeCloseTo(enemyDisplaySize('mob'), 0);
    expect(batH).toBeCloseTo(enemyDisplaySize('mob'), 0);
    // 旧算法 max 边 contain：火蝠高度只有史莱姆 ~59%
    const oldBatH = 288 * (enemyDisplaySize('mob') / Math.max(489, 288));
    expect(batH).toBeGreaterThan(oldBatH * 1.4);
  });

  it('核心循环杂兵：无技能=杂兵，有技能=精英', () => {
    const slime = MOBS.find((m) => m.id === 'enemy_slime_wood')!;
    const golem = MOBS.find((m) => m.id === 'enemy_golem_earth')!;
    expect(slime.displayTier).toBe('mob');
    expect(golem.displayTier).toBe('elite');
  });

  it('章 Boss 守关魔将=miniBoss', () => {
    const tyrant = MOBS.find((m) => m.id === 'enemy_bamboo_tyrant_wood')!;
    expect(tyrant.displayTier).toBe('miniBoss');
  });

  it('生物怪物面：初=精英，觉=Boss', () => {
    expect(inferCreatureDisplayTier('tier1')).toBe('elite');
    expect(inferCreatureDisplayTier('tier2')).toBe('boss');
  });

  it('战斗名含档位标签', () => {
    const slime = MOBS.find((m) => m.id === 'enemy_slime_wood')!;
    expect(formatEnemyBattleName(slime)).toMatch(/^杂兵 · /);
  });

  it('立绘可按区高 cap，避免顶穿名匾', () => {
    const uncapped = enemySpriteScale(528, 579, 'miniBoss');
    const capped = enemySpriteScale(528, 579, 'miniBoss', 280);
    expect(579 * uncapped).toBeCloseTo(enemyDisplaySize('miniBoss'), 0);
    expect(579 * capped).toBeLessThanOrEqual(280 + 0.01);
  });

  it('立绘中心贴区底，头顶不越过区顶', () => {
    const cy = enemySpriteCenterY(200, 500, 300);
    expect(cy).toBe(500 - 150);
    expect(cy - 150).toBeGreaterThanOrEqual(200 - 0.01);
  });

  it('所有关卡遭遇均有 displayTier', () => {
    for (const stage of STAGES) {
      for (const enc of stage.encounters) {
        const { def } = resolveEncounter(enc);
        expect(enemyDisplayTierOf(def), `${stage.id} ${def.id}`).toBeTruthy();
      }
    }
  });
});
