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
import { MAIN_PRELOAD_IMAGES } from '@/config/Assets';
import { ensureAudioSubpackage } from '@/config/Subpackages';
import { warmupCommonSubpackages } from '@/config/SubpackageWarmup';
import { BootDiag } from '@/core/BootDiag';
import { TitleScene } from '@/scenes/TitleScene';
import { BattleScene } from '@/scenes/BattleScene';
import { TeamScene } from '@/scenes/TeamScene';
import { PetDetailScene } from '@/scenes/PetDetailScene';
import { CodexScene } from '@/scenes/CodexScene';
import { GachaScene } from '@/scenes/GachaScene';
import { ShopScene } from '@/scenes/ShopScene';

declare const GameGlobal: any;

configureWechatShare();

if (typeof GameGlobal !== 'undefined') {
  GameGlobal.onError = (msg: string) => {
    console.error('[GlobalError]', msg);
  };
  GameGlobal.onUnhandledRejection = (ev: any) => {
    console.error('[UnhandledRejection]', ev?.reason || ev);
  };
}

async function main(): Promise<void> {
  const canvas = GameGlobal?.canvas ?? null;
  if (!canvas) {
    GameGlobal.__bootError = 'no canvas';
    console.error('[main] 找不到 canvas');
    return;
  }

  Game.init(canvas as any);
  if (!(Game.app?.renderer)) {
    GameGlobal.__bootError = 'renderer init failed';
    console.error('[main] 渲染器初始化失败');
    return;
  }

  await TextureCache.preload([...MAIN_PRELOAD_IMAGES]);
  console.log(`[main] 纹理数: ${TextureCache.size}`);

  SceneManager.register(new TitleScene());
  SceneManager.register(new BattleScene());
  SceneManager.register(new TeamScene());
  SceneManager.register(new PetDetailScene());
  SceneManager.register(new CodexScene());
  SceneManager.register(new GachaScene());
  SceneManager.register(new ShopScene());
  SceneManager.switchTo('title');

  await Game.runPostSceneWarmup();

  BootDiag.attachProbe();
  BootDiag.startWatchdog();
  warmupCommonSubpackages();

  await ensureAudioSubpackage();
  BgmManager.playMain();
  Platform.onHide(() => BgmManager.pause());
  Platform.onShow(() => BgmManager.resume());
}

main().catch((e) => {
  try {
    GameGlobal.__bootError = String((e as Error)?.message || e);
  } catch (_) { /* */ }
  console.error('[main] 启动失败:', e);
});
