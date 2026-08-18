/**
 * Tap 文字光栅：全程只用一块真实 2D canvas。
 *
 * 进战斗时字正常、打完一轮才乱码乱飘，是因为第一回合会 new 出几十个飘字 Text，
 * 每个 Pixi.Text 都会 ADAPTER.createCanvas() + Texture.from(canvas)。
 * Tap 的 createCanvas / OffscreenCanvas 很快会回到同一块布，Texture 缓存一共享，
 * 后写的伤害数字就会盖掉血条字，看起来像乱码还跟着飘。
 */
import { CanvasResource } from '@pixi/core';
import { Text } from '@pixi/text';
import { Platform } from '@/core/PlatformService';

const _CR = CanvasResource as any;
if (!_CR.__tapWrapTest) {
  const origTest = _CR.test.bind(CanvasResource);
  _CR.test = (source: any) => !!(source && source.__tapTextWrap === true) || origTest(source);
  _CR.__tapWrapTest = true;
}

interface Host2d {
  canvas: { width: number; height: number };
  ctx: any;
}

export function installTapTextRaster(acquireHost: () => Host2d | null): (w?: number, h?: number) => any {
  let host: Host2d | null | undefined;

  const getHost = (): Host2d | null => {
    if (host !== undefined) return host;
    host = acquireHost();
    return host;
  };

  const createWrap = (w?: number, h?: number): any => {
    const state = {
      w: Math.max(1, w || 1),
      h: Math.max(1, h || 1),
      snap: null as Uint8ClampedArray | null,
    };

    const syncSize = (): Host2d | null => {
      const h2 = getHost();
      if (!h2) return null;
      if (h2.canvas.width !== state.w) h2.canvas.width = state.w;
      if (h2.canvas.height !== state.h) h2.canvas.height = state.h;
      return h2;
    };

    const ctx: any = {
      fillStyle: '#000000',
      strokeStyle: '#000000',
      font: '16px sans-serif',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      lineWidth: 1,
      lineJoin: 'miter',
      miterLimit: 10,
      shadowColor: 'black',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      globalAlpha: 1,
      letterSpacing: '0px',
      textLetterSpacing: '0px',
      apply(hctx: any) {
        hctx.fillStyle = ctx.fillStyle;
        hctx.strokeStyle = ctx.strokeStyle;
        hctx.font = ctx.font;
        hctx.textAlign = ctx.textAlign;
        hctx.textBaseline = ctx.textBaseline;
        hctx.lineWidth = ctx.lineWidth;
        hctx.lineJoin = ctx.lineJoin;
        hctx.miterLimit = ctx.miterLimit;
        hctx.shadowColor = ctx.shadowColor;
        hctx.shadowBlur = ctx.shadowBlur;
        hctx.shadowOffsetX = ctx.shadowOffsetX;
        hctx.shadowOffsetY = ctx.shadowOffsetY;
        hctx.globalAlpha = ctx.globalAlpha;
        try { (hctx as any).letterSpacing = ctx.letterSpacing; } catch { /* */ }
        try { (hctx as any).textLetterSpacing = ctx.textLetterSpacing; } catch { /* */ }
      },
      withHost(fn: (hctx: any) => any) {
        const h2 = syncSize();
        if (!h2) return undefined;
        ctx.apply(h2.ctx);
        return fn(h2.ctx);
      },
      measureText(s: string) {
        const r = ctx.withHost((hctx: any) => hctx.measureText(s));
        return r ?? { width: String(s || '').length * 10 };
      },
      clearRect(x: number, y: number, cw: number, ch: number) {
        ctx.withHost((hctx: any) => hctx.clearRect(x, y, cw, ch));
      },
      fillRect(x: number, y: number, cw: number, ch: number) {
        ctx.withHost((hctx: any) => hctx.fillRect(x, y, cw, ch));
      },
      fillText(t: string, x: number, y: number) {
        ctx.withHost((hctx: any) => hctx.fillText(t, x, y));
      },
      strokeText(t: string, x: number, y: number) {
        ctx.withHost((hctx: any) => hctx.strokeText(t, x, y));
      },
      scale(x: number, y: number) {
        ctx.withHost((hctx: any) => hctx.scale(x, y));
      },
      translate(x: number, y: number) {
        ctx.withHost((hctx: any) => hctx.translate(x, y));
      },
      setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
        ctx.withHost((hctx: any) => hctx.setTransform(a, b, c, d, e, f));
      },
      save() { getHost()?.ctx.save(); },
      restore() { getHost()?.ctx.restore(); },
      beginPath() { getHost()?.ctx.beginPath(); },
      closePath() { getHost()?.ctx.closePath(); },
      getImageData(_x: number, _y: number, iw: number, ih: number) {
        if (state.snap && state.snap.length === iw * ih * 4) {
          return { data: state.snap, width: iw, height: ih };
        }
        const h2 = syncSize();
        if (h2) {
          try { return h2.ctx.getImageData(0, 0, iw, ih); } catch { /* */ }
        }
        return { data: new Uint8ClampedArray(iw * ih * 4), width: iw, height: ih };
      },
      putImageData() {},
      createLinearGradient() { return { addColorStop() {} }; },
    };

    const canvas: any = {
      __tapTextWrap: true,
      style: {},
      get width() { return state.w; },
      set width(v: number) { state.w = Math.max(1, v | 0); state.snap = null; },
      get height() { return state.h; },
      set height(v: number) { state.h = Math.max(1, v | 0); state.snap = null; },
      getContext(type: string) { return type === '2d' ? ctx : null; },
      addEventListener() {},
      removeEventListener() {},
      __tapSnap() {
        const h2 = syncSize();
        if (!h2) return;
        try {
          const img = h2.ctx.getImageData(0, 0, state.w, state.h);
          state.snap = new Uint8ClampedArray(img.data);
        } catch {
          state.snap = null;
        }
      },
    };
    ctx.canvas = canvas;
    return canvas;
  };

  const proto = Text.prototype as any;
  if (!proto.__tapSnapPatched) {
    const orig = proto.updateTexture;
    proto.updateTexture = function updateTextureTap(this: Text) {
      orig.call(this);
      const canvas = (this as any).canvas;
      if (typeof canvas?.__tapSnap === 'function') canvas.__tapSnap();
    };
    proto.__tapSnapPatched = true;
  }

  return createWrap;
}

export function shouldInstallTapTextRaster(): boolean {
  return Platform.isTaptap;
}
