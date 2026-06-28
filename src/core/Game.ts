/**
 * 全局游戏单例 - 持有 PIXI.Application 和核心引用
 *
 * 移植自 game2D_huahua（已验证微信/抖音真机），去除业务依赖：
 * - 750 设计宽适配 + DPR
 * - Renderer 三级降级（Application → Renderer → autoDetectRenderer）
 * - EventSystem 坐标映射修复
 */
import * as PIXI from 'pixi.js';
import { ShaderSystem } from '@pixi/core';
import { TweenManager } from './TweenManager';
import { BootDiag } from './BootDiag';
import { patchCanvasForceWebGL1, installForceWebGL1OnPlatform } from './forceWebGL1';
import { UPDATE_PRIORITY } from '@pixi/ticker';

declare const wx: any;
declare const tt: any;
declare const GameGlobal: any;

/* ---- @pixi/unsafe-eval 内联 patch（双保险：pixiUnsafeEvalPatch.ts 之外再 ensure 一次） ---- */

const GLSL_TO_SINGLE_SETTERS: Record<string, (gl: any, loc: any, cv: any, v: any) => void> = {
  vec3(gl, loc, cv, v) { (cv[0]!==v[0]||cv[1]!==v[1]||cv[2]!==v[2])&&(cv[0]=v[0],cv[1]=v[1],cv[2]=v[2],gl.uniform3f(loc,v[0],v[1],v[2])); },
  int(gl, loc, _c, v) { gl.uniform1i(loc, v); },
  ivec2(gl, loc, _c, v) { gl.uniform2i(loc, v[0], v[1]); },
  ivec3(gl, loc, _c, v) { gl.uniform3i(loc, v[0], v[1], v[2]); },
  ivec4(gl, loc, _c, v) { gl.uniform4i(loc, v[0], v[1], v[2], v[3]); },
  uint(gl, loc, _c, v) { gl.uniform1ui(loc, v); },
  uvec2(gl, loc, _c, v) { gl.uniform2ui(loc, v[0], v[1]); },
  uvec3(gl, loc, _c, v) { gl.uniform3ui(loc, v[0], v[1], v[2]); },
  uvec4(gl, loc, _c, v) { gl.uniform4ui(loc, v[0], v[1], v[2], v[3]); },
  bvec2(gl, loc, _c, v) { gl.uniform2i(loc, v[0], v[1]); },
  bvec3(gl, loc, _c, v) { gl.uniform3i(loc, v[0], v[1], v[2]); },
  bvec4(gl, loc, _c, v) { gl.uniform4i(loc, v[0], v[1], v[2], v[3]); },
  mat2(gl, loc, _c, v) { gl.uniformMatrix2fv(loc, false, v); },
  mat4(gl, loc, _c, v) { gl.uniformMatrix4fv(loc, false, v); },
};
const GLSL_TO_ARRAY_SETTERS: Record<string, (gl: any, loc: any, cv: any, v: any) => void> = {
  float(gl, loc, _c, v) { gl.uniform1fv(loc, v); },
  vec2(gl, loc, _c, v) { gl.uniform2fv(loc, v); },
  vec3(gl, loc, _c, v) { gl.uniform3fv(loc, v); },
  vec4(gl, loc, _c, v) { gl.uniform4fv(loc, v); },
  int(gl, loc, _c, v) { gl.uniform1iv(loc, v); },
  ivec2(gl, loc, _c, v) { gl.uniform2iv(loc, v); },
  ivec3(gl, loc, _c, v) { gl.uniform3iv(loc, v); },
  ivec4(gl, loc, _c, v) { gl.uniform4iv(loc, v); },
  uint(gl, loc, _c, v) { gl.uniform1uiv(loc, v); },
  uvec2(gl, loc, _c, v) { gl.uniform2uiv(loc, v); },
  uvec3(gl, loc, _c, v) { gl.uniform3uiv(loc, v); },
  uvec4(gl, loc, _c, v) { gl.uniform4uiv(loc, v); },
  bool(gl, loc, _c, v) { gl.uniform1iv(loc, v); },
  bvec2(gl, loc, _c, v) { gl.uniform2iv(loc, v); },
  bvec3(gl, loc, _c, v) { gl.uniform3iv(loc, v); },
  bvec4(gl, loc, _c, v) { gl.uniform4iv(loc, v); },
  sampler2D(gl, loc, _c, v) { gl.uniform1iv(loc, v); },
  samplerCube(gl, loc, _c, v) { gl.uniform1iv(loc, v); },
  sampler2DArray(gl, loc, _c, v) { gl.uniform1iv(loc, v); },
};

function patchedSyncUniforms(group: any, uniformData: any, ud: any, uv: any, renderer: any): void {
  let textureCount = 0, v: any = null, cv: any = null;
  const gl = renderer.gl;
  for (const i in group.uniforms) {
    const data = uniformData[i], uvi = uv[i], udi = ud[i], gu = group.uniforms[i];
    if (!data) { if (gu.group === true) renderer.shader.syncUniformGroup(uvi); continue; }
    if (data.type==='float'&&data.size===1&&!data.isArray) { if(uvi!==udi.value){udi.value=uvi;gl.uniform1f(udi.location,uvi);} }
    else if (data.type==='bool'&&data.size===1&&!data.isArray) { if(uvi!==udi.value){udi.value=uvi;gl.uniform1i(udi.location,Number(uvi));} }
    else if ((data.type==='sampler2D'||data.type==='samplerCube'||data.type==='sampler2DArray')&&data.size===1&&!data.isArray) {
      renderer.texture.bind(uvi,textureCount); if(udi.value!==textureCount){udi.value=textureCount;gl.uniform1i(udi.location,textureCount);} textureCount++;
    } else if (data.type==='mat3'&&data.size===1&&!data.isArray) {
      gu.a!==void 0?gl.uniformMatrix3fv(udi.location,false,uvi.toArray(true)):gl.uniformMatrix3fv(udi.location,false,uvi);
    } else if (data.type==='vec2'&&data.size===1&&!data.isArray) {
      if(gu.x!==void 0){cv=udi.value;v=uvi;(cv[0]!==v.x||cv[1]!==v.y)&&(cv[0]=v.x,cv[1]=v.y,gl.uniform2f(udi.location,v.x,v.y));}
      else{cv=udi.value;v=uvi;(cv[0]!==v[0]||cv[1]!==v[1])&&(cv[0]=v[0],cv[1]=v[1],gl.uniform2f(udi.location,v[0],v[1]));}
    } else if (data.type==='vec4'&&data.size===1&&!data.isArray) {
      if(gu.width!==void 0){cv=udi.value;v=uvi;(cv[0]!==v.x||cv[1]!==v.y||cv[2]!==v.width||cv[3]!==v.height)&&(cv[0]=v.x,cv[1]=v.y,cv[2]=v.width,cv[3]=v.height,gl.uniform4f(udi.location,v.x,v.y,v.width,v.height));}
      else{cv=udi.value;v=uvi;(cv[0]!==v[0]||cv[1]!==v[1]||cv[2]!==v[2]||cv[3]!==v[3])&&(cv[0]=v[0],cv[1]=v[1],cv[2]=v[2],cv[3]=v[3],gl.uniform4f(udi.location,v[0],v[1],v[2],v[3]));}
    } else { (data.size===1&&!data.isArray?GLSL_TO_SINGLE_SETTERS:GLSL_TO_ARRAY_SETTERS)[data.type].call(null,gl,udi.location,udi.value,uvi); }
  }
}

function ensureUnsafeEvalPatch(): void {
  if ((ShaderSystem.prototype as any).__patched) return;
  Object.assign(ShaderSystem.prototype, {
    __patched: true,
    systemCheck() { /* 禁用 eval 检测 */ },
    syncUniforms(group: any, glProgram: any) {
      const self = this as any;
      patchedSyncUniforms(group, self.shader.program.uniformData, glProgram.uniformData, group.uniforms, self.renderer);
    },
  });
  console.log('[Game] unsafe-eval patch 已应用');
}

ensureUnsafeEvalPatch();

/* ---- end unsafe-eval patch ---- */

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

  readonly _uid = Math.random().toString(36).slice(2, 8);

  constructor() {
    // 预初始化 stage/ticker，保证任何时刻访问都不为 undefined
    this.stage = new PIXI.Container();
    this.ticker = new PIXI.Ticker();
  }

  init(canvas: any): void {
    if (this._initialized) return;

    ensureUnsafeEvalPatch();
    installForceWebGL1OnPlatform();
    patchCanvasForceWebGL1(canvas);

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

    canvas.width = realWidth;
    canvas.height = realHeight;

    // ---- 创建 renderer + stage + ticker（三级降级） ----
    let renderer: PIXI.IRenderer | null = null;

    // 方式 1：标准 PIXI.Application
    let app: PIXI.Application | null = null;
    try {
      app = new PIXI.Application({
        view: canvas,
        width: realWidth,
        height: realHeight,
        backgroundColor: 0x1a1126,
        resolution: 1,
        antialias: true,
        preserveDrawingBuffer: true,
        // 鸿蒙/Android 必须显式要求 stencil；preferWebGLVersion 1 避免假 WebGL2
        preferWebGLVersion: 1,
      } as any);
    } catch (e) {
      console.error('[Game] new PIXI.Application 失败:', e);
    }

    if (app && app.stage && app.ticker && app.renderer) {
      this.app = app;
      this.stage = app.stage;
      this.ticker = app.ticker;
      renderer = app.renderer;
      console.log('[Game] 方式1: PIXI.Application 创建成功');
    } else {
      if (app && app.renderer) renderer = app.renderer;

      // 方式 2：手动 new PIXI.Renderer
      if (!renderer) {
        try {
          renderer = new PIXI.Renderer({
            view: canvas, width: realWidth, height: realHeight,
            backgroundColor: 0x1a1126, resolution: 1, antialias: true,
            preserveDrawingBuffer: true, preferWebGLVersion: 1,
          } as any);
          console.log('[Game] 方式2: new PIXI.Renderer 创建成功');
        } catch (e2) {
          console.error('[Game] new PIXI.Renderer 失败:', e2);
        }
      }

      // 方式 3：autoDetectRenderer 降级
      if (!renderer) {
        try {
          renderer = PIXI.autoDetectRenderer({
            view: canvas, width: realWidth, height: realHeight,
            backgroundColor: 0x1a1126, resolution: 1, antialias: true,
            preserveDrawingBuffer: true, preferWebGLVersion: 1,
          } as any);
          console.log('[Game] 方式3: autoDetectRenderer 创建成功');
        } catch (e3) {
          console.error('[Game] autoDetectRenderer 失败:', e3);
        }
      }

      this.stage = new PIXI.Container();
      this.ticker = new PIXI.Ticker();
      this.ticker.start();

      if (renderer) {
        this.ticker.add(() => { renderer!.render(this.stage); });
      } else {
        console.error('[Game] 所有渲染器创建均失败，画面将无法渲染');
      }

      this.app = {
        stage: this.stage,
        ticker: this.ticker,
        renderer,
        view: canvas,
      } as any;
    }

    // 标记游戏已渲染成功（供 game.js 诊断弹窗判断）
    try { (GameGlobal as any).__gameRendered = true; } catch (_) {}

    // 整体缩放到设计分辨率
    this.stage.scale.set(this.scale, this.scale);
    this.stage.sortableChildren = true;

    // 全局 ticker：Tween 须先于 Pixi 默认 render 执行（真机 iOS26 否则 alpha 补间长期不生效）
    this.ticker.add(() => {
      const dt = this.ticker.deltaMS / 1000;
      TweenManager.update(dt);
    }, this, UPDATE_PRIORITY.HIGH);

    try {
      if (!this.ticker.started) this.ticker.start();
      BootDiag.log('Game.init', `ticker.started=${this.ticker.started}`);
    } catch (e) {
      BootDiag.log('Game.init', `ticker.start 异常: ${e}`);
    }

    BootDiag.logRendererOnInit();
    BootDiag.hookTickerOnce();

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

  /** 设置帧率上限（非战斗场景降帧省电） */
  setMaxFPS(fps: number): void {
    try { this.ticker.maxFPS = fps; } catch (_) {}
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
