/**
 * 微信真机：tap 走 canvas touchstart/touchend + 设计坐标 hitTest（勿混 pointerdown，会覆盖 _active）。
 * 可选长按：按住达阈值且位移未超 slop 时触发 onLongPress，松手不再发 tap。
 */
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';
import { clientEventToDesign, rawClientPoint } from './clientEventToDesign';
import { containsDesignPoint, pickTopmostHit } from './hitTestDesign';
import { deferAfterPointerEvent } from './deferAfterPointer';
import { getTouchCanvas } from './touchCanvas';
import { readHostCanvasRect } from './hostCanvasRect';

const TAP_SLOP = 14;
const DEFAULT_LONG_PRESS_MS = 450;

interface TapBinding {
  target: import('pixi.js').Container;
  fn: () => void;
  guard?: () => boolean;
  blockTap?: () => boolean;
  /** 设计坐标额外过滤（如滚动列表视口外不响应） */
  pointGuard?: (dx: number, dy: number) => boolean;
  /** 为 true 时在 touchend 内同步执行（tt.addShortcut 等必须用户手势同步调用的 API） */
  sync?: boolean;
  onLongPress?: () => void;
  longPressMs?: number;
}

let _installed = false;
let _bindings: TapBinding[] = [];
let _active: { binding: TapBinding; x: number; y: number } | null = null;
let _holdTimer: ReturnType<typeof setTimeout> | null = null;
let _longPressed = false;

let _onStart: EventListener | null = null;
let _onMove: EventListener | null = null;
let _onEnd: EventListener | null = null;

/** 只报开头几次：坐标/命中链一坏就是全局坏，刷屏无意义，一条不报又查不出来 */
let _diagLeft = 6;

function logTapDiag(
  phase: 'down' | 'up', e: unknown, p: { x: number; y: number }, hit: boolean,
): void {
  if (_diagLeft <= 0) return;
  _diagLeft -= 1;
  const raw = rawClientPoint(e);
  const rect = readHostCanvasRect();
  const rectInfo = rect
    ? `${Math.round(rect.width)}x${Math.round(rect.height)}@${Math.round(rect.left)},${Math.round(rect.top)}`
    : 'none';
  console.log(`[tap] ${phase} raw=${Math.round(raw.x)},${Math.round(raw.y)} `
    + `design=${Math.round(p.x)},${Math.round(p.y)} rect=${rectInfo} `
    + `logic=${Game.designWidth}x${Math.round(Game.logicHeight)} `
    + `hit=${hit ? 'yes' : 'no'} bindings=${_bindings.length}`);
}

function clearHoldTimer(): void {
  if (_holdTimer != null) {
    clearTimeout(_holdTimer);
    _holdTimer = null;
  }
}

/** 设计坐标上是否落在已注册按钮里（详情横滑用来避开升级/返回） */
export function hitCanvasTapTarget(dx: number, dy: number): boolean {
  return pickBinding(dx, dy) != null;
}

function pickBinding(dx: number, dy: number): TapBinding | null {
  _bindings = _bindings.filter((b) => b.target.parent);
  // 禁用态也要参与 hitTest，否则会穿透点到下层按钮（抽卡结果页点「确定」误触底层十连）
  const hits = _bindings.filter((b) =>
    containsDesignPoint(b.target, dx, dy)
    && (!b.pointGuard || b.pointGuard(dx, dy)));
  if (!hits.length) return null;
  const top = pickTopmostHit(hits.map((b) => b.target), dx, dy);
  if (!top) return null;
  return hits.find((b) => b.target === top) ?? hits[hits.length - 1];
}

function armLongPress(binding: TapBinding): void {
  clearHoldTimer();
  if (!binding.onLongPress) return;
  const ms = binding.longPressMs ?? DEFAULT_LONG_PRESS_MS;
  _holdTimer = setTimeout(() => {
    _holdTimer = null;
    const act = _active;
    if (!act || act.binding !== binding) return;
    if (!binding.target.parent) return;
    if (binding.guard && !binding.guard()) return;
    if (binding.blockTap?.()) return;
    _longPressed = true;
    try {
      binding.onLongPress!();
    } catch (err) {
      console.error('[canvasTapRouter longPress]', err);
    }
  }, ms);
}

function ensureInstalled(): void {
  if (_installed || !Platform.isMinigame) return;
  const canvas = getTouchCanvas();
  if (!canvas?.addEventListener) return;

  _onStart = ((e: Event) => {
    clearHoldTimer();
    _longPressed = false;
    const p = clientEventToDesign(e);
    const binding = pickBinding(p.x, p.y);
    _active = binding ? { binding, x: p.x, y: p.y } : null;
    if (binding) armLongPress(binding);
    logTapDiag('down', e, p, binding != null);
  }) as EventListener;

  _onMove = ((e: Event) => {
    const act = _active;
    if (!act || _longPressed) return;
    const p = clientEventToDesign(e);
    const dx = p.x - act.x;
    const dy = p.y - act.y;
    if (dx * dx + dy * dy > TAP_SLOP * TAP_SLOP) {
      clearHoldTimer();
    }
  }) as EventListener;

  _onEnd = ((e: Event) => {
    clearHoldTimer();
    const act = _active;
    const wasLong = _longPressed;
    _active = null;
    _longPressed = false;
    if (!act || wasLong) return;
    const b = act.binding;
    if (!b.target.parent) return;
    if (b.guard && !b.guard()) return;
    if (b.blockTap?.()) return;
    const p = clientEventToDesign(e);
    const dx = p.x - act.x;
    const dy = p.y - act.y;
    logTapDiag('up', e, p, true);
    if (dx * dx + dy * dy > TAP_SLOP * TAP_SLOP) return;
    if (!containsDesignPoint(b.target, p.x, p.y)) return;
    if (b.sync) {
      try { b.fn(); } catch (err) { console.error('[canvasTapRouter sync]', err); }
    } else {
      deferAfterPointerEvent(b.fn);
    }
  }) as EventListener;

  canvas.addEventListener('touchstart', _onStart, { passive: true });
  canvas.addEventListener('touchmove', _onMove, { passive: true });
  canvas.addEventListener('touchend', _onEnd);
  canvas.addEventListener('touchcancel', _onEnd);
  _installed = true;
}

export function registerCanvasTap(binding: TapBinding): () => void {
  ensureInstalled();
  _bindings.push(binding);
  return () => {
    const i = _bindings.indexOf(binding);
    if (i !== -1) _bindings.splice(i, 1);
  };
}
