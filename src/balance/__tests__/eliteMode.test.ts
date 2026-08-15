import { describe, expect, it } from 'vitest';
import { STAGES, formatStageBattleHeader } from '@/balance/stages';
import {
  buildEliteStage,
  eliteStageIdOf,
  nextUnlockedEliteStage,
} from '@/balance/eliteMode';

describe('nextUnlockedEliteStage', () => {
  const s1 = STAGES.find((s) => s.chapter === 1 && s.index === 1)!;
  const s2 = STAGES.find((s) => s.chapter === 1 && s.index === 2)!;
  const s7 = STAGES.find((s) => s.chapter === 1 && s.index === 7)!;

  it('下一关已三星则连到该关精英', () => {
    const elite = buildEliteStage(s1);
    const starsOf = (id: string) => (id === s2.id ? 3 : 0);
    expect(nextUnlockedEliteStage(elite.id, starsOf)?.id).toBe(eliteStageIdOf(s2.id));
  });

  it('下一关未三星则没有下一关', () => {
    const elite = buildEliteStage(s1);
    expect(nextUnlockedEliteStage(elite.id, () => 0)).toBeUndefined();
  });

  it('下一关是 Boss 则没有精英下一关', () => {
    const elite = buildEliteStage(s7);
    const starsOf = () => 3;
    expect(nextUnlockedEliteStage(elite.id, starsOf)).toBeUndefined();
  });
});

describe('formatStageBattleHeader', () => {
  it('精英关也带章节关卡号', () => {
    const base = STAGES.find((s) => s.id === 'stage_1_3')!;
    const elite = buildEliteStage(base);
    expect(formatStageBattleHeader(elite)).toBe('1-3 焰蝠洞口 · 精英');
  });
});
