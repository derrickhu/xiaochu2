/**
 * CDN 后台预热：不阻塞首屏 / 进战斗主流程
 */
import { AUDIO } from '@/config/Audio';
import { petAvatarLoadPaths } from '@/config/Assets';
import { SHOP_SHELL_IMAGES } from '@/config/assetPreload';
import { CdnAssetService } from '@/core/CdnAssetService';
import { Platform } from '@/core/PlatformService';
import { SfxManager } from '@/core/SfxManager';
import { PlayerData } from '@/game/PlayerData';

let started = false;

/** 启动后 fire-and-forget：拉 manifest + 商店壳 / 灵宠头像 / 全量音频 */
export function warmupCdnAssets(): void {
  if (started || !Platform.isMinigame || !CdnAssetService.enabled) return;
  started = true;

  // SFX 建池不等 CDN：音效已在包内，只需分包就位。
  // 若串在 preloadPaths 之后，就得先下完 2.1MB BGM，首页最初几秒点按钮全是静音。
  void SfxManager.warmup().catch((e) => {
    console.warn('[CDN] 音效预热失败', e);
  });

  void (async () => {
    try {
      await CdnAssetService.fetchManifest();
    } catch (e) {
      console.warn('[CDN] manifest 预热失败', e);
    }

    const petPaths = PlayerData.ownedPets.flatMap((id) => {
      const star = PlayerData.getOwned(id)?.star ?? 1;
      return [...petAvatarLoadPaths(id, star)];
    });

    // 商店壳优先：进页才下会空壳半晌。短音效已留包内，只有 BGM 需要从 CDN 拉
    const bgmPaths = [AUDIO.mainBgm, AUDIO.battleBgm, AUDIO.bossBgm];
    void CdnAssetService.preloadPaths([...SHOP_SHELL_IMAGES, ...petPaths, ...bgmPaths])
      .catch((e) => {
        console.warn('[CDN] 资源预热失败', e);
      });
  })();
}
