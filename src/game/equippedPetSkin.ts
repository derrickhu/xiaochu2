/**
 * 当前装备的皮肤。存档在 PlayerData，这里只留一份给贴图路径查询，
 * 避免 Assets 再去引用 PlayerData。
 */
let equipped: Record<string, string> = {};

export function syncEquippedPetSkins(next: Record<string, string> | null | undefined): void {
  equipped = next && typeof next === 'object' ? { ...next } : {};
}

export function equippedSkinId(petId: string): string | null {
  const id = equipped[petId];
  return typeof id === 'string' && id.length > 0 ? id : null;
}
