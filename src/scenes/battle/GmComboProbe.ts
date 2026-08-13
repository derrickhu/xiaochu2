/**
 * GM 连击特效探针 —— 战斗内直接点出任意档位的连击表现。
 *
 * 连击特效按 3/6/9/12/15/18 分档，越高越炸，但手搓 12 连以上基本靠运气，
 * 调一次参数要凑半天棋盘。这里把每档的表现单独拎出来，点一下就播。
 *
 * 播的不只是文字特效：音效、屏震、马达、里程碑闪白全都按真实战斗那套一起走，
 * 否则单看特效会误判强度——画面上够炸的东西，配上震动和音效可能就过了。
 * 连播模式复用 comboRhythm 的节拍曲线，跟真正打出长连的节奏完全一致。
 *
 * 仅在 GM 开启时挂载（见 BattleScene._build）。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';
import { SfxManager } from '@/core/SfxManager';
import { makeButton } from './battleWidgets';
import { comboBeat, comboMilestoneHold, comboShake, comboVibrate } from './comboRhythm';
import { getComboTier, isComboMilestone } from './ComboDisplay';
import type { BattleFx } from './BattleFx';
import type { BattleHud } from './BattleHud';

/** 与 COMBO_MILESTONES 的阈值对齐，一档一个按钮 */
const TIER_STOPS = [3, 6, 9, 12, 15, 18] as const;
const DEMO_MAX = 18;

const BTN_W = 46;
const BTN_H = 38;
const BTN_GAP = 5;

/**
 * 播完后的停留时长（秒）。特效散完还会常驻一层托住文字，那一帧最该看清，
 * 所以给得比实战宽裕得多——实战里消除一结束就硬切，根本来不及看。
 * 能这样拖是因为 ComboDisplay.hide 会把计时拉回淡出起点，托多久都不影响退场。
 */
const TAIL_HOLD = 2.4;

interface ProbeRun {
  /** 下一个要播的连击数 */
  next: number;
  max: number;
  /** 距离下一次触发的剩余秒数 */
  wait: number;
}

export class GmComboProbe {
  private _root: PIXI.Container | null = null;
  private _run: ProbeRun | null = null;
  private _hud: BattleHud | null = null;
  private _fx: BattleFx | null = null;

  build(parent: PIXI.Container, hud: BattleHud, fx: BattleFx): void {
    this._hud = hud;
    this._fx = fx;

    const root = new PIXI.Container();
    // 与「跳过本波」同一行靠左排开；连击文字落在棋盘中上部，这里不会挡住它
    root.position.set(14, Game.safeTop + 28);
    this._root = root;
    parent.addChild(root);

    let x = BTN_W / 2;
    for (const stop of TIER_STOPS) {
      const btn = makeButton(String(stop), BTN_W, BTN_H, 0x4a3d6b, () => this._fire(stop));
      btn.position.set(x, 0);
      root.addChild(btn);
      x += BTN_W + BTN_GAP;
    }
    const demo = makeButton('连播', BTN_W + 10, BTN_H, 0xb03a52, () => this._fire(1, DEMO_MAX));
    demo.position.set(x + 5, 0);
    root.addChild(demo);
  }

  /**
   * 显隐切换。容器常驻、只切 visible，是为了保住它在结算浮层之下的层级——
   * 关掉再动态 addChild 会挂到容器末尾，按钮条就会浮在结算界面上面。
   * 隐藏时顺手掐掉正在跑的连播，否则收起后特效还会继续往外冒。
   */
  setVisible(on: boolean): void {
    if (this._root) this._root.visible = on;
    if (!on) {
      this._run = null;
      this._hud?.hideCombo(true);
    }
  }

  /** 单档播一次；给了 max 就从 from 连播到 max */
  private _fire(from: number, max = from): void {
    this._hud?.hideCombo(true);
    this._run = { next: from, max, wait: 0 };
  }

  update(dt: number): void {
    const run = this._run;
    if (!run) return;
    run.wait -= dt;
    if (run.wait > 0) return;

    if (run.next > run.max) {
      // 走淡出而不是立即清除：真实战斗里消除结束会硬切，但那样看不清收尾
      this._hud?.hideCombo(false);
      this._run = null;
      return;
    }

    const combo = run.next;
    this._play(combo);
    run.next++;
    run.wait = combo >= run.max
      ? TAIL_HOLD
      : comboBeat(combo) + comboMilestoneHold(combo);
  }

  /** 与 BattleScene._resolveAfterDrag 里的连击表现保持一致 */
  private _play(combo: number): void {
    const fx = this._fx;
    if (!this._hud || !fx) return;
    this._hud.showCombo(combo, fx);
    SfxManager.playComboHit(combo);
    Platform.vibrateShort(comboVibrate(combo));
    const shake = comboShake(combo);
    if (shake === 'heavy') fx.shakeHeavy();
    else if (shake === 'medium') fx.shakeMedium();
    else if (shake === 'light') fx.shakeLight();
    if (isComboMilestone(combo) && getComboTier(combo) >= 3) {
      fx.flash(0xffe6b0, 0.16, 0.22);
    }
  }

  destroy(): void {
    this._run = null;
    this._root?.parent?.removeChild(this._root);
    this._root?.destroy({ children: true });
    this._root = null;
    this._hud = null;
    this._fx = null;
  }
}
