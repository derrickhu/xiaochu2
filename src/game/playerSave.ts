import {
  DEFAULT_TEAM,
  INITIAL_PET_LEVEL,
  INITIAL_PET_STAR,
  PET_MAP,
  TEAM_SIZE,
} from '@/balance/pets';
import { getStarProfile } from '@/balance/growth';
import { ECONOMY } from '@/balance/economy';

export const SAVE_KEY = 'xiaochu2_save_v2';
export const LEGACY_SAVE_KEY = 'xiaochu2_save_v1';
export const SAVE_VERSION = 2;

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
  /** 已收录生物 id；初始 5 只赠送宠开局即同时进入 ownedPets / discovered / team。 */
  discovered: string[];
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
    discovered: [...DEFAULT_TEAM],
  };
}

/** 解析 v2 存档，缺字段回退默认 */
export function parseSaveData(parsed: Partial<SaveData>): SaveData {
  const owned = sanitizeOwned(parsed.ownedPets);
  return {
    version: SAVE_VERSION,
    coins: typeof parsed.coins === 'number' ? parsed.coins : 0,
    lingyu: typeof parsed.lingyu === 'number' ? parsed.lingyu : ECONOMY.gacha.starterLingyu,
    tickets: typeof parsed.tickets === 'number' ? parsed.tickets : 0,
    gachaSinceHigh: typeof parsed.gachaSinceHigh === 'number' ? parsed.gachaSinceHigh : 0,
    exp: typeof parsed.exp === 'number' ? parsed.exp : 0,
    stars: parsed.stars && typeof parsed.stars === 'object' ? parsed.stars : {},
    ownedPets: owned,
    pendingShards: sanitizeShardLedger(parsed.pendingShards, owned),
    team: sanitizeTeam(parsed.team, owned),
    recruitedCount: typeof parsed.recruitedCount === 'number'
      ? parsed.recruitedCount
      : countNonInitial(owned),
    discovered: sanitizeDiscovered(parsed.discovered, owned),
  };
}

/** v1 → v2：保留 coins/stars/team，拥有列表 = 默认队 ∪ 原队伍 */
export function migrateLegacySave(legacy: { coins?: number; stars?: unknown; team?: unknown }): SaveData {
  const owned = initialOwned();
  if (Array.isArray(legacy.team)) {
    for (const id of legacy.team) {
      if (typeof id === 'string' && PET_MAP.has(id) && !owned[id]) {
        owned[id] = { level: INITIAL_PET_LEVEL, star: INITIAL_PET_STAR, shards: 0 };
      }
    }
  }
  return {
    version: SAVE_VERSION,
    coins: typeof legacy.coins === 'number' ? legacy.coins : 0,
    lingyu: ECONOMY.gacha.starterLingyu,
    tickets: 0,
    gachaSinceHigh: 0,
    exp: 0,
    stars: legacy.stars && typeof legacy.stars === 'object' ? (legacy.stars as Record<string, number>) : {},
    ownedPets: owned,
    pendingShards: {},
    team: sanitizeTeam(legacy.team, owned),
    recruitedCount: countNonInitial(owned),
    discovered: sanitizeDiscovered(undefined, owned),
  };
}

/** 收录列表清洗：仅保留合法生物 id；并入初始赠送 + 已拥有，保证可获取池一致 */
function sanitizeDiscovered(discovered: unknown, owned: Record<string, OwnedPet>): string[] {
  const set = new Set<string>(DEFAULT_TEAM);
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

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}
