import {
  DEFAULT_TEAM,
  INITIAL_PET_LEVEL,
  INITIAL_PET_STAR,
  PET_MAP,
  TEAM_SIZE,
} from '@/balance/pets';
import { STAGES, STAGE_STAR_MIGRATION } from '@/balance/stages';
import { migrateCreatureId } from '@/balance/creatureIdMigration';
import { getStarProfile } from '@/balance/growth';
import { ECONOMY } from '@/balance/economy';
import { emptyStaminaState, type StaminaState } from './staminaService';

import {
  DEV_LEGACY_SAVE_KEYS,
  LEGACY_SAVE_KEY,
  SAVE_KEY,
} from '@/config/CloudConfig';

export { SAVE_KEY, LEGACY_SAVE_KEY } from '@/config/CloudConfig';
export const SAVE_VERSION = 7;

/** 单只灵宠的养成进度 */
export interface OwnedPet {
  level: number;
  star: number;
  shards: number;
}

/** 日循环状态：跨日由 game/dailyReset.ts 统一整体归零 */
export interface DailyState {
  /** 本组数据所属日期（YYYY-MM-DD），与今日不符即重置 */
  date: string;
  /** 五行秘境今日已用次数 */
  realmRuns: number;
  /** questId → 进度计数 */
  questProgress: Record<string, number>;
  /** 今日已领奖的 questId（含全清奖励的哨兵 id） */
  questClaimed: string[];
  /** 每日首胜翻倍已发放的日期；与 date 分开存，避免重置漏判导致重复发放 */
  firstWinDate: string;
  /**
   * 广告位 id → 今日已看次数（日限见 balance/monetization.ts 的 AD_PLACEMENTS）。
   * 8 个广告位共用这一份计数，而不是各自加一个 `xxxAd: {date, used}` 字段 ——
   * 后者每加一个位就得配一套判日切代码，日限逻辑必然逐渐漂移。
   */
  adUsage: Record<string, number>;
}

/** 七日循环签到 */
export interface CheckinState {
  lastDate: string;
  /** 连续签到天数（断签归零后重新从 1 起） */
  streak: number;
  /** 累计签到天数（统计用） */
  totalDays: number;
}

/** 通天塔进度：runFloor/runHpPct 为「当前这轮爬塔」的续战快照 */
export interface TowerState {
  bestFloor: number;
  /** 下一次进入的层数（1 起） */
  runFloor: number;
  /** 续战 HP 比例（0~1，1 = 满血起手） */
  runHpPct: number;
  /** 续战技能 CD 快照：petId → 剩余回合，缺失视为就绪 */
  runCds: Record<string, number>;
  /** 本轮已战败，需消耗重置次数才能继续 */
  runEnded: boolean;
  /** resetDate / resetsUsed 所属日期 */
  resetDate: string;
  /** 今日已用重置次数（免费 + 广告） */
  resetsUsed: number;
  /** 已领取的层数里程碑 */
  claimedMilestones: number[];
  /**
   * 本轮登塔已获灵机：id → 叠加层数。
   * 只在本 run 内有效，战败重置时清零 —— build 是临时的才有重开价值。
   */
  runBlesses: Record<string, number>;
  /** 本 run 已结算过基础塔币的最高层（防止回退重爬重复计币） */
  runReachedFloor: number;
  /** 塔币（登塔印记）：唯一跨 run 保留的产出 */
  coins: number;
  /** coinBaseToday / exchangeUsed 所属日期 */
  coinDate: string;
  /** 今日已发放的基础塔币（突破与守关奖励不计入） */
  coinBaseToday: number;
  /** 传承树：节点 id → 已解锁等级（永久，不随 run 清零） */
  legacy: Record<string, number>;
  /** 本轮剩余机缘重掷次数（由传承「重掷」提供） */
  runRerollsLeft: number;
  /** 今日各兑换项已用次数 */
  exchangeUsed: Record<string, number>;
  /**
   * 当前层的可选路径（层类型 id）。
   * 抽出后落盘，玩家退出重进不会刷出更好的分支。
   */
  runPaths: string[];
  /** runPaths 对应的层数，与 runFloor 不符时重抽 */
  runPathsFloor: number;
  /** 本层已选定的路径类型，战斗结算时读取（空 = 未选） */
  runPathKind: string;
}

export interface SaveData {
  version: number;
  coins: number;
  /** 抽卡货币：灵玉 */
  lingyu: number;
  /** 招募券（十连券等，预留） */
  tickets: number;
  /** 抽卡硬保底计数（连续未出 SSR+ 抽数） */
  gachaSinceHigh: number;
  /** UR 天井计数（连续未出 UR 抽数，与 gachaSinceHigh 独立），v7 起 */
  gachaSinceUr: number;
  /** 通用碎片：可折算成任意宠的本体碎片（折算率见 ECONOMY.universal），v7 起 */
  universalShards: number;
  /** 升级经验池（关卡掉落，跨宠共享，升级时按需消耗） */
  exp: number;
  /** stageId → 最佳星数（1~3） */
  stars: Record<string, number>;
  /** 当前编队（宠物 id，1~5 只） */
  team: string[];
  /** 已拥有灵宠 → 养成进度 */
  ownedPets: Record<string, OwnedPet>;
  /** 未拥有灵宠的碎片暂存（解锁该宠时并入 OwnedPet.shards，修复碎片丢弃） */
  pendingShards: Record<string, number>;
  /** 已招募新宠次数（招募定价用，含碎片溢出招募） */
  recruitedCount: number;
  /** 图鉴里程碑已结算到的拥有数（每 ECONOMY.milestone.codexEvery 只发灵玉） */
  codexRewarded: number;
  /** 侧边栏复访奖励最后领取日期（YYYY-MM-DD，抖音必接） */
  sidebarRewardDate: string;
  /** 日循环（秘境次数 / 日常任务 / 首胜），v6 起 */
  daily: DailyState;
  /** 七日签到，v6 起 */
  checkin: CheckinState;
  /** 通天塔，v6 起 */
  tower: TowerState;
  /** 体力（惰性恢复，见 game/staminaService.ts），v7 起 */
  stamina: StaminaState;
}

/** 招募结果 */
export interface RecruitResult {
  petId: string;
  /** true = 已全收集，本次转为碎片 */
  duplicate: boolean;
  shards?: number;
}

export function initialOwned(): Record<string, OwnedPet> {
  const owned: Record<string, OwnedPet> = {};
  for (const id of DEFAULT_TEAM) {
    owned[id] = { level: INITIAL_PET_LEVEL, star: INITIAL_PET_STAR, shards: 0 };
  }
  return owned;
}

/** 指定日期的空日循环态（跨日重置与新号初始化共用） */
export function emptyDailyState(date = ''): DailyState {
  return {
    date,
    realmRuns: 0,
    questProgress: {},
    questClaimed: [],
    firstWinDate: '',
    adUsage: {},
  };
}

export function emptyCheckinState(): CheckinState {
  return { lastDate: '', streak: 0, totalDays: 0 };
}

export function emptyTowerState(): TowerState {
  return {
    bestFloor: 0,
    runFloor: 1,
    runHpPct: 1,
    runCds: {},
    runEnded: false,
    resetDate: '',
    resetsUsed: 0,
    claimedMilestones: [],
    runBlesses: {},
    runReachedFloor: 0,
    coins: 0,
    coinDate: '',
    coinBaseToday: 0,
    legacy: {},
    runRerollsLeft: 0,
    exchangeUsed: {},
    runPaths: [],
    runPathsFloor: 0,
    runPathKind: '',
  };
}

export function initialData(): SaveData {
  return {
    version: SAVE_VERSION,
    coins: 0,
    lingyu: ECONOMY.gacha.starterLingyu,
    tickets: 0,
    gachaSinceHigh: 0,
    gachaSinceUr: 0,
    universalShards: 0,
    exp: 0,
    stars: {},
    team: [...DEFAULT_TEAM],
    ownedPets: initialOwned(),
    pendingShards: {},
    recruitedCount: 0,
    // 初始阵容不计入里程碑，从后续新宠开始累计
    codexRewarded: DEFAULT_TEAM.length,
    sidebarRewardDate: '',
    daily: emptyDailyState(),
    checkin: emptyCheckinState(),
    tower: emptyTowerState(),
    stamina: emptyStaminaState(),
  };
}

/**
 * 解析存档，缺字段回退默认；v3 起迁移灵宠 ID，v5 起 Boss 关统一到第 8 关，
 * v6 起补齐 daily/checkin/tower（老档直接吃缺省空态，等价于「今天还没开始玩」），
 * v7 起补齐 gachaSinceUr / universalShards / stamina（缺失即从 0 与满瓶起算）。
 */
export function parseSaveData(parsed: Partial<SaveData> & { discovered?: unknown }): SaveData {
  const migrated = migratePetIdsInPartialSave(parsed);
  const owned = sanitizeOwned(migrated.ownedPets);
  const ownedCount = Object.keys(owned).length;
  const fromVersion = typeof migrated.version === 'number' ? migrated.version : 0;
  return {
    version: SAVE_VERSION,
    coins: typeof migrated.coins === 'number' ? migrated.coins : 0,
    lingyu: typeof migrated.lingyu === 'number' ? migrated.lingyu : ECONOMY.gacha.starterLingyu,
    tickets: typeof migrated.tickets === 'number' ? migrated.tickets : 0,
    gachaSinceHigh: typeof migrated.gachaSinceHigh === 'number' ? migrated.gachaSinceHigh : 0,
    gachaSinceUr: typeof migrated.gachaSinceUr === 'number'
      ? Math.max(0, Math.floor(migrated.gachaSinceUr))
      : 0,
    universalShards: typeof migrated.universalShards === 'number'
      ? Math.max(0, Math.floor(migrated.universalShards))
      : 0,
    exp: typeof migrated.exp === 'number' ? migrated.exp : 0,
    stars: migrateStageStars(
      migrated.stars && typeof migrated.stars === 'object' ? migrated.stars : {},
      fromVersion,
    ),
    ownedPets: owned,
    pendingShards: sanitizeShardLedger(migrated.pendingShards, owned),
    team: sanitizeTeam(migrated.team, owned),
    recruitedCount: typeof migrated.recruitedCount === 'number'
      ? migrated.recruitedCount
      : countNonInitial(owned),
    // 初始阵容不计入可领：老档若基准偏低，抬到至少 DEFAULT_TEAM.length
    codexRewarded: (() => {
      const raw = typeof migrated.codexRewarded === 'number'
        ? migrated.codexRewarded
        : ownedCount;
      const baseline = DEFAULT_TEAM.length;
      return ownedCount >= baseline ? Math.max(raw, baseline) : raw;
    })(),
    sidebarRewardDate: typeof migrated.sidebarRewardDate === 'string'
      ? migrated.sidebarRewardDate
      : '',
    daily: sanitizeDaily(migrated.daily),
    checkin: sanitizeCheckin(migrated.checkin),
    tower: sanitizeTower(migrated.tower),
    stamina: sanitizeStamina(migrated.stamina),
  };
}

/** 老档无体力字段 → 按满瓶开局（未上线，不需要向下兼容惩罚） */
function sanitizeStamina(raw: unknown): StaminaState {
  const out = emptyStaminaState();
  if (!raw || typeof raw !== 'object') return out;
  const s = raw as Partial<StaminaState>;
  if (typeof s.value === 'number' && Number.isFinite(s.value)) {
    out.value = Math.max(0, Math.floor(s.value));
  }
  if (typeof s.lastRegenMs === 'number' && Number.isFinite(s.lastRegenMs) && s.lastRegenMs > 0) {
    out.lastRegenMs = Math.floor(s.lastRegenMs);
  }
  return out;
}

function sanitizeDaily(raw: unknown): DailyState {
  const out = emptyDailyState();
  if (!raw || typeof raw !== 'object') return out;
  const d = raw as Partial<DailyState>;
  if (typeof d.date === 'string') out.date = d.date;
  if (typeof d.firstWinDate === 'string') out.firstWinDate = d.firstWinDate;
  out.realmRuns = Math.max(0, typeof d.realmRuns === 'number' ? Math.floor(d.realmRuns) : 0);
  if (d.questProgress && typeof d.questProgress === 'object') {
    for (const [id, v] of Object.entries(d.questProgress as Record<string, unknown>)) {
      const n = typeof v === 'number' ? Math.floor(v) : 0;
      if (n > 0) out.questProgress[id] = n;
    }
  }
  if (Array.isArray(d.questClaimed)) {
    out.questClaimed = [...new Set(d.questClaimed.filter((id): id is string => typeof id === 'string'))];
  }
  if (d.adUsage && typeof d.adUsage === 'object') {
    for (const [id, v] of Object.entries(d.adUsage as Record<string, unknown>)) {
      const n = typeof v === 'number' ? Math.floor(v) : 0;
      if (n > 0) out.adUsage[id] = n;
    }
  }
  return out;
}

function sanitizeCheckin(raw: unknown): CheckinState {
  const out = emptyCheckinState();
  if (!raw || typeof raw !== 'object') return out;
  const c = raw as Partial<CheckinState>;
  if (typeof c.lastDate === 'string') out.lastDate = c.lastDate;
  out.streak = Math.max(0, typeof c.streak === 'number' ? Math.floor(c.streak) : 0);
  out.totalDays = Math.max(0, typeof c.totalDays === 'number' ? Math.floor(c.totalDays) : 0);
  return out;
}

function sanitizeTower(raw: unknown): TowerState {
  const out = emptyTowerState();
  if (!raw || typeof raw !== 'object') return out;
  const t = raw as Partial<TowerState>;
  out.bestFloor = Math.max(0, typeof t.bestFloor === 'number' ? Math.floor(t.bestFloor) : 0);
  out.runFloor = Math.max(1, typeof t.runFloor === 'number' ? Math.floor(t.runFloor) : 1);
  out.runHpPct = typeof t.runHpPct === 'number' && Number.isFinite(t.runHpPct)
    ? Math.min(1, Math.max(0, t.runHpPct))
    : 1;
  out.runEnded = t.runEnded === true;
  if (t.runCds && typeof t.runCds === 'object') {
    for (const [id, v] of Object.entries(t.runCds as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        out.runCds[id] = Math.floor(v);
      }
    }
  }
  if (typeof t.resetDate === 'string') out.resetDate = t.resetDate;
  out.resetsUsed = Math.max(0, typeof t.resetsUsed === 'number' ? Math.floor(t.resetsUsed) : 0);
  if (Array.isArray(t.claimedMilestones)) {
    out.claimedMilestones = [...new Set(
      t.claimedMilestones.filter((n): n is number => typeof n === 'number' && n > 0).map(Math.floor),
    )];
  }
  if (t.runBlesses && typeof t.runBlesses === 'object') {
    for (const [id, v] of Object.entries(t.runBlesses as Record<string, unknown>)) {
      const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
      if (n > 0) out.runBlesses[id] = n;
    }
  }
  out.runReachedFloor = Math.max(
    0,
    typeof t.runReachedFloor === 'number' ? Math.floor(t.runReachedFloor) : 0,
  );
  out.coins = Math.max(0, typeof t.coins === 'number' && Number.isFinite(t.coins) ? Math.floor(t.coins) : 0);
  if (typeof t.coinDate === 'string') out.coinDate = t.coinDate;
  out.coinBaseToday = Math.max(
    0,
    typeof t.coinBaseToday === 'number' ? Math.floor(t.coinBaseToday) : 0,
  );
  if (t.legacy && typeof t.legacy === 'object') {
    for (const [id, v] of Object.entries(t.legacy as Record<string, unknown>)) {
      const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
      if (n > 0) out.legacy[id] = n;
    }
  }
  out.runRerollsLeft = Math.max(
    0,
    typeof t.runRerollsLeft === 'number' ? Math.floor(t.runRerollsLeft) : 0,
  );
  if (t.exchangeUsed && typeof t.exchangeUsed === 'object') {
    for (const [id, v] of Object.entries(t.exchangeUsed as Record<string, unknown>)) {
      const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
      if (n > 0) out.exchangeUsed[id] = n;
    }
  }
  if (Array.isArray(t.runPaths)) {
    out.runPaths = t.runPaths.filter((k): k is string => typeof k === 'string');
  }
  out.runPathsFloor = Math.max(
    0,
    typeof t.runPathsFloor === 'number' ? Math.floor(t.runPathsFloor) : 0,
  );
  if (typeof t.runPathKind === 'string') out.runPathKind = t.runPathKind;
  return out;
}

/** v1 → v4：保留 coins/stars/team，拥有列表 = 默认队 ∪ 原队伍 */
export function migrateLegacySave(legacy: { coins?: number; stars?: unknown; team?: unknown }): SaveData {
  const owned = initialOwned();
  if (Array.isArray(legacy.team)) {
    for (const id of legacy.team) {
      if (typeof id !== 'string') continue;
      const mapped = migrateCreatureId(id);
      if (mapped && PET_MAP.has(mapped) && !owned[mapped]) {
        owned[mapped] = { level: INITIAL_PET_LEVEL, star: INITIAL_PET_STAR, shards: 0 };
      }
    }
  }
  return parseSaveData({
    coins: legacy.coins,
    stars: legacy.stars && typeof legacy.stars === 'object'
      ? migrateStageStars(legacy.stars as Record<string, number>, 0)
      : {},
    ownedPets: owned,
    team: Array.isArray(legacy.team)
      ? legacy.team.filter((id): id is string => typeof id === 'string')
      : undefined,
  });
}

/** 暂存碎片清洗：仅保留合法宠 id、非负整数，且必须是「未拥有」的宠 */
function sanitizeShardLedger(
  ledger: unknown,
  owned: Record<string, OwnedPet>,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (ledger && typeof ledger === 'object') {
    for (const [id, v] of Object.entries(ledger as Record<string, unknown>)) {
      if (!PET_MAP.has(id) || owned[id]) continue;
      const n = typeof v === 'number' ? Math.floor(v) : 0;
      if (n > 0) out[id] = n;
    }
  }
  return out;
}

function sanitizeOwned(owned: unknown): Record<string, OwnedPet> {
  if (!owned || typeof owned !== 'object') return initialOwned();
  const out: Record<string, OwnedPet> = {};
  for (const [id, v] of Object.entries(owned as Record<string, unknown>)) {
    if (!PET_MAP.has(id) || !v || typeof v !== 'object') continue;
    const o = v as Partial<OwnedPet>;
    const star = clampInt(o.star, 1, 5, INITIAL_PET_STAR);
    const maxLv = getStarProfile(star).maxLevel;
    out[id] = {
      star,
      level: clampInt(o.level, 1, maxLv, INITIAL_PET_LEVEL),
      shards: Math.max(0, typeof o.shards === 'number' ? Math.floor(o.shards) : 0),
    };
  }
  // 存档异常导致空拥有时，回退初始阵容，保证可玩
  return Object.keys(out).length > 0 ? out : initialOwned();
}

/** 编队清洗：去重、剔除未拥有、限长，空了回退默认队（取已拥有者） */
function sanitizeTeam(team: unknown, owned: Record<string, OwnedPet>): string[] {
  const isOwned = (id: string) => !!owned[id];
  if (Array.isArray(team)) {
    const valid = [...new Set(team)]
      .filter((id): id is string => typeof id === 'string' && isOwned(id))
      .slice(0, TEAM_SIZE);
    if (valid.length > 0) return valid;
  }
  const fallback = DEFAULT_TEAM.filter(isOwned).slice(0, TEAM_SIZE);
  return fallback.length > 0 ? fallback : Object.keys(owned).slice(0, TEAM_SIZE);
}

function countNonInitial(owned: Record<string, OwnedPet>): number {
  return Object.keys(owned).filter((id) => !DEFAULT_TEAM.includes(id)).length;
}

function mergeOwned(into: Record<string, OwnedPet>, id: string, pet: OwnedPet): void {
  const prev = into[id];
  if (!prev) {
    into[id] = pet;
    return;
  }
  into[id] = {
    star: Math.max(prev.star, pet.star),
    level: Math.max(prev.level, pet.level),
    shards: Math.max(prev.shards, pet.shards),
  };
}

function migratePetIdsInPartialSave(parsed: Partial<SaveData> & { discovered?: unknown }): Partial<SaveData> {
  const ownedPets: Record<string, OwnedPet> = {};
  if (parsed.ownedPets && typeof parsed.ownedPets === 'object') {
    for (const [id, v] of Object.entries(parsed.ownedPets)) {
      const mapped = migrateCreatureId(id);
      if (!mapped || !v || typeof v !== 'object') continue;
      mergeOwned(ownedPets, mapped, v as OwnedPet);
    }
  }

  const pendingShards: Record<string, number> = {};
  if (parsed.pendingShards && typeof parsed.pendingShards === 'object') {
    for (const [id, v] of Object.entries(parsed.pendingShards)) {
      const mapped = migrateCreatureId(id);
      if (!mapped) continue;
      const n = typeof v === 'number' ? Math.floor(v) : 0;
      if (n > 0) pendingShards[mapped] = (pendingShards[mapped] ?? 0) + n;
    }
  }

  const team = Array.isArray(parsed.team)
    ? parsed.team
      .map((id) => (typeof id === 'string' ? migrateCreatureId(id) : null))
      .filter((id): id is string => !!id)
    : parsed.team;

  return { ...parsed, ownedPets, pendingShards, team };
}

function migrateStageStars(stars: Record<string, number>, fromVersion: number): Record<string, number> {
  const validIds = new Set(STAGES.map((s) => s.id));
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(stars)) {
    // v5：旧 Boss 关 id（如 stage_1_5）迁到统一第 8 关；仅升级时跑一次，避免与新铺垫关撞 id
    const mapped = fromVersion < 5 ? (STAGE_STAR_MIGRATION[id] ?? id) : id;
    if (validIds.has(mapped)) {
      out[mapped] = Math.max(out[mapped] ?? 0, typeof n === 'number' ? n : 0);
    }
  }
  return out;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}
