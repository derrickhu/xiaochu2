/**
 * 灵宠消消塔 2 - 游戏入口
 */
import '@/core/pixiUnsafeEvalPatch';
import { Game } from '@/core/Game';
import { SceneManager } from '@/core/SceneManager';
import { TextureCache } from '@/core/TextureCache';
import { BgmManager } from '@/core/BgmManager';
import { loadAudioSettings } from '@/core/AudioSettings';
import { Platform } from '@/core/PlatformService';
import { isUsableCanvas, pickCanvasFromHost } from '@/core/hostCanvas';
import { tapTextHostState } from '@/core/tapTextRaster';
import { describeError } from '@/core/renderDiagnostics';
import { SettingsPanel } from '@/ui/SettingsPanel';
import { BackendService } from '@/core/BackendService';
import { configureWechatShare } from '@/core/ShareService';
import { initAnalytics, analytics, setAnalyticsUserId } from '@/analytics';
import { SAVE_KEY } from '@/config/CloudConfig';
import { PersistService } from '@/core/PersistService';
import { CloudSyncManager } from '@/managers/CloudSyncManager';
import { PlayerData } from '@/game/PlayerData';
import { DEFERRED_PRELOAD_IMAGES, MAIN_PRELOAD_IMAGES } from '@/config/Assets';
import { ensureAudioSubpackage, loadSubpackage, loadSubpackagesForPaths } from '@/config/Subpackages';
import { warmupCommonSubpackages } from '@/config/SubpackageWarmup';
import { warmupCdnAssets } from '@/config/CdnWarmup';
import { warmupCustomFonts } from '@/core/FontService';
import { waitMs } from '@/utils/hostTimeout';
import { TitleScene } from '@/scenes/TitleScene';
import { BattleScene } from '@/scenes/BattleScene';
import { TeamScene } from '@/scenes/TeamScene';
import { PetDetailScene } from '@/scenes/PetDetailScene';
import { CodexScene } from '@/scenes/CodexScene';
import { GachaScene } from '@/scenes/GachaScene';
import { ShopScene } from '@/scenes/ShopScene';
import { SecretRealmScene } from '@/scenes/SecretRealmScene';
import { TowerScene } from '@/scenes/TowerScene';
import { RankPanel } from '@/ui/RankPanel';
import { queueTowerRankSync, startCloudRankWatch } from '@/game/rankService';
import { GMManager } from '@/core/GMManager';
import { OverlayManager } from '@/core/OverlayManager';
import { GMPanel } from '@/ui/GMPanel';
import { GMEntryButton } from '@/ui/GMEntryButton';
import { SidebarPanel } from '@/ui/SidebarPanel';
import { DesktopShortcutPanel } from '@/ui/DesktopShortcutPanel';
import { CheckinPanel } from '@/ui/CheckinPanel';
import { DailyQuestPanel } from '@/ui/DailyQuestPanel';
import { CurrencySourcePanel } from '@/ui/CurrencySourcePanel';
import { StaminaPanel } from '@/ui/StaminaPanel';
import {
  LOADING_SPLASH_IMAGES,
  LoadingScreenOverlay,
} from '@/ui/LoadingScreenOverlay';

declare const GameGlobal: any;
declare const tap: any;
declare const qg: any;
declare const qa: any;
declare const wx: any;

function bootStep(msg: string): void {
  try { GameGlobal.__bootStep = msg; } catch { /* */ }
  try { GameGlobal.__bootDiag?.(msg); } catch { /* */ }
  // Tap 准入测试只回传 console 落盘的 js_log.log，光进 __bootDiag 数组等于没有
  console.log(`[boot] ${msg}`);
}

configureWechatShare();
initAnalytics();
CloudSyncManager.prewarm();

if (typeof GameGlobal !== 'undefined') {
  const prevError = GameGlobal.onError;
  const prevReject = GameGlobal.onUnhandledRejection;
  GameGlobal.onError = (msg: string) => {
    console.error('[GlobalError]', msg);
    try { prevError?.(msg); } catch { /* */ }
    analytics.trackAppError(msg, { source: 'GameGlobal.onError' });
  };
  GameGlobal.onUnhandledRejection = (ev: any) => {
    console.error('[UnhandledRejection]', ev?.reason || ev);
    try { prevReject?.(ev); } catch { /* */ }
    analytics.trackAppError(ev?.reason || ev, { source: 'unhandledRejection' });
  };
}

/** Title 首帧之后再补首屏用不到的图；失败也不影响游戏，场景 shell 会再拉一次 */
async function warmupDeferredImages(): Promise<void> {
  try {
    await loadSubpackagesForPaths(DEFERRED_PRELOAD_IMAGES);
    await TextureCache.preload([...DEFERRED_PRELOAD_IMAGES]);
  } catch (e) {
    console.warn('[main] 延后图预热失败', e);
  }
}

async function main(): Promise<void> {
  bootStep('main-start');
  let canvas = isUsableCanvas(GameGlobal?.canvas) ? GameGlobal.canvas : null;
  if (!isUsableCanvas(canvas) && typeof tap !== 'undefined' && typeof tap.createCanvas === 'function') {
    canvas = tap.createCanvas();
    try { GameGlobal.canvas = canvas; } catch { /* */ }
    bootStep('canvas-from-tap');
  }
  if (!isUsableCanvas(canvas) && typeof qg !== 'undefined' && typeof qg.createCanvas === 'function') {
    canvas = qg.createCanvas();
    try { GameGlobal.canvas = canvas; } catch { /* */ }
    bootStep('canvas-from-qg');
  }
  if (!isUsableCanvas(canvas) && typeof qa !== 'undefined' && typeof qa.createCanvas === 'function') {
    canvas = qa.createCanvas();
    try { GameGlobal.canvas = canvas; } catch { /* */ }
    bootStep('canvas-from-qa');
  }
  if (!isUsableCanvas(canvas) && typeof wx !== 'undefined' && typeof wx.createCanvas === 'function') {
    canvas = wx.createCanvas();
    try { GameGlobal.canvas = canvas; } catch { /* */ }
    bootStep('canvas-from-wx');
  }
  if (!isUsableCanvas(canvas)) {
    const g = (typeof globalThis !== 'undefined' ? globalThis : {}) as Record<string, any>;
    const picked = pickCanvasFromHost({
      hostCanvas: GameGlobal?.__hostCanvas,
      canvas: g.canvas,
      screencanvas: g.screencanvas,
      document: typeof document !== 'undefined' ? document : GameGlobal?.__hostDocument,
      createCanvas: typeof qg !== 'undefined' && typeof qg.createCanvas === 'function'
        ? () => qg.createCanvas()
        : undefined,
    });
    if (isUsableCanvas(picked)) {
      canvas = picked;
      try { GameGlobal.canvas = canvas; } catch { /* */ }
      bootStep('canvas-from-host src=' + (GameGlobal?.__hostCanvasSrc || 'pick'));
    }
  }
  bootStep(
    'canvas=' + (canvas
      ? `${canvas.width || 0}x${canvas.height || 0} getContext=${typeof canvas.getContext}`
      : 'null'),
  );
  if (!isUsableCanvas(canvas)) {
    console.error('[main] 找不到 canvas');
    try { GameGlobal.__showBootDiag?.(); } catch { /* */ }
    return;
  }

  Game.init(canvas as any);
  bootStep('init rendered=' + !!GameGlobal.__gameRendered + ' renderer=' + !!Game.app?.renderer);
  if (!(Game.app?.renderer)) {
    console.error('[main] 渲染器初始化失败');
    try { GameGlobal.__showBootDiag?.(); } catch { /* */ }
    return;
  }

  Game.stage.sortableChildren = true;
  const loadingOverlay = new LoadingScreenOverlay();
  Game.stage.addChild(loadingOverlay);

  // 自定义字体与 Loading 图并行预热，进主场景前 await，避免首屏落系统体
  const fontsReady = warmupCustomFonts();

  // 先出 Loading 底图/标题，避免云同步等待时黑屏
  bootStep('splash-preload');
  await TextureCache.preload([...LOADING_SPLASH_IMAGES]);
  loadingOverlay.applySplashTexture();
  loadingOverlay.applyTitleTexture();
  loadingOverlay.setProgress(0.08);
  bootStep(`splash-done ${TextureCache.healthReport()}`);

  let initialSaveLoaded = false;
  PersistService.subscribeCloudImport((info) => {
    if (!info.changedKeys.includes(SAVE_KEY)) return;
    if (!initialSaveLoaded) return;
    console.warn(`[main] 云端存档已更新 reason=${info.reason}`);
    PlayerData.reloadFromStorage(`cloud-import:${info.reason}`);
  });

  bootStep('cloud-sync-wait');
  if (Platform.isHuawei) {
    void loadSubpackage('battle');
    void loadSubpackage('shop');
  }
  const startupSync = await CloudSyncManager.awaitStartupSync();
  bootStep(`cloud-sync ${startupSync.status}/${startupSync.reason}`);
  console.log(
    `[main] 云同步启动结果: ${startupSync.status}, reason=${startupSync.reason}, platform=${Platform.name}`,
  );
  loadingOverlay.setProgress(0.16);

  let resolvedUserId = CloudSyncManager.userId;
  // 超时说明 login 还在飞；再 await ensureToken 会跟同一条 Promise 一起挂死
  if (!resolvedUserId && BackendService.available && startupSync.reason !== 'startup-timeout') {
    try {
      await BackendService.ensureToken();
      resolvedUserId = BackendService.userId;
    } catch (error) {
      console.warn('[main] 启动后补登失败', error);
    }
  }
  console.log(`[main] userId=${resolvedUserId || '(empty)'}`);

  if (resolvedUserId) {
    setAnalyticsUserId(resolvedUserId);
  } else {
    console.warn('[main] 未拿到登录 userId，经分仅以 anonymous_id 上报（请检查 Backend 登录日志）');
  }

  PlayerData.load();
  initialSaveLoaded = true;
  loadingOverlay.setProgress(0.2);

  // 首屏这两段是冷启动的主要可控开销，分开计时，真机 js_log 里能直接看出瓶颈在哪段
  bootStep('main-preload');
  const pkgStartAt = Date.now();
  await loadSubpackagesForPaths(MAIN_PRELOAD_IMAGES);
  const pkgMs = Date.now() - pkgStartAt;
  loadingOverlay.setProgress(0.28);

  const preloadStartAt = Date.now();
  await TextureCache.preload([...MAIN_PRELOAD_IMAGES], (loaded, total) => {
    const ratio = total > 0 ? loaded / total : 1;
    loadingOverlay.setProgress(0.28 + ratio * 0.67);
  });
  const imgMs = Date.now() - preloadStartAt;
  bootStep(`preload-done pkgMs=${pkgMs} imgMs=${imgMs}`);
  const fontStartAt = Date.now();
  bootStep('fonts-wait');
  await Promise.race([
    fontsReady,
    waitMs(Platform.isHuawei ? 800 : 4000),
  ]);
  bootStep(`${TextureCache.healthReport()} textHost=${tapTextHostState()} `
    + `pkgMs=${pkgMs} imgMs=${imgMs} fontMs=${Date.now() - fontStartAt}`);
  loadingOverlay.setProgress(0.97);

  bootStep('scenes-register');
  SceneManager.register(new TitleScene());
  SceneManager.register(new BattleScene());
  SceneManager.register(new TeamScene());
  SceneManager.register(new PetDetailScene());
  SceneManager.register(new CodexScene());
  SceneManager.register(new GachaScene());
  SceneManager.register(new ShopScene());
  SceneManager.register(new SecretRealmScene());
  SceneManager.register(new TowerScene());

  bootStep('switch-title');
  SceneManager.switchTo('title');
  bootStep('title-ok');
  // 标题已经能玩，后面叠层 / 音频再慢也不算启动失败
  try { GameGlobal.__bootOk = true; } catch { /* */ }

  bootStep('overlays');
  try {
    OverlayManager.container.addChild(new CheckinPanel());
    OverlayManager.container.addChild(new DailyQuestPanel());
    OverlayManager.container.addChild(new RankPanel());
    OverlayManager.container.addChild(new CurrencySourcePanel());
    OverlayManager.container.addChild(new StaminaPanel());
    OverlayManager.container.addChild(new SettingsPanel());
    if (GMManager.isRuntimeAllowed) {
      OverlayManager.container.addChild(new GMPanel());
      OverlayManager.container.addChild(new GMEntryButton());
    }
    if (Platform.isDouyin) {
      OverlayManager.container.addChild(new DesktopShortcutPanel());
      OverlayManager.container.addChild(new SidebarPanel());
    }
  } catch (e) {
    bootStep('overlays.fail:' + describeError(e));
  }
  try { startCloudRankWatch(); } catch { /* 巡检失败不挡进家 */ }

  bootStep('warm-present');
  await Game.warmScenePresent();
  loadingOverlay.setProgress(1);

  // 进主场景首帧后再撤 Loading，避免中间空窗浅底闪一下
  Game.stage.removeChild(loadingOverlay);
  loadingOverlay.destroy({ children: true });

  bootStep('audio');
  try {
    await ensureAudioSubpackage();
    loadAudioSettings();
    BgmManager.playMain();
  } catch (e) {
    bootStep('audio.fail:' + describeError(e));
  }

  warmupCommonSubpackages();
  // CDN：不 await，manifest + 拥有灵宠/BGM 后台预热，不挡首屏与 BGM 起播
  warmupCdnAssets();
  void warmupDeferredImages();

  try {
    analytics.trackSessionStart({
      entry: 'main_boot',
      with_user_id: !!resolvedUserId,
      cloud_sync_status: startupSync.status,
    });
  } catch (e) {
    bootStep('analytics.fail:' + describeError(e));
  }
  try { GameGlobal.__bootOk = true; } catch { /* */ }
  bootStep('boot-ok');

  let lastHideAt = 0;
  Platform.onHide(() => {
    BgmManager.pause();
    void CloudSyncManager.flushNow('app-hide');
    analytics.trackSessionEnd('app-hide');
    lastHideAt = Date.now();
  });
  Platform.onShow(() => {
    BgmManager.resume();
    queueTowerRankSync();
    if (lastHideAt > 0) {
      analytics.trackAppShow({
        from_background: true,
        background_ms: Math.max(0, Date.now() - lastHideAt),
      });
    }
  });
}

main().catch((e) => {
  const desc = describeError(e);
  console.error('[main] 启动失败:', desc, e);
  bootStep('main.catch:' + desc);
  try { GameGlobal.__showBootDiag?.(); } catch { /* */ }
  analytics.trackAppError(e, { source: 'main.catch' });
});
