import {
  DEFAULT_TEAM,
  DEFAULT_SUMMON_POOL_R_IDS,
  INITIAL_PET_LEVEL,
  INITIAL_PET_STAR,
  PET_MAP,
  TEAM_SIZE,
} from '@/balance/pets';
import { STAGES, STAGE_STAR_MIGRATION } from '@/balance/stages';
import { migrateCreatureId } from '@/balance/creatureIdMigration';
import { getStarProfile } from '@/balance/growth';
import { ECONOMY } from '@/balance/economy';

export const SAVE_KEY = 'xiaochu2_save_v2';
export const LEGACY_SAVE_KEY = 'xiaochu2_save_v1';
export const SAVE_VERSION = 3;

/** 单只灵宠的养成进度 */
export interface OwnedPet {
  level: number;
  star: number;
  shards: number;
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
  /** 已收录生物 id；R 档开局即入召唤池，SR+ 由章节 Boss 收录扩展。 */
  discovered: string[];
  /** 图鉴里程碑已结算到的收录数（每 ECONOMY.milestone.codexEvery 只发灵玉） */
  codexRewarded: number;
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

export function initialData(): SaveData {
  return {
    version: SAVE_VERSION,
    coins: 0,
    lingyu: ECONOMY.gacha.starterLingyu,
    tickets: 0,
    gachaSinceHigh: 0,
    exp: 0,
    stars: {},
    team: [...DEFAULT_TEAM],
    ownedPets: initialOwned(),
    pendingShards: {},
    recruitedCount: 0,
    discovered: [...DEFAULT_SUMMON_POOL_R_IDS],
    // 初始收录池（R 档赠送）不计入里程碑，从后续收录开始累计
    codexRewarded: DEFAULT_SUMMON_POOL_R_IDS.length,
  };
}

/** 解析存档，缺字段回退默认；v3 起迁移灵宠 ID */
export function parseSaveData(parsed: Partial<SaveData>): SaveData {
  const migrated = migratePetIdsInPartialSave(parsed);
  const owned = sanitizeOwned(migrated.ownedPets);
  const discovered = sanitizeDiscovered(migrated.discovered, owned);
  return {
    version: SAVE_VERSION,
    coins: typeof migrated.coins === 'number' ? migrated.coins : 0,
    lingyu: typeof migrated.lingyu === 'number' ? migrated.lingyu : ECONOMY.gacha.starterLingyu,
    tickets: typeof migrated.tickets === 'number' ? migrated.tickets : 0,
    gachaSinceHigh: typeof migrated.gachaSinceHigh === 'number' ? migrated.gachaSinceHigh : 0,
    exp: typeof migrated.exp === 'number' ? migrated.exp : 0,
    stars: migrateStageStars(migrated.stars && typeof migrated.stars === 'object' ? migrated.stars : {}),
    ownedPets: owned,
    pendingShards: sanitizeShardLedger(migrated.pendingShards, owned),
    team: sanitizeTeam(migrated.team, owned),
    recruitedCount: typeof migrated.recruitedCount === 'number'
      ? migrated.recruitedCount
      : countNonInitial(owned),
    discovered,
    // 旧档无此字段：从当前收录数起算，不追溯补发
    codexRewarded: typeof migrated.codexRewarded === 'number'
      ? migrated.codexRewarded
      : discovered.length,
  };
}

/** v1 → v3：保留 coins/stars/team，拥有列表 = 默认队 ∪ 原队伍 */
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
      ? migrateStageStars(legacy.stars as Record<string, number>)
      : {},
    ownedPets: owned,
    team: Array.isArray(legacy.team)
      ? legacy.team.filter((id): id is string => typeof id === 'string')
      : undefined,
  });
}

/** 收录列表清洗：R 档默认池 + 已拥有 + 存档收录 */
function sanitizeDiscovered(discovered: unknown, owned: Record<string, OwnedPet>): string[] {
  const set = new Set<string>(DEFAULT_SUMMON_POOL_R_IDS);
  for (const id of Object.keys(owned)) set.add(id);
  if (Array.isArray(discovered)) {
    for (const id of discovered) {
      if (typeof id === 'string' && PET_MAP.has(id)) set.add(id);
    }
  }
  return [...set];
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

function migratePetIdsInPartialSave(parsed: Partial<SaveData>): Partial<SaveData> {
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

  const discovered = Array.isArray(parsed.discovered)
    ? parsed.discovered
      .map((id) => (typeof id === 'string' ? migrateCreatureId(id) : null))
      .filter((id): id is string => !!id)
    : parsed.discovered;

  return { ...parsed, ownedPets, pendingShards, team, discovered };
}

function migrateStageStars(stars: Record<string, number>): Record<string, number> {
  const validIds = new Set(STAGES.map((s) => s.id));
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(stars)) {
    const mapped = STAGE_STAR_MIGRATION[id] ?? id;
    if (validIds.has(mapped)) {
      out[mapped] = Math.max(out[mapped] ?? 0, n);
    }
  }
  return out;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}
