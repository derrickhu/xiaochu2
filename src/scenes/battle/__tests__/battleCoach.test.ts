import { describe, expect, it } from 'vitest';

import { counterElementOf } from '@/balance/combat';
import { STAGES } from '@/balance/stages';
import { TUTORIAL_FLAGS } from '@/game/tutorialFlags';
import {
  COMBO_NUDGE,
  COMBO_NUDGE_STREAK,
  COMBO_PRAISE,
  COUNTER_NUDGE_STREAK,
  TEAM_ORB_TIP,
  counterNudgeText,
  counterPraiseText,
  emptyCoachMemory,
  isCoachStage,
  nextCoach,
  teamMissingCounterTip,
  teamOrbLine,
} from '@/scenes/battle/battleCoach';

const doneNone = { combo: false, counter: false };
const doneAll = { combo: true, counter: true };

describe('局内点破', () => {
  it('只盯主线前 3 关', () => {
    expect(isCoachStage({ chapter: 1, index: 1 })).toBe(true);
    expect(isCoachStage({ chapter: 1, index: 3 })).toBe(true);
    expect(isCoachStage({ chapter: 1, index: 4 })).toBe(false);
    expect(isCoachStage({ chapter: 2, index: 1 })).toBe(false);
  });

  it('第一次打出 2 连：点破连击，不走连续失败那条', () => {
    const { line, mem } = nextCoach(
      emptyCoachMemory(),
      { combo: 2, orbs: ['wood', 'fire'], enemyElement: 'wood' },
      doneNone,
    );
    expect(line?.flag).toBe(TUTORIAL_FLAGS.comboHint);
    expect(line?.kind).toBe('praise');
    expect(line?.text).toBe(COMBO_PRAISE);
    expect(mem.singleStreak).toBe(0);
  });

  it('连续只消 1 组才补连击；第 2 手还不出', () => {
    let mem = emptyCoachMemory();
    let line = null;
    for (let i = 0; i < COMBO_NUDGE_STREAK - 1; i++) {
      const r = nextCoach(mem, { combo: 1, orbs: ['wood'], enemyElement: 'wood' }, doneNone);
      mem = r.mem;
      line = r.line;
    }
    expect(line).toBeNull();
    const last = nextCoach(mem, { combo: 1, orbs: ['wood'], enemyElement: 'wood' }, doneNone);
    expect(last.line?.kind).toBe('nudge');
    expect(last.line?.text).toBe(COMBO_NUDGE);
  });

  it('中途打出连击会清掉单消计数', () => {
    const afterTwo = nextCoach(
      { singleStreak: 2, resistStreak: 0 },
      { combo: 3, orbs: ['wood', 'fire', 'heart'], enemyElement: 'wood' },
      doneNone,
    );
    expect(afterTwo.mem.singleStreak).toBe(0);
    expect(afterTwo.line?.kind).toBe('praise');
  });

  it('第一次消到克制色：点破克制', () => {
    const enemy = 'fire';
    const { line } = nextCoach(
      emptyCoachMemory(),
      { combo: 1, orbs: [counterElementOf(enemy)], enemyElement: enemy },
      doneNone,
    );
    expect(line?.flag).toBe(TUTORIAL_FLAGS.counterHint);
    expect(line?.kind).toBe('praise');
    expect(line?.text).toBe(counterPraiseText(enemy));
  });

  it('连续消被克色才补克制；消到克制色会清计数', () => {
    const enemy = 'fire';
    const resist = 'metal'; // 火克金
    let mem = emptyCoachMemory();
    const first = nextCoach(mem, { combo: 1, orbs: [resist], enemyElement: enemy }, doneNone);
    expect(first.line).toBeNull();
    expect(first.mem.resistStreak).toBe(1);
    const second = nextCoach(first.mem, { combo: 1, orbs: [resist], enemyElement: enemy }, doneNone);
    expect(COUNTER_NUDGE_STREAK).toBe(2);
    expect(second.line?.kind).toBe('nudge');
    expect(second.line?.text).toBe(counterNudgeText(enemy));

    const reset = nextCoach(
      { singleStreak: 0, resistStreak: 1 },
      { combo: 1, orbs: [counterElementOf(enemy)], enemyElement: enemy },
      { combo: true, counter: false },
    );
    expect(reset.mem.resistStreak).toBe(0);
    expect(reset.line?.kind).toBe('praise');
  });

  it('已点破的知识不再说；同一手优先庆祝连击', () => {
    const silent = nextCoach(
      emptyCoachMemory(),
      { combo: 3, orbs: ['water'], enemyElement: 'fire' },
      doneAll,
    );
    expect(silent.line).toBeNull();

    const both = nextCoach(
      emptyCoachMemory(),
      { combo: 2, orbs: ['water', 'wood'], enemyElement: 'fire' },
      doneNone,
    );
    expect(both.line?.topic).toBe('combo');
  });

  it('文案不含相对进度词', () => {
    const banned = ['本章', '最后一关', '章末', '还剩', '终章'];
    const texts = [
      COMBO_PRAISE,
      COMBO_NUDGE,
      counterPraiseText('fire'),
      counterNudgeText('water'),
      TEAM_ORB_TIP,
      teamMissingCounterTip('wood'),
    ];
    for (const t of texts) {
      for (const word of banned) expect(t).not.toContain(word);
    }
  });
});

describe('编队页点破', () => {
  it('默认队五行齐全：只说珠色规则', () => {
    const stage = STAGES.find((s) => s.id === 'stage_1_1')!;
    const line = teamOrbLine(stage, ['metal', 'wood', 'water', 'fire', 'earth']);
    expect(line?.flag).toBe(TUTORIAL_FLAGS.teamOrb);
    expect(line?.text).toBe(TEAM_ORB_TIP);
  });

  it('缺克制色：改口换成队', () => {
    const stage = STAGES.find((s) => s.id === 'stage_1_3')!;
    expect(stage.element).toBe('fire');
    const line = teamOrbLine(stage, ['wood', 'fire', 'earth']);
    expect(line?.text).toBe(teamMissingCounterTip('fire'));
    expect(line?.text).toContain('水');
  });

  it('第 4 关不再说', () => {
    const stage = STAGES.find((s) => s.id === 'stage_1_4')!;
    expect(teamOrbLine(stage, ['metal'])).toBeNull();
  });
});
