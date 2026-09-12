/** 华为原生 qg 没有 createCanvas，主屏画布来自宿主全局 / document。 */

export function isUsableCanvas(c: unknown): c is { getContext: (...args: unknown[]) => unknown } {
  return !!c && typeof (c as { getContext?: unknown }).getContext === 'function';
}

export type HostCanvasBag = {
  canvas?: unknown;
  screencanvas?: unknown;
  hostCanvas?: unknown;
  document?: {
    getElementById?: (id: string) => unknown;
    createElement?: (tag: string) => unknown;
  };
  createCanvas?: () => unknown;
};

export function pickCanvasFromHost(host: HostCanvasBag): unknown {
  const tries = [host.hostCanvas, host.canvas, host.screencanvas];
  for (const c of tries) {
    if (isUsableCanvas(c)) return c;
  }
  try {
    const byId = host.document?.getElementById?.('canvas');
    if (isUsableCanvas(byId)) return byId;
  } catch { /* */ }
  try {
    const created = host.createCanvas?.();
    if (isUsableCanvas(created)) return created;
  } catch { /* */ }
  try {
    const el = host.document?.createElement?.('canvas');
    if (isUsableCanvas(el)) return el;
  } catch { /* */ }
  return null;
}
