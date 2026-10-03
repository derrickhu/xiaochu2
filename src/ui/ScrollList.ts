import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';
import { clientEventToDesign } from '@/utils/clientEventToDesign';
import { getTouchCanvas } from '@/utils/touchCanvas';
import { flingVelocity, shouldFling, stepInertia } from './scrollMotion';

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
  /** 内容 y 变化后（跟手或惯性）。用来只给视口附近的格子补内容 */
  onScroll?: (contentY: number) => void;
}

/**
 * 带 mask 的列表会走 renderAdvanced，默认把子节点全画一遍。
 * 给有 hitArea 的直接子节点标上 cullArea，Pixi 每帧跳过屏幕外的卡。
 * 对齐旧版图鉴「cy 不在裁切区就 continue」。
 */
export function armScrollCulling(content: PIXI.Container, pad = 40): void {
  content.cullable = true;
  const kids = content.children;
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    const ha = child.hitArea;
    if (!(ha instanceof PIXI.Rectangle) || ha.width <= 0 || ha.height <= 0) continue;
    child.cullArea = new PIXI.Rectangle(
      ha.x - pad,
      ha.y - pad,
      ha.width + pad * 2,
      ha.height + pad * 2,
    );
    child.cullable = true;
  }
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
  private _samples: { y: number; t: number }[] = [];
  private _velocity = 0;
  private _gliding = false;
  private readonly _glideTick = (): void => {
    this._stepGlide();
  };

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
      this._stopGlide();
      this._samples.length = 0;
      this._pushSample(content.y);
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
      this._place(content, content.y - dy);
      this._lastY = p.y;
      this._pushSample(content.y);
    };

    this._rawUp = (e: unknown) => {
      const cfgNow = this._cfg;
      const wasDragging = this._dragging;
      const moved = this._moved;
      const wasVertical = this._axis === 'v';
      this._dragging = false;
      this._axis = 'none';
      if (wasDragging && wasVertical && moved) this._startGlide();
      if (!wasDragging || !wasVertical || moved || !cfgNow?.onTap) return;
      const p = clientEventToDesign(e);
      if (!this._inViewport(p.y)) return;
      cfgNow.onTap(p.x, p.y);
    };

    const content = cfg.content();
    if (content) armScrollCulling(content);

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
    this._stopGlide();
    this._samples.length = 0;
    this._cfg = null;
    this._rawDown = null;
    this._rawMove = null;
    this._rawUp = null;
    this._dragging = false;
    this._moved = false;
    this._axis = 'none';
  }

  private _place(content: PIXI.Container, y: number): void {
    const cfg = this._cfg;
    if (!cfg) return;
    const next = Math.max(cfg.scrollMin, Math.min(cfg.listTop, y));
    if (content.y !== next) content.y = next;
    cfg.onScroll?.(content.y);
  }

  private _pushSample(y: number): void {
    const t = performance.now();
    const samples = this._samples;
    samples.push({ y, t });
    const cutoff = t - 90;
    while (samples.length > 2 && samples[0].t < cutoff) samples.shift();
  }

  private _startGlide(): void {
    const v = flingVelocity(this._samples);
    this._samples.length = 0;
    if (!shouldFling(v)) return;
    this._velocity = v;
    if (this._gliding) return;
    this._gliding = true;
    Game.ticker.add(this._glideTick);
  }

  private _stopGlide(): void {
    this._velocity = 0;
    if (!this._gliding) return;
    this._gliding = false;
    Game.ticker.remove(this._glideTick);
  }

  private _stepGlide(): void {
    const cfg = this._cfg;
    const content = cfg?.content();
    if (!cfg || !content || content.destroyed) {
      this._stopGlide();
      return;
    }
    const stepped = stepInertia(
      content.y,
      this._velocity,
      Game.ticker.deltaMS,
      cfg.scrollMin,
      cfg.listTop,
    );
    this._velocity = stepped.v;
    this._place(content, stepped.y);
    if (stepped.stop) this._stopGlide();
  }

  private _inViewport(y: number): boolean {
    if (!this._cfg) return false;
    return y >= this._cfg.viewportTop && y <= this._cfg.viewportTop + this._cfg.viewportH;
  }
}
