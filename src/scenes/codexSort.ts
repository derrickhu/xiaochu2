import { PET_MAP } from '@/balance/pets';
import { PlayerData } from '@/game/PlayerData';

export interface PetGrowthOrderKey {
  owned: boolean;
  star: number;
  level: number;
  rarity: number;
  id: string;
}

/** 已有在前；同组内星级 → 等级 → 稀有度，高的靠前 */
export function compareCodexPetOrder(
  a: PetGrowthOrderKey,
  b: PetGrowthOrderKey,
): number {
  if (a.owned !== b.owned) return a.owned ? -1 : 1;
  if (b.star !== a.star) return b.star - a.star;
  if (b.level !== a.level) return b.level - a.level;
  if (b.rarity !== a.rarity) return b.rarity - a.rarity;
  return a.id.localeCompare(b.id);
}

export function petGrowthOrderKey(p: { id: string; rarity: number }): PetGrowthOrderKey {
  return {
    owned: PlayerData.isOwned(p.id),
    star: PlayerData.petStar(p.id),
    level: PlayerData.petLevel(p.id),
    rarity: p.rarity,
    id: p.id,
  };
}

/** 灵宠页 / 商店 / 编队共用 */
export function sortByGrowthOrder<T>(
  items: readonly T[],
  keyOf: (item: T) => PetGrowthOrderKey,
): T[] {
  return [...items].sort((a, b) => compareCodexPetOrder(keyOf(a), keyOf(b)));
}

export function sortPetsByGrowthOrder<T extends { id: string; rarity: number }>(
  pets: readonly T[],
): T[] {
  return sortByGrowthOrder(pets, petGrowthOrderKey);
}

export function sortPetIdsByGrowthOrder(ids: readonly string[]): string[] {
  return sortByGrowthOrder(ids, (id) => {
    const pet = PET_MAP.get(id);
    return petGrowthOrderKey({ id, rarity: pet?.rarity ?? 0 });
  });
}
