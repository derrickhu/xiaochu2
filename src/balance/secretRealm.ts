/**
 * 五行秘境（纯数据 + 关卡构造，零 UI / 零存档）
 *
 * 日循环主体。五个副本对应金木水火土，按星期轮换开放，敌人属性固定，
 * 逼玩家为当日属性组一支克制队 —— 让 ELEMENT_COUNTERS 与 30 只灵宠真正被用上，
 * 而不是一套万能队打到底。
 *
 * 全部复用既有资产：关卡类型走 stageTypes 的 dailyResource（经验丰厚），
 * 通关额外发灵玉 + 灵宠币（不发碎片），敌人走 enemies 的五行杂兵模板。
 */
import { counterElementOf, type Element } from './combat';
import type { EncounterRef } from './enemies';
import { registerExtraStage, type StageDef } from './stages';

export interface RealmTierDef {
  /** 1 起 */
  tier: number;
  name: string;
  /** 解锁需通关的章节数（= 已通该章 Boss） */
  unlockChapter: number;
  /** 数值缩放用的等效章节 */
  scaleChapter: number;
  /** enemyStats 难度系数 */
  difficulty: number;
  /** 三星回合上限 */
  starTurnLimit: number;
  /** 通关灵玉 */
  lingyu: number;
  /** 通关灵宠币 */
  coins: number;
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
   * 三波必须是三只不同的怪：同怪三连会把「组克制队」这个卖点压成同一场打三遍，
   * 由 secretRealm.test.ts 的契约兜住。
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

export function realmTier(tier: number): RealmTierDef {
  return REALM_TIERS.find((t) => t.tier === tier) ?? REALM_TIERS[0];
}

export function realmStageId(realmId: string, tier: number): string {
  return `${realmId}_t${tier}`;
}

/**
 * 构造并注册一档秘境关卡。
 * 秘境关卡不进 STAGES，只进 STAGE_MAP，因此不会污染章节地图与经分关卡序号。
 */
export function buildRealmStage(realm: RealmDef, tier: number): StageDef {
  const t = realmTier(tier);
  const encounters: EncounterRef[] = realm.waveMobs.map((id) => ({ kind: 'mob', id }));
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
    displayLabel: `${realm.name}·${t.name}`,
  });
}
