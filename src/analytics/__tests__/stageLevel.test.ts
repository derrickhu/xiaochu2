import { describe, it, expect } from 'vitest';
import { stageLevelId } from '@/analytics/stageLevel';

describe('stageLevelId', () => {
  it('按 STAGES 顺序返回 1 起的 level_id', () => {
    expect(stageLevelId('stage_1_1')).toBe(1);
    expect(stageLevelId('stage_1_2')).toBe(2);
    expect(stageLevelId('unknown')).toBe(0);
  });
});
