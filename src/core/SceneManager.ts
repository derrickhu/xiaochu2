/**
 * 场景管理器 - 管理场景切换
 */
import * as PIXI from 'pixi.js';
import { Game } from './Game';
import { TweenManager } from './TweenManager';
import { OverlayManager } from './OverlayManager';

export interface Scene {
  readonly name: string;
  readonly container: PIXI.Container;
  onEnter?(): void;
  onExit?(): void;
  update?(dt: number): void;
}

class SceneManagerClass {
  private _scenes: Map<string, Scene> = new Map();
  private _currentScene: Scene | null = null;

  register(scene: Scene): void {
    this._scenes.set(scene.name, scene);
  }

  switchTo(name: string): void {
    console.log(`[SceneManager] switchTo("${name}") Game.uid=${(Game as any)._uid}, stage=${!!Game.stage}`);

    const nextScene = this._scenes.get(name);
    if (!nextScene) {
      console.error(`[SceneManager] 场景 "${name}" 未注册`);
      return;
    }

    if (!Game.stage) {
      console.error('[SceneManager] Game.stage 未初始化，无法切换场景。'
        + ' 请检查 Game.init() 是否在 switchTo() 之前被调用且执行成功。');
      return;
    }

    // 退出当前场景
    if (this._currentScene) {
      // 取消旧场景容器上的残留 tween 动画（如淡出过渡等）
      TweenManager.cancelTarget(this._currentScene.container);

      this._currentScene.onExit?.();
      Game.stage.removeChild(this._currentScene.container);
    }

    // 安全重置：确保 stage.pivot 归零（防止 HapticSystem 等系统残留偏移）
    Game.stage.pivot.set(0, 0);

    // 关闭所有弹窗面板，重置覆盖层 transform（防止场景切换时面板状态残留）
    this._closeAndResetOverlay();

    // 取消新场景容器上可能存在的旧 tween
    TweenManager.cancelTarget(nextScene.container);

    // 进入新场景
    this._currentScene = nextScene;
    Game.stage.addChild(nextScene.container);
    nextScene.onEnter?.();

    // 确保全局覆盖层（弹窗面板）始终在场景之上
    this._bringOverlayToFront();

    console.log(`[SceneManager] 切换到场景: ${name}`);
  }

  get current(): Scene | null {
    return this._currentScene;
  }

  /** 将 OverlayManager 的容器提升到 stage 最顶部 */
  private _bringOverlayToFront(): void {
    try {
      OverlayManager.bringToFront();
      // 调试：打印 stage 子元素顺序
      const stageChildren = Game.stage.children.map((c: any) => c.constructor?.name || 'Container');
      console.log(`[SceneManager] bringToFront 完成, stage 子元素顺序: [${stageChildren.join(', ')}]`);
    } catch (e) {
      console.warn('[SceneManager] bringToFront 失败:', e);
    }
  }

  /** 关闭所有弹窗并重置覆盖层 transform */
  private _closeAndResetOverlay(): void {
    try {
      OverlayManager.closeAllPanels();
      OverlayManager.resetTransform();
    } catch (e) {
      console.warn('[SceneManager] closeAndResetOverlay 失败:', e);
    }
  }
}

export const SceneManager = new SceneManagerClass();
