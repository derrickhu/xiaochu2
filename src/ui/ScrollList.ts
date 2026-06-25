import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';

type CanvasLike = HTMLElement & {
  addEventListener: HTMLElement['addEventListener'];
  removeEventListener: HTMLElement['removeEventListener'];
};

export interface ScrollListConfig {
  /** 被滚动的内容容器；返回 null 时忽略手势 */
  content: () => PIXI.Container | null;
  viewportTop: number;
  viewportH: number;
  scrollMin: number;
  listTop: number;
  /** 超过多少设计像素视为滚动，用于屏蔽 pointertap */
  moveThreshold: number;
}

/** Canvas 原生 touch/pointer 纵向滚动控制器（小游戏 adapter 与 Pixi pointermove 隔离）。 */
export class ScrollListController {
  private _cfg: ScrollListConfig | null = null;
  private _dragging = false;
  private _moved = false;
  private _lastY = 0;
  private _rawDown: ((e: unknown) => void) | null = null;
  private _rawMove: ((e: unknown) => void) | null = null;
  private _rawUp: (() => void) | null = null;

  get moved(): boolean {
    return this._moved;
  }

  attach(cfg: ScrollListConfig): void {
    this.detach();
    this._cfg = cfg;
    const canvas = Game.app.view as unknown as CanvasLike;

    this._rawDown = (e: unknown) => {
      const content = this._cfg?.content();
      if (!content || !this._cfg) return;
      const y = Game.pointerEventToStageLocal(e).y;
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
      const y = Game.pointerEventToStageLocal(e).y;
      const dy = this._lastY - y;
      if (Math.abs(dy) > cfgNow.moveThreshold) this._moved = true;
      if (dy === 0) return;
      content.y = Math.max(cfgNow.scrollMin, Math.min(cfgNow.listTop, content.y - dy));
      this._lastY = y;
    };

    this._rawUp = () => {
      this._dragging = false;
    };

    if (Platform.isMinigame) {
      canvas.addEventListener('touchstart', this._rawDown as EventListener, { passive: true });
      canvas.addEventListener('touchmove', this._rawMove as EventListener, { passive: false });
      canvas.addEventListener('touchend', this._rawUp);
      canvas.addEventListener('touchcancel', this._rawUp);
    } else {
      canvas.addEventListener('pointerdown', this._rawDown as EventListener);
      canvas.addEventListener('pointermove', this._rawMove as EventListener);
      canvas.addEventListener('pointerup', this._rawUp);
      canvas.addEventListener('pointercancel', this._rawUp);
    }
  }

  detach(): void {
    const canvas = Game.app?.view as unknown as CanvasLike | undefined;
    if (canvas && this._rawDown) {
      canvas.removeEventListener('touchstart', this._rawDown as EventListener);
      canvas.removeEventListener('pointerdown', this._rawDown as EventListener);
    }
    if (canvas && this._rawMove) {
      canvas.removeEventListener('touchmove', this._rawMove as EventListener);
      canvas.removeEventListener('pointermove', this._rawMove as EventListener);
    }
    if (canvas && this._rawUp) {
      canvas.removeEventListener('touchend', this._rawUp);
      canvas.removeEventListener('touchcancel', this._rawUp);
      canvas.removeEventListener('pointerup', this._rawUp);
      canvas.removeEventListener('pointercancel', this._rawUp);
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
