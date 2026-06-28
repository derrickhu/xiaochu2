/**
 * 灵宠头像纹理：统一候选路径查表/加载（新 ID + 旧 ID fallback）
 */
import * as PIXI from 'pixi.js';
import { petAvatarLoadPaths, petAvatarPath } from '@/config/Assets';
import { TextureCache } from '@/core/TextureCache';

export function getPetAvatarTexture(petId: string, star = 1): PIXI.Texture | null {
  return TextureCache.getFirst(petAvatarLoadPaths(petId, star));
}

export async function loadPetAvatarTexture(petId: string, star = 1): Promise<PIXI.Texture | null> {
  return TextureCache.loadFirst(petAvatarLoadPaths(petId, star), petAvatarPath(petId, star));
}

export async function preloadPetAvatarTextures(
  entries: readonly { petId: string; star?: number }[],
): Promise<void> {
  const batchSize = 6;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    await Promise.all(batch.map(({ petId, star = 1 }) => loadPetAvatarTexture(petId, star)));
  }
}
