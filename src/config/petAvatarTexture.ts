/**
 * 灵宠头像纹理：统一候选路径查表/加载（旧存档 ID 经 migrate 映射到 pet_XXX 文件名）
 * CDN miss 时 get 立即返回 null 并后台加载，不阻塞主流程。
 */
import * as PIXI from 'pixi.js';
import { petAvatarLoadPaths, petAvatarPath } from '@/config/Assets';
import { TextureCache } from '@/core/TextureCache';

export function getPetAvatarTexture(petId: string, star = 1): PIXI.Texture | null {
  const paths = petAvatarLoadPaths(petId, star);
  const tex = TextureCache.getFirst(paths);
  if (!tex) {
    void TextureCache.loadFirst(paths, petAvatarPath(petId, star)).catch(() => null);
  }
  return tex;
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

/**
 * 异步挂头像：有缓存立刻画；否则占位并在 CDN/加载完成后设纹理。
 * 返回取消函数。
 */
export function bindPetAvatarSprite(
  sprite: PIXI.Sprite,
  petId: string,
  star: number,
  onApplied?: (tex: PIXI.Texture) => void,
): () => void {
  let cancelled = false;
  const apply = (tex: PIXI.Texture) => {
    if (cancelled || sprite.destroyed) return;
    sprite.texture = tex;
    onApplied?.(tex);
  };
  const existing = getPetAvatarTexture(petId, star);
  if (existing) {
    apply(existing);
    return () => { cancelled = true; };
  }
  void loadPetAvatarTexture(petId, star).then((tex) => {
    if (tex) apply(tex);
  });
  return () => { cancelled = true; };
}
