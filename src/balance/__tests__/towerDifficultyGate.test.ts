/**
 * 通天塔难度门禁：塔必须比同进度主线更硬，且不许再出现「1 级摸到 28 层」。
 */
import { describe, expect, it } from 'vitest';
import { TOWER_WALL } from '@/balance/difficultyBudget';
import {
  auditTowerDifficulty,
  formatTowerDifficultyReport,
} from '@/formulas/towerDifficultyAudit';

const report = auditTowerDifficulty();
const summary = (): string => `\n${formatTowerDifficultyReport(report)}\n`;

describe('通天塔难度门禁', () => {
  it('塔墙护栏全部满足', () => {
    expect(report.violations, summary()).toEqual([]);
  });

  it('Lv1★1 高手必须在 F20 守关前撞墙', () => {
    expect(report.lv1.high, summary()).toBeLessThanOrEqual(TOWER_WALL.lv1HighMaxDepth);
    expect(report.lv1.mid, summary()).toBeLessThanOrEqual(TOWER_WALL.lv1MidMaxDepth);
  });

  it('章节锚点中手深度受控，塔比同进度主线更硬', () => {
    const wall = report.violations.filter((v) => v.rule === 'towerChapterWall');
    expect(wall, summary()).toEqual([]);
  });

  it('非守关层没有软段', () => {
    const soft = report.violations.filter((v) => v.rule === 'towerSoftFloor');
    expect(soft, summary()).toEqual([]);
  });
});
