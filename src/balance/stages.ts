/**
 * 关卡表（纯数据，零逻辑）
 *
 * 64 关 · 8 章 × 每章固定 8 关 · 每章 Boss 直掉 1 只灵宠（SR/SSR）+ 首教 1 种可玩挑战。
 * 统一关数便于运营与章节地图路径点复用。
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
  1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 8, 7: 8, 8: 8,
};

/** 各章 Boss 掉落宠期望稀有度（仅 SR/SSR；1~2 章 SR，3 章起 SSR；UR 仅抽卡） */
export const CHAPTER_BOSS_DROP_RARITY: Readonly<Record<number, Rarity>> = {
  1: 2,
  2: 2,
  3: 3,
  4: 3,
  5: 3,
  6: 3,
  7: 3,
  8: 3,
};

/** @deprecated 旧名，测试/工具兼容 */
export const CHAPTER_CAPTURE_RARITY = CHAPTER_BOSS_DROP_RARITY;

/**
 * 各章 Boss 直掉灵宠（定位轮替：输出 → 治疗 → 坦克 → 辅助，循环至终章）。
 * R 档见 DEFAULT_SUMMON_POOL_R_IDS；UR 不进 Boss 掉落。
 */
export const CHAPTER_REWARD_PET: Readonly<Record<number, string>> = {
  1: 'pet_017', // SR 输出 · 木
  2: 'pet_004', // SR 治疗 · 木
  3: 'pet_028', // SSR 坦克 · 土
  4: 'pet_025', // SSR 辅助 · 火
  5: 'pet_011', // SSR 输出 · 金
  6: 'pet_010', // SSR 治疗 · 土
  7: 'pet_029', // SSR 辅助 · 土
  8: 'pet_016', // SSR 输出 · 木
};

const mob = (id: string): EncounterRef => ({ kind: 'mob', id });

const creature = (
  id: string,
  tier: 'tier1' | 'tier2',
  bossDrop?: boolean,
): EncounterRef => ({ kind: 'creature', id, tier, ...(bossDrop ? { bossDrop: true } : {}) });

function buildChapterBossDrop(opts: {
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
  if (!c) throw new Error(`Boss 掉落未知生物: ${opts.creatureId}`);
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

// ── 第一章（8 关）：铺垫无新挑战 · Boss 教多波 + 收录星辉灵鹿（SR 输出） ──
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
  {
    id: 'stage_1_5', chapter: 1, index: 5, name: '溪边练手', element: 'wood',
    type: 'normal', dropTableId: 'dt_forest_wood',
    encounters: [mob('enemy_slime_wood'), mob('enemy_bat_fire')], difficulty: 1.22, starTurnLimit: 10,
    hintTags: ['巩固'], hintText: '多练习消除，熟悉心珠回血',
  },
  {
    id: 'stage_1_6', chapter: 1, index: 6, name: '翠影谷', element: 'wood',
    type: 'elite', dropTableId: 'dt_forest_wood',
    encounters: [mob('enemy_slime_wood'), mob('enemy_slime_wood'), mob('enemy_bat_fire')], difficulty: 1.25, starTurnLimit: 11,
    hintTags: ['三波'], hintText: '波次变多，注意保留技能',
  },
  {
    id: 'stage_1_7', chapter: 1, index: 7, name: '林海尽头', element: 'fire',
    type: 'elite', dropTableId: 'dt_forest_fire',
    encounters: [mob('enemy_bat_fire'), mob('enemy_slime_wood')], difficulty: 1.28, starTurnLimit: 12,
    hintTags: ['过渡'], hintText: '章末试炼将至，带齐克制属性',
  },
  buildChapterBossDrop({
    id: 'stage_1_8', chapter: 1, index: 8, name: '星辉试炼', element: 'wood',
    dropTableId: 'dt_forest_boss', creatureId: 'pet_017',
    difficulty: 1.15, starTurnLimit: 18, challenge: 'multiWave',
  }),
];

// ── 第二章（8 关）：铺垫复用多波 · Boss 教封印珠 + 收录灵鹿 ──
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
  fillerStage({
    id: 'stage_2_6', chapter: 2, index: 6, name: '晶髓浅滩', element: 'metal',
    type: 'normal', dropTableId: 'dt_cave_normal', difficulty: 1.22, starTurnLimit: 14,
    challenge: 'multiWave',
  }),
  fillerStage({
    id: 'stage_2_7', chapter: 2, index: 7, name: '溶洞尽头', element: 'water',
    type: 'elite', dropTableId: 'dt_cave_elite', difficulty: 1.25, starTurnLimit: 15,
    challenge: 'multiWave',
  }),
  buildChapterBossDrop({
    id: 'stage_2_8', chapter: 2, index: 8, name: '灵鹿试炼', element: 'wood',
    dropTableId: 'dt_cave_boss', creatureId: 'pet_004',
    difficulty: 1.25, starTurnLimit: 20, challenge: 'boardSeal',
  }),
];

// ── 第三章（8 关）：铺垫混多波+封印 · Boss 教高防减伤 + 收录归墟玄龟（SSR 坦克） ──
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
    id: 'stage_3_3', chapter: 3, index: 3, name: '云心祭坛', element: 'water',
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
    type: 'elite', dropTableId: 'dt_peak_elite', difficulty: 1.3, starTurnLimit: 17,
    challenge: 'multiWave',
  }),
  fillerStage({
    id: 'stage_3_6', chapter: 3, index: 6, name: '风雷栈道', element: 'metal',
    type: 'normal', dropTableId: 'dt_peak_normal', difficulty: 1.32, starTurnLimit: 17,
    challenge: 'boardSeal',
  }),
  fillerStage({
    id: 'stage_3_7', chapter: 3, index: 7, name: '绝巅前厅', element: 'fire',
    type: 'elite', dropTableId: 'dt_peak_elite', difficulty: 1.35, starTurnLimit: 18,
    challenge: 'multiWave',
  }),
  buildChapterBossDrop({
    id: 'stage_3_8', chapter: 3, index: 8, name: '玄龟试炼', element: 'earth',
    dropTableId: 'dt_peak_boss', creatureId: 'pet_028',
    difficulty: 1.25, starTurnLimit: 24, challenge: 'highDefense',
  }),
];

// ── 历练 4～8 章（统一每章 8 关） ──
interface TrialChapterDef {
  chapter: number;
  name: string;
  stageCount: number;
  difficultyBase: number;
  bossDropPetId: string;
  bossChallenge: BossChallengeKind;
  /** 长度 = stageCount - 1，仅已学挑战 */
  fillerChallenges: readonly BossChallengeKind[];
  fillerNames: readonly string[];
}

/**
 * 历练 4～8 章：v0.4.2 上调 difficultyBase（原 0.9~0.98 系统性偏软，
 * 同章节敌人比 1～3 章更「软」）。现与主线同量级起步并逐章加压。
 */
const TRIAL_CHAPTERS: readonly TrialChapterDef[] = [
  {
    chapter: 4, name: '炽土试炼', stageCount: 8, difficultyBase: 1.0,
    bossDropPetId: 'pet_025', bossChallenge: 'boardRock',
    fillerChallenges: ['multiWave', 'boardSeal', 'highDefense', 'multiWave', 'boardSeal', 'highDefense', 'multiWave'],
    fillerNames: ['炽土前哨', '熔岩小径', '岩傀儡阵', '焦土深谷', '封印残阵', '炎纹廊道', '炽石祭坛'],
  },
  {
    chapter: 5, name: '灵兽秘境', stageCount: 8, difficultyBase: 1.02,
    bossDropPetId: 'pet_011', bossChallenge: 'selfHeal',
    fillerChallenges: ['boardRock', 'highDefense', 'boardSeal', 'multiWave', 'boardRock', 'highDefense', 'boardSeal'],
    fillerNames: ['秘境入口', '顽石迷阵', '巨像守卫', '灵泉浅滩', '熔岩岔路', '古阵核心', '秘境深廊'],
  },
  {
    chapter: 6, name: '归墟深渊', stageCount: 8, difficultyBase: 1.04,
    bossDropPetId: 'pet_010', bossChallenge: 'chargeHit',
    fillerChallenges: ['selfHeal', 'boardRock', 'highDefense', 'boardSeal', 'selfHeal', 'multiWave', 'boardRock'],
    fillerNames: ['深渊上层', '寒潭回响', '晶甲巢穴', '自疗深池', '蓄力试场', '归墟裂隙', '深渊前厅'],
  },
  {
    chapter: 7, name: '星轨之野', stageCount: 8, difficultyBase: 1.06,
    bossDropPetId: 'pet_029', bossChallenge: 'noHeart',
    fillerChallenges: ['chargeHit', 'selfHeal', 'boardRock', 'highDefense', 'boardSeal', 'chargeHit', 'selfHeal'],
    fillerNames: ['星轨外环', '蓄力星门', '自愈绿洲', '顽石星带', '巨像轨道', '禁心前庭', '星轨内环'],
  },
  {
    chapter: 8, name: '虚空之巅', stageCount: 8, difficultyBase: 1.08,
    bossDropPetId: 'pet_016', bossChallenge: 'banElement',
    fillerChallenges: ['noHeart', 'chargeHit', 'selfHeal', 'boardRock', 'highDefense', 'boardSeal', 'noHeart'],
    fillerNames: ['虚空门扉', '禁心廊道', '蓄力深渊', '寒潭虚影', '顽石天阶', '封印核心', '封元前厅'],
  },
];

function buildTrialChapter(def: TrialChapterDef): StageDef[] {
  const c = CREATURE_MAP.get(def.bossDropPetId);
  if (!c) throw new Error(`历练章 Boss 掉落宠未知: ${def.bossDropPetId}`);
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

  stages.push(buildChapterBossDrop({
    id: `stage_${def.chapter}_${bossIndex}`,
    chapter: def.chapter,
    index: bossIndex,
    name: `${c.name}·试炼`,
    element: c.element,
    dropTableId: `dt_ch${def.chapter}_boss`,
    creatureId: def.bossDropPetId,
    // Boss 难度只比末位铺垫关高一档（+0.05×章关数）；总量断崖由 powerBudget 护栏兜底
    // v0.4.2 曾试 *0.06，第 7 章 noHeart Boss 中手 6 回合暴毙，回退 *0.05
    difficulty: def.difficultyBase + def.stageCount * 0.05,
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

/** 短标签：1-1 青苔林边（编队 / 战斗顶栏） */
export function formatStageShortLabel(stage: Pick<StageDef, 'chapter' | 'index' | 'name'>): string {
  return `${stage.chapter}-${stage.index} ${stage.name}`;
}

/** 战斗顶栏：章节关卡号 + 名称，Boss 关附加标记 */
export function formatStageBattleHeader(stage: StageDef): string {
  const base = formatStageShortLabel(stage);
  return stage.isBoss ? `${base} · BOSS` : base;
}

export const CHAPTER_NAME: Readonly<Record<number, string>> = {
  1: '第一章 · 灵兽森林',
  2: '第二章 · 幽晶溶洞',
  3: '第三章 · 风雷绝巅',
  ...Object.fromEntries(TRIAL_CHAPTERS.map((t) => [t.chapter, `第${t.chapter}章 · ${t.name}`])),
};

/** 旧关卡 id → 新 id（存档星数迁移；Boss 关统一迁到第 8 关） */
export const STAGE_STAR_MIGRATION: Readonly<Record<string, string>> = {
  stage_1_5: 'stage_1_8',
  stage_2_6: 'stage_2_8',
  stage_3_6: 'stage_3_8',
  stage_4_6: 'stage_4_8',
  stage_5_7: 'stage_5_8',
  stage_6_7: 'stage_6_8',
  stage_7_7: 'stage_7_8',
};

export { STARTER_CREATURE_IDS };
