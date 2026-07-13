import * as PIXI from 'pixi.js';
import { Platform } from '@/core/PlatformService';
import { clientEventToDesign } from '@/utils/clientEventToDesign';
import { getTouchCanvas } from '@/utils/touchCanvas';

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
  private _startX = 0;
  private _startY = 0;
  /** none=未判定；v=纵向滚动；h=横向（让出给切页等） */
  private _axis: 'none' | 'v' | 'h' = 'none';
  private _rawDown: ((e: unknown) => void) | null = null;
  private _rawMove: ((e: unknown) => void) | null = null;
  private _rawUp: ((e: unknown) => void) | null = null;

  get moved(): boolean {
    return this._moved;
  }

  /** 当前手势是否已判定为横向（供外部横滑切页参考） */
  get isHorizontal(): boolean {
    return this._axis === 'h';
  }

  attach(cfg: ScrollListConfig): void {
    this.detach();
    this._cfg = cfg;
    const canvas = getTouchCanvas();
    this._moved = false;
    this._axis = 'none';

    this._rawDown = (e: unknown) => {
      const content = this._cfg?.content();
      if (!content || !this._cfg) return;
      const p = clientEventToDesign(e);
      if (!this._inViewport(p.y)) return;
      this._dragging = true;
      this._moved = false;
      this._axis = 'none';
      this._startX = p.x;
      this._startY = p.y;
      this._lastY = p.y;
    };

    this._rawMove = (e: unknown) => {
      const cfgNow = this._cfg;
      const content = cfgNow?.content();
      if (!this._dragging || !content || !cfgNow) return;
      const p = clientEventToDesign(e);
      const dx = p.x - this._startX;
      const dyFromStart = p.y - this._startY;

      // 先判定轴向：横向主导则让出，避免与整页左右滑切宠冲突
      if (this._axis === 'none') {
        const adx = Math.abs(dx);
        const ady = Math.abs(dyFromStart);
        const lock = Math.max(cfgNow.moveThreshold, 10);
        if (adx > lock || ady > lock) {
          this._axis = adx > ady ? 'h' : 'v';
          if (this._axis === 'h') {
            this._dragging = false;
            this._moved = false;
            return;
          }
        } else {
          return;
        }
      }
      if (this._axis === 'h') return;

      (e as { preventDefault?: () => void }).preventDefault?.();
      const dy = this._lastY - p.y;
      if (Math.abs(dy) > cfgNow.moveThreshold) this._moved = true;
      if (dy === 0) return;
      content.y = Math.max(cfgNow.scrollMin, Math.min(cfgNow.listTop, content.y - dy));
      this._lastY = p.y;
    };

    this._rawUp = (e: unknown) => {
      const cfgNow = this._cfg;
      const wasDragging = this._dragging;
      const moved = this._moved;
      const wasVertical = this._axis === 'v';
      this._dragging = false;
      this._axis = 'none';
      if (!wasDragging || !wasVertical || moved || !cfgNow?.onTap) return;
      const p = clientEventToDesign(e);
      if (!this._inViewport(p.y)) return;
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
    this._axis = 'none';
  }

  private _inViewport(y: number): boolean {
    if (!this._cfg) return false;
    return y >= this._cfg.viewportTop && y <= this._cfg.viewportTop + this._cfg.viewportH;
  }
}
