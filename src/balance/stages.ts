/**
 * 关卡表（纯数据，零逻辑）
 *
 * 阶段九：StageDef.enemies(string[]) 升级为 encounters(EncounterRef[])——每波可为
 * 「杂怪 mob」或「生物 creature 的 tier1/tier2 形态」，tier2 + captureUnlock 即收录点。
 * 敌人实际数值由公式层（formulas/growth.ts enemyStats）按章节/难度生成。
 */
import type { Element } from './combat';
import type { StageType } from './stageTypes';
import type { EncounterRef } from './enemies';
import { CREATURE_MAP } from './creatures';
import { STARTER_CREATURE_IDS } from './creatures';

export interface StageDef {
  id: string;
  chapter: number;
  index: number;
  name: string;
  /** 关卡主属性（克制软墙提示用） */
  element: Element;
  /** 关卡类型（单一真源 stageTypes.ts，决定产出倍率/UI 标识/体力） */
  type: StageType;
  /** 掉落表引用（drops.ts），结算经验/碎片用 */
  dropTableId: string;
  /** 遭遇序列（依次为每波）：杂怪 或 生物形态 */
  encounters: readonly EncounterRef[];
  /** 关内难度递增系数（敌人曲线额外乘数） */
  difficulty: number;
  /** 是否章节 Boss 关 */
  isBoss?: boolean;
  /** 三星目标：回合数限制 */
  starTurnLimit: number;
  /** 本关引入/复用的机制 id 列表（stageMechanics.ts 三轴：棋盘珠/敌人/规则） */
  mechanics?: readonly string[];
  /** 推荐解法标签（选关/开场提示用，简短关键词） */
  hintTags?: readonly string[];
  /** 推荐解法一句话提示（缺省时用 hintTags 拼接） */
  hintText?: string;
}

/** 遭遇引用便捷构造：杂怪 */
const mob = (id: string): EncounterRef => ({ kind: 'mob', id });

/** 本关波次数（UI/进度） */
export function stageWaveCount(stage: StageDef): number {
  return stage.encounters.length;
}

/**
 * 第一章（8 关）：教学 + 编队需求建立。全部使用杂怪（mob），不引入可收服生物。
 */
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
    mechanics: ['rule_multi_wave'],
    hintTags: ['多波'], hintText: '两波敌人，注意保留血量',
  },
  {
    id: 'stage_1_3', chapter: 1, index: 3, name: '焰蝠洞口', element: 'fire',
    type: 'normal', dropTableId: 'dt_forest_fire',
    encounters: [mob('enemy_bat_fire'), mob('enemy_bat_fire')], difficulty: 1.2, starTurnLimit: 9,
    hintTags: ['火属性', '推荐水克制'], hintText: '火怪攻击高，带水宠克制并准备治疗',
  },
  {
    id: 'stage_1_4', chapter: 1, index: 4, name: '荆棘丛林', element: 'wood',
    type: 'normal', dropTableId: 'dt_forest_wood',
    encounters: [mob('enemy_hedgehog_wood'), mob('enemy_hedgehog_wood')], difficulty: 1.25, starTurnLimit: 10,
    mechanics: ['enemy_fast_attack'],
    hintTags: ['高攻速攻', '推荐治疗/护盾'], hintText: '刺猬攻速快，无治疗会被持续磨血',
  },
  {
    id: 'stage_1_5', chapter: 1, index: 5, name: '碎岩谷', element: 'earth',
    type: 'elite', dropTableId: 'dt_forest_elite',
    encounters: [mob('enemy_golem_earth')], difficulty: 1.3, starTurnLimit: 12,
    mechanics: ['enemy_damage_reduce'],
    hintTags: ['高防减伤', '推荐木克制/爆发'], hintText: '傀儡高防且会减伤，带木系克制或直伤爆发破防',
  },
  {
    id: 'stage_1_6', chapter: 1, index: 6, name: '寒潭深处', element: 'water',
    type: 'normal', dropTableId: 'dt_forest_water',
    encounters: [mob('enemy_serpent_water'), mob('enemy_serpent_water')], difficulty: 1.35, starTurnLimit: 13,
    mechanics: ['enemy_self_heal'],
    hintTags: ['自疗', '推荐土克制+爆发'], hintText: '幼蛟会自愈，带土系克制并集中爆发抢血线',
  },
  {
    id: 'stage_1_7', chapter: 1, index: 7, name: '烈焰隘口', element: 'fire',
    type: 'elite', dropTableId: 'dt_forest_elite',
    encounters: [mob('enemy_bat_fire'), mob('enemy_lion_fire')], difficulty: 1.4, starTurnLimit: 14,
    mechanics: ['enemy_charge'],
    hintTags: ['蓄力重击', '推荐水克制+护盾'], hintText: '狂狮会蓄力重击，带护盾/治疗扛住并用水克制',
  },
  {
    id: 'stage_1_8', chapter: 1, index: 8, name: '蛮竹王座', element: 'wood',
    type: 'boss', dropTableId: 'dt_forest_boss',
    encounters: [mob('enemy_hedgehog_wood'), mob('enemy_panda_boss_wood')], difficulty: 1.5, isBoss: true, starTurnLimit: 18,
    mechanics: ['orb_rock'],
    hintTags: ['BOSS', '克制+爆发+续航'], hintText: '熊猫王减伤又自疗，需金系克制、爆发与续航三者兼备，盘面出现顽石珠',
  },
];

/**
 * 第二章（6 关 · 幽晶溶洞）：引入「封印珠」棋盘机制。
 */
const CHAPTER_2: readonly StageDef[] = [
  {
    id: 'stage_2_1', chapter: 2, index: 1, name: '晶洞入口', element: 'metal',
    type: 'normal', dropTableId: 'dt_cave_normal',
    encounters: [mob('enemy_scorpion_metal')], difficulty: 1.0, starTurnLimit: 10,
    mechanics: ['orb_sealed'],
    hintTags: ['封印珠'], hintText: '初遇封印珠：消除其相邻珠子来解封',
  },
  {
    id: 'stage_2_2', chapter: 2, index: 2, name: '回音廊道', element: 'water',
    type: 'normal', dropTableId: 'dt_cave_normal',
    encounters: [mob('enemy_toad_water'), mob('enemy_bat_fire')], difficulty: 1.1, starTurnLimit: 12,
    mechanics: ['orb_sealed', 'rule_multi_wave'],
    hintTags: ['封印珠', '多波'], hintText: '封印珠 + 多波：边解封边保血',
  },
  {
    id: 'stage_2_3', chapter: 2, index: 3, name: '晶甲巢穴', element: 'metal',
    type: 'elite', dropTableId: 'dt_cave_elite',
    encounters: [mob('enemy_scorpion_metal')], difficulty: 1.2, starTurnLimit: 13,
    mechanics: ['enemy_damage_reduce', 'enemy_charge'],
    hintTags: ['减伤', '蓄力'], hintText: '晶甲蝎减伤又蓄力：克制破防并护盾扛击',
  },
  {
    id: 'stage_2_4', chapter: 2, index: 4, name: '毒雾深渊', element: 'water',
    type: 'normal', dropTableId: 'dt_cave_normal',
    encounters: [mob('enemy_toad_water'), mob('enemy_toad_water')], difficulty: 1.3, starTurnLimit: 14,
    mechanics: ['orb_sealed', 'enemy_self_heal'],
    hintTags: ['封印珠', '自疗'], hintText: '封印珠拖慢节奏 + 敌人自疗：解封后集中爆发',
  },
  {
    id: 'stage_2_5', chapter: 2, index: 5, name: '幽光裂隙', element: 'fire',
    type: 'elite', dropTableId: 'dt_cave_elite',
    encounters: [mob('enemy_bat_fire'), mob('enemy_scorpion_metal')], difficulty: 1.35, starTurnLimit: 15,
    mechanics: ['rule_ban_water', 'enemy_damage_reduce'],
    hintTags: ['封水', '减伤'], hintText: '本关水珠失效：改用其它属性破减伤',
  },
  {
    id: 'stage_2_6', chapter: 2, index: 6, name: '幽晶王座', element: 'earth',
    type: 'boss', dropTableId: 'dt_cave_boss',
    encounters: [mob('enemy_toad_water'), mob('enemy_crystal_boss_earth')], difficulty: 1.5, isBoss: true, starTurnLimit: 20,
    mechanics: ['orb_rock', 'enemy_damage_reduce', 'enemy_charge'],
    hintTags: ['BOSS', '顽石封印', '减伤+蓄力'], hintText: '巨像减伤蓄力 + 顽石封印满盘：解封、破防、扛击三线兼顾',
  },
];

/**
 * 第三章（6 关 · 风雷绝巅）：组合加难 + 引入「禁心」规则机制。
 */
const CHAPTER_3: readonly StageDef[] = [
  {
    id: 'stage_3_1', chapter: 3, index: 1, name: '裂风崖', element: 'fire',
    type: 'normal', dropTableId: 'dt_peak_normal',
    encounters: [mob('enemy_eagle_fire'), mob('enemy_eagle_fire')], difficulty: 1.0, starTurnLimit: 13,
    mechanics: ['enemy_double_charge'],
    hintTags: ['连续蓄力'], hintText: '雷羽鹰连续蓄力：护盾与续航要足',
  },
  {
    id: 'stage_3_2', chapter: 3, index: 2, name: '雷鸣回廊', element: 'metal',
    type: 'elite', dropTableId: 'dt_peak_elite',
    encounters: [mob('enemy_warden_metal')], difficulty: 1.15, starTurnLimit: 15,
    mechanics: ['orb_sealed', 'enemy_guard_heal'],
    hintTags: ['封印珠', '减伤+自疗'], hintText: '守卫减伤自疗 + 封印珠：解封后克制爆发',
  },
  {
    id: 'stage_3_3', chapter: 3, index: 3, name: '无心祭坛', element: 'water',
    type: 'normal', dropTableId: 'dt_peak_normal',
    encounters: [mob('enemy_toad_water'), mob('enemy_eagle_fire')], difficulty: 1.25, starTurnLimit: 16,
    mechanics: ['rule_no_heal'],
    hintTags: ['禁心'], hintText: '首现禁心：心珠不回血，靠护盾与速杀',
  },
  {
    id: 'stage_3_4', chapter: 3, index: 4, name: '绝风险道', element: 'fire',
    type: 'elite', dropTableId: 'dt_peak_elite',
    encounters: [mob('enemy_eagle_fire'), mob('enemy_warden_metal')], difficulty: 1.35, starTurnLimit: 17,
    mechanics: ['rule_no_heal', 'enemy_double_charge'],
    hintTags: ['禁心', '连续蓄力'], hintText: '禁心 + 连续蓄力：护盾流稳住节奏',
  },
  {
    id: 'stage_3_5', chapter: 3, index: 5, name: '焚天台', element: 'fire',
    type: 'elite', dropTableId: 'dt_peak_elite',
    encounters: [mob('enemy_warden_metal'), mob('enemy_eagle_fire')], difficulty: 1.45, starTurnLimit: 18,
    mechanics: ['rule_ban_fire', 'enemy_guard_heal'],
    hintTags: ['封火', '减伤+自疗'], hintText: '本关火珠失效：换属性破减伤自疗',
  },
  {
    id: 'stage_3_6', chapter: 3, index: 6, name: '风雷绝巅', element: 'wood',
    type: 'boss', dropTableId: 'dt_peak_boss',
    encounters: [mob('enemy_warden_metal'), mob('enemy_thunderlord_boss_wood')], difficulty: 1.6, isBoss: true, starTurnLimit: 24,
    mechanics: ['rule_no_heal', 'orb_sealed', 'enemy_guard_heal', 'enemy_double_charge'],
    hintTags: ['BOSS', '禁心', '封印珠', '减伤自疗+连续蓄力'],
    hintText: '终章试炼：禁心 + 封印珠 + 减伤自疗 + 连续蓄力，养成与编队的总检验',
  },
];

// ════════════════════════════════════════════════════════════════
// 历练章（阶段九收录入口）：每关用杂怪铺垫，生物初级形态预告、高级形态收录。
//   击败 tier2 + captureUnlock 即把该生物收录进 PlayerData.discovered。
// ════════════════════════════════════════════════════════════════

interface TrialChapterDef {
  chapter: number;
  name: string;
  /** 铺垫杂怪 id */
  mob: string;
  /** 章首引入的新机制（保证机制密度 + 关卡叙事） */
  introMechanic: string;
  /** 收录关额外规则机制（可空） */
  extraMechanic?: string;
  difficultyBase: number;
  /** 本章依次收录的生物 id（最后一只为章 Boss） */
  creatureIds: readonly string[];
}

const TRIAL_CHAPTERS: readonly TrialChapterDef[] = [
  {
    chapter: 4, name: '历练 · 锋芒试炼', mob: 'enemy_blade_metal',
    introMechanic: 'trial_capture', difficultyBase: 0.85,
    creatureIds: ['pet_metal_004', 'pet_wood_004', 'pet_water_004', 'pet_fire_004', 'pet_earth_004'],
  },
  {
    chapter: 5, name: '历练 · 灵兽秘境', mob: 'enemy_slime_wood',
    introMechanic: 'rule_ban_metal', extraMechanic: 'trial_elite_pair', difficultyBase: 0.85,
    creatureIds: ['cr_jadehorn_goat', 'cr_golden_crane', 'cr_cloud_fox', 'cr_stone_ape', 'cr_kunlun_dragon'],
  },
  {
    chapter: 6, name: '历练 · 归墟深渊', mob: 'enemy_toad_water',
    introMechanic: 'rule_ban_wood', extraMechanic: 'trial_elite_pair', difficultyBase: 0.8,
    creatureIds: ['cr_abyss_jellyfish', 'cr_frost_seal', 'cr_guixu_turtle', 'cr_tide_manta', 'cr_guixu_whale'],
  },
  {
    chapter: 7, name: '历练 · 星轨之野', mob: 'enemy_eagle_fire',
    introMechanic: 'rule_ban_earth', extraMechanic: 'trial_elite_pair', difficultyBase: 0.75,
    creatureIds: ['cr_star_deer', 'cr_thunder_cicada', 'cr_red_crow', 'cr_star_gear', 'cr_zhulong'],
  },
  {
    chapter: 8, name: '历练 · 虚空之巅', mob: 'enemy_warden_metal',
    introMechanic: 'trial_void', extraMechanic: 'rule_no_heal', difficultyBase: 0.7,
    creatureIds: ['cr_void_eye', 'cr_chaos_fox', 'cr_rift_beetle', 'cr_shadow_roc', 'cr_outer_demon'],
  },
];

function buildTrialChapter(def: TrialChapterDef): StageDef[] {
  return def.creatureIds.map((cid, i): StageDef => {
    const c = CREATURE_MAP.get(cid);
    if (!c) throw new Error(`历练章引用未知生物: ${cid}`);
    const index = i + 1;
    const isBoss = index === def.creatureIds.length;
    const mechanics: string[] = [];
    if (index === 1) mechanics.push(def.introMechanic);
    if (def.extraMechanic && isBoss) mechanics.push(def.extraMechanic);
    return {
      id: `stage_${def.chapter}_${index}`,
      chapter: def.chapter,
      index,
      name: `${c.name}·历练`,
      element: c.element,
      type: isBoss ? 'boss' : 'elite',
      dropTableId: `dt_trial_${cid}`,
      encounters: [
        mob(def.mob),
        { kind: 'creature', id: cid, tier: 'tier1' },
        { kind: 'creature', id: cid, tier: 'tier2', captureUnlock: true },
      ],
      difficulty: def.difficultyBase + i * 0.06,
      isBoss: isBoss || undefined,
      starTurnLimit: 16 + def.chapter,
      mechanics: mechanics.length > 0 ? mechanics : undefined,
      hintTags: ['历练', '收录'],
      hintText: `击败「${c.name}」的高级形态即可收录进宠物池`,
    };
  });
}

const TRIAL_STAGES: readonly StageDef[] = TRIAL_CHAPTERS.flatMap(buildTrialChapter);

export const STAGES: readonly StageDef[] = [
  ...CHAPTER_1, ...CHAPTER_2, ...CHAPTER_3, ...TRIAL_STAGES,
];

export const STAGE_MAP: ReadonlyMap<string, StageDef> = new Map(STAGES.map((s) => [s.id, s]));

/** 章节列表（去重，升序） */
export const CHAPTERS: readonly number[] = [...new Set(STAGES.map((s) => s.chapter))].sort((a, b) => a - b);

/** 取某章节的所有关卡 */
export function stagesOfChapter(chapter: number): readonly StageDef[] {
  return STAGES.filter((s) => s.chapter === chapter);
}

/** 章节名 */
export const CHAPTER_NAME: Readonly<Record<number, string>> = {
  1: '第一章 · 灵兽森林',
  2: '第二章 · 幽晶溶洞',
  3: '第三章 · 风雷绝巅',
  ...Object.fromEntries(TRIAL_CHAPTERS.map((t) => [t.chapter, `第${t.chapter}章 · ${t.name}`])),
};

// 兼容/便捷：初始赠送生物（其它模块可读）
export { STARTER_CREATURE_IDS };
