import * as PIXI from 'pixi.js';
import { Platform } from '@/core/PlatformService';
import { clientEventToDesign } from '@/utils/clientEventToDesign';
import { getTouchCanvas } from '@/utils/touchCanvas';
import { touchDiag } from '@/utils/touchDiag';

export interface ScrollListConfig {
  /** 被滚动的内容容器；返回 null 时忽略手势 */
  content: () => PIXI.Container | null;
  viewportTop: number;
  viewportH: number;
  scrollMin: number;
  listTop: number;
  /** 超过多少设计像素视为滚动，用于屏蔽 tap */
  moveThreshold: number;
  /** 未滚动时在视口内松手 → 设计坐标点击（与 touch 滚动同链，避免与 canvasTapRouter 抢事件） */
  onTap?: (designX: number, designY: number) => void;
}

/** Canvas 原生 touch/pointer 纵向滚动控制器（小游戏 adapter 与 Pixi pointermove 隔离）。 */
export class ScrollListController {
  private _cfg: ScrollListConfig | null = null;
  private _dragging = false;
  private _moved = false;
  private _lastY = 0;
  private _rawDown: ((e: unknown) => void) | null = null;
  private _rawMove: ((e: unknown) => void) | null = null;
  private _rawUp: ((e: unknown) => void) | null = null;

  get moved(): boolean {
    return this._moved;
  }

  attach(cfg: ScrollListConfig): void {
    this.detach();
    this._cfg = cfg;
    const canvas = getTouchCanvas();
    this._moved = false;

    this._rawDown = (e: unknown) => {
      const content = this._cfg?.content();
      if (!content || !this._cfg) return;
      const y = clientEventToDesign(e).y;
      if (!this._inViewport(y)) return;
      this._dragging = true;
      this._moved = false;
      this._lastY = y;
    };

    this._rawMove = (e: unknown) => {
      const cfgNow = this._cfg;
      const content = cfgNow?.content();
      if (!this._dragging || !content || !cfgNow) return;
      (e as { preventDefault?: () => void }).preventDefault?.();
      const y = clientEventToDesign(e).y;
      const dy = this._lastY - y;
      if (Math.abs(dy) > cfgNow.moveThreshold) this._moved = true;
      if (dy === 0) return;
      content.y = Math.max(cfgNow.scrollMin, Math.min(cfgNow.listTop, content.y - dy));
      this._lastY = y;
    };

    this._rawUp = (e: unknown) => {
      const cfgNow = this._cfg;
      const wasDragging = this._dragging;
      const moved = this._moved;
      this._dragging = false;
      if (!wasDragging || moved || !cfgNow?.onTap) return;
      const p = clientEventToDesign(e);
      if (!this._inViewport(p.y)) return;
      touchDiag('scroll.tap', `@${Math.round(p.x)},${Math.round(p.y)}`);
      cfgNow.onTap(p.x, p.y);
    };

    if (Platform.isMinigame) {
      canvas.addEventListener('touchstart', this._rawDown as EventListener, { passive: true });
      canvas.addEventListener('touchmove', this._rawMove as EventListener, { passive: false });
      canvas.addEventListener('touchend', this._rawUp as EventListener);
      canvas.addEventListener('touchcancel', this._rawUp as EventListener);
    } else {
      canvas.addEventListener('pointerdown', this._rawDown as EventListener);
      canvas.addEventListener('pointermove', this._rawMove as EventListener);
      canvas.addEventListener('pointerup', this._rawUp as EventListener);
      canvas.addEventListener('pointercancel', this._rawUp as EventListener);
    }
  }

  detach(): void {
    const canvas = getTouchCanvas();
    if (canvas && this._rawDown) {
      canvas.removeEventListener('touchstart', this._rawDown as EventListener);
      canvas.removeEventListener('pointerdown', this._rawDown as EventListener);
    }
    if (canvas && this._rawMove) {
      canvas.removeEventListener('touchmove', this._rawMove as EventListener);
      canvas.removeEventListener('pointermove', this._rawMove as EventListener);
    }
    if (canvas && this._rawUp) {
      canvas.removeEventListener('touchend', this._rawUp as EventListener);
      canvas.removeEventListener('touchcancel', this._rawUp as EventListener);
      canvas.removeEventListener('pointerup', this._rawUp as EventListener);
      canvas.removeEventListener('pointercancel', this._rawUp as EventListener);
    }
    this._cfg = null;
    this._rawDown = null;
    this._rawMove = null;
    this._rawUp = null;
    this._dragging = false;
    this._moved = false;
  }

  private _inViewport(y: number): boolean {
    if (!this._cfg) return false;
    return y >= this._cfg.viewportTop && y <= this._cfg.viewportTop + this._cfg.viewportH;
  }
}
