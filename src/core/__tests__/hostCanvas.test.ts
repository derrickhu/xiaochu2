import { describe, expect, it } from 'vitest';
import { isUsableCanvas, pickCanvasFromHost } from '../hostCanvas';

function fakeCanvas() {
  return { width: 100, height: 200, getContext: () => ({}) };
}

describe('pickCanvasFromHost', () => {
  it('优先用已经抓住的宿主 canvas', () => {
    const host = fakeCanvas();
    expect(pickCanvasFromHost({ hostCanvas: host, canvas: fakeCanvas() })).toBe(host);
  });

  it('没有 createCanvas 时走 document.getElementById', () => {
    const host = fakeCanvas();
    expect(pickCanvasFromHost({
      document: { getElementById: (id) => (id === 'canvas' ? host : null) },
    })).toBe(host);
  });

  it('再退到 document.createElement', () => {
    const host = fakeCanvas();
    expect(pickCanvasFromHost({
      document: { createElement: (tag) => (tag === 'canvas' ? host : null) },
    })).toBe(host);
  });

  it('createCanvas 抛错时还能用 createElement', () => {
    const host = fakeCanvas();
    expect(pickCanvasFromHost({
      createCanvas: () => { throw new Error('no qg.createCanvas'); },
      document: { createElement: () => host },
    })).toBe(host);
  });

  it('没有 getContext 的对象不算画布', () => {
    expect(isUsableCanvas({ width: 1, height: 1 })).toBe(false);
    expect(pickCanvasFromHost({ canvas: { width: 1 } })).toBeNull();
  });
});
