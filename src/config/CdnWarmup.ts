/**
 * CDN 后台预热：不阻塞首屏 / 进战斗主流程
 */
import { AUDIO } from '@/config/Audio';
import { petAvatarLoadPaths } from '@/config/Assets';
import { CdnAssetService } from '@/core/CdnAssetService';
import { Platform } from '@/core/PlatformService';
import { PlayerData } from '@/game/PlayerData';

let started = false;

/** 启动后 fire-and-forget：拉 manifest + 预热已拥有灵宠头像与主 BGM */
export function warmupCdnAssets(): void {
  if (started || !Platform.isMinigame || !CdnAssetService.enabled) return;
  started = true;

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

    void CdnAssetService.preloadPaths([...petPaths, AUDIO.mainBgm, AUDIO.bossBgm]).catch((e) => {
      console.warn('[CDN] 资源预热失败', e);
    });
  })();
}
