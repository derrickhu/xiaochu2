/**
 * 关卡表（纯数据，零逻辑）
 *
 * 只存参数：敌人引用 + 难度系数，奖励与敌人实际数值由公式层生成。
 */
import type { Element } from './combat';
import type { StageType } from './stageTypes';

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
  /** 敌人模板 id 列表（依次为每波） */
  enemies: string[];
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

/**
 * 第一章（8 关）：每关刻意制造一种编队需求，逼玩家在编队界面做选择——
 *   1-1/1-2 教学普攻怪 → 1-3 火怪压制(带水克制) → 1-4 高攻速攻怪(带治疗/护盾)
 *   → 1-5 减伤高防怪(带木克制+直伤爆发) → 1-6 自疗怪(带增伤/爆发抢血线)
 *   → 1-7 蓄力重击怪(护盾/治疗扛重击) → 1-8 Boss 减伤+自疗(克制+爆发+续航全要)
 */
const CHAPTER_1: readonly StageDef[] = [
  {
    id: 'stage_1_1', chapter: 1, index: 1, name: '青苔林边', element: 'wood',
    type: 'normal', dropTableId: 'dt_forest_metal',
    enemies: ['enemy_slime_wood'], difficulty: 1.0, starTurnLimit: 6,
    hintTags: ['新手'], hintText: '熟悉转珠：木怪上场，带金宠更省力',
  },
  {
    id: 'stage_1_2', chapter: 1, index: 2, name: '林间小径', element: 'wood',
    type: 'normal', dropTableId: 'dt_forest_wood',
    enemies: ['enemy_slime_wood', 'enemy_bat_fire'], difficulty: 1.1, starTurnLimit: 8,
    mechanics: ['rule_multi_wave'],
    hintTags: ['多波'], hintText: '两波敌人，注意保留血量',
  },
  {
    id: 'stage_1_3', chapter: 1, index: 3, name: '焰蝠洞口', element: 'fire',
    type: 'normal', dropTableId: 'dt_forest_fire',
    enemies: ['enemy_bat_fire', 'enemy_bat_fire'], difficulty: 1.2, starTurnLimit: 9,
    hintTags: ['火属性', '推荐水克制'], hintText: '火怪攻击高，带水宠克制并准备治疗',
  },
  {
    id: 'stage_1_4', chapter: 1, index: 4, name: '荆棘丛林', element: 'wood',
    type: 'normal', dropTableId: 'dt_forest_wood',
    enemies: ['enemy_hedgehog_wood', 'enemy_hedgehog_wood'], difficulty: 1.25, starTurnLimit: 10,
    mechanics: ['enemy_fast_attack'],
    hintTags: ['高攻速攻', '推荐治疗/护盾'], hintText: '刺猬攻速快，无治疗会被持续磨血',
  },
  {
    id: 'stage_1_5', chapter: 1, index: 5, name: '碎岩谷', element: 'earth',
    type: 'elite', dropTableId: 'dt_forest_elite',
    enemies: ['enemy_golem_earth'], difficulty: 1.3, starTurnLimit: 12,
    mechanics: ['enemy_damage_reduce'],
    hintTags: ['高防减伤', '推荐木克制/爆发'], hintText: '傀儡高防且会减伤，带木系克制或直伤爆发破防',
  },
  {
    id: 'stage_1_6', chapter: 1, index: 6, name: '寒潭深处', element: 'water',
    type: 'normal', dropTableId: 'dt_forest_water',
    enemies: ['enemy_serpent_water', 'enemy_serpent_water'], difficulty: 1.35, starTurnLimit: 13,
    mechanics: ['enemy_self_heal'],
    hintTags: ['自疗', '推荐土克制+爆发'], hintText: '幼蛟会自愈，带土系克制并集中爆发抢血线',
  },
  {
    id: 'stage_1_7', chapter: 1, index: 7, name: '烈焰隘口', element: 'fire',
    type: 'elite', dropTableId: 'dt_forest_elite',
    enemies: ['enemy_bat_fire', 'enemy_lion_fire'], difficulty: 1.4, starTurnLimit: 14,
    mechanics: ['enemy_charge'],
    hintTags: ['蓄力重击', '推荐水克制+护盾'], hintText: '狂狮会蓄力重击，带护盾/治疗扛住并用水克制',
  },
  {
    id: 'stage_1_8', chapter: 1, index: 8, name: '蛮竹王座', element: 'wood',
    type: 'boss', dropTableId: 'dt_forest_boss',
    enemies: ['enemy_hedgehog_wood', 'enemy_panda_boss_wood'], difficulty: 1.5, isBoss: true, starTurnLimit: 18,
    mechanics: ['orb_rock'],
    hintTags: ['BOSS', '克制+爆发+续航'], hintText: '熊猫王减伤又自疗，需金系克制、爆发与续航三者兼备，盘面出现顽石珠',
  },
];

/**
 * 第二章（6 关 · 幽晶溶洞）：引入「封印珠」棋盘机制——
 *   2-1 单独首现封印珠（先教会）→ 2-2 多波复用 → 2-3 高防晶甲蝎
 *   → 2-4 封印珠 + 自疗（首次组合）→ 2-5 精英晶甲蝎(减伤+蓄力)
 *   → 2-6 Boss 幽晶巨像（封印珠 + 减伤 + 蓄力三合一）
 */
const CHAPTER_2: readonly StageDef[] = [
  {
    id: 'stage_2_1', chapter: 2, index: 1, name: '晶洞入口', element: 'metal',
    type: 'normal', dropTableId: 'dt_cave_normal',
    enemies: ['enemy_scorpion_metal'], difficulty: 1.0, starTurnLimit: 10,
    mechanics: ['orb_sealed'],
    hintTags: ['封印珠'], hintText: '初遇封印珠：消除其相邻珠子来解封',
  },
  {
    id: 'stage_2_2', chapter: 2, index: 2, name: '回音廊道', element: 'water',
    type: 'normal', dropTableId: 'dt_cave_normal',
    enemies: ['enemy_toad_water', 'enemy_bat_fire'], difficulty: 1.1, starTurnLimit: 12,
    mechanics: ['orb_sealed', 'rule_multi_wave'],
    hintTags: ['封印珠', '多波'], hintText: '封印珠 + 多波：边解封边保血',
  },
  {
    id: 'stage_2_3', chapter: 2, index: 3, name: '晶甲巢穴', element: 'metal',
    type: 'elite', dropTableId: 'dt_cave_elite',
    enemies: ['enemy_scorpion_metal'], difficulty: 1.2, starTurnLimit: 13,
    mechanics: ['enemy_damage_reduce', 'enemy_charge'],
    hintTags: ['减伤', '蓄力'], hintText: '晶甲蝎减伤又蓄力：克制破防并护盾扛击',
  },
  {
    id: 'stage_2_4', chapter: 2, index: 4, name: '毒雾深渊', element: 'water',
    type: 'normal', dropTableId: 'dt_cave_normal',
    enemies: ['enemy_toad_water', 'enemy_toad_water'], difficulty: 1.3, starTurnLimit: 14,
    mechanics: ['orb_sealed', 'enemy_self_heal'],
    hintTags: ['封印珠', '自疗'], hintText: '封印珠拖慢节奏 + 敌人自疗：解封后集中爆发',
  },
  {
    id: 'stage_2_5', chapter: 2, index: 5, name: '幽光裂隙', element: 'fire',
    type: 'elite', dropTableId: 'dt_cave_elite',
    enemies: ['enemy_bat_fire', 'enemy_scorpion_metal'], difficulty: 1.35, starTurnLimit: 15,
    mechanics: ['rule_ban_water', 'enemy_damage_reduce'],
    hintTags: ['封水', '减伤'], hintText: '本关水珠失效：改用其它属性破减伤',
  },
  {
    id: 'stage_2_6', chapter: 2, index: 6, name: '幽晶王座', element: 'earth',
    type: 'boss', dropTableId: 'dt_cave_boss',
    enemies: ['enemy_toad_water', 'enemy_crystal_boss_earth'], difficulty: 1.5, isBoss: true, starTurnLimit: 20,
    mechanics: ['orb_rock', 'enemy_damage_reduce', 'enemy_charge'],
    hintTags: ['BOSS', '顽石封印', '减伤+蓄力'], hintText: '巨像减伤蓄力 + 顽石封印满盘：解封、破防、扛击三线兼顾',
  },
];

/**
 * 第三章（6 关 · 风雷绝巅）：组合加难 + 引入「禁心」规则机制——
 *   3-1 连续蓄力高攻 → 3-2 封印珠 + 减伤自疗 → 3-3 首现禁心（先单独教会）
 *   → 3-4 禁心 + 蓄力 → 3-5 封火 + 减伤自疗精英 → 3-6 Boss 风雷天尊（禁心 + 三技能）
 */
const CHAPTER_3: readonly StageDef[] = [
  {
    id: 'stage_3_1', chapter: 3, index: 1, name: '裂风崖', element: 'fire',
    type: 'normal', dropTableId: 'dt_peak_normal',
    enemies: ['enemy_eagle_fire', 'enemy_eagle_fire'], difficulty: 1.0, starTurnLimit: 13,
    mechanics: ['enemy_double_charge'],
    hintTags: ['连续蓄力'], hintText: '雷羽鹰连续蓄力：护盾与续航要足',
  },
  {
    id: 'stage_3_2', chapter: 3, index: 2, name: '雷鸣回廊', element: 'metal',
    type: 'elite', dropTableId: 'dt_peak_elite',
    enemies: ['enemy_warden_metal'], difficulty: 1.15, starTurnLimit: 15,
    mechanics: ['orb_sealed', 'enemy_guard_heal'],
    hintTags: ['封印珠', '减伤+自疗'], hintText: '守卫减伤自疗 + 封印珠：解封后克制爆发',
  },
  {
    id: 'stage_3_3', chapter: 3, index: 3, name: '无心祭坛', element: 'water',
    type: 'normal', dropTableId: 'dt_peak_normal',
    enemies: ['enemy_toad_water', 'enemy_eagle_fire'], difficulty: 1.25, starTurnLimit: 16,
    mechanics: ['rule_no_heal'],
    hintTags: ['禁心'], hintText: '首现禁心：心珠不回血，靠护盾与速杀',
  },
  {
    id: 'stage_3_4', chapter: 3, index: 4, name: '绝风险道', element: 'fire',
    type: 'elite', dropTableId: 'dt_peak_elite',
    enemies: ['enemy_eagle_fire', 'enemy_warden_metal'], difficulty: 1.35, starTurnLimit: 17,
    mechanics: ['rule_no_heal', 'enemy_double_charge'],
    hintTags: ['禁心', '连续蓄力'], hintText: '禁心 + 连续蓄力：护盾流稳住节奏',
  },
  {
    id: 'stage_3_5', chapter: 3, index: 5, name: '焚天台', element: 'fire',
    type: 'elite', dropTableId: 'dt_peak_elite',
    enemies: ['enemy_warden_metal', 'enemy_eagle_fire'], difficulty: 1.45, starTurnLimit: 18,
    mechanics: ['rule_ban_fire', 'enemy_guard_heal'],
    hintTags: ['封火', '减伤+自疗'], hintText: '本关火珠失效：换属性破减伤自疗',
  },
  {
    id: 'stage_3_6', chapter: 3, index: 6, name: '风雷绝巅', element: 'wood',
    type: 'boss', dropTableId: 'dt_peak_boss',
    enemies: ['enemy_warden_metal', 'enemy_thunderlord_boss_wood'], difficulty: 1.6, isBoss: true, starTurnLimit: 24,
    mechanics: ['rule_no_heal', 'orb_sealed', 'enemy_guard_heal', 'enemy_double_charge'],
    hintTags: ['BOSS', '禁心', '封印珠', '减伤自疗+连续蓄力'],
    hintText: '终章试炼：禁心 + 封印珠 + 减伤自疗 + 连续蓄力，养成与编队的总检验',
  },
];

export const STAGES: readonly StageDef[] = [...CHAPTER_1, ...CHAPTER_2, ...CHAPTER_3];

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
};
