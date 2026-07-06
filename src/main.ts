/**
 * 灵宠消消塔 2 - 游戏入口
 */
import '@/core/pixiUnsafeEvalPatch';
import { Game } from '@/core/Game';
import { SceneManager } from '@/core/SceneManager';
import { TextureCache } from '@/core/TextureCache';
import { BgmManager } from '@/core/BgmManager';
import { Platform } from '@/core/PlatformService';
import { configureWechatShare } from '@/core/ShareService';
import { initAnalytics, analytics, setAnalyticsUserId } from '@/analytics';
import { SAVE_KEY } from '@/config/CloudConfig';
import { PersistService } from '@/core/PersistService';
import { CloudSyncManager } from '@/managers/CloudSyncManager';
import { PlayerData } from '@/game/PlayerData';
import { MAIN_PRELOAD_IMAGES } from '@/config/Assets';
import { ensureAudioSubpackage } from '@/config/Subpackages';
import { warmupCommonSubpackages } from '@/config/SubpackageWarmup';
import { TitleScene } from '@/scenes/TitleScene';
import { BattleScene } from '@/scenes/BattleScene';
import { TeamScene } from '@/scenes/TeamScene';
import { PetDetailScene } from '@/scenes/PetDetailScene';
import { CodexScene } from '@/scenes/CodexScene';
import { GachaScene } from '@/scenes/GachaScene';
import { ShopScene } from '@/scenes/ShopScene';
import { GMManager } from '@/core/GMManager';
import { OverlayManager } from '@/core/OverlayManager';
import { GMPanel } from '@/ui/GMPanel';
import { GMEntryButton } from '@/ui/GMEntryButton';
import { SidebarPanel } from '@/ui/SidebarPanel';

declare const GameGlobal: any;

configureWechatShare();
initAnalytics();
CloudSyncManager.prewarm();

if (typeof GameGlobal !== 'undefined') {
  GameGlobal.onError = (msg: string) => {
    console.error('[GlobalError]', msg);
    analytics.trackAppError(msg, { source: 'GameGlobal.onError' });
  };
  GameGlobal.onUnhandledRejection = (ev: any) => {
    console.error('[UnhandledRejection]', ev?.reason || ev);
    analytics.trackAppError(ev?.reason || ev, { source: 'unhandledRejection' });
  };
}

async function main(): Promise<void> {
  const canvas = GameGlobal?.canvas ?? null;
  if (!canvas) {
    console.error('[main] 找不到 canvas');
    return;
  }

  Game.init(canvas as any);
  if (!(Game.app?.renderer)) {
    console.error('[main] 渲染器初始化失败');
    return;
  }

  let initialSaveLoaded = false;
  PersistService.subscribeCloudImport((info) => {
    if (!info.changedKeys.includes(SAVE_KEY)) return;
    if (!initialSaveLoaded) return;
    console.warn(`[main] 云端存档已更新 reason=${info.reason}`);
    PlayerData.reloadFromStorage(`cloud-import:${info.reason}`);
  });

  const startupSync = await CloudSyncManager.awaitStartupSync();
  console.log(
    `[main] 云同步启动结果: ${startupSync.status}, reason=${startupSync.reason}, platform=${Platform.name}`,
  );
  console.log(`[main] userId=${CloudSyncManager.userId || '(empty)'}`);

  if (CloudSyncManager.userId) {
    setAnalyticsUserId(CloudSyncManager.userId);
  } else {
    console.warn('[main] 未拿到登录 userId，经分仅以 anonymous_id 上报（请检查 Backend 登录日志）');
  }

  PlayerData.load();
  initialSaveLoaded = true;

  await TextureCache.preload([...MAIN_PRELOAD_IMAGES]);

  SceneManager.register(new TitleScene());
  SceneManager.register(new BattleScene());
  SceneManager.register(new TeamScene());
  SceneManager.register(new PetDetailScene());
  SceneManager.register(new CodexScene());
  SceneManager.register(new GachaScene());
  SceneManager.register(new ShopScene());
  SceneManager.switchTo('title');

  if (GMManager.isRuntimeAllowed) {
    OverlayManager.container.addChild(new GMPanel());
    OverlayManager.container.addChild(new GMEntryButton());
  }

  if (Platform.isDouyin) {
    OverlayManager.container.addChild(new SidebarPanel());
  }

  await Game.warmScenePresent();

  warmupCommonSubpackages();

  await ensureAudioSubpackage();
  BgmManager.playMain();

  analytics.trackSessionStart({
    entry: 'main_boot',
    with_user_id: !!CloudSyncManager.userId,
    cloud_sync_status: startupSync.status,
  });

  let lastHideAt = 0;
  Platform.onHide(() => {
    BgmManager.pause();
    void CloudSyncManager.flushNow('app-hide');
    analytics.trackSessionEnd('app-hide');
    lastHideAt = Date.now();
  });
  Platform.onShow(() => {
    BgmManager.resume();
    if (lastHideAt > 0) {
      analytics.trackAppShow({
        from_background: true,
        background_ms: Math.max(0, Date.now() - lastHideAt),
      });
    }
  });
}

main().catch((e) => {
  console.error('[main] 启动失败:', e);
  analytics.trackAppError(e, { source: 'main.catch' });
});
