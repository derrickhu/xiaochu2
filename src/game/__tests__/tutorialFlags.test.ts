import { describe, expect, it } from 'vitest';

import { initialData, parseSaveData, SAVE_VERSION } from '@/game/playerSave';
import { TUTORIAL_FLAGS, sanitizeTutorial } from '@/game/tutorialFlags';

describe('新手引导存档', () => {
  it('新号：引导进度为空，长拖示意该出', () => {
    const data = initialData();
    expect(data.tutorial).toEqual({});
    expect(data.tutorial[TUTORIAL_FLAGS.dragHint]).toBeUndefined();
    expect(data.tutorial[TUTORIAL_FLAGS.homeStart]).toBeUndefined();
  });

  it('老档没有 tutorial 字段但有通关记录 → 整体豁免，不能让老玩家重吃 1-1 引导', () => {
    const parsed = parseSaveData({
      version: 7,
      stars: { stage_1_1: 3, stage_2_4: 2 },
    });
    expect(parsed.version).toBe(SAVE_VERSION);
    expect(parsed.tutorial[TUTORIAL_FLAGS.dragHint]).toBe(true);
    expect(parsed.tutorial[TUTORIAL_FLAGS.homeStart]).toBe(true);
    expect(parsed.tutorial[TUTORIAL_FLAGS.comboHint]).toBe(true);
    expect(parsed.tutorial[TUTORIAL_FLAGS.counterHint]).toBe(true);
    expect(parsed.tutorial[TUTORIAL_FLAGS.teamOrb]).toBe(true);
  });

  it('老档没有 tutorial 也没有任何通关记录 → 当新号，照常给引导', () => {
    const parsed = parseSaveData({ version: 7, stars: {} });
    expect(parsed.tutorial).toEqual({});
  });

  it('已完成的 flag 能跨解析保留', () => {
    const parsed = parseSaveData({
      version: SAVE_VERSION,
      stars: {},
      tutorial: { [TUTORIAL_FLAGS.dragHint]: true },
    });
    expect(parsed.tutorial[TUTORIAL_FLAGS.dragHint]).toBe(true);
  });

  it('脏数据清洗：未登记的 key 与非 true 值都丢掉，防存档膨胀', () => {
    const out = sanitizeTutorial(
      { unknownStep: true, [TUTORIAL_FLAGS.dragHint]: 'yes' },
      false,
    );
    expect(out).toEqual({});
  });
});
