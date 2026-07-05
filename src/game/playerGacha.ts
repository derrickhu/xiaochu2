import type { Element } from '@/balance/combat';
import { ECONOMY } from '@/balance/economy';
import {
  INITIAL_PET_LEVEL,
  INITIAL_PET_STAR,
  PETS,
  type PetDef,
} from '@/balance/pets';
import { pullOne, pullTen, type GachaState, type PullOutcome } from '@/game/gacha/Gacha';
import type { SaveData } from './playerSave';

export type { PullOutcome } from '@/game/gacha/Gacha';

export function addLingyu(data: SaveData, amount: number): boolean {
  if (amount === 0) return false;
  data.lingyu = Math.max(0, data.lingyu + Math.floor(amount));
  return true;
}

/** 单抽：扣灵玉，结算保底/重复转碎片/护航包。element 可选，限定五行子池 */
export function pullGachaSingle(
  data: SaveData,
  rng: () => number = Math.random,
  element?: Element,
): PullOutcome | null {
  if (data.lingyu < ECONOMY.gacha.singleCost) return null;
  data.lingyu -= ECONOMY.gacha.singleCost;
  const state: GachaState = { sinceHigh: data.gachaSinceHigh };
  const outcome = pullOne(
    rng, state, (id) => isOwned(data, id), 1,
    gachaPoolPets(element), discoveryWeightFn(data),
  );
  applyPull(data, outcome);
  data.gachaSinceHigh = state.sinceHigh;
  return outcome;
}

/** 十连：扣灵玉，含 SR+ 保底。element 可选，限定五行子池 */
export function pullGachaTen(
  data: SaveData,
  rng: () => number = Math.random,
  element?: Element,
): PullOutcome[] | null {
  if (data.lingyu < ECONOMY.gacha.tenCost) return null;
  data.lingyu -= ECONOMY.gacha.tenCost;
  const state: GachaState = { sinceHigh: data.gachaSinceHigh };
  const outcomes = pullTen(
    rng, state, (id) => isOwned(data, id),
    gachaPoolPets(element), discoveryWeightFn(data),
  );
  for (const outcome of outcomes) applyPull(data, outcome);
  data.gachaSinceHigh = state.sinceHigh;
  return outcomes;
}

function isOwned(data: SaveData, petId: string): boolean {
  return !!data.ownedPets[petId];
}

/** 解锁一只宠（抽卡/赠送）：并入暂存碎片，初始等级/星级 */
function unlockPet(data: SaveData, petId: string): void {
  if (isOwned(data, petId)) return;
  const pending = data.pendingShards[petId] ?? 0;
  data.ownedPets[petId] = {
    level: INITIAL_PET_LEVEL,
    star: INITIAL_PET_STAR,
    shards: pending,
  };
  delete data.pendingShards[petId];
  data.recruitedCount++;
  // 拥有即视为已收录（保证可获取池/图鉴一致）
  if (!data.discovered.includes(petId)) data.discovered.push(petId);
}

/**
 * 出货池 = 全花名册（element 可选限定五行子池）。
 * 收录不再限制“能不能抽到”，而是转为档内 UP 权重（discoveryWeightFn），
 * 消灭旧版「13/30 只永久不可达」的死池问题。
 */
export function gachaPoolPets(element?: Element): PetDef[] {
  return PETS.filter((p) => !element || p.element === element);
}

/** 档内权重：已收录（图鉴 UP）宠 ×discoveryUpWeight，未收录 = 1 */
function discoveryWeightFn(data: SaveData): (pet: PetDef) => number {
  const up = ECONOMY.gacha.discoveryUpWeight;
  return (pet) => (data.discovered.includes(pet.id) ? up : 1);
}

/** 落库单次抽卡结果：新宠解锁 / 重复转碎片（不触发保存，批量后统一存） */
function applyPull(data: SaveData, outcome: PullOutcome): void {
  if (outcome.duplicate) {
    const owned = data.ownedPets[outcome.petId];
    if (owned) owned.shards += outcome.shards;
    else data.pendingShards[outcome.petId] =
      (data.pendingShards[outcome.petId] ?? 0) + outcome.shards;
  } else {
    unlockPet(data, outcome.petId);
    applyEscortPack(data, outcome);
  }
}

/** NEW SSR/UR 护航包：附赠本体碎片 + 通用经验，并回写到 outcome 供 UI 展示 */
function applyEscortPack(data: SaveData, outcome: PullOutcome): void {
  const escort = ECONOMY.gacha.escort[outcome.rarity];
  if (!escort) return;
  const owned = data.ownedPets[outcome.petId];
  if (owned) owned.shards += escort.shards;
  data.exp += escort.exp;
  outcome.escort = { shards: escort.shards, exp: escort.exp };
}
