import { describe, expect, it } from 'vitest';
import {
  chapterMapProgressIndex,
  resolveHomeDisplay,
  walkHomeStage,
} from '@/balance/chapterMap';
import { nextMainlineStage, stagesOfChapter, STAGES, CHAPTERS } from '@/balance/stages';

describe('nextMainlineStage', () => {
  it('章内推进到下一关', () => {
    const s1 = STAGES.find((s) => s.chapter === 1 && s.index === 1)!;
    const s2 = STAGES.find((s) => s.chapter === 1 && s.index === 2)!;
    expect(nextMainlineStage(s1.id)?.id).toBe(s2.id);
  });

  it('章末 Boss 跨到下一章第 1 关', () => {
    const boss = STAGES.find((s) => s.chapter === 1 && s.isBoss)!;
    const next = nextMainlineStage(boss.id);
    expect(next?.chapter).toBe(2);
    expect(next?.index).toBe(1);
  });
});

describe('resolveHomeDisplay', () => {
  const ch1 = stagesOfChapter(1);
  const makeStars = (clearedIds: Set<string>) => (id: string) => (clearedIds.has(id) ? 3 : 0);
  const unlockByStars = (starsOf: (id: string) => number) => (stage: typeof STAGES[number]) => {
    if (stage.index === 1) {
      if (stage.chapter === 1) return true;
      const prevBoss = STAGES.find((s) => s.chapter === stage.chapter - 1 && s.isBoss);
      return prevBoss ? starsOf(prevBoss.id) > 0 : true;
    }
    const prev = STAGES.find((s) => s.chapter === stage.chapter && s.index === stage.index - 1);
    return prev ? starsOf(prev.id) > 0 : false;
  };

  const base = {
    latestUnlocked: 1,
    chapters: CHAPTERS,
    isChapterUnlocked: (ch: number) => ch <= 1,
    stagesOfChapter,
  };

  it('章内未通完时停在记住的章，并高亮下一关', () => {
    const cleared = new Set(ch1.filter((s) => s.index <= 7).map((s) => s.id));
    const starsOf = makeStars(cleared);
    const isUnlocked = unlockByStars(starsOf);
    const display = resolveHomeDisplay({
      ...base,
      rememberedChapter: 1,
      rememberedStageId: '',
      starsOf,
      isUnlocked,
    });
    expect(display.chapter).toBe(1);
    expect(chapterMapProgressIndex(ch1, starsOf, isUnlocked)).toBe(7);
    expect(display.stageId).toBe(ch1[7].id);
  });

  it('选过关且已打过 → 落到下一关', () => {
    const s3 = ch1.find((s) => s.index === 3)!;
    const s4 = ch1.find((s) => s.index === 4)!;
    const cleared = new Set(ch1.filter((s) => s.index <= 3).map((s) => s.id));
    const starsOf = makeStars(cleared);
    const isUnlocked = unlockByStars(starsOf);
    const display = resolveHomeDisplay({
      ...base,
      rememberedChapter: 1,
      rememberedStageId: s3.id,
      starsOf,
      isUnlocked,
    });
    expect(display.chapter).toBe(1);
    expect(display.stageId).toBe(s4.id);
  });

  it('打完第 1 章 Boss 后仍停在第 1 章，不跳到进度章', () => {
    const boss = ch1.find((s) => s.isBoss)!;
    const cleared = new Set(ch1.map((s) => s.id));
    const starsOf = makeStars(cleared);
    const isUnlocked = unlockByStars(starsOf);
    const display = resolveHomeDisplay({
      rememberedChapter: 1,
      rememberedStageId: boss.id,
      latestUnlocked: 2,
      chapters: CHAPTERS,
      isChapterUnlocked: (ch) => ch <= 2,
      stagesOfChapter,
      starsOf,
      isUnlocked,
    });
    expect(display.chapter).toBe(1);
    expect(display.stageId).toBeNull();
  });

  it('只切章浏览已通完的章，回主页仍停在该章', () => {
    const cleared = new Set(ch1.map((s) => s.id));
    const starsOf = makeStars(cleared);
    const isUnlocked = unlockByStars(starsOf);
    const display = resolveHomeDisplay({
      rememberedChapter: 1,
      rememberedStageId: '',
      latestUnlocked: 2,
      chapters: CHAPTERS,
      isChapterUnlocked: (ch) => ch <= 2,
      stagesOfChapter,
      starsOf,
      isUnlocked,
    });
    expect(display.chapter).toBe(1);
    expect(display.stageId).toBeNull();
  });

  it('显式 preferred 优先于记住的章', () => {
    const cleared = new Set(ch1.map((s) => s.id));
    const starsOf = makeStars(cleared);
    const isUnlocked = unlockByStars(starsOf);
    const display = resolveHomeDisplay({
      preferred: 1,
      rememberedChapter: 2,
      rememberedStageId: '',
      latestUnlocked: 2,
      chapters: CHAPTERS,
      isChapterUnlocked: (ch) => ch <= 2,
      stagesOfChapter,
      starsOf,
      isUnlocked,
    });
    expect(display.chapter).toBe(1);
  });
});

describe('walkHomeStage', () => {
  it('未通关停在本关', () => {
    const s2 = STAGES.find((s) => s.chapter === 1 && s.index === 2)!;
    expect(walkHomeStage(s2.id, () => 0, () => true)?.id).toBe(s2.id);
  });

  it('已通关走到下一关', () => {
    const s2 = STAGES.find((s) => s.chapter === 1 && s.index === 2)!;
    const s3 = STAGES.find((s) => s.chapter === 1 && s.index === 3)!;
    const starsOf = (id: string) => (id === s2.id ? 3 : 0);
    expect(walkHomeStage(s2.id, starsOf, () => true)?.id).toBe(s3.id);
  });

  it('章末已通关不跨到下一章', () => {
    const boss = STAGES.find((s) => s.chapter === 1 && s.isBoss)!;
    const starsOf = () => 3;
    expect(walkHomeStage(boss.id, starsOf, () => true, 1)?.chapter).toBe(1);
  });
});
