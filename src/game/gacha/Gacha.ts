/**
 * 抽卡引擎（纯逻辑，RNG 注入，零渲染 / 零存档依赖）
 *
 * 解耦设计：
 * - 出货概率读 rarity.ts 的 gachaRate（与 statMult 解耦）。
 * - 保底（硬保底 SSR+ / 十连保底 SR+）在此结算，计数由调用方持久化传入。
 * - 是否重复由 isOwned 回调判定；重复宠转碎片数读 economy.ts。
 * 调用方（PlayerData）只负责扣灵玉、落库、改 owned/shards。
 */
import { PETS, type PetDef } from '@/balance/pets';
import { RARITIES, getRarity, type Rarity } from '@/balance/rarity';
import { ECONOMY } from '@/balance/economy';

export interface GachaState {
  /** 连续未出 SSR+ 的抽数（硬保底计数，跨抽持久化） */
  sinceHigh: number;
}

export interface PullOutcome {
  petId: string;
  rarity: Rarity;
  /** true = 抽到已拥有宠，本次转碎片 */
  duplicate: boolean;
  /** duplicate 时获得的碎片数（非重复为 0） */
  shards: number;
  /** 是否触发硬保底（UI 提示用） */
  pity: boolean;
}

const DEFAULT_POOL: readonly PetDef[] = PETS;

/** 池内实际出现的稀有度档位（升序） */
function poolRarityTiers(pool: readonly PetDef[]): Rarity[] {
  return [...new Set(pool.map((p) => p.rarity))].sort((a, b) => a - b) as Rarity[];
}

/**
 * 将「最低稀有度」约束落到池内可满足的档位。
 * 池内无 ≥ min 的宠时，回退到池内最高档（十连 SR 保底在仅 R 池时只能出 R）。
 */
function effectiveMinRarity(pool: readonly PetDef[], minRarity: Rarity): Rarity {
  const tiers = poolRarityTiers(pool);
  if (tiers.length === 0) return minRarity;
  const eligible = tiers.filter((t) => t >= minRarity);
  if (eligible.length > 0) return eligible[0];
  return tiers[tiers.length - 1];
}

/** 仅在「池内出现且 ≥ minRarity」的档位间，按 gachaRate 归一化抽取 */
function rollRarityForPool(
  rng: () => number,
  pool: readonly PetDef[],
  minRarity: Rarity,
): Rarity {
  const tiers = poolRarityTiers(pool).filter((t) => t >= minRarity);
  if (tiers.length === 0) return effectiveMinRarity(pool, minRarity);
  const total = tiers.reduce((s, t) => s + getRarity(t).gachaRate, 0);
  let r = rng() * total;
  for (const t of tiers) {
    r -= getRarity(t).gachaRate;
    if (r <= 0) return t;
  }
  return tiers[tiers.length - 1];
}

function pickPetOfRarity(rng: () => number, rarity: Rarity, pool: readonly PetDef[]): PetDef {
  const candidates = pool.filter((p) => p.rarity === rarity);
  if (candidates.length === 0) {
    // 该稀有度无宠时，回退到最接近的较低档，再不行回退到更高档
    const lower = pool.filter((p) => p.rarity < rarity).sort((a, b) => b.rarity - a.rarity);
    if (lower[0]) return lower[0];
    const higher = pool.filter((p) => p.rarity > rarity).sort((a, b) => a.rarity - b.rarity);
    return higher[0] ?? pool[0];
  }
  return candidates[Math.floor(rng() * candidates.length)];
}

/**
 * 单抽：按概率 + 硬保底出货。会就地更新 state.sinceHigh。
 * @param minRarity 本抽强制最低稀有（十连保底用，缺省 1）
 */
export function pullOne(
  rng: () => number,
  state: GachaState,
  isOwned: (petId: string) => boolean,
  minRarity: Rarity = 1,
  pool: readonly PetDef[] = DEFAULT_POOL,
): PullOutcome {
  const g = ECONOMY.gacha;
  const effPool = pool.length > 0 ? pool : DEFAULT_POOL;
  const pityHit = state.sinceHigh + 1 >= g.pitySSR;
  const rawFloor: Rarity = pityHit ? 3 : minRarity;
  const floor = effectiveMinRarity(effPool, rawFloor);
  const rarity = rollRarityForPool(rng, effPool, floor);

  if (rarity >= 3) state.sinceHigh = 0;
  else state.sinceHigh += 1;

  const pet = pickPetOfRarity(rng, rarity, effPool);
  // 展示与碎片结算一律以「实际出货宠」的稀有度为准（与卡面/图鉴一致）
  const actualRarity = pet.rarity;
  const duplicate = isOwned(pet.id);
  const shards = duplicate ? (g.duplicateShards[actualRarity] ?? 0) : 0;
  return { petId: pet.id, rarity: actualRarity, duplicate, shards, pity: pityHit };
}

/**
 * 十连：连抽 10 次，保证至少一只 SR+（rarity≥tenPullFloorRarity）。
 * isOwned 用调用方在「本批之前」的拥有快照即可（同批重复也按重复结算）。
 */
export function pullTen(
  rng: () => number,
  state: GachaState,
  isOwned: (petId: string) => boolean,
  pool: readonly PetDef[] = DEFAULT_POOL,
): PullOutcome[] {
  const g = ECONOMY.gacha;
  const out: PullOutcome[] = [];
  // 同批内已出现的也视为已拥有，避免一批多张同宠都按“新获得”
  const seen = new Set<string>();
  const ownedOrSeen = (id: string): boolean => isOwned(id) || seen.has(id);

  for (let i = 0; i < 10; i++) {
    const isLast = i === 9;
    const noFloorYet = !out.some((o) => o.rarity >= g.tenPullFloorRarity);
    const minRarity: Rarity = (isLast && noFloorYet)
      ? (g.tenPullFloorRarity as Rarity)
      : 1;
    const r = pullOne(rng, state, ownedOrSeen, minRarity, pool);
    seen.add(r.petId);
    out.push(r);
  }
  return out;
}
