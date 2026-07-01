/**
 * 微信真机：tap 走 canvas touchstart/touchend + 设计坐标 hitTest（勿混 pointerdown，会覆盖 _active）。
 */
import { Platform } from '@/core/PlatformService';
import { clientEventToDesign } from './clientEventToDesign';
import { containsDesignPoint, pickTopmostHit } from './hitTestDesign';
import { deferAfterPointerEvent } from './deferAfterPointer';
import { getTouchCanvas, touchCanvasBridgeKind } from './touchCanvas';
import { touchDiag, touchDiagCanvas, touchDiagOnce } from './touchDiag';

const TAP_SLOP = 14;

interface TapBinding {
  target: import('pixi.js').Container;
  fn: () => void;
  guard?: () => boolean;
  blockTap?: () => boolean;
  /** 诊断标签 */
  label?: string;
}

let _installed = false;
let _bindings: TapBinding[] = [];
let _active: { binding: TapBinding; x: number; y: number } | null = null;

let _onStart: EventListener | null = null;
let _onEnd: EventListener | null = null;

function pickBinding(dx: number, dy: number): TapBinding | null {
  _bindings = _bindings.filter((b) => b.target.parent);
  const hits = _bindings.filter((b) => {
    if (b.guard && !b.guard()) return false;
    return containsDesignPoint(b.target, dx, dy);
  });
  if (!hits.length) return null;
  const top = pickTopmostHit(hits.map((b) => b.target), dx, dy);
  if (!top) return null;
  return hits.find((b) => b.target === top) ?? hits[hits.length - 1];
}

function ensureInstalled(): void {
  if (_installed || !Platform.isMinigame) return;
  const canvas = getTouchCanvas();
  if (!canvas?.addEventListener) {
    touchDiagOnce('tapRouter', 'install FAIL: canvas 无 addEventListener');
    return;
  }

  touchDiagCanvas('tapRouter.install');
  touchDiagOnce('tapRouter', `bridge=${touchCanvasBridgeKind(canvas)}`);

  _onStart = ((e: Event) => {
    const p = clientEventToDesign(e);
    const binding = pickBinding(p.x, p.y);
    _active = binding ? { binding, x: p.x, y: p.y } : null;
    touchDiag('tap.start', `${Math.round(p.x)},${Math.round(p.y)}`
      + ` hit=${binding ? (binding.label ?? 'yes') : 'none'}`
      + ` bindings=${_bindings.length}`);
  }) as EventListener;

  _onEnd = ((e: Event) => {
    const act = _active;
    _active = null;
    if (!act) {
      touchDiag('tap.end', 'no active');
      return;
    }
    const b = act.binding;
    if (!b.target.parent) {
      touchDiag('tap.end', 'target destroyed');
      return;
    }
    if (b.guard && !b.guard()) {
      touchDiag('tap.end', `guard fail ${b.label ?? ''}`);
      return;
    }
    if (b.blockTap?.()) {
      touchDiag('tap.end', `blockTap ${b.label ?? ''}`);
      return;
    }
    const p = clientEventToDesign(e);
    const dx = p.x - act.x;
    const dy = p.y - act.y;
    const slop2 = dx * dx + dy * dy;
    if (slop2 > TAP_SLOP * TAP_SLOP) {
      touchDiag('tap.end', `slop ${Math.round(Math.sqrt(slop2))} ${b.label ?? ''}`);
      return;
    }
    if (!containsDesignPoint(b.target, p.x, p.y)) {
      touchDiag('tap.end', `miss end ${b.label ?? ''} @${Math.round(p.x)},${Math.round(p.y)}`);
      return;
    }
    touchDiag('tap.fire', b.label ?? 'binding');
    deferAfterPointerEvent(b.fn);
  }) as EventListener;

  canvas.addEventListener('touchstart', _onStart, { passive: true });
  canvas.addEventListener('touchend', _onEnd);
  canvas.addEventListener('touchcancel', _onEnd);
  _installed = true;
  touchDiagOnce('tapRouter', 'installed touchstart/touchend');
}

export function registerCanvasTap(binding: TapBinding): () => void {
  ensureInstalled();
  _bindings.push(binding);
  return () => {
    const i = _bindings.indexOf(binding);
    if (i !== -1) _bindings.splice(i, 1);
  };
}
