/**
 * 前 3 关即时点破：做对了命名规则，打不好再补一句。
 *
 * 同一条知识只出一次（praise / nudge 互斥），一场里同一回合最多一句。
 * 不按关卡号排课——第一版就是关卡一改文案就说谎。
 */
import {
  counterElementOf,
  resistedElementOf,
  type Element,
  type OrbType,
} from '@/balance/combat';
import { ELEMENT_NAME } from '@/balance/ui';
import type { StageDef } from '@/balance/stages';
import { TUTORIAL_FLAGS, type TutorialFlag } from '@/game/tutorialFlags';

/** 连续几手只消 1 组，才认定「没悟连击」 */
export const COMBO_NUDGE_STREAK = 3;
/** 连续几手净消被克色、不消克制色，才认定「没悟克制」 */
export const COUNTER_NUDGE_STREAK = 2;

export type CoachTopic = 'combo' | 'counter' | 'team';
export type CoachKind = 'praise' | 'nudge';

export interface CoachLine {
  topic: CoachTopic;
  kind: CoachKind;
  flag: TutorialFlag;
  text: string;
}

export interface CoachMemory {
  singleStreak: number;
  resistStreak: number;
}

export function emptyCoachMemory(): CoachMemory {
  return { singleStreak: 0, resistStreak: 0 };
}

export const COMBO_PRAISE = '连击了！一次多消几组，伤害更高～';
export const COMBO_NUDGE = '一次多消几组，连击会更疼～';

export function counterPraiseText(enemy: Element): string {
  const mine = ELEMENT_NAME[counterElementOf(enemy)];
  const theirs = ELEMENT_NAME[enemy];
  return `${mine}克${theirs}，这一下更疼！`;
}

export function counterNudgeText(enemy: Element): string {
  const mine = ELEMENT_NAME[counterElementOf(enemy)];
  const theirs = ELEMENT_NAME[enemy];
  return `这怪是${theirs}，消${mine}珠才克它～`;
}

export const TEAM_ORB_TIP = '上阵灵宠的属性，决定你能消哪种珠';

export function teamMissingCounterTip(stageElement: Element): string {
  const mine = ELEMENT_NAME[counterElementOf(stageElement)];
  const theirs = ELEMENT_NAME[stageElement];
  return `这关是${theirs}属性，带上${mine}系灵宠才克得动`;
}

/** 主线第 1 章前 3 关才点破，后面靠关卡自己教 */
export function isCoachStage(stage: { chapter: number; index: number } | null | undefined): boolean {
  return !!stage && stage.chapter === 1 && stage.index <= 3;
}

export interface CoachTurn {
  /** 本手总连击（含天降） */
  combo: number;
  /** 本手消掉的珠色（含心珠） */
  orbs: readonly OrbType[];
  enemyElement: Element;
}

export interface CoachDone {
  combo: boolean;
  counter: boolean;
}

/**
 * 看完一手，决定要不要说话。
 * 优先点破刚发生的好事，其次才是「连续打不好」。
 */
export function nextCoach(
  mem: CoachMemory,
  turn: CoachTurn,
  done: CoachDone,
): { mem: CoachMemory; line: CoachLine | null } {
  const matchedCounter = turn.orbs.includes(counterElementOf(turn.enemyElement));
  const matchedResist = turn.orbs.includes(resistedElementOf(turn.enemyElement));

  const next: CoachMemory = {
    singleStreak: turn.combo <= 1 ? mem.singleStreak + 1 : 0,
    resistStreak: matchedCounter ? 0 : matchedResist ? mem.resistStreak + 1 : 0,
  };

  if (!done.combo && turn.combo >= 2) {
    return { mem: next, line: comboLine('praise') };
  }
  if (!done.counter && matchedCounter) {
    return { mem: next, line: counterLine('praise', turn.enemyElement) };
  }
  if (!done.combo && next.singleStreak >= COMBO_NUDGE_STREAK) {
    return { mem: next, line: comboLine('nudge') };
  }
  if (!done.counter && next.resistStreak >= COUNTER_NUDGE_STREAK) {
    return { mem: next, line: counterLine('nudge', turn.enemyElement) };
  }
  return { mem: next, line: null };
}

function comboLine(kind: CoachKind): CoachLine {
  return {
    topic: 'combo',
    kind,
    flag: TUTORIAL_FLAGS.comboHint,
    text: kind === 'praise' ? COMBO_PRAISE : COMBO_NUDGE,
  };
}

function counterLine(kind: CoachKind, enemy: Element): CoachLine {
  return {
    topic: 'counter',
    kind,
    flag: TUTORIAL_FLAGS.counterHint,
    text: kind === 'praise' ? counterPraiseText(enemy) : counterNudgeText(enemy),
  };
}

/** 编队页：前 3 关说一次珠色规则；缺克制色时改说换队 */
export function teamOrbLine(
  stage: StageDef,
  teamElements: readonly Element[],
): CoachLine | null {
  if (!isCoachStage(stage)) return null;
  const hasCounter = teamElements.includes(counterElementOf(stage.element));
  return {
    topic: 'team',
    kind: hasCounter ? 'praise' : 'nudge',
    flag: TUTORIAL_FLAGS.teamOrb,
    text: hasCounter ? TEAM_ORB_TIP : teamMissingCounterTip(stage.element),
  };
}
