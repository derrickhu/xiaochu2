/** 已有在前；同组内星级 → 等级 → 稀有度，高的靠前 */
export function compareCodexPetOrder(
  a: { owned: boolean; star: number; level: number; rarity: number; id: string },
  b: { owned: boolean; star: number; level: number; rarity: number; id: string },
): number {
  if (a.owned !== b.owned) return a.owned ? -1 : 1;
  if (b.star !== a.star) return b.star - a.star;
  if (b.level !== a.level) return b.level - a.level;
  if (b.rarity !== a.rarity) return b.rarity - a.rarity;
  return a.id.localeCompare(b.id);
}
