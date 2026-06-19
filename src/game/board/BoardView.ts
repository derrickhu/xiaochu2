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
import { BOARD_IMAGES, ORB_IMAGES } from '@/config/Assets';
import { BoardModel, type MatchGroup, type FallMove, type Cell } from './BoardModel';

export interface BoardViewCallbacks {
  /** 是否允许开始拖珠（战斗状态机控制） */
  canDrag: () => boolean;
  onDragStart?: () => void;
  /** 松手或超时（didMove = 拖动期间发生过交换） */
  onDragEnd: (didMove: boolean) => void;
  /**
   * 有效珠判定（队伍属性覆盖）：返回 false 的珠子降饱和显示，
   * 提示玩家消除它不产生伤害。不传 = 全部有效。
   */
  isOrbActive?: (orb: OrbType) => boolean;
}

/** 无效珠：降饱和 + 半透明（仍可拖消，仅无伤害） */
const INACTIVE_TINT = 0x8a8a8a;
const INACTIVE_ALPHA = 0.58;
/** 封印珠：冷色覆层，与无效珠明显区分 */
const SEAL_TINT = 0xc8d4ff;
const SEAL_ALPHA = 0.72;

export class BoardView {
  readonly container = new PIXI.Container();

  private readonly _board: BoardModel;
  private readonly _cb: BoardViewCallbacks;
  private readonly _cell = UI.board.cellSize;

  private _orbsLayer = new PIXI.Container();
  /** 珠子状态标记层：封印「封」/ 无效「无」，与珠面分离便于辨认 */
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
    // 状态标记层（封印 / 无效），置于珠子之上
    this._overlayLayer.eventMode = 'none';
    this.container.addChild(this._overlayLayer);
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
          this._drawSealMark(this._cellCenterX(c), this._cellCenterY(r), size);
        } else if (!active && orb !== 'heart') {
          sp.tint = INACTIVE_TINT;
          sp.alpha = INACTIVE_ALPHA;
          this._drawInactiveMark(this._cellCenterX(c), this._cellCenterY(r), size);
        } else {
          sp.tint = 0xffffff;
          sp.alpha = 1;
        }
      }
    }
  }

  /** @deprecated 兼容旧调用，等同 refreshOrbStates */
  refreshLocks(): void {
    this.refreshOrbStates();
  }

  /** 封印珠：蓝紫冰层 + 金边 + 「封」字（不可拖/不可消，消邻格解封） */
  private _drawSealMark(cx: number, cy: number, size: number): void {
    const mark = new PIXI.Container();
    const half = size / 2;

    const frost = new PIXI.Graphics();
    frost.beginFill(0x3d52cc, 0.55);
    frost.lineStyle(3, 0xffd75e, 1);
    frost.drawRoundedRect(-half, -half, size, size, 10);
    frost.endFill();
    mark.addChild(frost);

    // 简易锁头：弧 + 锁体（不用横线，避免被看成「减号」）
    const shackle = new PIXI.Graphics();
    shackle.lineStyle(3, 0xffffff, 1);
    shackle.arc(0, -half * 0.14, half * 0.2, Math.PI, 0);
    mark.addChild(shackle);
    const body = new PIXI.Graphics();
    body.beginFill(0xffffff, 0.9);
    body.drawRoundedRect(-half * 0.2, -half * 0.06, half * 0.4, half * 0.32, 4);
    body.endFill();
    mark.addChild(body);

    const label = new PIXI.Text('封', {
      fontSize: Math.floor(size * 0.34),
      fill: 0xffffff,
      fontWeight: 'bold',
      stroke: 0x1a2266,
      strokeThickness: 4,
    });
    label.anchor.set(0.5);
    label.position.set(0, half * 0.22);
    mark.addChild(label);

    mark.position.set(cx, cy);
    this._overlayLayer.addChild(mark);
  }

  /** 无效珠：灰化 + 红色斜杠 + 「无」字（可消无伤害） */
  private _drawInactiveMark(cx: number, cy: number, size: number): void {
    const mark = new PIXI.Container();
    const half = size / 2;

    const slash = new PIXI.Graphics();
    slash.lineStyle(4, 0xff5252, 0.95);
    slash.moveTo(-half * 0.62, half * 0.62);
    slash.lineTo(half * 0.62, -half * 0.62);
    mark.addChild(slash);

    const badge = new PIXI.Graphics();
    badge.beginFill(0x2a1a1a, 0.88);
    badge.lineStyle(2, 0xff9142, 1);
    badge.drawRoundedRect(-half * 0.55, -half * 0.72, half * 1.1, half * 0.42, 6);
    badge.endFill();
    mark.addChild(badge);

    const label = new PIXI.Text('无', {
      fontSize: Math.floor(size * 0.28),
      fill: 0xff9142,
      fontWeight: 'bold',
    });
    label.anchor.set(0.5);
    label.position.set(0, -half * 0.51);
    mark.addChild(label);

    mark.position.set(cx, cy);
    this._overlayLayer.addChild(mark);
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
          onComplete: () => {
            done();
            if (remain <= 0) this.refreshOrbStates();
          },
        });
      }
    });
  }

  /** 播放转珠动画：目标格珠子弹跳缩放并切换为新珠贴图 */
  playConvert(cells: Cell[], to: OrbType): Promise<void> {
    return new Promise((resolve) => {
      if (cells.length === 0) {
        resolve();
        return;
      }
      let remain = cells.length;
      const done = (): void => {
        remain--;
        if (remain <= 0) resolve();
      };
      const size = this._cell * UI.board.orbScale;
      for (const { r, c } of cells) {
        const sp = this._sprites[r][c];
        if (!sp) {
          done();
          continue;
        }
        TweenManager.cancelTarget(sp.scale);
        // 缩没 → 换贴图 → 弹回
        TweenManager.to({
          target: sp, props: { width: size * 0.1, height: size * 0.1 },
          duration: UI.anim.orbSwap * 1.5, ease: Ease.easeInQuad,
          onComplete: () => {
            this._applyOrbTexture(sp, to);
            sp.width = size * 0.1;
            sp.height = size * 0.1;
            TweenManager.to({
              target: sp, props: { width: size, height: size },
              duration: UI.anim.orbSwap * 2.5, ease: Ease.easeOutBack,
              onComplete: () => {
                done();
                if (remain <= 0) this.refreshOrbStates();
              },
            });
          },
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
    const pad = 3;
    const w = this.boardWidth + pad * 2;
    const h = this.boardHeight + pad * 2;

    const frame = new PIXI.Graphics();
    frame.beginFill(0x080812, 0.85);
    frame.drawRoundedRect(-pad, -pad, w, h, 6);
    frame.endFill();
    frame.lineStyle(1.5, 0x505078, 0.5);
    frame.drawRoundedRect(-pad, -pad, w, h, 6);
    this.container.addChild(frame);

    const tileDark = TextureCache.get(BOARD_IMAGES.dark);
    const tileLight = TextureCache.get(BOARD_IMAGES.light);
    const tiles = new PIXI.Container();

    for (let r = 0; r < this._board.rows; r++) {
      for (let c = 0; c < this._board.cols; c++) {
        const x = c * this._cell;
        const y = r * this._cell;
        const isDark = (r + c) % 2 === 0;
        const tex = isDark ? tileDark : tileLight;
        if (tex) {
          const sp = new PIXI.Sprite(tex);
          sp.width = this._cell;
          sp.height = this._cell;
          sp.position.set(x, y);
          tiles.addChild(sp);
        } else {
          const cell = new PIXI.Graphics();
          cell.beginFill(isDark ? 0x1c1c30 : 0x121223, 0.9);
          cell.drawRect(x, y, this._cell, this._cell);
          cell.endFill();
          tiles.addChild(cell);
        }
      }
    }
    this.container.addChild(tiles);
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
    // 封印珠不可拖动
    if (this._board.isLocked(r, c)) {
      Platform.vibrateShort('light');
      return;
    }

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
      // 封印珠不可被换入
      if (this._board.isLocked(nr, nc)) continue;
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
    // tint/alpha 由 refreshOrbStates 统一处理
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
