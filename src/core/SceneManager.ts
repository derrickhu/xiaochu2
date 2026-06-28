/**
 * 场景管理器 - 管理场景切换
 */
import * as PIXI from 'pixi.js';
import { Game } from './Game';
import { TweenManager, Ease } from './TweenManager';
import { OverlayManager } from './OverlayManager';
import { deferAfterPointerEvent } from '@/utils/deferAfterPointer';
import { Platform } from './PlatformService';
import { BootDiag, bootDiagBindScene } from './BootDiag';

export interface Scene {
  readonly name: string;
  readonly container: PIXI.Container;
  onEnter?(data?: unknown): void;
  onExit?(): void;
  update?(dt: number): void;
}

class SceneManagerClass {
  private _scenes: Map<string, Scene> = new Map();
  private _currentScene: Scene | null = null;
  /** 每帧驱动 current.update(dt) 的 ticker 是否已挂载（懒挂载，避免 Game 未初始化） */
  private _tickerInstalled = false;

  constructor() {
    bootDiagBindScene(() => {
      const s = this._currentScene;
      return s ? { name: s.name, container: s.container } : null;
    });
  }

  register(scene: Scene): void {
    this._scenes.set(scene.name, scene);
  }

  /** 懒挂载：首次切场景时把「驱动当前场景 update」接到全局 ticker。 */
  private _ensureTicker(): void {
    if (this._tickerInstalled) return;
    Game.ticker.add(() => {
      const dt = Game.ticker.deltaMS / 1000;
      this._currentScene?.update?.(dt);
    });
    this._tickerInstalled = true;
  }

  /** 统一进场转场：iOS 真机跳过 alpha=0；devtools 保留淡入以便调试 */
  private _playEnterTransition(scene: Scene): void {
    const c = scene.container;
    TweenManager.cancelTarget(c);
    const instant = Platform.isMinigame && !Platform.isDevtools;
    if (instant) {
      c.alpha = 1;
      c.y = 0;
      BootDiag.log('enterTransition', `${scene.name} instant(ios-real)`);
      return;
    }
    c.alpha = 0;
    c.y = 24;
    TweenManager.to({ target: c, props: { alpha: 1 }, duration: 0.2, ease: Ease.easeOutQuad });
    TweenManager.to({ target: c, props: { y: 0 }, duration: 0.28, ease: Ease.easeOutCubic });
    BootDiag.log('enterTransition', `${scene.name} alpha=0→1 tweens=${TweenManager.activeCount}`);
  }

  switchTo(name: string, data?: unknown): void {
    // 底栏「灵宠/返回」等 pointertap 内同步切场景会 destroy 命中节点，
    // 微信端 Pixi pointerup 仍可能在本轮事件栈内访问 pressTargets → null.scale。
    deferAfterPointerEvent(() => this._switchToImmediate(name, data));
  }

  private _switchToImmediate(name: string, data?: unknown): void {
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

    // 场景 container 为单例复用；切出时勿长期 mute 根节点，否则返回后子按钮全部失效
    const root = nextScene.container;
    root.interactiveChildren = true;
    root.eventMode = 'passive';

    // 进入新场景
    this._ensureTicker();
    this._currentScene = nextScene;
    Game.stage.addChild(nextScene.container);
    nextScene.onEnter?.(data);
    this._playEnterTransition(nextScene);

    // 确保全局覆盖层（弹窗面板）始终在场景之上
    this._bringOverlayToFront();

    BootDiag.log('switchTo', `${name} children=${nextScene.container.children.length}`);
    setTimeout(() => BootDiag.snapshot(`afterSwitch:${name}`), 0);

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
