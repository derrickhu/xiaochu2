import type { Element } from '@/balance/combat';
import { ECONOMY } from '@/balance/economy';
import {
  INITIAL_PET_LEVEL,
  INITIAL_PET_STAR,
  PETS,
  type PetDef,
} from '@/balance/pets';
import {
  bannerWeightFn,
  pullOne,
  pullTen,
  type GachaState,
  type PullOutcome,
} from '@/game/gacha/Gacha';
import { isFeatured } from '@/balance/gachaBanner';
import type { SaveData } from './playerSave';

export type { PullOutcome } from '@/game/gacha/Gacha';

export function addLingyu(data: SaveData, amount: number): boolean {
  if (amount === 0) return false;
  data.lingyu = Math.max(0, data.lingyu + Math.floor(amount));
  return true;
}

/** 单抽：扣灵玉，结算保底/重复转碎片。element 可选，限定五行子池 */
export function pullGachaSingle(
  data: SaveData,
  rng: () => number = Math.random,
  element?: Element,
  /** 广告免费单抽：跳过灵玉结算，保底计数与出货口径完全一致 */
  opts?: { free?: boolean },
): PullOutcome | null {
  if (!opts?.free) {
    if (data.lingyu < ECONOMY.gacha.singleCost) return null;
    data.lingyu -= ECONOMY.gacha.singleCost;
  }
  const state = gachaStateOf(data);
  const pool = gachaPoolPets(element);
  const outcome = pullOne(
    rng, state, (id) => isOwned(data, id), 1,
    pool, bannerWeightFn(pool),
  );
  applyPull(data, outcome);
  writeGachaState(data, state);
  return outcome;
}

/** 十连：扣灵玉，含 SR+ 保底。element 可选，限定五行子池 */
export function pullGachaTen(
  data: SaveData,
  rng: () => number = Math.random,
  element?: Element,
  /** 十连券已在调用方扣除，这里跳过灵玉结算 */
  opts?: { free?: boolean },
): PullOutcome[] | null {
  if (!opts?.free) {
    if (data.lingyu < ECONOMY.gacha.tenCost) return null;
    data.lingyu -= ECONOMY.gacha.tenCost;
  }
  const state = gachaStateOf(data);
  const pool = gachaPoolPets(element);
  const outcomes = pullTen(
    rng, state, (id) => isOwned(data, id),
    pool, bannerWeightFn(pool),
  );
  for (const outcome of outcomes) applyPull(data, outcome);
  writeGachaState(data, state);
  return outcomes;
}

function gachaStateOf(data: SaveData): GachaState {
  return { sinceHigh: data.gachaSinceHigh, sinceUr: data.gachaSinceUr };
}

function writeGachaState(data: SaveData, state: GachaState): void {
  data.gachaSinceHigh = state.sinceHigh;
  data.gachaSinceUr = state.sinceUr;
}

function isOwned(data: SaveData, petId: string): boolean {
  return !!data.ownedPets[petId];
}

/** 解锁一只宠（Boss 掉落 / 抽卡 / 招募）：并入暂存碎片，初始等级/星级 */
export function unlockPetInSave(data: SaveData, petId: string): boolean {
  if (isOwned(data, petId)) return false;
  const pending = data.pendingShards[petId] ?? 0;
  data.ownedPets[petId] = {
    level: INITIAL_PET_LEVEL,
    star: INITIAL_PET_STAR,
    shards: pending,
  };
  delete data.pendingShards[petId];
  data.recruitedCount++;
  return true;
}

/** 出货池 = 全花名册（element 可选限定五行子池） */
export function gachaPoolPets(element?: Element): PetDef[] {
  return PETS.filter((p) => !element || p.element === element);
}

/** 落库单次抽卡结果：新宠解锁 / 重复转碎片（不触发保存，批量后统一存） */
function applyPull(data: SaveData, outcome: PullOutcome): void {
  outcome.featured = isFeatured(outcome.petId);
  if (outcome.duplicate) {
    const owned = data.ownedPets[outcome.petId];
    if (owned) owned.shards += outcome.shards;
    else data.pendingShards[outcome.petId] =
      (data.pendingShards[outcome.petId] ?? 0) + outcome.shards;
    applyUniversalBonus(data, outcome);
  } else {
    unlockPetInSave(data, outcome.petId);
  }
}

/** 重复 SSR/UR 追加通用碎片：让「又是这只」也能推进别的宠升星 */
function applyUniversalBonus(data: SaveData, outcome: PullOutcome): void {
  const gain = ECONOMY.gacha.duplicateUniversal[outcome.rarity] ?? 0;
  if (gain <= 0) return;
  data.universalShards += gain;
  outcome.universal = gain;
}
