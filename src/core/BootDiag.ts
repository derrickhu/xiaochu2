/**
 * 真机启动黑屏诊断：结构化日志 + 帧/watchdog 采样 + GameGlobal 快照（供 game.js 弹窗）。
 */
import * as PIXI from 'pixi.js';
import { Game } from './Game';
import { TweenManager } from './TweenManager';
import { shouldForceWebGL1 } from './forceWebGL1';

declare const GameGlobal: any;

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

function push(line: string): void {
  _lines.push(line);
  if (_lines.length > 80) _lines.shift();
  console.log(`${TAG} ${line}`);
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
    if (c.alpha >= 0.99 && Math.abs(c.y) < 1) return;
    const before = `alpha=${c.alpha.toFixed(3)} y=${c.y.toFixed(1)} tweens=${TweenManager.activeCount}`;
    c.alpha = 1;
    c.y = 0;
    TweenManager.cancelTarget(c);
    push(`ensureVisible(${reason}): ${before} → alpha=1 y=0`);
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
          try {
            const px = new Uint8Array(4);
            gl.readPixels(
              Math.floor(r.width / 2),
              Math.floor(r.height / 2),
              1, 1,
              gl.RGBA, gl.UNSIGNED_BYTE, px,
            );
            parts.push(`readPixels center: rgba(${px[0]},${px[1]},${px[2]},${px[3]})`);
          } catch (e) {
            parts.push(`readPixels fail: ${e}`);
          }
        }
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

  logRendererOnInit(): void {
    try {
      const r = Game.app?.renderer as any;
      const gl = r?.gl;
      if (!gl) {
        push('init: 无 gl 上下文');
        return;
      }
      push(`init: webGLVersion=${r.context?.webGLVersion} maxTex=${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`);
      push(`init: OES_element_index_uint=${!!gl.getExtension('OES_element_index_uint')}`);
      if (r.context?.webGLVersion === 2) {
        push('init: WARN 仍在 WebGL2，Sprite 可能不绘制，请检查 forceWebGL1');
      }
    } catch (e) {
      push(`init renderer err: ${e}`);
    }
  },

  attachProbe(): void {
    if (!shouldForceWebGL1()) return;
    try {
      const g = new PIXI.Graphics();
      g.beginFill(0x00aa44, 0.85);
      g.drawRect(8, 8, 120, 40);
      g.endFill();
      g.zIndex = 99999;
      Game.stage.sortableChildren = true;
      Game.stage.addChild(g);
      push('probe: 已挂载左上角绿色探针 120x40（2.5s 后移除）');
      setTimeout(() => {
        if (g.parent) {
          g.parent.removeChild(g);
          g.destroy();
          push('probe: 探针已移除');
        }
      }, 2500);
    } catch (e) {
      push(`probe fail: ${e}`);
    }
  },
};
