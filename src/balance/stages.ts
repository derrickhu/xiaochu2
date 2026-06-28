/**
 * 关卡表（纯数据，零逻辑）
 *
 * 52 关 · 8 章 · 每章 Boss 收录 1 只 + 首教 1 种可玩挑战（bossChallenge.ts）。
 */
import type { Element } from './combat';
import type { StageType } from './stageTypes';
import type { EncounterRef } from './enemies';
import { CREATURE_MAP } from './creatures';
import { STARTER_CREATURE_IDS } from './creatures';
import type { Rarity } from './rarity';
import {
  type BossChallengeKind,
  bossChallengeConfig,
  bossChallengeLabel,
  CHAPTER_BOSS_CHALLENGE,
  recipeForChallenge,
} from './bossChallenge';

export type { BossChallengeKind };
export {
  bossChallengeLabel,
  CHAPTER_BOSS_CHALLENGE,
} from './bossChallenge';

export interface StageDef {
  id: string;
  chapter: number;
  index: number;
  name: string;
  element: Element;
  type: StageType;
  dropTableId: string;
  encounters: readonly EncounterRef[];
  difficulty: number;
  isBoss?: boolean;
  starTurnLimit: number;
  mechanics?: readonly string[];
  hintTags?: readonly string[];
  hintText?: string;
}

export const CHAPTER_STAGE_COUNT: Readonly<Record<number, number>> = {
  1: 5, 2: 6, 3: 6, 4: 6, 5: 7, 6: 7, 7: 7, 8: 8,
};

/** 各章 Boss 收录宠期望稀有度（最低 SR；SR → SSR → UR 递进） */
export const CHAPTER_CAPTURE_RARITY: Readonly<Record<number, Rarity>> = {
  1: 2,
  2: 2,
  3: 3,
  4: 4,
  5: 3,
  6: 3,
  7: 4,
  8: 4,
};

/**
 * 各章 Boss 收录宠（定位轮替：输出 → 治疗 → 坦克 → 辅助，循环至终章）。
 * R 档见 DEFAULT_SUMMON_POOL_R_IDS，不进章节收录。
 */
export const CHAPTER_REWARD_PET: Readonly<Record<number, string>> = {
  1: 'pet_017', // SR 输出 · 木
  2: 'pet_004', // SR 治疗 · 木
  3: 'pet_028', // SSR 坦克 · 土
  4: 'pet_014', // UR 辅助 · 金
  5: 'pet_011', // SSR 输出 · 金
  6: 'pet_010', // SSR 治疗 · 土
  7: 'pet_030', // UR 坦克 · 土
  8: 'pet_026', // UR 输出 · 火
};

const mob = (id: string): EncounterRef => ({ kind: 'mob', id });

const creature = (
  id: string,
  tier: 'tier1' | 'tier2',
  captureUnlock?: boolean,
): EncounterRef => ({ kind: 'creature', id, tier, ...(captureUnlock ? { captureUnlock: true } : {}) });

function buildChapterCaptureBoss(opts: {
  id: string;
  chapter: number;
  index: number;
  name: string;
  element: Element;
  dropTableId: string;
  creatureId: string;
  difficulty: number;
  starTurnLimit: number;
  challenge: BossChallengeKind;
}): StageDef {
  const c = CREATURE_MAP.get(opts.creatureId);
  if (!c) throw new Error(`收录 Boss 未知生物: ${opts.creatureId}`);
  const cfg = bossChallengeConfig(opts.challenge, { ruleBanElement: opts.element });
  return {
    id: opts.id,
    chapter: opts.chapter,
    index: opts.index,
    name: opts.name,
    element: opts.element,
    type: 'boss',
    dropTableId: opts.dropTableId,
    encounters: [
      mob(cfg.prepMob),
      creature(opts.creatureId, 'tier1'),
      creature(opts.creatureId, 'tier2', true),
    ],
    difficulty: opts.difficulty,
    isBoss: true,
    starTurnLimit: opts.starTurnLimit,
    mechanics: cfg.mechanics,
    hintTags: cfg.hintTags,
    hintText: cfg.hintText,
  };
}

function fillerStage(opts: {
  id: string;
  chapter: number;
  index: number;
  name: string;
  element: Element;
  type: StageType;
  dropTableId: string;
  difficulty: number;
  starTurnLimit: number;
  challenge: BossChallengeKind;
}): StageDef {
  const r = recipeForChallenge(opts.challenge);
  return {
    id: opts.id,
    chapter: opts.chapter,
    index: opts.index,
    name: opts.name,
    element: opts.element,
    type: opts.type,
    dropTableId: opts.dropTableId,
    encounters: r.encounters,
    difficulty: opts.difficulty,
    starTurnLimit: opts.starTurnLimit,
    mechanics: r.mechanics,
    hintTags: r.hintTags,
    hintText: r.hintText,
  };
}

export function stageWaveCount(stage: StageDef): number {
  return stage.encounters.length;
}

export function chapterBossStage(chapter: number): StageDef | undefined {
  return STAGES.find((s) => s.chapter === chapter && s.isBoss);
}

// ── 第一章（5 关）：铺垫无新挑战 · Boss 教多波 + 收录星辉灵鹿（SR 输出） ──
const CHAPTER_1: readonly StageDef[] = [
  {
    id: 'stage_1_1', chapter: 1, index: 1, name: '青苔林边', element: 'wood',
    type: 'normal', dropTableId: 'dt_forest_metal',
    encounters: [mob('enemy_slime_wood')], difficulty: 1.0, starTurnLimit: 6,
    hintTags: ['新手'], hintText: '熟悉转珠：木怪上场，带金宠更省力',
  },
  {
    id: 'stage_1_2', chapter: 1, index: 2, name: '林间小径', element: 'wood',
    type: 'normal', dropTableId: 'dt_forest_wood',
    encounters: [mob('enemy_slime_wood'), mob('enemy_bat_fire')], difficulty: 1.1, starTurnLimit: 8,
    hintTags: ['两波'], hintText: '两拨敌人，先熟悉换波节奏',
  },
  {
    id: 'stage_1_3', chapter: 1, index: 3, name: '焰蝠洞口', element: 'fire',
    type: 'normal', dropTableId: 'dt_forest_fire',
    encounters: [mob('enemy_bat_fire')], difficulty: 1.15, starTurnLimit: 8,
    hintTags: ['火属性'], hintText: '火怪攻击偏高，带水宠克制',
  },
  {
    id: 'stage_1_4', chapter: 1, index: 4, name: '荆棘丛林', element: 'wood',
    type: 'normal', dropTableId: 'dt_forest_wood',
    encounters: [mob('enemy_slime_wood'), mob('enemy_slime_wood')], difficulty: 1.2, starTurnLimit: 9,
    hintTags: ['木属性'], hintText: '稳扎稳打，为章末试炼留技能',
  },
  buildChapterCaptureBoss({
    id: 'stage_1_5', chapter: 1, index: 5, name: '星辉试炼', element: 'wood',
    dropTableId: 'dt_forest_boss', creatureId: 'pet_017',
    difficulty: 1.45, starTurnLimit: 18, challenge: 'multiWave',
  }),
];

// ── 第二章（6 关）：铺垫复用多波 · Boss 教封印珠 + 收录灵鹿 ──
const CHAPTER_2: readonly StageDef[] = [
  fillerStage({
    id: 'stage_2_1', chapter: 2, index: 1, name: '晶洞入口', element: 'metal',
    type: 'normal', dropTableId: 'dt_cave_normal', difficulty: 1.0, starTurnLimit: 10,
    challenge: 'multiWave',
  }),
  fillerStage({
    id: 'stage_2_2', chapter: 2, index: 2, name: '回音廊道', element: 'water',
    type: 'normal', dropTableId: 'dt_cave_normal', difficulty: 1.05, starTurnLimit: 11,
    challenge: 'multiWave',
  }),
  fillerStage({
    id: 'stage_2_3', chapter: 2, index: 3, name: '晶甲巢穴', element: 'metal',
    type: 'elite', dropTableId: 'dt_cave_elite', difficulty: 1.1, starTurnLimit: 12,
    challenge: 'multiWave',
  }),
  fillerStage({
    id: 'stage_2_4', chapter: 2, index: 4, name: '毒雾深渊', element: 'water',
    type: 'normal', dropTableId: 'dt_cave_normal', difficulty: 1.15, starTurnLimit: 13,
    challenge: 'multiWave',
  }),
  fillerStage({
    id: 'stage_2_5', chapter: 2, index: 5, name: '幽光裂隙', element: 'fire',
    type: 'elite', dropTableId: 'dt_cave_elite', difficulty: 1.2, starTurnLimit: 14,
    challenge: 'multiWave',
  }),
  buildChapterCaptureBoss({
    id: 'stage_2_6', chapter: 2, index: 6, name: '灵鹿试炼', element: 'wood',
    dropTableId: 'dt_cave_boss', creatureId: 'pet_004',
    difficulty: 1.5, starTurnLimit: 20, challenge: 'boardSeal',
  }),
];

// ── 第三章（6 关）：铺垫混多波+封印 · Boss 教高防减伤 + 收录归墟玄龟（SSR 坦克） ──
const CHAPTER_3: readonly StageDef[] = [
  fillerStage({
    id: 'stage_3_1', chapter: 3, index: 1, name: '裂风崖', element: 'fire',
    type: 'normal', dropTableId: 'dt_peak_normal', difficulty: 1.0, starTurnLimit: 13,
    challenge: 'multiWave',
  }),
  fillerStage({
    id: 'stage_3_2', chapter: 3, index: 2, name: '雷鸣回廊', element: 'metal',
    type: 'elite', dropTableId: 'dt_peak_elite', difficulty: 1.1, starTurnLimit: 14,
    challenge: 'boardSeal',
  }),
  fillerStage({
    id: 'stage_3_3', chapter: 3, index: 3, name: '无心祭坛', element: 'water',
    type: 'normal', dropTableId: 'dt_peak_normal', difficulty: 1.15, starTurnLimit: 15,
    challenge: 'multiWave',
  }),
  fillerStage({
    id: 'stage_3_4', chapter: 3, index: 4, name: '绝风险道', element: 'fire',
    type: 'elite', dropTableId: 'dt_peak_elite', difficulty: 1.25, starTurnLimit: 16,
    challenge: 'boardSeal',
  }),
  fillerStage({
    id: 'stage_3_5', chapter: 3, index: 5, name: '焚天台', element: 'fire',
    type: 'elite', dropTableId: 'dt_peak_elite', difficulty: 1.35, starTurnLimit: 17,
    challenge: 'multiWave',
  }),
  buildChapterCaptureBoss({
    id: 'stage_3_6', chapter: 3, index: 6, name: '玄龟试炼', element: 'earth',
    dropTableId: 'dt_peak_boss', creatureId: 'pet_028',
    difficulty: 2.3, starTurnLimit: 24, challenge: 'highDefense',
  }),
];

// ── 历练 4～8 章 ──
interface TrialChapterDef {
  chapter: number;
  name: string;
  stageCount: number;
  difficultyBase: number;
  captureCreatureId: string;
  bossChallenge: BossChallengeKind;
  /** 长度 = stageCount - 1，仅已学挑战 */
  fillerChallenges: readonly BossChallengeKind[];
  fillerNames: readonly string[];
}

const TRIAL_CHAPTERS: readonly TrialChapterDef[] = [
  {
    chapter: 4, name: '历练 · 炽土试炼', stageCount: 6, difficultyBase: 0.9,
    captureCreatureId: 'pet_014', bossChallenge: 'boardRock',
    fillerChallenges: ['multiWave', 'boardSeal', 'highDefense', 'multiWave', 'boardSeal'],
    fillerNames: ['炽土前哨', '熔岩小径', '岩傀儡阵', '焦土深谷', '封印残阵'],
  },
  {
    chapter: 5, name: '历练 · 灵兽秘境', stageCount: 7, difficultyBase: 0.92,
    captureCreatureId: 'pet_011', bossChallenge: 'selfHeal',
    fillerChallenges: ['boardRock', 'highDefense', 'boardSeal', 'multiWave', 'boardRock', 'highDefense'],
    fillerNames: ['秘境入口', '顽石迷阵', '巨像守卫', '灵泉浅滩', '熔岩岔路', '古阵核心'],
  },
  {
    chapter: 6, name: '历练 · 归墟深渊', stageCount: 7, difficultyBase: 0.94,
    captureCreatureId: 'pet_010', bossChallenge: 'chargeHit',
    fillerChallenges: ['selfHeal', 'boardRock', 'highDefense', 'boardSeal', 'selfHeal', 'multiWave'],
    fillerNames: ['深渊上层', '寒潭回响', '晶甲巢穴', '自疗深池', '蓄力试场', '归墟裂隙'],
  },
  {
    chapter: 7, name: '历练 · 星轨之野', stageCount: 7, difficultyBase: 0.96,
    captureCreatureId: 'pet_030', bossChallenge: 'noHeart',
    fillerChallenges: ['chargeHit', 'selfHeal', 'boardRock', 'highDefense', 'boardSeal', 'chargeHit'],
    fillerNames: ['星轨外环', '蓄力星门', '自愈绿洲', '顽石星带', '巨像轨道', '禁心前庭'],
  },
  {
    chapter: 8, name: '历练 · 虚空之巅', stageCount: 8, difficultyBase: 0.98,
    captureCreatureId: 'pet_026', bossChallenge: 'banElement',
    fillerChallenges: ['noHeart', 'chargeHit', 'selfHeal', 'boardRock', 'highDefense', 'boardSeal', 'noHeart'],
    fillerNames: ['虚空门扉', '禁心廊道', '蓄力深渊', '寒潭虚影', '顽石天阶', '封印核心', '封元前厅'],
  },
];

function buildTrialChapter(def: TrialChapterDef): StageDef[] {
  const c = CREATURE_MAP.get(def.captureCreatureId);
  if (!c) throw new Error(`历练章收录宠未知: ${def.captureCreatureId}`);
  const bossIndex = def.stageCount;
  const stages: StageDef[] = [];

  def.fillerChallenges.forEach((ch, i) => {
    const index = i + 1;
    stages.push(fillerStage({
      id: `stage_${def.chapter}_${index}`,
      chapter: def.chapter,
      index,
      name: def.fillerNames[i] ?? `历练 ${index}`,
      element: c.element,
      type: index % 2 === 0 ? 'elite' : 'normal',
      dropTableId: index % 2 === 0 ? 'dt_trial_elite' : 'dt_trial_normal',
      difficulty: def.difficultyBase + i * 0.05,
      starTurnLimit: 14 + def.chapter + i,
      challenge: ch,
    }));
  });

  stages.push(buildChapterCaptureBoss({
    id: `stage_${def.chapter}_${bossIndex}`,
    chapter: def.chapter,
    index: bossIndex,
    name: `${c.name}·试炼`,
    element: c.element,
    dropTableId: `dt_ch${def.chapter}_boss`,
    creatureId: def.captureCreatureId,
    difficulty: def.difficultyBase + def.stageCount * 0.08,
    starTurnLimit: 18 + def.chapter * 2,
    challenge: def.bossChallenge,
  }));

  return stages;
}

const TRIAL_STAGES: readonly StageDef[] = TRIAL_CHAPTERS.flatMap(buildTrialChapter);

export const STAGES: readonly StageDef[] = [
  ...CHAPTER_1, ...CHAPTER_2, ...CHAPTER_3, ...TRIAL_STAGES,
];

export const STAGE_MAP: ReadonlyMap<string, StageDef> = new Map(STAGES.map((s) => [s.id, s]));

export const CHAPTERS: readonly number[] = [...new Set(STAGES.map((s) => s.chapter))].sort((a, b) => a - b);

export function stagesOfChapter(chapter: number): readonly StageDef[] {
  return STAGES.filter((s) => s.chapter === chapter);
}

export const CHAPTER_NAME: Readonly<Record<number, string>> = {
  1: '第一章 · 灵兽森林',
  2: '第二章 · 幽晶溶洞',
  3: '第三章 · 风雷绝巅',
  ...Object.fromEntries(TRIAL_CHAPTERS.map((t) => [t.chapter, `第${t.chapter}章 · ${t.name}`])),
};

/** 旧关卡 id → 新 id（存档星数迁移） */
export const STAGE_STAR_MIGRATION: Readonly<Record<string, string>> = {
  stage_1_8: 'stage_1_5',
  stage_4_5: 'stage_4_6',
  stage_5_5: 'stage_5_7',
  stage_6_5: 'stage_6_7',
  stage_7_5: 'stage_7_7',
  stage_8_2: 'stage_8_8',
};

export { STARTER_CREATURE_IDS };
