/**
 * 全局游戏单例 - 持有 PIXI.Application 和核心引用
 *
 * direct-webgl 单 canvas 直上屏（对齐 game2D_huahua，已验证微信真机）。
 */
import * as PIXI from 'pixi.js';
import { TweenManager } from './TweenManager';
import { iosPlatform } from './webglContextPatch';
import { Platform } from './PlatformService';
import { UPDATE_PRIORITY } from '@pixi/ticker';

declare const wx: any;
declare const tt: any;
declare const GameGlobal: any;

/** 小游戏真机 WebGL 初始化选项（对齐 game2D_huahua） */
const RENDERER_OPTS = {
  backgroundColor: 0x1a1126,
  resolution: 1,
  antialias: true,
  preserveDrawingBuffer: true,
  preferWebGLVersion: 1,
};

class GameClass {
  app!: PIXI.Application;
  stage: PIXI.Container;
  ticker: PIXI.Ticker;

  designWidth = 750;
  designHeight = 1334;
  screenWidth = 375;
  screenHeight = 667;
  scale = 1;
  dpr = 1;
  safeTop = 0;

  private _initialized = false;

  constructor() {
    this.stage = new PIXI.Container();
    this.ticker = new PIXI.Ticker();
  }

  init(canvas: any): void {
    if (this._initialized) return;

    const _api: any = typeof wx !== 'undefined' ? wx : typeof tt !== 'undefined' ? tt : null;
    const sysInfo = _api?.getSystemInfoSync?.();

    if (sysInfo) {
      this.screenWidth = sysInfo.screenWidth;
      this.screenHeight = sysInfo.screenHeight;
      this.dpr = sysInfo.pixelRatio || 2;
    }

    let safeTopPx = 0;
    try {
      const capsule = _api?.getMenuButtonBoundingClientRect?.();
      if (capsule && capsule.top) {
        safeTopPx = capsule.top;
      } else if (sysInfo?.statusBarHeight) {
        safeTopPx = sysInfo.statusBarHeight + 6;
      }
    } catch (_) { /* */ }
    if (safeTopPx <= 0) safeTopPx = 40;
    this.safeTop = Math.round(safeTopPx * (this.designWidth / this.screenWidth));

    this.scale = this.screenWidth / this.designWidth * this.dpr;
    const realWidth = this.screenWidth * this.dpr;
    const realHeight = this.screenHeight * this.dpr;

    canvas.width = realWidth;
    canvas.height = realHeight;

    const tryCreateRuntime = (view: any): { app: PIXI.Application | null; renderer: PIXI.IRenderer | null } => {
      let r: PIXI.IRenderer | null = null;
      let a: PIXI.Application | null = null;
      try {
        a = new PIXI.Application({ view, width: realWidth, height: realHeight, ...RENDERER_OPTS } as any);
      } catch (e) {
        console.error('[Game] new PIXI.Application 失败:', e);
      }
      if (a?.stage && a?.ticker && a?.renderer) {
        return { app: a, renderer: a.renderer };
      }
      if (a?.renderer) r = a.renderer;
      if (!r) {
        try {
          r = new PIXI.Renderer({ view, width: realWidth, height: realHeight, ...RENDERER_OPTS } as any);
        } catch (e2) {
          console.error('[Game] new PIXI.Renderer 失败:', e2);
        }
      }
      if (!r) {
        try {
          r = PIXI.autoDetectRenderer({ view, width: realWidth, height: realHeight, ...RENDERER_OPTS } as any);
        } catch (e3) {
          console.error('[Game] autoDetectRenderer 失败:', e3);
        }
      }
      return { app: a, renderer: r };
    };

    const { app, renderer: initialRenderer } = tryCreateRuntime(canvas);
    let renderer = initialRenderer;

    if (app?.stage && app?.ticker && app?.renderer) {
      this.app = app;
      this.stage = app.stage;
      this.ticker = app.ticker;
      renderer = app.renderer;
    } else {
      if (app?.renderer) renderer = app.renderer;
      this.stage = new PIXI.Container();
      this.ticker = new PIXI.Ticker();
      this.ticker.start();
      if (renderer) {
        this.ticker.add(() => { renderer!.render(this.stage); });
      } else {
        console.error('[Game] 所有渲染器创建均失败，画面将无法渲染');
      }
      this.app = { stage: this.stage, ticker: this.ticker, renderer, view: canvas } as any;
    }

    if (!renderer) {
      try { (GameGlobal as any).__gameRendered = false; } catch (_) { /* */ }
      console.error('[Game] 渲染器不可用，终止初始化');
      return;
    }

    try { (GameGlobal as any).__gameRendered = true; } catch (_) { /* */ }

    this.stage.scale.set(this.scale, this.scale);
    this.stage.sortableChildren = true;
    this.ticker.add(() => {
      TweenManager.update(this.ticker.deltaMS / 1000);
    }, this, UPDATE_PRIORITY.HIGH);

    try {
      if (!this.ticker.started) this.ticker.start();
    } catch (e) {
      console.error('[Game] ticker.start 异常:', e);
    }

    try {
      const evtSys = (this.app.renderer as any).events;
      if (evtSys && evtSys.domElement) {
        const dom = evtSys.domElement;
        evtSys.mapPositionToPoint = (point: any, x: number, y: number) => {
          let rect: any;
          try { rect = dom.getBoundingClientRect(); } catch (_) { rect = null; }
          if (!rect || !rect.width || !rect.height) {
            rect = { left: 0, top: 0, width: this.screenWidth, height: this.screenHeight };
          }
          const resMul = 1.0 / (evtSys.resolution || 1);
          point.x = ((x - (rect.left || 0)) * (dom.width / rect.width)) * resMul;
          point.y = ((y - (rect.top || 0)) * (dom.height / rect.height)) * resMul;
        };
      }
    } catch (e) { console.warn('[Game] EventSystem patch 失败:', e); }

    this._initialized = true;
  }

  pointerEventToStageLocal(e: unknown): PIXI.Point {
    const ev = e as {
      clientX?: number; clientY?: number; x?: number; y?: number;
      touches?: { clientX?: number; clientY?: number }[];
      changedTouches?: { clientX?: number; clientY?: number }[];
    };
    const t0 = ev.changedTouches?.[0] ?? ev.touches?.[0];
    const cx = ev.clientX ?? t0?.clientX ?? ev.x ?? 0;
    const cy = ev.clientY ?? t0?.clientY ?? ev.y ?? 0;
    const rendererPoint = new PIXI.Point();
    const evtSys = (this.app.renderer as any)?.events;
    if (evtSys?.mapPositionToPoint) {
      evtSys.mapPositionToPoint(rendererPoint, cx, cy);
    } else {
      rendererPoint.x = cx * (this.designWidth / this.screenWidth);
      rendererPoint.y = cy * (this.designWidth / this.screenWidth);
    }
    return this.stage.toLocal(rendererPoint);
  }

  get logicWidth(): number {
    return this.designWidth;
  }

  get logicHeight(): number {
    return this.screenHeight / this.screenWidth * this.designWidth;
  }

  /**
   * 帧率上限（仅浏览器环境生效）。
   *
   * 小游戏真机上禁用：Pixi Ticker.maxFPS 的节流检查依赖
   * `rAF 时间戳` 与 `performance.now()` 同源，而微信 iOS 上两个时钟
   * 基准不一致（社区已知坑），`_lastFrame` 一旦被污染成未来值，
   * `delta` 恒为负 → ticker 永久静默（Tween/render 全停，点屏才有画面）。
   * game2D_huahua 从不设 maxFPS，同机型稳定 —— 与其对齐。
   */
  setMaxFPS(fps: number): void {
    if (Platform.isMinigame) return;
    try { this.ticker.maxFPS = fps; } catch (_) { /* */ }
  }

  /** 立即 render 上屏（不依赖 ticker 时序；换场景/拖动跟手时用） */
  syncFrameToScreen(): void {
    const renderer = this.app?.renderer;
    if (!renderer || !this.stage) return;
    renderer.render(this.stage);
  }

  /** iOS 真机：场景 build 后多帧 present，避免首帧空白 */
  async warmScenePresent(): Promise<void> {
    this.syncFrameToScreen();
    if (!Platform.isMinigame || Platform.isDevtools || !iosPlatform()) return;
    await this._waitPresentFrames(2);
    this.syncFrameToScreen();
  }

  private _waitPresentFrames(count: number): Promise<void> {
    return new Promise((resolve) => {
      let left = count;
      const tick = (): void => {
        left--;
        if (left <= 0) {
          try { this.ticker.remove(tick); } catch (_) { /* */ }
          resolve();
        }
      };
      if (this.ticker?.started) {
        this.ticker.add(tick);
        return;
      }
      let n = 0;
      const poll = (): void => {
        n++;
        if (n >= count) resolve();
        else setTimeout(poll, 16);
      };
      setTimeout(poll, 16);
    });
  }
}

const _global: any = typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof window !== 'undefined' ? window
  : typeof globalThis !== 'undefined' ? globalThis
  : {};

if (!_global.__gameInstance) {
  _global.__gameInstance = new GameClass();
}
export const Game: GameClass = _global.__gameInstance;
