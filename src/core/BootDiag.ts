/**
 * 真机启动黑屏诊断：结构化日志 + 帧/watchdog 采样 + GameGlobal 快照（供 game.js 弹窗）。
 */
import * as PIXI from 'pixi.js';
import { Game } from './Game';
import { TweenManager } from './TweenManager';
import { iosPlatform } from './webglContextPatch';
declare const wx: any;
declare const tt: any;
declare const GameGlobal: any;

function isRealDevice(): boolean {
  try {
    const api = typeof wx !== 'undefined' ? wx : typeof tt !== 'undefined' ? tt : null;
    return api?.getSystemInfoSync?.()?.platform !== 'devtools';
  } catch {
    return false;
  }
}

const TAG = '[BootDiag]';
const _lines: string[] = [];
let _frame = 0;
let _watchStarted = false;
let _tickerHooked = false;

/** 由 SceneManager 注册，避免循环 import */
let _getCurrentScene: (() => { name: string; container: PIXI.Container } | null) | null = null;

export function bootDiagBindScene(
  getter: () => { name: string; container: PIXI.Container } | null,
): void {
  _getCurrentScene = getter;
}

function canvasDiagId(c: unknown): string {
  const o = c as { __diagId?: string } | null;
  if (!o) return 'null';
  return o.__diagId || 'anon';
}

function sampleCtx2d(
  c: { width?: number; height?: number; getContext?: (t: string) => unknown } | null | undefined,
  label: string,
  parts: string[],
): void {
  if (!c?.getContext) {
    parts.push(`${label}: no-canvas`);
    return;
  }
  try {
    const ctx = c.getContext('2d') as CanvasRenderingContext2D | null;
    if (!ctx?.getImageData) {
      parts.push(`${label}: ctx2d=null id=${canvasDiagId(c)}`);
      return;
    }
    const w = c.width || 1;
    const h = c.height || 1;
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const mid = ctx.getImageData(cx, cy, 1, 1).data;
    parts.push(
      `${label} id=${canvasDiagId(c)} ${w}x${h} `
      + `center=rgba(${mid[0]},${mid[1]},${mid[2]},${mid[3]})`,
    );
    try {
      const tl = ctx.getImageData(20, 20, 1, 1).data;
      parts.push(
        `${label} top-left=rgba(${tl[0]},${tl[1]},${tl[2]},${tl[3]})`,
      );
    } catch (_) { /* */ }
  } catch (e) {
    parts.push(`${label} sample err: ${e}`);
  }
}

function push(line: string): void {
  _lines.push(line);
  if (_lines.length > 120) _lines.shift();
  console.log(`${TAG} ${line}`);
}

function sampleDesignPixel(
  gl: WebGLRenderingContext,
  r: { width: number; height: number },
  label: string,
  x: number,
  y: number,
  parts: string[],
): void {
  try {
    const sx = Game.stage?.scale?.x || 1;
    const sy = Game.stage?.scale?.y || sx;
    const px = new Uint8Array(4);
    const rx = Math.max(0, Math.min(r.width - 1, Math.floor(x * sx)));
    const ry = Math.max(0, Math.min(r.height - 1, r.height - 1 - Math.floor(y * sy)));
    gl.readPixels(rx, ry, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    parts.push(`${label}@${Math.round(x)},${Math.round(y)}: rgba(${px[0]},${px[1]},${px[2]},${px[3]})`);
  } catch (e) {
    parts.push(`${label} sample fail: ${e}`);
  }
}

function describeDisplayObject(node: PIXI.DisplayObject, index: number): string {
  const obj = node as PIXI.DisplayObject & {
    texture?: PIXI.Texture;
    renderable?: boolean;
    worldAlpha?: number;
    children?: PIXI.DisplayObject[];
  };
  let bounds = '?';
  try {
    const b = obj.getBounds();
    bounds = `${b.x.toFixed(0)},${b.y.toFixed(0)},${b.width.toFixed(0)}x${b.height.toFixed(0)}`;
  } catch (e) {
    bounds = `err:${String(e).slice(0, 28)}`;
  }
  const tex = obj.texture
    ? ` tex=${obj.texture.valid ? 'ok' : 'bad'} ${obj.texture.width}x${obj.texture.height}`
    : '';
  return `scene child[${index}] ${obj.constructor?.name || 'DisplayObject'}`
    + ` vis=${obj.visible} rend=${obj.renderable !== false}`
    + ` alpha=${obj.alpha?.toFixed?.(2) ?? '?'} worldAlpha=${obj.worldAlpha?.toFixed?.(2) ?? '?'}`
    + ` pos=${obj.x?.toFixed?.(0) ?? '?'},${obj.y?.toFixed?.(0) ?? '?'}`
    + ` scale=${obj.scale?.x?.toFixed?.(2) ?? '?'},${obj.scale?.y?.toFixed?.(2) ?? '?'}`
    + ` bounds=${bounds}`
    + ` mask=${!!obj.mask} children=${obj.children?.length ?? 0}`
    + tex;
}

function currentScene(): { name: string; container: PIXI.Container } | null {
  return _getCurrentScene?.() ?? null;
}

export const BootDiag = {
  log(phase: string, detail?: string): void {
    push(detail ? `${phase} | ${detail}` : phase);
  },

  expose(): void {
    try {
      if (typeof GameGlobal !== 'undefined') {
        GameGlobal.__bootDiagLines = () => [..._lines];
        GameGlobal.__bootDiagSnapshot = () => BootDiag.snapshot('manual');
      }
    } catch (_) { /* */ }
  },

  hookTickerOnce(): void {
    if (_tickerHooked || !Game.ticker) return;
    _tickerHooked = true;
    Game.ticker.add(() => {
      _frame++;
      if (_frame === 1 || _frame === 30 || _frame === 60 || _frame === 120) {
        BootDiag.snapshot(`frame${_frame}`);
      }
    });
  },

  startWatchdog(): void {
    if (_watchStarted) return;
    _watchStarted = true;
    BootDiag.expose();

    const schedule = (ms: number, label: string, fixAlpha?: boolean) => {
      setTimeout(() => {
        BootDiag.snapshot(label);
        if (fixAlpha) BootDiag.ensureSceneVisible(`${label}-fix`);
      }, ms);
    };

    schedule(500, 't+500ms');
    schedule(1000, 't+1s', true);
    schedule(3000, 't+3s', true);
    schedule(5000, 't+5s', true);
  },

  ensureSceneVisible(reason: string): void {
    const scene = currentScene();
    const c = scene?.container;
    if (!c || c.destroyed) {
      push(`ensureVisible skip(${reason}): 无场景容器`);
      return;
    }
    let fixed = 0;
    const flatten = (node: PIXI.Container): void => {
      if (node.destroyed) return;
      TweenManager.cancelTarget(node);
      if (node.alpha < 0.99) {
        node.alpha = 1;
        fixed++;
      }
      for (const ch of node.children) {
        if (ch instanceof PIXI.Container) flatten(ch);
        else if ((ch as PIXI.DisplayObject).alpha < 0.99) {
          TweenManager.cancelTarget(ch);
          (ch as PIXI.DisplayObject).alpha = 1;
          fixed++;
        }
      }
    };
    const before = `rootAlpha=${c.alpha.toFixed(3)} y=${c.y.toFixed(1)} tweens=${TweenManager.activeCount}`;
    c.alpha = 1;
    c.y = 0;
    flatten(c);
    if (fixed > 0 || c.alpha < 0.99 || Math.abs(c.y) > 1) {
      push(`ensureVisible(${reason}): ${before} → fixed=${fixed} tweens=${TweenManager.activeCount}`);
    }
  },

  snapshot(label: string): string {
    const parts: string[] = [`--- ${label} ---`];

    try {
      const ticker = Game.ticker;
      parts.push(
        `ticker: started=${ticker?.started} `
        + `maxFPS=${ticker?.maxFPS} FPS=${ticker?.FPS?.toFixed?.(1) ?? '?'} `
        + `deltaMS=${ticker?.deltaMS?.toFixed?.(2) ?? '?'} `
        + `tweens=${TweenManager.activeCount}`,
      );
    } catch (e) {
      parts.push(`ticker err: ${e}`);
    }

    try {
      const stage = Game.stage;
      const r = Game.app?.renderer as any;
      parts.push(
        `stage: children=${stage?.children?.length ?? 0} `
        + `scale=${stage?.scale?.x?.toFixed?.(3) ?? '?'} `
        + `logic=${Game.logicWidth}x${Game.logicHeight.toFixed(0)}`,
      );
      if (r) {
        parts.push(
          `renderer: ${r.width}x${r.height} type=${r.type ?? '?'} `
          + `glVer=${r.context?.webGLVersion ?? '?'}`,
        );
        const gl = r.gl;
        if (gl) {
          const ext = gl.getExtension('OES_element_index_uint');
          parts.push(`gl: OES_element_index_uint=${!!ext}`);
          const view = (r as { view?: unknown }).view;
          const display = GameGlobal?.canvas;
          parts.push(
            `view: renderer.view===canvas=${view === display} `
            + `canvasId=${canvasDiagId(display)}`,
          );
          try {
            const px = new Uint8Array(4);
            const cx = Math.floor(r.width / 2);
            const cy = Math.floor(r.height / 2);
            gl.readPixels(cx, cy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            parts.push(`readPixels center: rgba(${px[0]},${px[1]},${px[2]},${px[3]})`);
            gl.readPixels(20, Math.max(0, r.height - 20), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            parts.push(`readPixels top-left: rgba(${px[0]},${px[1]},${px[2]},${px[3]})`);
            sampleDesignPixel(gl, r, 'probeGfx', 20, 20, parts);
            sampleDesignPixel(gl, r, 'probeWhiteSprite', 20, 82, parts);
            sampleDesignPixel(gl, r, 'probeBufferSprite', 20, 144, parts);
            sampleDesignPixel(gl, r, 'titleLogo', Game.logicWidth / 2, Game.safeTop + 168, parts);
            sampleDesignPixel(gl, r, 'titleBgCenter', Game.logicWidth / 2, Game.logicHeight / 2, parts);
          } catch (e) {
            parts.push(`readPixels fail: ${e}`);
          }
        }
        BootDiag._sampleScreen2d(parts);
      }
    } catch (e) {
      parts.push(`stage/renderer err: ${e}`);
    }

    const scene = currentScene();
    const c = scene?.container;
    if (c) {
      parts.push(
        `scene[${scene!.name}]: children=${c.children.length} `
        + `alpha=${c.alpha.toFixed(3)} y=${c.y.toFixed(1)} visible=${c.visible}`,
      );
      let texOk = 0;
      let texBad = 0;
      c.children.forEach((child) => {
        BootDiag._walkTextures(child, () => { texOk++; }, () => { texBad++; });
      });
      parts.push(`scene textures: ok=${texOk} invalid=${texBad}`);
      c.children.slice(0, 8).forEach((child, idx) => {
        parts.push(describeDisplayObject(child, idx));
      });
    } else {
      parts.push('scene: (none)');
    }

    const text = parts.join('\n');
    parts.forEach((p) => push(p));
    return text;
  },

  _walkTextures(node: PIXI.DisplayObject, onOk: () => void, onBad: () => void): void {
    const spr = node as PIXI.Sprite;
    if (spr.texture) {
      if (spr.texture.valid) onOk();
      else onBad();
    }
    const cont = node as PIXI.Container;
    if (cont.children) {
      for (const ch of cont.children) BootDiag._walkTextures(ch, onOk, onBad);
    }
  },

  _sampleScreen2d(parts: string[]): void {
    try {
      const main = GameGlobal?.__mainCanvas;
      const pixiView = GameGlobal?.__pixiViewCanvas;
      const display = GameGlobal?.canvas;
      const nativeScreen = GameGlobal?.screencanvas;
      const physical = GameGlobal?.__physicalScreenCanvas;
      const method = GameGlobal?.__compositeMethod ?? '?';
      const frames = GameGlobal?.__compositeFrameCount ?? 0;

      parts.push(
        'canvas拓扑:'
        + ` mainId=${canvasDiagId(main)}`
        + ` pixiId=${canvasDiagId(pixiView)}`
        + ` displayId=${canvasDiagId(display)}`
        + ` nativeScreenId=${canvasDiagId(nativeScreen)}`
        + ` physicalId=${canvasDiagId(physical)}`,
      );
      parts.push(
        `canvas关系: main===display=${main === display}`
        + ` main===nativeScreen=${main === nativeScreen}`
        + ` display===pixi=${display === pixiView}`
        + ` src=${GameGlobal?.__mainCanvasSource ?? '?'}`
        + ` physicalBlit=${!!physical}`,
      );
      parts.push(
        `renderPath=${GameGlobal?.__renderPath ?? 'default'}`
        + ` compositor=${GameGlobal?.__mainCtx2d ? '2d' : 'direct-webgl'}`
        + ` hook=${GameGlobal?.__compositorHook ?? '?'}`
        + ` method=${method}`
        + ` frames=${frames}`,
      );
      if (GameGlobal?.__mainCtx2d && frames > 0 && frames < 10) {
        parts.push('WARN compositor frames 异常偏低，2D 合成可能未持续执行');
      }

      if (main && GameGlobal?.__mainCtx2d?.getImageData) {
        const ctx = GameGlobal.__mainCtx2d as CanvasRenderingContext2D;
        const cx = Math.floor(main.width / 2);
        const cy = Math.floor(main.height / 2);
        const px = ctx.getImageData(cx, cy, 1, 1).data;
        parts.push(`main2d center: rgba(${px[0]},${px[1]},${px[2]},${px[3]})`);
        try {
          const tl = ctx.getImageData(20, 20, 1, 1).data;
          parts.push(`main2d top-left: rgba(${tl[0]},${tl[1]},${tl[2]},${tl[3]})`);
        } catch (_) { /* */ }
      }

      if (nativeScreen && nativeScreen !== main) {
        sampleCtx2d(nativeScreen, 'nativeScreen', parts);
      }
      if (physical && physical !== main && physical !== nativeScreen) {
        sampleCtx2d(physical, 'physical', parts);
      }
    } catch (e) {
      parts.push(`screen2d sample fail: ${e}`);
    }
  },

  logRendererOnInit(): void {
    try {
      const r = Game.app?.renderer as any;
      const gl = r?.gl;
      if (!gl) {
        push('init: 无 gl 上下文');
        return;
      }
      push(`init: webGLVersion=${r.context?.webGLVersion} maxTex=${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`);
      push(`init: batchMaxTextures=${r.batch?.maxTextures ?? '?'}`);
      push(`init: OES_element_index_uint=${!!gl.getExtension('OES_element_index_uint')}`);
      push(`init: multisample=${r.multisample ?? '?'}`);
      if (r.context?.webGLVersion === 2 && iosPlatform()) {
        push('init: WARN iOS 仍在 WebGL2，Sprite 可能不绘制');
      }
    } catch (e) {
      push(`init renderer err: ${e}`);
    }
  },

  attachProbe(): void {
    if (!isRealDevice()) return;
    try {
      const g = new PIXI.Graphics();
      g.beginFill(0x00aa44, 0.85);
      g.drawRect(8, 8, 120, 40);
      g.endFill();
      g.zIndex = 99999;

      const white = new PIXI.Sprite(PIXI.Texture.WHITE);
      white.tint = 0xffffff;
      white.position.set(8, 70);
      white.width = 120;
      white.height = 40;
      white.zIndex = 99998;

      const pixels = new Uint8Array(16 * 16 * 4);
      for (let i = 0; i < 16 * 16; i++) {
        pixels[i * 4] = 255;
        pixels[i * 4 + 1] = 0;
        pixels[i * 4 + 2] = 180;
        pixels[i * 4 + 3] = 255;
      }
      const bufferTex = PIXI.Texture.fromBuffer(pixels, 16, 16);
      const bufferSprite = new PIXI.Sprite(bufferTex);
      bufferSprite.position.set(8, 132);
      bufferSprite.width = 120;
      bufferSprite.height = 40;
      bufferSprite.zIndex = 99997;

      Game.stage.sortableChildren = true;
      Game.stage.addChild(g);
      Game.stage.addChild(white);
      Game.stage.addChild(bufferSprite);
      push('probe: 已挂载 Graphics/WHITE Sprite/buffer Sprite 三段探针（2.5s 后移除）');
      setTimeout(() => {
        for (const obj of [g, white, bufferSprite]) {
          if (obj.parent) obj.parent.removeChild(obj);
          obj.destroy();
        }
        try {
          bufferTex.destroy(true);
        } catch (_) { /* */ }
        if (g.destroyed) {
          push('probe: 探针已移除');
        }
      }, 2500);
    } catch (e) {
      push(`probe fail: ${e}`);
    }
  },
};
