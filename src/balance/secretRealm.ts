/**
 * 五行秘境（纯数据 + 关卡构造，零 UI / 零存档）
 *
 * 日循环主体。五个副本对应金木水火土，按星期轮换开放，敌人属性固定，
 * 逼玩家为当日属性组一支克制队 —— 让 ELEMENT_COUNTERS 与 30 只灵宠真正被用上，
 * 而不是一套万能队打到底。
 *
 * 难度 UI 固定三档（初/中/高）：初、中锚定不变；高阶随已通关章数在
 * [HIGH_SCALE_MIN, MAIN_CHAPTER_COUNT] 内抬难度与奖励，以后加主线章节只需改
 * MAIN_CHAPTER_COUNT，不必再加平铺按钮。
 *
 * 全部复用既有资产：关卡类型走 stageTypes 的 dailyResource（经验丰厚），
 * 通关额外发灵玉 + 灵宠币（不发碎片），敌人走 enemies 的五行杂兵模板。
 */
import { counterElementOf, type Element } from './combat';
import type { EncounterRef } from './enemies';
import { MAIN_CHAPTER_COUNT, registerExtraStage, type StageDef } from './stages';

export interface RealmTierDef {
  /** 1 起 */
  tier: number;
  name: string;
  /**
   * 解锁门槛：`PlayerData.isChapterUnlocked(unlockChapter)`
   * （该章第 1 关可进 ≈ 通关上一章 Boss / 进入该章）
   */
  unlockChapter: number;
  /** 数值缩放用的等效章节（高阶经 resolveRealmTier 后可能高于表内基值） */
  scaleChapter: number;
  /** enemyStats 难度系数 */
  difficulty: number;
  /** 三星回合上限 */
  starTurnLimit: number;
  /** 通关灵玉 */
  lingyu: number;
  /** 通关灵宠币 */
  coins: number;
  /** 高阶：随通关章动态抬档 */
  dynamicScale?: boolean;
}

export interface RealmDef {
  id: string;
  /** 副本（也即敌人）属性 */
  element: Element;
  name: string;
  /** 一句话战术提示 */
  hint: string;
  /**
   * 三波敌人（杂兵 → 精英 → 守关）。
   * 三波必须是三只不同的怪：同怪三连会把「组克制队」这个卖点压成同一场打三遍。
   */
  waveMobs: readonly [string, string, string];
}

export const SECRET_REALM = {
  /** 每日总次数（跨副本共享，非体力，规则更轻） */
  dailyRuns: 3,
  /** 周末全属性开放 */
  weekendDays: [0, 6] as readonly number[],
  /** 掉落表：经验大头（货币在结算额外发） */
  dropTableId: 'dt_daily_exp',
  /** 高阶动态缩放：下限（刚解锁时） */
  highScaleMin: 8,
  /** 高阶在最终章时的通关奖励 / 难度（相对表内基值插值） */
  highScaleMaxReward: {
    lingyu: 48,
    coins: 1100,
    difficulty: 1.25,
    starTurnLimit: 20,
  },
} as const;

export const REALM_TIERS: readonly RealmTierDef[] = [
  {
    tier: 1, name: '初阶', unlockChapter: 1, scaleChapter: 2,
    difficulty: 0.95, starTurnLimit: 12, lingyu: 10, coins: 220,
  },
  {
    tier: 2, name: '中阶', unlockChapter: 3, scaleChapter: 5,
    difficulty: 1.05, starTurnLimit: 14, lingyu: 16, coins: 360,
  },
  {
    tier: 3, name: '高阶', unlockChapter: 6, scaleChapter: 8,
    difficulty: 1.15, starTurnLimit: 16, lingyu: 24, coins: 520,
    dynamicScale: true,
  },
];

export const REALMS: readonly RealmDef[] = [
  {
    id: 'realm_metal', element: 'metal', name: '锐金洞天',
    hint: '敌人属金，火克金 —— 带火系灵宠上阵',
    waveMobs: ['enemy_scorpion_swarm_metal', 'enemy_scorpion_metal', 'enemy_scorpion_king_metal'],
  },
  {
    id: 'realm_wood', element: 'wood', name: '青木灵境',
    hint: '敌人属木，金克木 —— 带金系灵宠上阵',
    waveMobs: ['enemy_slime_wood', 'enemy_vine_slime_wood', 'enemy_thunderlord_boss_wood'],
  },
  {
    id: 'realm_water', element: 'water', name: '玄水寒渊',
    hint: '敌人属水，土克水 —— 带土系灵宠上阵',
    waveMobs: ['enemy_serpent_water', 'enemy_toad_water', 'enemy_serpent_king_water'],
  },
  {
    id: 'realm_fire', element: 'fire', name: '赤焰熔窟',
    hint: '敌人属火，水克火 —— 带水系灵宠上阵',
    waveMobs: ['enemy_bat_fire', 'enemy_bat_swarm_fire', 'enemy_bat_king_fire'],
  },
  {
    id: 'realm_earth', element: 'earth', name: '厚土玄坛',
    hint: '敌人属土，木克土 —— 带木系灵宠上阵',
    waveMobs: ['enemy_pebble_earth', 'enemy_golem_earth', 'enemy_crystal_boss_earth'],
  },
];

export const REALM_MAP: ReadonlyMap<string, RealmDef> = new Map(REALMS.map((r) => [r.id, r]));

/** 星期轮换：周一金、周二木、周三水、周四火、周五土、周末全开 */
const WEEKDAY_ELEMENT: Readonly<Record<number, Element>> = {
  1: 'metal',
  2: 'wood',
  3: 'water',
  4: 'fire',
  5: 'earth',
};

/** 当日开放的副本（周末返回全部） */
export function openRealmsOn(date = new Date()): readonly RealmDef[] {
  const day = date.getDay();
  if (SECRET_REALM.weekendDays.includes(day)) return REALMS;
  const el = WEEKDAY_ELEMENT[day];
  return REALMS.filter((r) => r.element === el);
}

export function isRealmOpen(realmId: string, date = new Date()): boolean {
  return openRealmsOn(date).some((r) => r.id === realmId);
}

/** 明日开放提示文案（周末全开时返回「五行全开」） */
export function tomorrowRealmHint(date = new Date()): string {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  const open = openRealmsOn(next);
  if (open.length === REALMS.length) return '五行全开';
  return open[0]?.name ?? '秘境';
}

/** 该副本要求玩家携带的属性（克制副本属性） */
export function realmCounterElement(realm: RealmDef): Element {
  return counterElementOf(realm.element);
}

/** 表内静态档（不含高阶动态抬档） */
export function realmTier(tier: number): RealmTierDef {
  return REALM_TIERS.find((t) => t.tier === tier) ?? REALM_TIERS[0];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * 解析当前应使用的档位数值。
 * 初/中原样；高阶按已通关章数在 [highScaleMin, MAIN_CHAPTER_COUNT] 插值。
 */
export function resolveRealmTier(tier: number, clearedChapters: number): RealmTierDef {
  const base = realmTier(tier);
  if (!base.dynamicScale) return base;

  const minScale = SECRET_REALM.highScaleMin;
  const maxScale = MAIN_CHAPTER_COUNT;
  const scale = clamp(Math.floor(clearedChapters), minScale, maxScale);
  const span = Math.max(1, maxScale - minScale);
  const t = (scale - minScale) / span;
  const maxR = SECRET_REALM.highScaleMaxReward;

  return {
    ...base,
    scaleChapter: scale,
    lingyu: Math.round(lerp(base.lingyu, maxR.lingyu, t)),
    coins: Math.round(lerp(base.coins, maxR.coins, t)),
    difficulty: Math.round(lerp(base.difficulty, maxR.difficulty, t) * 100) / 100,
    starTurnLimit: Math.round(lerp(base.starTurnLimit, maxR.starTurnLimit, t)),
  };
}

/** 未解锁难度点击提示 */
export function realmTierUnlockHint(tier: RealmTierDef): string {
  return `进入第${tier.unlockChapter}章后解锁「${tier.name}」`;
}

export function realmStageId(realmId: string, tier: number): string {
  return `${realmId}_t${tier}`;
}

/**
 * 构造并注册一档秘境关卡。
 * 秘境关卡不进 STAGES，只进 STAGE_MAP，因此不会污染章节地图与经分关卡序号。
 */
export function buildRealmStage(
  realm: RealmDef,
  tier: number,
  clearedChapters: number = SECRET_REALM.highScaleMin,
): StageDef {
  const t = resolveRealmTier(tier, clearedChapters);
  const encounters: EncounterRef[] = realm.waveMobs.map((id) => ({ kind: 'mob', id }));
  const scaleTag = t.dynamicScale ? `·${t.scaleChapter}章` : '';
  return registerExtraStage({
    id: realmStageId(realm.id, t.tier),
    // chapter 只作数值缩放输入，不代表主线章节
    chapter: t.scaleChapter,
    index: t.tier,
    name: `${realm.name}·${t.name}`,
    element: realm.element,
    type: 'dailyResource',
    dropTableId: SECRET_REALM.dropTableId,
    encounters,
    difficulty: t.difficulty,
    starTurnLimit: t.starTurnLimit,
    hintText: realm.hint,
    displayLabel: `${realm.name}·${t.name}${scaleTag}`,
  });
}
