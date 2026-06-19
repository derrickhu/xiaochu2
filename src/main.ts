/**
 * 灵宠消消塔 2 - 游戏入口
 */
// unsafe-eval patch 必须最先导入，在 new PIXI.Application() 之前执行
import '@/core/pixiUnsafeEvalPatch';
import { Game } from '@/core/Game';
import { SceneManager } from '@/core/SceneManager';
import { TextureCache } from '@/core/TextureCache';
import { BgmManager } from '@/core/BgmManager';
import { Platform } from '@/core/PlatformService';
import { PRELOAD_IMAGES } from '@/config/Assets';
import { TitleScene } from '@/scenes/TitleScene';
import { BattleScene } from '@/scenes/BattleScene';
import { TeamScene } from '@/scenes/TeamScene';
import { PetDetailScene } from '@/scenes/PetDetailScene';
import { CodexScene } from '@/scenes/CodexScene';

declare const GameGlobal: any;

// 全局错误捕获——确保真机上所有异常可见
if (typeof GameGlobal !== 'undefined') {
  GameGlobal.onError = (msg: string) => {
    console.error('[GlobalError]', msg);
  };
  GameGlobal.onUnhandledRejection = (ev: any) => {
    console.error('[UnhandledRejection]', ev?.reason || ev);
  };
}

async function main(): Promise<void> {
  // 小游戏环境下 canvas 由 adapter 挂在 GameGlobal 上
  const canvas = typeof GameGlobal !== 'undefined' ? GameGlobal.canvas : null;
  if (!canvas) {
    console.error('[main] 找不到 canvas，无法启动');
    return;
  }

  Game.init(canvas);

  // 预加载核心资源（珠子贴图）
  await TextureCache.preload([...PRELOAD_IMAGES]);
  console.log(`[main] 预加载完成，纹理数: ${TextureCache.size}`);

  SceneManager.register(new TitleScene());
  SceneManager.register(new BattleScene());
  SceneManager.register(new TeamScene());
  SceneManager.register(new PetDetailScene());
  SceneManager.register(new CodexScene());
  SceneManager.switchTo('title');

  BgmManager.playMain();
  Platform.onHide(() => BgmManager.pause());
  Platform.onShow(() => BgmManager.resume());
}

main().catch((e) => {
  console.error('[main] 启动失败:', e);
});
