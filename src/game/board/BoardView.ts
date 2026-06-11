/**
 * 珠盘视图：渲染 + 长拖转珠交互 + 消除/下落动画
 *
 * - 珠子 Sprite 走对象池，sprites[r][c] 与 BoardModel.grid 一一对应
 * - 拖拽目标格判定沿用 xiao_chu 验证过的算法：只在「当前格 + 四正交邻格」
 *   中选最近中心，避免整盘 floor 在格缝抖动导致交换误判
 * - 8 秒限时由 update(dt) 驱动，超时强制松手
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { ObjectPool } from '@/core/ObjectPool';
import { TextureCache } from '@/core/TextureCache';
import { TweenManager, Ease } from '@/core/TweenManager';
import { Platform } from '@/core/PlatformService';
import { UI } from '@/balance/ui';
import { COMBAT, type OrbType } from '@/balance/combat';
import { ORB_IMAGES } from '@/config/Assets';
import { BoardModel, type MatchGroup, type FallMove } from './BoardModel';

export interface BoardViewCallbacks {
  /** 是否允许开始拖珠（战斗状态机控制） */
  canDrag: () => boolean;
  onDragStart?: () => void;
  /** 松手或超时（didMove = 拖动期间发生过交换） */
  onDragEnd: (didMove: boolean) => void;
}

export class BoardView {
  readonly container = new PIXI.Container();

  private readonly _board: BoardModel;
  private readonly _cb: BoardViewCallbacks;
  private readonly _cell = UI.board.cellSize;

  private _orbsLayer = new PIXI.Container();
  private _floatLayer = new PIXI.Container();
  private _pool: ObjectPool<PIXI.Sprite>;
  /** sprites[r][c]，与 grid 对应 */
  private _sprites: (PIXI.Sprite | null)[][] = [];

  // ---- 拖拽状态 ----
  private _dragging = false;
  private _dragR = 0;
  private _dragC = 0;
  private _dragTimer = 0;
  private _didMove = false;
  private _floatOrb: PIXI.Sprite | null = null;
  /** 交换动画期间禁止再次换格，避免格缝处 pointermove 来回 oscillate 卡死 */
  private _swapLocked = false;
  private _swapUnlockTimer = 0;

  /** 注册在 canvas 上的原生监听器（destroy 时移除） */
  private _rawMove: ((e: any) => void) | null = null;
  private _rawUp: ((e: any) => void) | null = null;

  constructor(board: BoardModel, cb: BoardViewCallbacks) {
    this._board = board;
    this._cb = cb;

    this._pool = new ObjectPool<PIXI.Sprite>({
      create: () => {
        const sp = new PIXI.Sprite();
        sp.anchor.set(0.5);
        return sp;
      },
      onGet: (sp) => {
        sp.visible = true;
        sp.alpha = 1;
        sp.scale.set(1);
      },
      onRelease: (sp) => {
        TweenManager.cancelTarget(sp);
        TweenManager.cancelTarget(sp.scale);
        sp.visible = false;
        if (sp.parent) sp.parent.removeChild(sp);
      },
      preallocate: COMBAT.boardCols * COMBAT.boardRows,
      maxSize: COMBAT.boardCols * COMBAT.boardRows * 2,
      onDiscard: (sp) => sp.destroy(),
    });

    this._buildBackground();
    this.container.addChild(this._orbsLayer);
    this._buildHitArea();
    // 浮珠层置顶（仅展示，不拦截触摸；触摸由 hit 层接收）
    this._floatLayer.eventMode = 'none';
    this.container.addChild(this._floatLayer);
    this.rebuild();
  }

  get boardWidth(): number {
    return this._cell * this._board.cols;
  }

  get boardHeight(): number {
    return this._cell * this._board.rows;
  }

  get dragging(): boolean {
    return this._dragging;
  }

  /** 拖珠剩余时间比例 1→0（未拖动时为 1） */
  get dragTimeLeft(): number {
    if (!this._dragging) return 1;
    return Math.max(0, 1 - this._dragTimer / COMBAT.dragTimeLimit);
  }

  /** 每帧驱动：8 秒限时 + 交换锁计时 */
  update(dt: number): void {
    if (this._swapUnlockTimer > 0) {
      this._swapUnlockTimer -= dt;
      if (this._swapUnlockTimer <= 0) {
        this._swapUnlockTimer = 0;
        this._swapLocked = false;
      }
    }
    if (!this._dragging) return;
    this._dragTimer += dt;
    if (this._dragTimer >= COMBAT.dragTimeLimit) {
      this._endDrag();
    }
  }

  /** 全量重建珠子 Sprite（进场 / 重开时用） */
  rebuild(): void {
    this._releaseAll();
    this._sprites = [];
    for (let r = 0; r < this._board.rows; r++) {
      const row: (PIXI.Sprite | null)[] = [];
      for (let c = 0; c < this._board.cols; c++) {
        const orb = this._board.get(r, c);
        row.push(orb ? this._spawnSprite(orb, r, c) : null);
      }
      this._sprites.push(row);
    }
  }

  /** 播放一组消除动画（缩放消失），结束后从池回收 */
  playClear(group: MatchGroup): Promise<void> {
    return new Promise((resolve) => {
      let remain = group.cells.length;
      const done = (): void => {
        remain--;
        if (remain <= 0) resolve();
      };
      for (const { r, c } of group.cells) {
        const sp = this._sprites[r][c];
        this._sprites[r][c] = null;
        if (!sp) {
          done();
          continue;
        }
        // 先弹大再缩没，带一点消除“爆”感
        TweenManager.to({
          target: sp.scale, props: { x: sp.scale.x * 1.25, y: sp.scale.y * 1.25 },
          duration: UI.anim.orbClear * 0.3, ease: Ease.easeOutQuad,
          onComplete: () => {
            TweenManager.to({
              target: sp.scale, props: { x: 0.01, y: 0.01 },
              duration: UI.anim.orbClear * 0.7, ease: Ease.easeInQuad,
            });
            TweenManager.to({
              target: sp, props: { alpha: 0 },
              duration: UI.anim.orbClear * 0.7,
              onComplete: () => {
                this._pool.release(sp);
                done();
              },
            });
          },
        });
      }
      if (group.cells.length === 0) resolve();
    });
  }

  /** 播放下落/补珠动画 */
  playFall(moves: FallMove[]): Promise<void> {
    return new Promise((resolve) => {
      if (moves.length === 0) {
        resolve();
        return;
      }
      let remain = moves.length;
      const done = (): void => {
        remain--;
        if (remain <= 0) resolve();
      };
      for (const m of moves) {
        let sp: PIXI.Sprite | null;
        if (m.fromRow !== null) {
          sp = this._sprites[m.fromRow][m.col];
          this._sprites[m.fromRow][m.col] = null;
        } else {
          // 新珠：从棋盘顶上方掉入
          sp = this._spawnSprite(m.orb, -m.spawnAbove, m.col);
        }
        this._sprites[m.toRow][m.col] = sp;
        if (!sp) {
          done();
          continue;
        }
        const targetY = this._cellCenterY(m.toRow);
        // 距离越远时间越长，营造自然下落
        const dist = Math.abs(targetY - sp.y) / this._cell;
        const dur = UI.anim.orbFall * (0.5 + 0.5 * Math.min(dist / 3, 1));
        TweenManager.to({
          target: sp, props: { y: targetY },
          duration: dur, ease: Ease.easeOutBounce,
          onComplete: done,
        });
      }
    });
  }

  /** 强制结束拖拽（场景退出等） */
  cancelDrag(): void {
    if (this._dragging) this._endDrag();
  }

  destroy(): void {
    const canvas = Game.app?.view as any;
    if (canvas) {
      if (this._rawMove) canvas.removeEventListener('pointermove', this._rawMove);
      if (this._rawUp) {
        canvas.removeEventListener('pointerup', this._rawUp);
        canvas.removeEventListener('pointercancel', this._rawUp);
      }
    }
    this._rawMove = null;
    this._rawUp = null;
    this._releaseAll();
    this._pool.clear();
    this.container.destroy({ children: true });
  }

  // ════════════ 内部 ════════════

  private _buildBackground(): void {
    const bg = new PIXI.Graphics();
    for (let r = 0; r < this._board.rows; r++) {
      for (let c = 0; c < this._board.cols; c++) {
        bg.beginFill((r + c) % 2 === 0 ? 0x342752 : 0x2c2147);
        bg.drawRect(c * this._cell, r * this._cell, this._cell, this._cell);
        bg.endFill();
      }
    }
    this.container.addChild(bg);
  }

  // 交互策略（沿用 game2D_huahua 验证过的方案）：
  // pointerdown 用 PixiJS 容器事件（可靠：PixiJS 注册在 canvas 上）；
  // pointermove / pointerup 直接注册在 canvas 元素上，完全绕过 PixiJS 事件系统。
  // 原因：PixiJS 7 将 pointermove/pointerup 注册在 globalThis（window）上，
  // 而小游戏 adapter 通过 canvas.addEventListener 分发触摸事件，
  // 两个系统天然隔离，导致拖拽中 move/up 事件丢失、拖珠卡死。
  private _buildHitArea(): void {
    const hit = new PIXI.Graphics();
    hit.beginFill(0xffffff, 0.001);
    hit.drawRect(0, 0, this.boardWidth, this.boardHeight);
    hit.endFill();
    hit.eventMode = 'static';
    hit.on('pointerdown', (e: PIXI.FederatedPointerEvent) => this._onDown(e));
    this.container.addChild(hit);

    const canvas = Game.app.view as any;
    this._rawMove = (e: any) => {
      if (!this._dragging) return;
      const p = this._rawToLocal(e);
      this._onMove(p.x, p.y);
    };
    this._rawUp = () => this._onUp();
    canvas.addEventListener('pointermove', this._rawMove);
    canvas.addEventListener('pointerup', this._rawUp);
    canvas.addEventListener('pointercancel', this._rawUp);
  }

  /**
   * 原生 pointer 事件 clientX/Y（逻辑像素）→ 棋盘本地设计坐标。
   * 不依赖 toLocal/worldTransform：clientX * designWidth / screenWidth 得到
   * 设计坐标，再减去容器在场景树中的累计偏移（父链均无缩放）。
   */
  private _rawToLocal(e: any): { x: number; y: number } {
    const t0 = e.touches?.[0] ?? e.changedTouches?.[0];
    const cx = e.clientX ?? t0?.clientX ?? e.x ?? 0;
    const cy = e.clientY ?? t0?.clientY ?? e.y ?? 0;
    const k = Game.designWidth / Game.screenWidth;
    let ox = 0;
    let oy = 0;
    let node: PIXI.Container | null = this.container;
    while (node && node !== Game.app.stage) {
      ox += node.x;
      oy += node.y;
      node = node.parent;
    }
    return { x: cx * k - ox, y: cy * k - oy };
  }

  private _onDown(e: PIXI.FederatedPointerEvent): void {
    if (this._dragging || !this._cb.canDrag()) return;
    const p = this.container.toLocal(e.global);
    const c = Math.floor(p.x / this._cell);
    const r = Math.floor(p.y / this._cell);
    if (!this._board.inBounds(r, c)) return;
    const orb = this._board.get(r, c);
    if (!orb) return;

    this._dragging = true;
    this._didMove = false;
    this._dragR = r;
    this._dragC = c;
    this._dragTimer = 0;

    // 原位珠半透明，浮珠跟手
    const sp = this._sprites[r][c];
    if (sp) sp.alpha = 0.35;
    const float = this._pool.get();
    this._applyOrbTexture(float, orb);
    float.width = this._cell * UI.board.orbScale * 1.15;
    float.height = this._cell * UI.board.orbScale * 1.15;
    float.position.set(p.x, p.y);
    this._floatLayer.addChild(float);
    this._floatOrb = float;

    Platform.vibrateShort();
    this._cb.onDragStart?.();
  }

  private _onMove(x: number, y: number): void {
    if (!this._dragging) return;
    // 钳制到棋盘范围
    const px = Math.max(0, Math.min(this.boardWidth, x));
    const py = Math.max(0, Math.min(this.boardHeight, y));
    if (this._floatOrb) this._floatOrb.position.set(px, py);

    // 交换动画锁定期内只跟手，不再判格（对齐 xiao_chu swapLogicLocked）
    if (this._swapLocked) return;

    // 目标格：当前格 + 四正交邻格中选最近中心
    const dr = this._dragR;
    const dc = this._dragC;
    let r = dr;
    let c = dc;
    let bestD = (px - this._cellCenterX(dc)) ** 2 + (py - this._cellCenterY(dr)) ** 2;
    const neigh = [[dr - 1, dc], [dr + 1, dc], [dr, dc - 1], [dr, dc + 1]];
    for (const [nr, nc] of neigh) {
      if (!this._board.inBounds(nr, nc)) continue;
      const d = (px - this._cellCenterX(nc)) ** 2 + (py - this._cellCenterY(nr)) ** 2;
      if (d < bestD) {
        bestD = d;
        r = nr;
        c = nc;
      }
    }

    // 必须换到正交邻格，且目标格与当前拖珠格不同
    if (r === dr && c === dc) return;
    if (Math.abs(r - dr) + Math.abs(c - dc) !== 1) return;

    // 数据交换
    this._board.swap(dr, dc, r, c);
    this._didMove = true;
    this._swapLocked = true;
    this._swapUnlockTimer = UI.anim.orbSwap;

    // Sprite 交换：被换走的珠 tween 到旧格，拖动珠瞬移到新格（保持半透明）
    const dragSp = this._sprites[dr][dc];
    const otherSp = this._sprites[r][c];
    this._sprites[r][c] = dragSp;
    this._sprites[dr][dc] = otherSp;

    if (dragSp) dragSp.position.set(this._cellCenterX(c), this._cellCenterY(r));
    if (otherSp) {
      TweenManager.cancelTarget(otherSp);
      TweenManager.to({
        target: otherSp,
        props: { x: this._cellCenterX(dc), y: this._cellCenterY(dr) },
        duration: UI.anim.orbSwap, ease: Ease.easeOutQuad,
      });
    }

    this._dragR = r;
    this._dragC = c;
  }

  private _onUp(): void {
    if (!this._dragging) return;
    this._endDrag();
  }

  private _endDrag(): void {
    this._dragging = false;
    this._dragTimer = 0;
    this._swapLocked = false;
    this._swapUnlockTimer = 0;
    const sp = this._sprites[this._dragR][this._dragC];
    if (sp) sp.alpha = 1;
    if (this._floatOrb) {
      this._pool.release(this._floatOrb);
      this._floatOrb = null;
    }
    this._cb.onDragEnd(this._didMove);
  }

  private _spawnSprite(orb: OrbType, r: number, c: number): PIXI.Sprite {
    const sp = this._pool.get();
    this._applyOrbTexture(sp, orb);
    const size = this._cell * UI.board.orbScale;
    sp.width = size;
    sp.height = size;
    sp.position.set(this._cellCenterX(c), this._cellCenterY(r));
    this._orbsLayer.addChild(sp);
    return sp;
  }

  private _applyOrbTexture(sp: PIXI.Sprite, orb: OrbType): void {
    const tex = TextureCache.get(ORB_IMAGES[orb]);
    if (tex) sp.texture = tex;
    const size = this._cell * UI.board.orbScale;
    sp.width = size;
    sp.height = size;
  }

  private _cellCenterX(c: number): number {
    return c * this._cell + this._cell / 2;
  }

  private _cellCenterY(r: number): number {
    return r * this._cell + this._cell / 2;
  }

  private _releaseAll(): void {
    for (const row of this._sprites) {
      for (const sp of row) {
        if (sp) this._pool.release(sp);
      }
    }
    this._sprites = [];
    if (this._floatOrb) {
      this._pool.release(this._floatOrb);
      this._floatOrb = null;
    }
  }
}
