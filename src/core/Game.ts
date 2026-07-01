/**
 * 全局游戏单例 - 持有 PIXI.Application 和核心引用
 *
 * 移植自 game2D_huahua（已验证微信/抖音真机），去除业务依赖：
 * - 750 设计宽适配 + DPR
 * - Renderer 三级降级（Application → Renderer → autoDetectRenderer）
 * - EventSystem 坐标映射修复
 */
import * as PIXI from 'pixi.js';
import { TweenManager } from './TweenManager';
import { BootDiag } from './BootDiag';
import { iosPlatform } from './webglContextPatch';
import { Platform } from './PlatformService';
import { UPDATE_PRIORITY } from '@pixi/ticker';

declare const wx: any;
declare const tt: any;
declare const GameGlobal: any;

function isMinimalBoot(): boolean {
  return !!(typeof GameGlobal !== 'undefined' && GameGlobal.__minimalBoot);
}

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

  /** 设计分辨率 */
  designWidth = 750;
  designHeight = 1334;

  /** 实际屏幕尺寸（逻辑像素） */
  screenWidth = 375;
  screenHeight = 667;

  /** 缩放比 */
  scale = 1;

  /** 像素密度 */
  dpr = 1;

  /** 安全区顶部偏移（设计坐标），位于胶囊按钮下方 */
  safeTop = 0;

  private _initialized = false;
  /** 上屏 canvas（2D 合成目标，game.js 第一次 createCanvas） */
  private _screenCanvas: any | null = null;
  /** Pixi WebGL 离屏 canvas（pixi-adapter 第二次 createCanvas） */
  private _renderCanvas: any | null = null;
  private _screenCtx2d: CanvasRenderingContext2D | null = null;
  private _compositorWarned = false;
  /** drawImage(WebGL canvas) 或 readPixels→putImageData */
  private _compositeMethod: 'drawImage' | 'readPixels' = 'drawImage';
  private _readPixelsBuf: Uint8Array | null = null;
  private _compositeImageData: ImageData | null = null;
  private _compositeTempCanvas: any | null = null;
  private _compositeTempCtx: CanvasRenderingContext2D | null = null;
  private _compositeProbeFrames = 0;
  private _compositeFrameCount = 0;
  private _compositeLastError = '';
  private _postRenderHooked = false;
  /** 同帧去重：postrender 与 ticker-LOW 同 tick 只合成一次 */
  private _lastCompositeTick = -1;
  /** ticker-LOW 兜底限频（ms），避免与 postrender 叠加过重；postrender 不受此限 */
  private _lastCompositeFallbackMs = 0;
  private _lastReadPixelsMs = 0;
  /** 转珠拖动等：临时提高 compositor 刷新，避免 touchmove 里手动 render 卡死主线程 */
  private _compositorBoostUntil = 0;
  private static readonly COMPOSITE_FALLBACK_MS = 33;
  private static readonly READPIXELS_MIN_MS = 50;

  readonly _uid = Math.random().toString(36).slice(2, 8);

  constructor() {
    // 预初始化 stage/ticker，保证任何时刻访问都不为 undefined
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

    // 计算安全区顶部（与胶囊按钮齐平），转为设计坐标
    let safeTopPx = 0;
    try {
      const capsule = _api?.getMenuButtonBoundingClientRect?.();
      if (capsule && capsule.top) {
        safeTopPx = capsule.top;
      } else if (sysInfo?.statusBarHeight) {
        safeTopPx = sysInfo.statusBarHeight + 6;
      }
    } catch (_) {}
    if (safeTopPx <= 0) safeTopPx = 40;
    this.safeTop = Math.round(safeTopPx * (this.designWidth / this.screenWidth));

    // 以宽度为基准适配
    this.scale = this.screenWidth / this.designWidth * this.dpr;

    const realWidth = this.screenWidth * this.dpr;
    const realHeight = this.screenHeight * this.dpr;

    const preBoundMain = GameGlobal?.__mainCanvas ?? null;
    const preBoundCtx2d = GameGlobal?.__mainCtx2d ?? null;

    // ── 双 canvas：主屏 2D 上屏 + 离屏 WebGL ──
    this._screenCanvas = canvas;
    this._renderCanvas = canvas;
    this._screenCtx2d = null;
    let pixiViewCanvas: any = canvas;

    if (preBoundMain && preBoundCtx2d && preBoundMain !== canvas) {
      try { preBoundMain.width = realWidth; } catch (_) { /* */ }
      try { preBoundMain.height = realHeight; } catch (_) { /* */ }
      this._screenCanvas = preBoundMain;
      this._screenCtx2d = preBoundCtx2d;
      this._renderCanvas = canvas;
      pixiViewCanvas = canvas;
      this._patchOffscreenCanvasDom(canvas);
      console.log(
        `[Game] 双 canvas 模式: 主屏2D + 离屏WebGL compositor=${this._compositeMethod}`
        + ` pixiView===main=${pixiViewCanvas === preBoundMain}`,
      );
    } else if (preBoundMain && preBoundCtx2d) {
      // adapter 未分出离屏 canvas 时，Game 内重建离屏 WebGL
      try { preBoundMain.width = realWidth; } catch (_) { /* */ }
      try { preBoundMain.height = realHeight; } catch (_) { /* */ }
      this._screenCanvas = preBoundMain;
      try {
        const freshCtx = preBoundMain.getContext?.('2d') as CanvasRenderingContext2D | null;
        this._screenCtx2d = freshCtx || preBoundCtx2d;
        if (freshCtx && typeof GameGlobal !== 'undefined') GameGlobal.__mainCtx2d = freshCtx;
      } catch {
        this._screenCtx2d = preBoundCtx2d;
      }
      try {
        pixiViewCanvas = this._ensurePixiViewCanvas(realWidth, realHeight);
      } catch (e) {
        console.error('[Game] 离屏 WebGL canvas 创建失败:', e);
      }
      this._renderCanvas = pixiViewCanvas;
      this._patchOffscreenCanvasDom(pixiViewCanvas);
      console.log(
        `[Game] 双 canvas 模式(兜底): compositor=${this._compositeMethod}`
        + ` pixiView===main=${pixiViewCanvas === preBoundMain}`,
      );
    } else {
      canvas.width = realWidth;
      canvas.height = realHeight;
    }

    // webgl2 禁用由 pixi-adapter/canvas.js + preferWebGLVersion:1 负责（对齐 huahua，勿改 PREFER_ENV）

    const tryCreateRuntime = (view: any): { app: PIXI.Application | null; renderer: PIXI.IRenderer | null } => {
      let r: PIXI.IRenderer | null = null;
      let a: PIXI.Application | null = null;
      try {
        a = new PIXI.Application({
          view, width: realWidth, height: realHeight, ...RENDERER_OPTS,
        } as any);
      } catch (e) {
        console.error('[Game] new PIXI.Application 失败:', e);
      }
      if (a?.stage && a?.ticker && a?.renderer) {
        console.log('[Game] 方式1: PIXI.Application 创建成功');
        return { app: a, renderer: a.renderer };
      }
      if (a?.renderer) r = a.renderer;
      if (!r) {
        try {
          r = new PIXI.Renderer({ view, width: realWidth, height: realHeight, ...RENDERER_OPTS } as any);
          console.log('[Game] 方式2: new PIXI.Renderer 创建成功');
        } catch (e2) {
          console.error('[Game] new PIXI.Renderer 失败:', e2);
        }
      }
      if (!r) {
        try {
          r = PIXI.autoDetectRenderer({ view, width: realWidth, height: realHeight, ...RENDERER_OPTS } as any);
          console.log('[Game] 方式3: autoDetectRenderer 创建成功');
        } catch (e3) {
          console.error('[Game] autoDetectRenderer 失败:', e3);
        }
      }
      return { app: a, renderer: r };
    };

    let { app, renderer } = tryCreateRuntime(pixiViewCanvas);

    // 双 canvas 下 Pixi 仍失败：降级 direct-webgl（对齐 caizhu-rosa）
    if ((!app?.renderer && !renderer) && pixiViewCanvas !== canvas) {
      console.warn('[Game] 离屏 Pixi 失败，降级 direct-webgl');
      this._renderCanvas = canvas;
      this._screenCtx2d = null;
      pixiViewCanvas = canvas;
      ({ app, renderer } = tryCreateRuntime(pixiViewCanvas));
    }

    if (!app?.renderer && !renderer && preBoundMain && preBoundCtx2d) {
      console.warn('[Game] 首次 Pixi 创建失败，尝试重建离屏 WebGL canvas');
      try {
        pixiViewCanvas = this._ensurePixiViewCanvas(realWidth, realHeight, true);
        this._renderCanvas = pixiViewCanvas;
        this._patchOffscreenCanvasDom(pixiViewCanvas);
        ({ app, renderer } = tryCreateRuntime(pixiViewCanvas));
      } catch (e) {
        console.error('[Game] 重建离屏 WebGL 仍失败:', e);
      }
    }

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
      this.app = { stage: this.stage, ticker: this.ticker, renderer, view: pixiViewCanvas } as any;
    }

    if (this._renderCanvas !== this._screenCanvas && !this._screenCtx2d) {
      try {
        const ctx = this._screenCanvas?.getContext?.('2d') as CanvasRenderingContext2D | null;
        if (ctx) this._screenCtx2d = ctx;
        else {
          console.warn('[Game] 主屏 getContext(2d) 失败，降级 direct-webgl');
          this._renderCanvas = this._screenCanvas;
        }
      } catch (e) {
        console.warn('[Game] 主屏 getContext(2d) 异常，降级 direct-webgl', e);
        this._renderCanvas = this._screenCanvas;
      }
    }

    if (!renderer) {
      try { (GameGlobal as any).__gameRendered = false; } catch (_) {}
      console.error('[Game] 渲染器不可用，终止初始化');
      return;
    }

    // 标记游戏已渲染成功（供 game.js 诊断弹窗判断）
    try { (GameGlobal as any).__gameRendered = true; } catch (_) {}

    // 整体缩放到设计分辨率
    this.stage.scale.set(this.scale, this.scale);
    if (!isMinimalBoot()) {
      this.stage.sortableChildren = true;
    }
    this.ticker.add(() => {
      const dt = this.ticker.deltaMS / 1000;
      TweenManager.update(dt);
    }, this, UPDATE_PRIORITY.HIGH);

    if (this._screenCtx2d && this._renderCanvas !== this._screenCanvas) {
      this._hookCompositorAfterRender(renderer);
      console.log(
        `[Game] render mode=2d-compositor method=${this._compositeMethod}`
        + ` screen=${this._screenCanvas?.width}x${this._screenCanvas?.height}`
        + ` render=${this._renderCanvas?.width}x${this._renderCanvas?.height}`,
      );
      if (!isMinimalBoot()) BootDiag.log('Game.init', `renderMode=2d-compositor method=${this._compositeMethod}`);
    } else {
      console.log(`[Game] render mode=direct-webgl canvas=${canvas.width}x${canvas.height}`);
      if (!isMinimalBoot()) BootDiag.log('Game.init', 'renderMode=direct-webgl');
    }

    try {
      if (!this.ticker.started) this.ticker.start();
      if (!isMinimalBoot()) BootDiag.log('Game.init', `ticker.started=${this.ticker.started}`);
    } catch (e) {
      if (!isMinimalBoot()) BootDiag.log('Game.init', `ticker.start 异常: ${e}`);
    }

    if (!isMinimalBoot()) {
      BootDiag.logRendererOnInit();
      BootDiag.hookTickerOnce();
    }

    // ---- 修复 EventSystem 坐标映射 ----
    // 真机 canvas.parentElement 不可写，PixiJS 内部 mapPositionToPoint
    // 走到 fallback rect {width:0,height:0} 导致坐标 NaN，所有 hit test 失败
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
        console.log('[Game] EventSystem.mapPositionToPoint 已修复');
      }
    } catch (e) { console.warn('[Game] EventSystem patch 失败:', e); }

    this._initialized = true;
    console.log(`[Game] 初始化完成: ${realWidth}x${realHeight}, scale=${this.scale.toFixed(2)}, dpr=${this.dpr}`);
  }

  /** 原生 touch/pointer → stage 本地设计坐标（与场景布局、EventSystem 一致） */
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

  /** 设计坐标系下的逻辑宽度 */
  get logicWidth(): number {
    return this.designWidth;
  }

  /** 设计坐标系下的逻辑高度（随屏幕比例变化） */
  get logicHeight(): number {
    return this.screenHeight / this.screenWidth * this.designWidth;
  }

  /** WebGL 离屏 + main-2d 合成（非 direct-webgl） */
  get usesCompositor(): boolean {
    return !!(this._screenCtx2d && this._renderCanvas !== this._screenCanvas);
  }

  /** 设置帧率上限（非战斗场景降帧省电） */
  setMaxFPS(fps: number): void {
    try { this.ticker.maxFPS = fps; } catch (_) {}
  }

  /** 拖动/动画期间提高 2D 合成帧率（ms=0 关闭） */
  setCompositorBoost(ms: number): void {
    this._compositorBoostUntil = ms > 0 ? Date.now() + ms : 0;
  }

  /**
   * 仅 2D 合成上屏（不重复 renderer.render）。
   * 拖动跟手时用：Pixi ticker 已 render，再 render 会导致 iOS 纹理丢失。
   */
  syncCompositorOnly(): void {
    if (this._screenCtx2d && this._renderCanvas !== this._screenCanvas) {
      this._compositeToScreen(true);
    }
  }

  /** 立即 render + compositor 上屏（不依赖 ticker 时序；iOS 换场景后必需） */
  syncFrameToScreen(): void {
    const renderer = this.app?.renderer;
    if (!renderer || !this.stage) return;
    renderer.render(this.stage);
    if (this._screenCtx2d && this._renderCanvas !== this._screenCanvas) {
      this._compositeToScreen(true);
    }
  }

  /** iOS 2d-compositor：场景 build 后多帧 render+合成，与首页 warmCompositorSync 同逻辑 */
  async warmSceneCompositor(): Promise<void> {
    this.syncFrameToScreen();
    const needWarm = Platform.isMinigame && !Platform.isDevtools && iosPlatform();
    if (!needWarm) return;

    await this._waitCompositorFrames(4);

    if (this._isMain2dCompositorStale()) {
      this.forceReadPixelsCompositor();
      this.syncFrameToScreen();
      await this._waitCompositorFrames(4);
      // readPixels 仅用于换场景首帧兜底，之后恢复 drawImage（逐帧 readPixels 会卡死真机）
      this._compositeMethod = 'drawImage';
      try { GameGlobal.__compositeMethod = 'drawImage'; } catch (_) { /* */ }
    }

    this.syncFrameToScreen();
    await this._waitCompositorFrames(2);
  }

  /** 场景挂载后：compositor 预热 + TitleScene 延迟 idle FPS */
  async runPostSceneWarmup(): Promise<void> {
    await this.warmSceneCompositor();
    try {
      const fn = GameGlobal?.__deferredIdleFps;
      if (typeof fn === 'function') {
        fn();
        GameGlobal.__deferredIdleFps = null;
      }
    } catch { /* */ }
  }

  private _waitCompositorFrames(count: number): Promise<void> {
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

  private _sampleMain2dCenter(): string {
    const c = GameGlobal?.__mainCanvas ?? this._screenCanvas;
    if (!c?.getContext) return 'main2d=null';
    try {
      const ctx = c.getContext('2d') as CanvasRenderingContext2D;
      const w = c.width || 1;
      const h = c.height || 1;
      const d = ctx.getImageData((w / 2) | 0, (h / 2) | 0, 1, 1).data;
      return `rgba(${d[0]},${d[1]},${d[2]},${d[3]})`;
    } catch (e) {
      return `err:${e}`;
    }
  }

  /** 合成未跟上：boot 红块探针 / 全透明 */
  private _isMain2dCompositorStale(): boolean {
    const s = this._sampleMain2dCenter();
    return /rgba\(255,0,0,255\)/.test(s) || /rgba\(0,0,0,0\)/.test(s);
  }

  /** drawImage 卡在旧帧时，强制走 readPixels 合成 */
  forceReadPixelsCompositor(): void {
    this._compositeMethod = 'readPixels';
    try { GameGlobal.__compositeMethod = 'readPixels'; } catch (_) { /* */ }
  }

  /** 确保 Pixi 使用与 __mainCanvas（2D 上屏）分离的离屏 WebGL canvas */
  private _ensurePixiViewCanvas(w: number, h: number, forceNew = false): any {
    const gg = GameGlobal as any;
    const main = gg?.__mainCanvas;

    const probeWebGL = (c: any): boolean => {
      if (!c?.getContext || c === main) return false;
      try {
        const gl = c.getContext('webgl', {
          stencil: true,
          antialias: false,
          alpha: true,
          depth: true,
          preserveDrawingBuffer: true,
        });
        return !!gl;
      } catch {
        return false;
      }
    };

    if (!forceNew) {
      const existing = gg?.__pixiViewCanvas;
      if (existing && existing !== main) {
        try { existing.width = w; existing.height = h; } catch (_) { /* */ }
        if (probeWebGL(existing)) {
          console.log('[Game] 复用 __pixiViewCanvas');
          return existing;
        }
        console.warn('[Game] __pixiViewCanvas 无法 WebGL，重建');
      }
    }

    const api: any = typeof wx !== 'undefined' ? wx : typeof tt !== 'undefined' ? tt : null;

    if (api?.createOffscreenCanvas) {
      try {
        const oc = api.createOffscreenCanvas({ type: 'webgl', width: w, height: h });
        if (probeWebGL(oc)) {
          gg.__pixiViewCanvas = oc;
          console.log('[Game] 离屏 WebGL: createOffscreenCanvas(webgl)');
          return oc;
        }
      } catch (e) {
        console.warn('[Game] createOffscreenCanvas(webgl) 失败:', e);
      }
    }

    if (api?.createCanvas) {
      const c = api.createCanvas();
      c.width = w;
      c.height = h;
      if (probeWebGL(c)) {
        gg.__pixiViewCanvas = c;
        console.log('[Game] 离屏 WebGL: wx.createCanvas()');
        return c;
      }
    }

    throw new Error('无法创建离屏 WebGL canvas');
  }

  /** 离屏 WebGL canvas 补齐 Pixi EventSystem 需要的 DOM stub */
  private _patchOffscreenCanvasDom(target: any): void {
    if (!target) return;
    const safeAssign = (key: string, value: unknown) => {
      try {
        if (target[key] === undefined || target[key] === null) target[key] = value;
      } catch {
        try {
          Object.defineProperty(target, key, { value, writable: true, configurable: true });
        } catch { /* */ }
      }
    };
    if (typeof target.addEventListener !== 'function') {
      safeAssign('addEventListener', () => {});
    }
    if (typeof target.removeEventListener !== 'function') {
      safeAssign('removeEventListener', () => {});
    }
    if (!target.style) safeAssign('style', {});
    if (typeof target.getBoundingClientRect !== 'function') {
      const sw = this.screenWidth;
      const sh = this.screenHeight;
      safeAssign('getBoundingClientRect', () => ({
        x: 0, y: 0, top: 0, left: 0, right: sw, bottom: sh, width: sw, height: sh,
      }));
    }
  }

  /**
   * 合成须在 Pixi render 之后同步到 main-2d。
   * 真机部分 renderer 不稳定派发 'postrender'（场景内 toggle/转珠看不到变化即源于此），
   * 故 **始终** 再挂一个 ticker-LOW 兜底，逐帧合成不丢；用 _lastCompositeTick 去重避免同帧重复合成。
   */
  private _hookCompositorAfterRender(renderer: PIXI.IRenderer | null): void {
    if (this._postRenderHooked) return;
    this._postRenderHooked = true;
    const r = renderer as (PIXI.IRenderer & {
      on?: (event: string, fn: () => void, context?: unknown) => void;
    }) | null;
    let hook = 'ticker-low';
    if (r?.on) {
      r.on('postrender', () => this._compositeToScreen(false, true), this);
      hook = 'postrender+ticker-low';
    }
    // ticker-LOW 兜底：postrender 不稳定时仍能上屏；限 ~30fps，且同 tick 与 postrender 去重
    this.ticker.add(() => this._compositeToScreen(false, false), this, UPDATE_PRIORITY.LOW);
    try { GameGlobal.__compositorHook = hook; } catch (_) { /* */ }
    console.log(`[Game] compositor 已挂 ${hook}（逐帧同步 main-2d）`);
    if (!isMinimalBoot()) BootDiag.log('compositor', `hook=${hook}`);
  }

  /** WebKit/iOS：2D 写入 backing store 后须 nominal draw 才触发物理上屏 */
  private _flushCanvas2dToScreen(ctx: CanvasRenderingContext2D): void {
    try {
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(0, 0, 1, 1);
      ctx.strokeStyle = 'rgba(0,0,0,0)';
      ctx.strokeRect(0, 0, 1, 1);
    } catch (_) { /* */ }
  }

  /** __mainCanvas 与 GameGlobal.screencanvas 分离时，把合成结果 blit 到物理屏 */
  private _presentToPhysicalScreen(source: { width: number; height: number }): void {
    const gg = GameGlobal as any;
    const physical = gg?.__physicalScreenCanvas ?? null;
    if (!physical || physical === this._screenCanvas) return;
    try {
      let pctx = gg.__physicalCtx2d as CanvasRenderingContext2D | null;
      if (!pctx) {
        pctx = physical.getContext?.('2d') as CanvasRenderingContext2D | null;
        if (pctx) gg.__physicalCtx2d = pctx;
      }
      if (!pctx) return;
      if (physical.width !== source.width) {
        try { physical.width = source.width; } catch (_) { /* */ }
      }
      if (physical.height !== source.height) {
        try { physical.height = source.height; } catch (_) { /* */ }
      }
      pctx.drawImage(this._screenCanvas, 0, 0, source.width, source.height);
      this._flushCanvas2dToScreen(pctx);
    } catch (e) {
      if (!this._compositorWarned) {
        this._compositorWarned = true;
        console.warn('[Game] presentToPhysicalScreen 失败:', e);
      }
    }
  }

  /**
   * 把离屏 WebGL 帧合成到主屏 2D canvas（对齐 caizhu-rosa：drawImage）。
   * @param force true 时跳过限频/去重（syncFrameToScreen 手动 render 后强制立即上屏）
   * @param fromPostRender true 时来自 postrender，不受 ticker 兜底 30fps 限频
   */
  private _compositeToScreen(force = false, fromPostRender = false): void {
    const ctx = this._screenCtx2d;
    const screen = this._screenCanvas;
    const render = this._renderCanvas;
    if (!ctx || !screen || !render || screen === render) return;

    const nowMs = Date.now();

    const compositorBoosted = nowMs < this._compositorBoostUntil;

    if (!force) {
      const tick = this.ticker?.lastTime ?? 0;
      if (tick === this._lastCompositeTick) return;
      // ticker-LOW 兜底限 ~30fps；postrender / 拖动 boost 不受此限
      if (!fromPostRender && !compositorBoosted
        && nowMs - this._lastCompositeFallbackMs < GameClass.COMPOSITE_FALLBACK_MS) {
        return;
      }
      this._lastCompositeTick = tick;
      if (!fromPostRender) this._lastCompositeFallbackMs = nowMs;
    }

    // readPixels 全屏回读极重（1179×2556≈12MB/帧），限 ~20fps 且仅 warm 场景时短暂使用
    if (this._compositeMethod === 'readPixels') {
      if (!force && nowMs - this._lastReadPixelsMs < GameClass.READPIXELS_MIN_MS) return;
      this._lastReadPixelsMs = nowMs;
      this._compositeFrameCount++;
      this._compositeViaReadPixels(ctx, screen);
      return;
    }

    this._compositeFrameCount++;
    try {
      if (typeof GameGlobal !== 'undefined') {
        GameGlobal.__compositeFrameCount = this._compositeFrameCount;
        GameGlobal.__compositeMethod = this._compositeMethod;
      }
    } catch (_) { /* */ }

    try {
      ctx.clearRect(0, 0, screen.width, screen.height);
      ctx.drawImage(render, 0, 0, screen.width, screen.height);
      this._flushCanvas2dToScreen(ctx);
      this._presentToPhysicalScreen(screen);
    } catch (error) {
      const msg = String(error);
      this._compositeLastError = msg;
      if (!this._compositorWarned) {
        this._compositorWarned = true;
        console.warn('[Game] 2d compositor drawImage 失败:', error);
        BootDiag.log('compositor', `drawImage fail: ${msg}`);
      }
      // 不在游戏循环内永久切 readPixels（逐帧全屏 readPixels 会卡死真机）
    }
  }

  /** readPixels → 离屏 2D temp → drawImage 上屏（避免主 canvas 直接 putImageData 不上屏） */
  private _compositeViaReadPixels(
    ctx: CanvasRenderingContext2D,
    screen: { width: number; height: number },
  ): void {
    const gl = (this.app?.renderer as any)?.gl as WebGLRenderingContext | undefined;
    if (!gl) return;

    const w = screen.width;
    const h = screen.height;
    const byteLen = w * h * 4;
    if (!this._readPixelsBuf || this._readPixelsBuf.length !== byteLen) {
      this._readPixelsBuf = new Uint8Array(byteLen);
      this._compositeImageData = null;
      this._compositeTempCanvas = null;
      this._compositeTempCtx = null;
    }

    if (!this._compositeTempCanvas) {
      const api: any = typeof wx !== 'undefined' ? wx : typeof tt !== 'undefined' ? tt : null;
      try {
        if (typeof api?.createOffscreenCanvas === 'function') {
          this._compositeTempCanvas = api.createOffscreenCanvas({ type: '2d', width: w, height: h });
        }
      } catch { /* */ }
      if (!this._compositeTempCanvas && typeof api?.createCanvas === 'function') {
        this._compositeTempCanvas = api.createCanvas();
        this._compositeTempCanvas.width = w;
        this._compositeTempCanvas.height = h;
      }
      if (this._compositeTempCanvas) {
        this._compositeTempCtx = this._compositeTempCanvas.getContext('2d') as CanvasRenderingContext2D | null;
        if (this._compositeTempCtx) {
          this._compositeImageData = this._compositeTempCtx.createImageData(w, h);
        }
      }
    }

    const imageData = this._compositeImageData;
    const tempCtx = this._compositeTempCtx;
    if (!imageData || !tempCtx) {
      this._compositeViaReadPixelsDirect(ctx, screen, gl, w, h, byteLen);
      return;
    }

    try {
      if (iosPlatform()) {
        try { gl.finish(); } catch (_) { /* */ }
      }
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, this._readPixelsBuf!);
      const dst = imageData.data;
      const src = this._readPixelsBuf!;
      const rowBytes = w * 4;
      for (let y = 0; y < h; y++) {
        const srcOff = (h - 1 - y) * rowBytes;
        dst.set(src.subarray(srcOff, srcOff + rowBytes), y * rowBytes);
      }
      tempCtx.putImageData(imageData, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(this._compositeTempCanvas, 0, 0, w, h);
      this._flushCanvas2dToScreen(ctx);
      this._presentToPhysicalScreen(screen);
    } catch (error) {
      if (!this._compositorWarned) {
        this._compositorWarned = true;
        console.warn('[Game] readPixels compositor 失败:', error);
        BootDiag.log('compositor', `readPixels fail: ${error}`);
      }
    }
  }

  /** readPixels 直写主屏 2D（temp canvas 不可用时的兜底） */
  private _compositeViaReadPixelsDirect(
    ctx: CanvasRenderingContext2D,
    screen: { width: number; height: number },
    gl: WebGLRenderingContext,
    w: number,
    h: number,
    byteLen: number,
  ): void {
    if (!this._readPixelsBuf || this._readPixelsBuf.length !== byteLen) {
      this._readPixelsBuf = new Uint8Array(byteLen);
    }
    if (!this._compositeImageData) {
      this._compositeImageData = ctx.createImageData(w, h);
    }
    try {
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, this._readPixelsBuf);
      const dst = this._compositeImageData!.data;
      const src = this._readPixelsBuf;
      const rowBytes = w * 4;
      for (let y = 0; y < h; y++) {
        const srcOff = (h - 1 - y) * rowBytes;
        dst.set(src.subarray(srcOff, srcOff + rowBytes), y * rowBytes);
      }
      ctx.putImageData(this._compositeImageData!, 0, 0);
      this._flushCanvas2dToScreen(ctx);
      this._presentToPhysicalScreen(screen);
    } catch (error) {
      if (!this._compositorWarned) {
        this._compositorWarned = true;
        console.warn('[Game] readPixels direct compositor 失败:', error);
        BootDiag.log('compositor', `readPixels direct fail: ${error}`);
      }
    }
  }

  /** drawImage 后采样：WebGL 有像素但 2D 未同步则切换 readPixels */
  private _maybeSwitchToReadPixels(
    ctx: CanvasRenderingContext2D,
    screen: { width: number; height: number },
  ): void {
    if (!iosPlatform() || this._compositeMethod !== 'drawImage') return;
    this._compositeProbeFrames++;
    // 前 60 帧每 3 帧探测（原仅 15/45，drawImage 失败时回退太慢）
    if (this._compositeProbeFrames > 60) return;
    if (this._compositeProbeFrames % 3 !== 0 && this._compositeProbeFrames !== 45) return;

    try {
      const gl = (this.app?.renderer as any)?.gl as WebGLRenderingContext | undefined;
      if (!gl) return;
      const gpu = new Uint8Array(4);
      // GL 原点左下；2D canvas 原点左上 —— 须采同一视觉位置
      const glY = Math.max(0, screen.height - 20);
      const cpuY = 20;
      gl.readPixels(20, glY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, gpu);
      if (gpu[3] === 0) return;

      const cpu = ctx.getImageData(20, cpuY, 1, 1).data;
      const mismatch = Math.abs(cpu[0] - gpu[0]) > 8
        || Math.abs(cpu[1] - gpu[1]) > 8
        || Math.abs(cpu[2] - gpu[2]) > 8;
      if (mismatch || cpu[3] === 0) {
        this._compositeMethod = 'readPixels';
        console.warn(
          `[Game] drawImage 未同步 WebGL（gpu=rgba(${gpu[0]},${gpu[1]},${gpu[2]},${gpu[3]})`
          + ` cpu=rgba(${cpu[0]},${cpu[1]},${cpu[2]},${cpu[3]})），切换 readPixels`,
        );
        if (!isMinimalBoot()) BootDiag.log('compositor', 'drawImage/WebGL mismatch → readPixels');
        this._compositeViaReadPixels(ctx, screen);
      }
    } catch (_) { /* */ }
  }
}

// 通过全局对象保证单例：防止 bundler 意外生成多份模块导致多个实例
const _global: any = typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof window !== 'undefined' ? window
  : typeof globalThis !== 'undefined' ? globalThis
  : {};

if (!_global.__gameInstance) {
  _global.__gameInstance = new GameClass();
}
export const Game: GameClass = _global.__gameInstance;
