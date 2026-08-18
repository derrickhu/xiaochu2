/**
 * 珠盘视图：渲染 + 长拖转珠交互 + 消除/下落动画
 *
 * - 珠子 Sprite 走对象池，sprites[r][c] 与 BoardModel.grid 一一对应
 * - 拖拽目标格：当前格 + 四正交邻格，带滞回，避免格缝来回抽
 * - 真机触摸链成对；起手 cancel 先宽限（同步震动会误触发 touchcancel）
 * - 拖珠限时由 update(dt) 驱动，单帧 dt 封顶，超时强制松手
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { ObjectPool } from '@/core/ObjectPool';
import { TextureCache } from '@/core/TextureCache';
import { TweenManager } from '@/core/TweenManager';
import { setScaleSafe, readScale } from '@/core/animationGuard';
import { Platform } from '@/core/PlatformService';
import { SfxManager } from '@/core/SfxManager';
import { UI } from '@/balance/ui';
import { COMBAT, type OrbType } from '@/balance/combat';
import { ORB_IMAGES } from '@/config/Assets';
import { getTouchCanvas } from '@/utils/touchCanvas';
import { BoardModel, type MatchGroup, type FallMove, type Cell } from './BoardModel';
import { playBoardClear, playBoardConvert, playBoardFall } from './boardAnimations';
import { buildBoardBackground } from './boardBackground';
import { drawSealMark } from './boardOrbMarks';
import {
  advanceDragTimer,
  DRAG_CANCEL_GRACE_MS,
  pickOrthoSwapTarget,
  shouldDeferDragCancel,
  shouldKeepDragAfterCancelGrace,
} from './boardDragMath';

export interface BoardViewCallbacks {
  /** 是否允许开始拖珠（战斗状态机控制） */
  canDrag: () => boolean;
  onDragStart?: () => void;
  /** 松手或超时（didMove = 拖动期间发生过交换） */
  onDragEnd: (didMove: boolean) => void;
  /** 有效珠判定（队伍属性覆盖）：返回 false 的珠子降饱和显示，提示消除无伤害 */
  isOrbActive?: (orb: OrbType) => boolean;
  /** 拖珠限时（秒）：加时/时间压缩状态动态调整；缺省 COMBAT.dragTimeLimit */
  dragTimeLimit?: () => number;
}

/** 无效珠：降饱和变淡（仍可拖消，仅无伤害；不再叠「无」字/斜杠） */
const INACTIVE_TINT = 0xffffff;
const INACTIVE_ALPHA = 0.42;
/** 封印珠：珠体略压冷色，叠层金框负责「封」识别 */
const SEAL_TINT = 0xd8e4ff;
const SEAL_ALPHA = 0.88;

/** 拖动期双珠交换 tween（对齐 xiao_chu g.swapAnim，连拖路径上逐格换位） */
interface DragSwapAnim {
  spA: PIXI.Sprite;
  spB: PIXI.Sprite;
  aFromX: number;
  aFromY: number;
  aToX: number;
  aToY: number;
  bFromX: number;
  bFromY: number;
  bToX: number;
  bToY: number;
  startMs: number;
  durationMs: number;
}

export class BoardView {
  readonly container = new PIXI.Container();

  private readonly _board: BoardModel;
  private readonly _cb: BoardViewCallbacks;
  private readonly _cell = UI.board.cellSize;

  private _orbsLayer = new PIXI.Container();
  /** 珠子状态标记层：封印「封」叠层（无效珠仅变淡，不叠字） */
  private _overlayLayer = new PIXI.Container();
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
  private _dragStartMs = 0;
  private _lastMoveMs = 0;
  private _cancelMs = 0;
  private _cancelGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private _floatOrb: PIXI.Sprite | null = null;
  /** 当前交换动画；逻辑锁另用真实时间，避免真机 touchmove 期间 ticker 不推进 */
  private _swapAnim: DragSwapAnim | null = null;
  /** 触摸事件用真实时间解锁；真机拖动时 Pixi ticker 可能被 touchmove 挤压 */
  private _swapLockUntilMs = 0;

  private _detachCanvasMove: (() => void) | null = null;

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
        setScaleSafe(sp, 1);
      },
      onRelease: (sp) => {
        TweenManager.cancelTarget(sp);
        const spScale = readScale(sp);
        if (spScale) TweenManager.cancelTarget(spScale);
        sp.visible = false;
        if (sp.parent) sp.parent.removeChild(sp);
      },
      preallocate: COMBAT.boardCols * COMBAT.boardRows,
      maxSize: COMBAT.boardCols * COMBAT.boardRows * 2,
      onDiscard: (sp) => sp.destroy(),
    });

    buildBoardBackground(this.container, this._board.rows, this._board.cols, this._cell);
    this.container.addChild(this._orbsLayer);
    // 状态标记层（封印 / 无效），置于珠子之上
    this._overlayLayer.eventMode = 'none';
    this.container.addChild(this._overlayLayer);
    this._setupInteraction();
    // 浮珠层置顶（仅展示，不拦截触摸；pointerdown 在棋盘 hitArea）
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

  /** 当前拖珠限时（秒），支持加时/时间压缩状态动态调整 */
  private get _dragTimeLimit(): number {
    return this._cb.dragTimeLimit?.() ?? COMBAT.dragTimeLimit;
  }

  /** 拖珠剩余时间比例 1→0（未拖动时为 1） */
  get dragTimeLeft(): number {
    if (!this._dragging) return 1;
    return Math.max(0, 1 - this._dragTimer / this._dragTimeLimit);
  }

  /** 每帧驱动：拖珠限时 + 路径交换 tween */
  update(dt: number): void {
    this._advanceSwapAnim();
    if (!this._dragging) return;
    const stepped = advanceDragTimer(this._dragTimer, dt, this._dragTimeLimit);
    this._dragTimer = stepped.timer;
    if (stepped.expired) this._endDrag();
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
    this.refreshOrbStates();
  }

  /** 重绘全部珠子视觉状态（解封/下落/重建后调用） */
  refreshOrbStates(): void {
    this._overlayLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const size = this._cell * UI.board.orbScale;
    for (let r = 0; r < this._board.rows; r++) {
      for (let c = 0; c < this._board.cols; c++) {
        const orb = this._board.get(r, c);
        const sp = this._sprites[r]?.[c];
        if (!orb || !sp) continue;

        const locked = this._board.isLocked(r, c);
        const active = this._cb.isOrbActive ? this._cb.isOrbActive(orb) : true;

        if (locked) {
          sp.tint = SEAL_TINT;
          sp.alpha = SEAL_ALPHA;
          drawSealMark(this._overlayLayer, this._cellCenterX(c), this._cellCenterY(r), size);
        } else if (!active && orb !== 'heart') {
          // 无效珠：只变淡，保留原色辨识；不叠「无」字
          sp.tint = INACTIVE_TINT;
          sp.alpha = INACTIVE_ALPHA;
        } else {
          sp.tint = 0xffffff;
          sp.alpha = 1;
        }
      }
    }
  }

  /** 播放一组消除动画（缩放消失），结束后从池回收 */
  playClear(group: MatchGroup): Promise<void> {
    return playBoardClear(this._animationContext(), group);
  }

  /** 播放下落/补珠动画 */
  playFall(moves: FallMove[]): Promise<void> {
    return playBoardFall(this._animationContext(), moves);
  }

  /** 播放转珠动画：目标格珠子弹跳缩放并切换为新珠贴图 */
  playConvert(cells: Cell[], to: OrbType): Promise<void> {
    return playBoardConvert(this._animationContext(), cells, to);
  }

  /** 格子中心的战斗逻辑坐标（容器已摆到棋盘原点） */
  worldPosOf(cell: Cell): { x: number; y: number } {
    return {
      x: this.container.x + this._cellCenterX(cell.c),
      y: this.container.y + this._cellCenterY(cell.r),
    };
  }

  /** 强制结束拖拽（场景退出等） */
  cancelDrag(): void {
    if (this._dragging) this._endDrag();
  }

  destroy(): void {
    this._clearCancelGrace();
    this._detachCanvasMove?.();
    this._detachCanvasMove = null;
    this._releaseAll();
    this._pool.clear();
    this.container.destroy({ children: true });
  }

  // ════════════ 内部 ════════════

  /**
   * 真机：canvas touchstart/move/end 成对（勿混 Pixi pointerdown + canvas pointerup）。
   * 浏览器 / 开发者工具：容器 pointerdown + canvas pointermove/up。
   * pointercancel / touchcancel 起手阶段先宽限，避免震动把拖珠当场掐死。
   */
  private _setupInteraction(): void {
    const canvas = getTouchCanvas();
    const touchMode = Platform.isMinigame && !Platform.isDevtools;

    const tryDown = (e: unknown): void => {
      if (this._dragging || !this._cb.canDrag()) return;
      const p = this._boardLocalFromClient(e);
      if (p.x < 0 || p.y < 0 || p.x > this.boardWidth || p.y > this.boardHeight) return;
      (e as { preventDefault?: () => void }).preventDefault?.();
      this._onDown(p.x, p.y);
    };
    const onMove = (e: Event): void => {
      if (!this._dragging) return;
      (e as { preventDefault?: () => void }).preventDefault?.();
      const p = this._boardLocalFromClient(e);
      this._onMove(p.x, p.y);
    };
    const onUp = (): void => {
      this._clearCancelGrace();
      if (this._dragging) this._onUp();
    };
    const onCancel = (): void => {
      this._onCancel();
    };

    if (touchMode) {
      this.container.eventMode = 'none';
      const onTouchStart = ((e: Event) => tryDown(e)) as EventListener;
      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      canvas.addEventListener('touchmove', onMove, { passive: false });
      canvas.addEventListener('touchend', onUp);
      canvas.addEventListener('touchcancel', onCancel);
      this._detachCanvasMove = () => {
        canvas.removeEventListener('touchstart', onTouchStart);
        canvas.removeEventListener('touchmove', onMove);
        canvas.removeEventListener('touchend', onUp);
        canvas.removeEventListener('touchcancel', onCancel);
      };
      return;
    }

    this.container.eventMode = 'static';
    this.container.hitArea = new PIXI.Rectangle(0, 0, this.boardWidth, this.boardHeight);
    this.container.interactiveChildren = false;

    const onPixiDown = (e: PIXI.FederatedPointerEvent): void => {
      tryDown(e);
    };
    this.container.on('pointerdown', onPixiDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);

    this._detachCanvasMove = () => {
      if (this.container && !this.container.destroyed) {
        this.container.off('pointerdown', onPixiDown);
      }
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
    };
  }

  /** clientX/Y → 棋盘 container 本地（与 Game.pointerEventToStageLocal / huahua _rawToLocal 一致） */
  private _boardLocalFromClient(e: unknown): { x: number; y: number } {
    const stageLocal = Game.pointerEventToStageLocal(e);
    return {
      x: stageLocal.x - this.container.x,
      y: stageLocal.y - this.container.y,
    };
  }


  private _advanceSwapAnim(nowMs = Date.now()): void {
    const a = this._swapAnim;
    if (!a) return;
    const t = Math.min(1, (nowMs - a.startMs) / a.durationMs);
    // 被拖珠的真实视觉由 floatOrb 跟手；底层半透明珠固定在当前逻辑格，避免“幽灵飘动”。
    a.spA.position.set(a.aToX, a.aToY);
    a.spB.position.set(
      a.bFromX + (a.bToX - a.bFromX) * t,
      a.bFromY + (a.bToY - a.bFromY) * t,
    );
    if (t >= 1) this._swapAnim = null;
  }

  private _swapLogicLocked(): boolean {
    return Date.now() < this._swapLockUntilMs;
  }

  private _finishSwapAnim(): void {
    const a = this._swapAnim;
    if (!a) return;
    a.spA.position.set(a.aToX, a.aToY);
    a.spB.position.set(a.bToX, a.bToY);
    this._swapAnim = null;
  }

  private _beginSwapAnim(
    dragSp: PIXI.Sprite,
    otherSp: PIXI.Sprite,
    fromR: number,
    fromC: number,
    toR: number,
    toC: number,
  ): void {
    this._finishSwapAnim();
    const aFromX = this._cellCenterX(fromC);
    const aFromY = this._cellCenterY(fromR);
    const aToX = this._cellCenterX(toC);
    const aToY = this._cellCenterY(toR);
    const bFromX = aToX;
    const bFromY = aToY;
    const bToX = aFromX;
    const bToY = aFromY;
    dragSp.position.set(aToX, aToY);
    otherSp.position.set(bFromX, bFromY);
    this._swapAnim = {
      spA: dragSp,
      spB: otherSp,
      aFromX,
      aFromY,
      aToX,
      aToY,
      bFromX,
      bFromY,
      bToX,
      bToY,
      startMs: Date.now(),
      durationMs: Math.max(1, UI.anim.orbSwap * 1000),
    };
  }

  private _onDown(localX: number, localY: number): void {
    if (this._dragging || !this._cb.canDrag()) return;
    const c = Math.floor(localX / this._cell);
    const r = Math.floor(localY / this._cell);
    if (!this._board.inBounds(r, c)) return;
    const orb = this._board.get(r, c);
    if (!orb) return;
    // 封印珠不可拖动
    if (this._board.isLocked(r, c)) {
      Platform.vibrateShort('light');
      return;
    }

    this._dragging = true;
    this._didMove = false;
    this._finishSwapAnim();
    this._swapLockUntilMs = 0;
    this._dragR = r;
    this._dragC = c;
    this._dragTimer = 0;
    this._dragStartMs = Date.now();
    this._lastMoveMs = 0;
    this._cancelMs = 0;
    this._clearCancelGrace();

    // 原位珠半透明，浮珠跟手
    const sp = this._sprites[r][c];
    if (sp) sp.alpha = 0.35;
    const float = this._pool.get();
    this._applyOrbTexture(float, orb);
    float.width = this._cell * UI.board.orbScale * 1.15;
    float.height = this._cell * UI.board.orbScale * 1.15;
    float.position.set(localX, localY);
    this._floatLayer.addChild(float);
    this._floatOrb = float;

    // 同步震动会在部分安卓/抖音上触发 touchcancel，表现为刚拿起珠就收手
    const startedAt = this._dragStartMs;
    setTimeout(() => {
      if (this._dragging && this._dragStartMs === startedAt) Platform.vibrateShort();
    }, 40);
    SfxManager.playPickUp();
    this._cb.onDragStart?.();
  }

  private _onMove(x: number, y: number): void {
    if (!this._dragging) return;
    this._lastMoveMs = Date.now();
    this._clearCancelGrace();
    // 钳制到棋盘范围
    const px = Math.max(0, Math.min(this.boardWidth, x));
    const py = Math.max(0, Math.min(this.boardHeight, y));
    if (this._floatOrb) this._floatOrb.position.set(px, py);
    this._advanceSwapAnim();

    if (this._swapLogicLocked()) return;

    const target = pickOrthoSwapTarget(px, py, this._dragR, this._dragC, {
      rows: this._board.rows,
      cols: this._board.cols,
      cell: this._cell,
      isBlocked: (nr, nc) => this._board.isLocked(nr, nc),
    });
    if (!target) return;
    const { r, c } = target;
    const dr = this._dragR;
    const dc = this._dragC;

    const fromR = dr;
    const fromC = dc;
    const dragSp = this._sprites[fromR][fromC];
    const otherSp = this._sprites[r][c];
    if (!dragSp || !otherSp) return;

    this._board.swap(fromR, fromC, r, c);
    this._didMove = true;
    this._sprites[r][c] = dragSp;
    this._sprites[fromR][fromC] = otherSp;

    this._beginSwapAnim(dragSp, otherSp, fromR, fromC, r, c);
    otherSp.alpha = 1;
    dragSp.alpha = 0.35;

    this._dragR = r;
    this._dragC = c;
    this._swapLockUntilMs = Date.now() + UI.anim.orbSwapLogicLock * 1000;
    SfxManager.playSwap();
  }

  private _onUp(): void {
    if (!this._dragging) return;
    this._endDrag();
  }

  private _onCancel(): void {
    if (!this._dragging) return;
    const age = Date.now() - this._dragStartMs;
    if (shouldDeferDragCancel(age, this._didMove)) {
      this._armCancelGrace();
      return;
    }
    this._endDrag();
  }

  private _armCancelGrace(): void {
    if (this._cancelGraceTimer != null) return;
    this._cancelMs = Date.now();
    this._cancelGraceTimer = setTimeout(() => {
      this._cancelGraceTimer = null;
      if (!this._dragging) return;
      if (shouldKeepDragAfterCancelGrace(this._lastMoveMs, this._cancelMs)) return;
      this._endDrag();
    }, DRAG_CANCEL_GRACE_MS);
  }

  private _clearCancelGrace(): void {
    if (this._cancelGraceTimer == null) return;
    clearTimeout(this._cancelGraceTimer);
    this._cancelGraceTimer = null;
  }

  private _endDrag(): void {
    this._clearCancelGrace();
    this._dragging = false;
    this._dragTimer = 0;
    this._finishSwapAnim();
    this._swapLockUntilMs = 0;
    const sp = this._sprites[this._dragR][this._dragC];
    if (sp) sp.alpha = 1;
    if (this._floatOrb) {
      this._pool.release(this._floatOrb);
      this._floatOrb = null;
    }
    if (this._didMove) SfxManager.playDragEnd();
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

  private _animationContext() {
    return {
      cell: this._cell,
      sprites: this._sprites,
      pool: this._pool,
      spawnSprite: (orb: OrbType, r: number, c: number) => this._spawnSprite(orb, r, c),
      applyOrbTexture: (sp: PIXI.Sprite, orb: OrbType) => this._applyOrbTexture(sp, orb),
      cellCenterY: (r: number) => this._cellCenterY(r),
      refreshOrbStates: () => this.refreshOrbStates(),
    };
  }

  private _applyOrbTexture(sp: PIXI.Sprite, orb: OrbType): void {
    const tex = TextureCache.get(ORB_IMAGES[orb]);
    if (tex) sp.texture = tex;
    const size = this._cell * UI.board.orbScale;
    sp.width = size;
    sp.height = size;
    sp.tint = 0xffffff;
    sp.alpha = 1;
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
