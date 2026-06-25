import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';

export interface BoardDragControllerOptions {
  container: PIXI.Container;
  boardWidth: number;
  boardHeight: number;
  isDragging: () => boolean;
  onDown: (e: PIXI.FederatedPointerEvent) => void;
  onMove: (x: number, y: number) => void;
  onUp: () => void;
}

/** Canvas pointer bridge：小游戏 adapter 下 move/up 不依赖 Pixi global pointer。 */
export class BoardDragController {
  private _rawMove: ((e: unknown) => void) | null = null;
  private _rawUp: (() => void) | null = null;

  constructor(private readonly _opts: BoardDragControllerOptions) {
    this._buildHitArea();
  }

  destroy(): void {
    const canvas = Game.app?.view as unknown as HTMLElement | undefined;
    if (canvas) {
      if (this._rawMove) canvas.removeEventListener('pointermove', this._rawMove as EventListener);
      if (this._rawUp) {
        canvas.removeEventListener('pointerup', this._rawUp);
        canvas.removeEventListener('pointercancel', this._rawUp);
      }
    }
    this._rawMove = null;
    this._rawUp = null;
  }

  private _buildHitArea(): void {
    const hit = new PIXI.Graphics();
    hit.beginFill(0xffffff, 0.001);
    hit.drawRect(0, 0, this._opts.boardWidth, this._opts.boardHeight);
    hit.endFill();
    hit.eventMode = 'static';
    hit.on('pointerdown', (e: PIXI.FederatedPointerEvent) => this._opts.onDown(e));
    this._opts.container.addChild(hit);

    const canvas = Game.app.view as unknown as HTMLElement;
    this._rawMove = (e: unknown) => {
      if (!this._opts.isDragging()) return;
      const p = this._rawToLocal(e);
      this._opts.onMove(p.x, p.y);
    };
    this._rawUp = () => this._opts.onUp();
    canvas.addEventListener('pointermove', this._rawMove as EventListener);
    canvas.addEventListener('pointerup', this._rawUp);
    canvas.addEventListener('pointercancel', this._rawUp);
  }

  /**
   * 原生 pointer 事件 clientX/Y（逻辑像素）→ 棋盘本地设计坐标。
   * 不依赖 toLocal/worldTransform：clientX * designWidth / screenWidth 得到
   * 设计坐标，再减去容器在场景树中的累计偏移（父链均无缩放）。
   */
  private _rawToLocal(e: unknown): { x: number; y: number } {
    const ev = e as {
      clientX?: number; clientY?: number; x?: number; y?: number;
      touches?: { clientX: number; clientY: number }[];
      changedTouches?: { clientX: number; clientY: number }[];
    };
    const t0 = ev.touches?.[0] ?? ev.changedTouches?.[0];
    const cx = ev.clientX ?? t0?.clientX ?? ev.x ?? 0;
    const cy = ev.clientY ?? t0?.clientY ?? ev.y ?? 0;
    const k = Game.designWidth / Game.screenWidth;
    let ox = 0;
    let oy = 0;
    let cur: PIXI.Container | null = this._opts.container;
    while (cur) {
      ox += cur.x;
      oy += cur.y;
      cur = cur.parent as PIXI.Container | null;
    }
    return { x: cx * k - ox, y: cy * k - oy };
  }
}
