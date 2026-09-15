/**
 * 长拖手势示意：全游戏唯一的显式教学（设计依据见 docs/06-新手引导.md）。
 *
 * 为什么只教这一件事：消 3 = 攻击、连击更疼、心珠回血、技能就绪，拖成功一次就全自明了
 * （伤害飘字、Combo 大字、就绪箭头都已经在演）。但「按住珠子沿路径连续交换」不是通用手势，
 * 玩家带着消消乐的习惯来会去点两颗试图对调 —— 第一拖迈不出去，后面所有反馈都无从发生。
 *
 * 与 xiao_chu 第一版的本质区别，这几条是底线，别在后续需求里被侵蚀：
 *   - 不遮罩、不暗化棋盘
 *   - 不锁起点、不锁路径、不自动补完；玩家从任意珠起手都行
 *   - 气泡立刻出现；手势循环到玩家自己动手为止
 * 第一版是锁定路径 + 拖错自动补完，玩家成了提线木偶；这里只是示范，不接管操作。
 */
import * as PIXI from 'pixi.js';

import { analytics, TUTORIAL_STEPS } from '@/analytics';
import { UI_GUIDE_IMAGES } from '@/config/Assets';
import { ensureAssets } from '@/config/Subpackages';
import { UI } from '@/balance/ui';
import type { OrbType } from '@/balance/combat';
import type { BoardModel, Cell } from '@/game/board/BoardModel';
import { PlayerData } from '@/game/PlayerData';
import { TUTORIAL_FLAGS } from '@/game/tutorialFlags';
import { makeLingGuideBubble, type LingGuideBubble } from '@/ui/LingGuideBubble';
import {
  DRAG_HINT_TIP,
  FIRST_DELAY_MS,
  MAX_ROUNDS,
  REPEAT_DELAY_MS,
  SWEEPS_PER_ROUND,
  SWEEP_GAP_MS,
  SWEEP_MS,
  findDragHintPath,
  type DragHintPath,
} from './dragHintPath';

export interface DragHintDeps {
  board: BoardModel;
  /** 格中心 → 场景坐标（BoardView.worldPosOf） */
  cellPos: (cell: Cell) => { x: number; y: number };
  /** 现在能不能演：玩家回合、不在演出中、玩家没在拖 */
  canPlay: () => boolean;
  /** 该色珠是否有上阵灵宠承接 */
  isUseful?: (orb: OrbType) => boolean;
  /** 气泡落点（场景坐标） */
  tipAnchor: { x: number; y: number };
}

type HintState = 'waiting' | 'playing' | 'done';

export class BattleDragHint {
  private readonly _deps: DragHintDeps;
  private readonly _root = new PIXI.Container();
  private readonly _gestureLayer = new PIXI.Graphics();
  private _bubble: LingGuideBubble | null = null;

  private _state: HintState = 'waiting';
  private _idleMs = 0;
  private _round = 0;
  private _path: DragHintPath | null = null;
  private _playMs = 0;
  private _touchReported = false;

  constructor(deps: DragHintDeps) {
    this._deps = deps;
  }

  /** 本局是否需要这套示意（已学会 / 老玩家直接不建） */
  static get needed(): boolean {
    return !PlayerData.isTutorialDone(TUTORIAL_FLAGS.dragHint);
  }

  /** 提到 Combo / 顶栏之上，不然大气泡会被 HUD 盖住 */
  raise(parent: PIXI.Container): void {
    parent.addChild(this._root);
  }

  build(parent: PIXI.Container): void {
    this._root.eventMode = 'none';
    this._root.visible = true;
    this._gestureLayer.visible = false;
    this._root.addChild(this._gestureLayer);
    this._buildBubble();
    parent.addChild(this._root);

    void ensureAssets([UI_GUIDE_IMAGES.xiaoling])
      .then(() => this._bubble?.applyPortrait())
      .catch(() => { /* 降级：无立绘，纯手势圈 + 大号文字 */ });
  }

  update(dt: number): void {
    if (this._state === 'done') return;

    if (this._state === 'playing') {
      this._playMs += dt * 1000;
      const total = SWEEPS_PER_ROUND * (SWEEP_MS + SWEEP_GAP_MS);
      if (this._playMs >= total || !this._deps.canPlay()) {
        this._finishRound();
        return;
      }
      this._redrawGesture();
      return;
    }

    if (!this._deps.canPlay()) {
      // 演出 / 敌人回合期间不累计静止时间，也不藏已经亮着的气泡
      this._idleMs = 0;
      this._gestureLayer.visible = false;
      return;
    }
    if (this._round >= MAX_ROUNDS) return;
    this._idleMs += dt * 1000;
    const need = this._round === 0 ? FIRST_DELAY_MS : REPEAT_DELAY_MS;
    if (this._idleMs >= need) this._play();
  }

  /** 玩家碰了棋盘：立即收起。他知道要碰棋盘了，但未必会拖，所以不算学会 */
  notifyTouch(): void {
    if (this._state === 'done') return;
    if (!this._touchReported && this._round > 0) {
      this._touchReported = true;
      analytics.trackTutorialStep(TUTORIAL_STEPS.dragHintDismissed, {
        reason: 'touch',
        rounds: this._round,
      });
    }
    this._hideAll();
    this._state = 'waiting';
    this._idleMs = 0;
  }

  /**
   * 玩家拖了但一颗也没消掉：立刻重新示范，不等 REPEAT_DELAY_MS 的静止计时。
   *
   * 这是「手把手」在不违反本文件开头那几条底线的前提下唯一正确的做法。
   * 原本的节奏是「玩家发呆够久才提示」，可是拖空的人不是在发呆，他刚刚试过一次并且失败了 ——
   * 那一刻正是他最需要看第二遍的时候，再让他干等几秒只会让他以为游戏卡了。
   *
   * 仍然不锁起点、不锁路径：他下一次可以从任何一颗珠起手。
   */
  notifyFruitless(): void {
    if (this._state === 'done') return;
    this._root.visible = true;
    this._state = 'waiting';
    // 只差一点就到重播阈值：留一小段间隔让上一次拖动的手指先离开屏幕
    this._idleMs = Math.max(0, REPEAT_DELAY_MS - 350);
    if (this._round >= MAX_ROUNDS) this._round = MAX_ROUNDS - 1;
  }

  /** 玩家自己消掉一次 = 真的学会了，永久收起 */
  notifyMatched(): void {
    if (this._state === 'done') return;
    this._hideAll();
    this._state = 'done';
    PlayerData.markTutorialDone(TUTORIAL_FLAGS.dragHint);
  }

  destroy(): void {
    this._root.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (this._root.parent) this._root.parent.removeChild(this._root);
    this._root.destroy({ children: true });
  }

  // ──────── 内部 ────────

  private _play(): void {
    const path = findDragHintPath(this._deps.board, this._deps.isUseful);
    if (!path) {
      this._idleMs = 0;
      return;
    }
    this._path = path;
    this._playMs = 0;
    this._round++;
    this._state = 'playing';
    this._gestureLayer.visible = true;
    this._redrawGesture();
    analytics.trackTutorialStep(TUTORIAL_STEPS.dragHintShown, { times: this._round });
  }

  private _finishRound(): void {
    this._gestureLayer.visible = false;
    this._gestureLayer.clear();
    this._idleMs = 0;
    this._state = 'waiting';
    // 播满上限也不标完成：没动手 ≠ 学会了。只停手势、留着气泡。
    if (this._round >= MAX_ROUNDS) {
      analytics.trackTutorialStep(TUTORIAL_STEPS.dragHintDismissed, {
        reason: 'exhausted',
        rounds: this._round,
      });
    }
  }

  private _hideAll(): void {
    this._root.visible = false;
    this._gestureLayer.visible = false;
    this._gestureLayer.clear();
  }

  private _redrawGesture(): void {
    const path = this._path;
    if (!path) return;
    const a = this._deps.cellPos(path.from);
    const b = this._deps.cellPos(path.to);
    const cell = UI.board.cellSize;

    const cycle = SWEEP_MS + SWEEP_GAP_MS;
    const t = (this._playMs % cycle) / SWEEP_MS;
    const moving = Math.min(1, Math.max(0, t));
    const eased = moving < 0.5
      ? 2 * moving * moving
      : 1 - (-2 * moving + 2) ** 2 / 2;
    const x = a.x + (b.x - a.x) * eased;
    const y = a.y + (b.y - a.y) * eased;
    const fade = t > 1 ? 1 - Math.min(1, (t - 1) * (SWEEP_MS / SWEEP_GAP_MS)) : 1;

    const g = this._gestureLayer;
    g.clear();

    const pulse = 0.92 + 0.08 * Math.sin((this._playMs / 1000) * 5);
    g.lineStyle(6, 0xffd66b, 0.95);
    g.drawCircle(a.x, a.y, cell * 0.48 * pulse);

    g.lineStyle(8, 0xffd66b, 0.5 * fade);
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);

    g.lineStyle(4, 0xffffff, 0.7 * fade);
    g.drawCircle(b.x, b.y, cell * 0.36);

    g.lineStyle(5, 0xffffff, 0.98 * fade);
    g.beginFill(0xffffff, 0.32 * fade);
    g.drawCircle(x, y, cell * 0.34);
    g.endFill();
    g.lineStyle(0);
    g.beginFill(0xffffff, 0.95 * fade);
    g.drawCircle(x, y, cell * 0.13);
    g.endFill();
  }

  private _buildBubble(): void {
    const bubble = makeLingGuideBubble({ text: DRAG_HINT_TIP });
    bubble.root.position.set(this._deps.tipAnchor.x, this._deps.tipAnchor.y);
    this._root.addChild(bubble.root);
    this._bubble = bubble;
  }
}
