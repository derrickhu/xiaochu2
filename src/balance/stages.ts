/**
 * 关卡表（纯数据，零逻辑）
 *
 * 128 关 · 16 章 × 每章固定 8 关 · 每章 Boss 直掉 1 只灵宠（SR/SSR）+ 首教 1 种可玩挑战。
 * 统一关数便于运营与章节地图路径点复用。
 */
import type { Element } from './combat';
import type { StageType } from './stageTypes';
import type { EncounterRef } from './enemies';
import { CREATURE_MAP } from './creatures';
import { STARTER_CREATURE_IDS } from './creatures';
import { LATE_CHAPTER_BOSS_PETS } from './creatureRoster';
import type { Rarity } from './rarity';
import {
  type BossChallengeKind,
  bossChallengeConfig,
  bossChallengeLabel,
  CHAPTER_BOSS_CHALLENGE,
  recipeForChallenge,
} from './bossChallenge';
import { applyGateLayer } from './stageGates';
import { starTurnLimitFor } from './powerBudget';

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
  /**
   * 展示名覆盖（副玩法关卡用）。秘境/通天塔的 chapter 只是数值缩放输入（允许小数），
   * 直接按 `章-关` 渲染会漏出配平参数，故由此字段接管顶栏与编队标题。
   */
  displayLabel?: string;
}

/** 主线总章数（16 章 × 8 关 = 128 关） */
export const MAIN_CHAPTER_COUNT = 16;

export const CHAPTER_STAGE_COUNT: Readonly<Record<number, number>> = Object.fromEntries(
  Array.from({ length: MAIN_CHAPTER_COUNT }, (_, i) => [i + 1, 8]),
);

/** 各章 Boss 掉落宠期望稀有度（仅 SR/SSR；1~2 章 SR，3 章起 SSR；UR 仅抽卡） */
export const CHAPTER_BOSS_DROP_RARITY: Readonly<Record<number, Rarity>> = Object.fromEntries(
  Array.from({ length: MAIN_CHAPTER_COUNT }, (_, i) => [i + 1, i + 1 <= 2 ? 2 : 3]),
);

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
  // 第 9~16 章从量产名录取（排布理由见 creatureRoster.LATE_CHAPTER_BOSS_PETS）
  ...LATE_CHAPTER_BOSS_PETS,
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
  challenge: BossChallengeKind;
}): StageDef {
  const c = CREATURE_MAP.get(opts.creatureId);
  if (!c) throw new Error(`Boss 掉落未知生物: ${opts.creatureId}`);
  const cfg = bossChallengeConfig(opts.challenge, { ruleBanElement: opts.element });
  // 初级形态预告技能 → 高级形态完整挑战；不再插 prep 热身波凑三波
  const waves = 2;
  return {
    id: opts.id,
    chapter: opts.chapter,
    index: opts.index,
    name: opts.name,
    element: opts.element,
    type: 'boss',
    dropTableId: opts.dropTableId,
    encounters: [
      creature(opts.creatureId, 'tier1'),
      creature(opts.creatureId, 'tier2', true),
    ],
    difficulty: opts.difficulty,
    isBoss: true,
    // 星线跟着 TTK 目标带走，不再逐关手填（见 powerBudget.starTurnLimitFor）
    starTurnLimit: starTurnLimitFor('boss', false, waves),
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
  challenge: BossChallengeKind;
  /** 怪物组合变体；同一挑战在不同关卡换组，避免整章刷同两只怪 */
  variant?: number;
}): StageDef {
  const r = recipeForChallenge(opts.challenge, opts.variant ?? 0);
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
    starTurnLimit: starTurnLimitFor(opts.type, false, r.encounters.length),
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

/**
 * 第一章是全项目唯一手写遭遇的一章（教学关要逐关控制节奏，不走配方）。
 * 星线仍统一由 TTK 目标带推出，避免这一章成为唯一还在手填星线的例外。
 */
function withDerivedStarLimit(stage: Omit<StageDef, 'starTurnLimit'>): StageDef {
  return {
    ...stage,
    starTurnLimit: starTurnLimitFor(stage.type, false, stage.encounters.length),
  };
}

/*
 * ── 第一章（8 关）──
 * 前段认盘面与克制 → 中后段预告攻压/战中封珠 → Boss 教蓄力+狂暴并收录星辉灵鹿。
 * 铺垫一律 normal（精英模式另开）；完整「封印珠」盘面留给第 2 章首教。
 */
const CHAPTER_1: readonly StageDef[] = ([
  {
    id: 'stage_1_1', chapter: 1, index: 1, name: '青苔林边', element: 'wood',
    type: 'normal', dropTableId: 'dt_forest_metal',
    encounters: [mob('enemy_slime_wood')], difficulty: 1.0,
    hintTags: ['新手'], hintText: '熟悉转珠：木怪上场，带金宠更省力',
  },
  {
    id: 'stage_1_2', chapter: 1, index: 2, name: '林间小径', element: 'wood',
    type: 'normal', dropTableId: 'dt_forest_wood',
    encounters: [mob('enemy_slime_wood'), mob('enemy_bat_fire')], difficulty: 1.1,
    hintTags: ['两波'], hintText: '两拨敌人，先熟悉换波节奏',
  },
  {
    id: 'stage_1_3', chapter: 1, index: 3, name: '焰蝠洞口', element: 'fire',
    type: 'normal', dropTableId: 'dt_forest_fire',
    encounters: [mob('enemy_bat_fire')], difficulty: 1.15,
    hintTags: ['高攻'], hintText: '火蝠攻击偏高：带水宠克制，留意回血',
  },
  {
    id: 'stage_1_4', chapter: 1, index: 4, name: '荆棘丛林', element: 'wood',
    type: 'normal', dropTableId: 'dt_forest_wood',
    encounters: [mob('enemy_slime_wood'), mob('enemy_moss_sprite_wood')], difficulty: 1.2,
    hintTags: ['战中封珠'], hintText: '木灵会封珠：先消相邻珠解封，再输出',
  },
  {
    id: 'stage_1_5', chapter: 1, index: 5, name: '溪边练手', element: 'wood',
    type: 'normal', dropTableId: 'dt_forest_wood',
    encounters: [mob('enemy_bat_fire'), mob('enemy_cinder_imp_fire')], difficulty: 1.22,
    hintTags: ['高攻', '压时'], hintText: '双火压血线：备好治疗，转珠别拖',
  },
  {
    id: 'stage_1_6', chapter: 1, index: 6, name: '翠影谷', element: 'wood',
    type: 'normal', dropTableId: 'dt_forest_wood',
    encounters: [mob('enemy_moss_sprite_wood'), mob('enemy_bat_fire')], difficulty: 1.25,
    hintTags: ['封珠', '狂暴'], hintText: '封珠 + 火蝠狂暴：解封要快，残血别磨',
  },
  {
    id: 'stage_1_7', chapter: 1, index: 7, name: '林海尽头', element: 'fire',
    type: 'normal', dropTableId: 'dt_forest_fire',
    encounters: [mob('enemy_cinder_imp_fire'), mob('enemy_moss_sprite_wood')], difficulty: 1.28,
    hintTags: ['蓄力预告'], hintText: '首领战将见蓄力重击：护盾/治疗留一手',
  },
  buildChapterBossDrop({
    id: 'stage_1_8', chapter: 1, index: 8, name: '星辉试炼', element: 'wood',
    dropTableId: 'dt_forest_boss', creatureId: 'pet_017',
    difficulty: 1.15, challenge: 'multiWave',
  }),
] satisfies readonly Omit<StageDef, 'starTurnLimit'>[]).map(withDerivedStarLimit);

/*
 * ── 第二章（8 关）──
 * 章中预告封印珠，Boss 给完整版（盘面封印 + 本体自愈/削攻）。
 */
const CHAPTER_2: readonly StageDef[] = [
  fillerStage({
    id: 'stage_2_1', chapter: 2, index: 1, name: '晶洞入口', element: 'metal',
    type: 'normal', dropTableId: 'dt_cave_normal', difficulty: 1.0,
    challenge: 'multiWave', variant: 0,
  }),
  fillerStage({
    id: 'stage_2_2', chapter: 2, index: 2, name: '回音廊道', element: 'water',
    type: 'normal', dropTableId: 'dt_cave_normal', difficulty: 1.05,
    challenge: 'multiWave', variant: 1,
  }),
  // 章中预告封印珠（Boss 给完整版）；铺垫保持 normal，精英模式另开
  fillerStage({
    id: 'stage_2_3', chapter: 2, index: 3, name: '晶甲巢穴', element: 'metal',
    type: 'normal', dropTableId: 'dt_cave_normal', difficulty: 1.1,
    challenge: 'boardSeal', variant: 0,
  }),
  fillerStage({
    id: 'stage_2_4', chapter: 2, index: 4, name: '毒雾深渊', element: 'water',
    type: 'normal', dropTableId: 'dt_cave_normal', difficulty: 1.15,
    challenge: 'multiWave', variant: 2,
  }),
  fillerStage({
    id: 'stage_2_5', chapter: 2, index: 5, name: '幽光裂隙', element: 'fire',
    type: 'normal', dropTableId: 'dt_cave_normal', difficulty: 1.2,
    challenge: 'boardSeal', variant: 1,
  }),
  fillerStage({
    id: 'stage_2_6', chapter: 2, index: 6, name: '晶髓浅滩', element: 'metal',
    type: 'normal', dropTableId: 'dt_cave_normal', difficulty: 1.22,
    challenge: 'multiWave', variant: 3,
  }),
  fillerStage({
    id: 'stage_2_7', chapter: 2, index: 7, name: '溶洞尽头', element: 'water',
    type: 'normal', dropTableId: 'dt_cave_normal', difficulty: 1.25,
    challenge: 'boardSeal', variant: 2,
  }),
  buildChapterBossDrop({
    id: 'stage_2_8', chapter: 2, index: 8, name: '灵鹿试炼', element: 'wood',
    dropTableId: 'dt_cave_boss', creatureId: 'pet_004',
    difficulty: 1.25, challenge: 'boardSeal',
  }),
];

// ── 第三章（8 关）：铺垫混多波+封印 · Boss 教高防减伤 + 收录归墟玄龟（SSR 坦克） ──
const CHAPTER_3: readonly StageDef[] = [
  fillerStage({
    id: 'stage_3_1', chapter: 3, index: 1, name: '裂风崖', element: 'fire',
    type: 'normal', dropTableId: 'dt_peak_normal', difficulty: 1.0,
    challenge: 'multiWave', variant: 2,
  }),
  fillerStage({
    id: 'stage_3_2', chapter: 3, index: 2, name: '雷鸣回廊', element: 'metal',
    type: 'normal', dropTableId: 'dt_peak_normal', difficulty: 1.1,
    challenge: 'boardSeal', variant: 0,
  }),
  fillerStage({
    id: 'stage_3_3', chapter: 3, index: 3, name: '云心祭坛', element: 'water',
    type: 'normal', dropTableId: 'dt_peak_normal', difficulty: 1.15,
    challenge: 'multiWave', variant: 3,
  }),
  fillerStage({
    id: 'stage_3_4', chapter: 3, index: 4, name: '绝风险道', element: 'fire',
    type: 'normal', dropTableId: 'dt_peak_normal', difficulty: 1.25,
    challenge: 'boardSeal', variant: 1,
  }),
  fillerStage({
    id: 'stage_3_5', chapter: 3, index: 5, name: '焚天台', element: 'fire',
    type: 'normal', dropTableId: 'dt_peak_normal', difficulty: 1.3,
    challenge: 'multiWave', variant: 4,
  }),
  fillerStage({
    id: 'stage_3_6', chapter: 3, index: 6, name: '风雷栈道', element: 'metal',
    type: 'normal', dropTableId: 'dt_peak_normal', difficulty: 1.32,
    challenge: 'boardSeal', variant: 2,
  }),
  // 章末前预告高防，Boss 给完整免控版
  fillerStage({
    id: 'stage_3_7', chapter: 3, index: 7, name: '绝巅前厅', element: 'fire',
    type: 'normal', dropTableId: 'dt_peak_normal', difficulty: 1.35,
    challenge: 'highDefense', variant: 0,
  }),
  buildChapterBossDrop({
    id: 'stage_3_8', chapter: 3, index: 8, name: '玄龟试炼', element: 'earth',
    dropTableId: 'dt_peak_boss', creatureId: 'pet_028',
    difficulty: 1.25, challenge: 'highDefense',
  }),
];

// ── 历练 4～16 章（统一每章 8 关，声明式生成） ──
interface TrialChapterDef {
  chapter: number;
  name: string;
  stageCount: number;
  difficultyBase: number;
  bossDropPetId: string;
  bossChallenge: BossChallengeKind;
  /**
   * 长度 = stageCount - 1。可含本章即将首教的轻量预告。
   *
   * 末位是「临门验队关」：须挑够重的 archetype，否则 Boss 首波相对前一关断崖。
   * 铺垫关 type 一律 normal；精英难度由进关「精英模式」提供。
   */
  fillerChallenges: readonly BossChallengeKind[];
  fillerNames: readonly string[];
}

/**
 * 历练 4～8 章：v0.4.2 上调 difficultyBase（原 0.9~0.98 系统性偏软，
 * 同章节敌人比 1～3 章更「软」）。现与主线同量级起步并逐章加压。
 *
 * v0.7 再抬一档（1.00~1.08 → 1.14~1.22）。难度审计显示章节**开场关**普遍被中手
 * 2 回合秒推：章内爬坡是 +0.05/关，起点定在 1.0 就意味着每章开头都要重新软一次，
 * 而玩家的养成是连续的，并不会在换章时倒退。抬高起点后开场关也能跑满
 * 「敌人出手 → 玩家调整 → 收尾」这个最小循环。
 */
const TRIAL_CHAPTERS: readonly TrialChapterDef[] = [
  {
    chapter: 4, name: '炽土试炼', stageCount: 8, difficultyBase: 1.22,
    bossDropPetId: 'pet_025', bossChallenge: 'boardRock',
    // 6 号位预告顽石；末位高防验队
    fillerChallenges: ['multiWave', 'boardSeal', 'highDefense', 'multiWave', 'boardSeal', 'boardRock', 'highDefense'],
    fillerNames: ['炽土前哨', '熔岩小径', '岩傀儡阵', '焦土深谷', '封印残阵', '顽石廊道', '炽石祭坛'],
  },
  {
    chapter: 5, name: '灵兽秘境', stageCount: 8, difficultyBase: 1.24,
    bossDropPetId: 'pet_011', bossChallenge: 'selfHeal',
    // 4 号位预告自疗；末位顽石验队
    fillerChallenges: ['boardRock', 'highDefense', 'boardSeal', 'selfHeal', 'boardSeal', 'highDefense', 'boardRock'],
    fillerNames: ['秘境入口', '顽石迷阵', '巨像守卫', '自愈灵泉', '熔岩岔路', '古阵核心', '秘境深廊'],
  },
  {
    chapter: 6, name: '归墟深渊', stageCount: 8, difficultyBase: 1.25,
    bossDropPetId: 'pet_010', bossChallenge: 'chargeHit',
    // 5 号位预告蓄力；末位顽石验队
    fillerChallenges: ['selfHeal', 'boardRock', 'highDefense', 'boardSeal', 'chargeHit', 'selfHeal', 'boardRock'],
    fillerNames: ['深渊上层', '寒潭回响', '晶甲巢穴', '封印深池', '蓄力试场', '归墟裂隙', '深渊前厅'],
  },
  {
    chapter: 7, name: '星轨之野', stageCount: 8, difficultyBase: 1.26,
    bossDropPetId: 'pet_029', bossChallenge: 'noHeart',
    // 6 号位预告禁心；末位蓄力验队
    fillerChallenges: ['selfHeal', 'chargeHit', 'boardRock', 'highDefense', 'boardSeal', 'noHeart', 'chargeHit'],
    fillerNames: ['星轨外环', '蓄力星门', '顽石星带', '巨像轨道', '封印星廊', '禁心前庭', '星轨内环'],
  },
  {
    chapter: 8, name: '虚空之巅', stageCount: 8, difficultyBase: 1.27,
    bossDropPetId: 'pet_016', bossChallenge: 'banElement',
    fillerChallenges: ['noHeart', 'selfHeal', 'chargeHit', 'boardRock', 'highDefense', 'boardSeal', 'noHeart'],
    fillerNames: ['虚空门扉', '禁心廊道', '蓄力深渊', '寒潭虚影', '顽石天阶', '封印核心', '封元前厅'],
  },

  /*
   * ── 第 9~16 章 ──
   * 每章仍只首教 1 种新挑战（bossChallenge），铺垫关只复用已学的；
   * 新挑战的载体是 Boss 本体的技能与阶段（见 creatureRoster.bossMonster），
   * 不是单靠 difficultyBase 把数值抬上去。
   *
   * difficultyBase 全部压平在 1.22（= 第 8 章的值，随其在 v0.7 一同上抬），**不再逐章加码**。
   * 原因是实测结论：敌人数值已按 chapterGrowth^(章-1) 复利外推（HP 1.36 / ATK 1.29），
   * 而养成锚点受 5★ 99 级封顶，第 9~16 章只能给出约 +5 级/章。两条曲线本就在拉开，
   * 若再叠一层 difficultyBase 爬坡，后期铺垫关的 TTK 会顶穿目标带。
   * 章节压力交给复利曲线与机制（新挑战、Boss 阶段）承担，difficulty 只留章内 +0.05/关 的爬坡。
   *
   * 末位铺垫关同样必须挑够重的 archetype（见 fillerChallenges 注释），
   * 新挑战里 resolveTank（磐岩傀儡）/ phaseShift（幽晶魔像）属重档，
   * attackDown（枯翼魔蝠单波）偏轻，不放末位。
   */
  {
    chapter: 9, name: '锐金洞天', stageCount: 8, difficultyBase: 1.22,
    bossDropPetId: LATE_CHAPTER_BOSS_PETS[9], bossChallenge: 'highAttack',
    fillerChallenges: ['chargeHit', 'noHeart', 'boardRock', 'selfHeal', 'boardSeal', 'highAttack', 'highDefense'],
    fillerNames: ['金铁回廊', '禁心矿脉', '顽石熔窑', '寒潭金池', '封印铸台', '锐锋试场', '洞天前殿'],
  },
  {
    chapter: 10, name: '灵芝药谷', stageCount: 8, difficultyBase: 1.18,
    bossDropPetId: LATE_CHAPTER_BOSS_PETS[10], bossChallenge: 'phaseShift',
    fillerChallenges: ['highAttack', 'selfHeal', 'boardSeal', 'noHeart', 'chargeHit', 'boardRock', 'phaseShift'],
    fillerNames: ['药谷入口', '灵泉暖池', '封印花田', '禁心幽径', '蓄力蕊台', '顽石药圃', '晶像回廊'],
  },
  {
    chapter: 11, name: '沧溟海眼', stageCount: 8, difficultyBase: 1.22,
    bossDropPetId: LATE_CHAPTER_BOSS_PETS[11], bossChallenge: 'elementAbsorb',
    fillerChallenges: ['phaseShift', 'selfHeal', 'boardRock', 'highAttack', 'noHeart', 'elementAbsorb', 'highDefense'],
    fillerNames: ['潮汐阶', '寒蛟浅滩', '顽石礁盘', '风暴之喉', '禁心漩涡', '吞灵深潭', '海眼前庭'],
  },
  {
    chapter: 12, name: '熔岩魔渊', stageCount: 8, difficultyBase: 1.22,
    bossDropPetId: LATE_CHAPTER_BOSS_PETS[12], bossChallenge: 'counterStrike',
    fillerChallenges: ['elementAbsorb', 'chargeHit', 'boardSeal', 'phaseShift', 'noHeart', 'counterStrike', 'highDefense'],
    fillerNames: ['焦岩栈道', '蓄力火喉', '封印岩窟', '晶像熔室', '禁心火海', '荆棘熔巢', '魔渊前厅'],
  },
  {
    chapter: 13, name: '厚土神墟', stageCount: 8, difficultyBase: 1.22,
    bossDropPetId: LATE_CHAPTER_BOSS_PETS[13], bossChallenge: 'attackDown',
    fillerChallenges: ['counterStrike', 'attackDown', 'boardRock', 'elementAbsorb', 'selfHeal', 'phaseShift', 'highDefense'],
    fillerNames: ['神墟外垣', '摧锋沙丘', '顽石陵道', '吞灵地穴', '灵泉暗河', '晶像祭坛', '神墟内殿'],
  },
  {
    chapter: 14, name: '赤霄天阙', stageCount: 8, difficultyBase: 1.22,
    bossDropPetId: LATE_CHAPTER_BOSS_PETS[14], bossChallenge: 'resolveTank',
    fillerChallenges: ['attackDown', 'counterStrike', 'noHeart', 'phaseShift', 'elementAbsorb', 'boardRock', 'resolveTank'],
    fillerNames: ['天阙云阶', '荆棘火廊', '禁心霄顶', '晶像天桥', '吞灵云海', '顽石天柱', '磐岩关门'],
  },
  {
    chapter: 15, name: '玄冥寒渊', stageCount: 8, difficultyBase: 1.22,
    bossDropPetId: LATE_CHAPTER_BOSS_PETS[15], bossChallenge: 'lockedColumn',
    fillerChallenges: ['resolveTank', 'lockedColumn', 'attackDown', 'counterStrike', 'elementAbsorb', 'phaseShift', 'resolveTank'],
    fillerNames: ['寒渊冰阶', '锁灵冰壁', '摧锋寒风', '荆棘冰棘', '吞灵寒潭', '晶像冰宫', '玄冥壁垒'],
  },
  {
    chapter: 16, name: '苍虬天境', stageCount: 8, difficultyBase: 1.22,
    bossDropPetId: LATE_CHAPTER_BOSS_PETS[16], bossChallenge: 'finalTrial',
    fillerChallenges: ['lockedColumn', 'resolveTank', 'counterStrike', 'elementAbsorb', 'attackDown', 'phaseShift', 'finalTrial'],
    fillerNames: ['天境门阶', '磐岩天关', '荆棘回廊', '吞灵云渊', '摧锋神道', '晶像天枢', '终局试场'],
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
      type: 'normal',
      dropTableId: 'dt_trial_normal',
      difficulty: def.difficultyBase + i * 0.05,
      challenge: ch,
      // 章号参与取模，让同一挑战在不同章也换组，而不是每章都从第一个变体开始
      variant: def.chapter + i,
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
    challenge: def.bossChallenge,
  }));

  return stages;
}

const TRIAL_STAGES: readonly StageDef[] = TRIAL_CHAPTERS.flatMap(buildTrialChapter);

/**
 * 闸门层统一在最后叠加，而不是散进各章定义里。
 *
 * 手写的 Ch1-3 与生成的 Ch4-16 是两套写法，若把闸门分别写进去，
 * 「第几章上什么闸门」这条节奏线就被拆成两半，改一次难度曲线要翻两处。
 */
export const STAGES: readonly StageDef[] = [
  ...CHAPTER_1, ...CHAPTER_2, ...CHAPTER_3, ...TRIAL_STAGES,
].map(applyGateLayer);

const STAGE_REGISTRY = new Map<string, StageDef>(STAGES.map((s) => [s.id, s]));

/**
 * 关卡查表：主线 16 章 + 副玩法动态注册的关卡（秘境 / 通天塔）。
 * 副玩法关卡只进这张表，不进 STAGES，以免污染章节地图、图鉴与经分关卡序号。
 */
export const STAGE_MAP: ReadonlyMap<string, StageDef> = STAGE_REGISTRY;

/** 注册主线之外动态生成的关卡，使其可被 BattleController 与资源预载解析 */
export function registerExtraStage(stage: StageDef): StageDef {
  STAGE_REGISTRY.set(stage.id, stage);
  return stage;
}

export const CHAPTERS: readonly number[] = [...new Set(STAGES.map((s) => s.chapter))].sort((a, b) => a - b);

export function stagesOfChapter(chapter: number): readonly StageDef[] {
  return STAGES.filter((s) => s.chapter === chapter);
}

/** 短标签：1-1 青苔林边（编队 / 战斗顶栏） */
export function formatStageShortLabel(
  stage: Pick<StageDef, 'chapter' | 'index' | 'name'> & { displayLabel?: string },
): string {
  return stage.displayLabel ?? `${stage.chapter}-${stage.index} ${stage.name}`;
}

/** 战斗顶栏：章节关卡号 + 名称，Boss 关附加标记 */
export function formatStageBattleHeader(stage: StageDef): string {
  const base = formatStageShortLabel(stage);
  return stage.isBoss ? `${base} · 首领` : base;
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
