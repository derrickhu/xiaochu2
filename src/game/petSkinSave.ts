import { SKIN_AD_COST, petSkinById } from '@/balance/petSkins';
import type { SaveData } from '@/game/playerSave';

export type SkinBuyResult = 'ok' | 'already' | 'poor' | 'need_pet' | 'unknown';
/** owned = 这次看完刚好凑够，已经入账并穿上；progress = 还差几次 */
export type SkinAdResult = 'owned' | 'progress' | 'already' | 'need_pet' | 'unknown';

function dropSkinAdProgress(data: SaveData, skinId: string): void {
  if (data.skinAdWatched[skinId] == null) return;
  const next = { ...data.skinAdWatched };
  delete next[skinId];
  data.skinAdWatched = next;
}

function grantSkin(data: SaveData, skinId: string, petId: string): void {
  data.ownedSkins = [...data.ownedSkins, skinId];
  data.equippedSkins = { ...data.equippedSkins, [petId]: skinId };
  dropSkinAdProgress(data, skinId);
}

/** 购买并立刻穿上。灵玉不足、没有这只灵宠、重复购买都不扣费。 */
export function buyPetSkin(data: SaveData, skinId: string): SkinBuyResult {
  const skin = petSkinById(skinId);
  if (!skin) return 'unknown';
  if (data.ownedSkins.includes(skin.id)) return 'already';
  if (!data.ownedPets[skin.petId]) return 'need_pet';
  if (data.lingyu < skin.priceLingyu) return 'poor';
  data.lingyu -= skin.priceLingyu;
  grantSkin(data, skin.id, skin.petId);
  return 'ok';
}

/**
 * 记一次已经看完的外观广告。凑够 SKIN_AD_COST 次就入账并穿上，不扣灵玉。
 * 没看完的次数留在 skinAdWatched，下次接着计。
 */
export function noteSkinAdWatch(data: SaveData, skinId: string): SkinAdResult {
  const skin = petSkinById(skinId);
  if (!skin) return 'unknown';
  if (data.ownedSkins.includes(skin.id)) return 'already';
  if (!data.ownedPets[skin.petId]) return 'need_pet';
  const next = (data.skinAdWatched[skin.id] ?? 0) + 1;
  if (next >= SKIN_AD_COST) {
    grantSkin(data, skin.id, skin.petId);
    return 'owned';
  }
  data.skinAdWatched = { ...data.skinAdWatched, [skin.id]: next };
  return 'progress';
}

export function equipPetSkin(data: SaveData, skinId: string): boolean {
  const skin = petSkinById(skinId);
  if (!skin || !data.ownedSkins.includes(skin.id)) return false;
  if (!data.ownedPets[skin.petId]) return false;
  data.equippedSkins = { ...data.equippedSkins, [skin.petId]: skin.id };
  return true;
}

export function unequipPetSkin(data: SaveData, petId: string): boolean {
  if (!data.equippedSkins[petId]) return false;
  const next = { ...data.equippedSkins };
  delete next[petId];
  data.equippedSkins = next;
  return true;
}
