/**
 * 首页进场：先欢迎，再指路。
 *
 * 上一版一上来就「点这一关」，玩家还不知道自己到了哪、对面是谁。
 * 欢迎卡只挡这一下（轻遮罩 + 点一下继续），随后圈选第一关，不再锁操作。
 */
import * as PIXI from 'pixi.js';

import { analytics, TUTORIAL_STEPS } from '@/analytics';
import { UI_GUIDE_IMAGES } from '@/config/Assets';
import { ensureAssets } from '@/config/Subpackages';
import { Game } from '@/core/Game';
import { COLORS, FONT_SIZE, popIn } from '@/ui';
import { makeLingGuideBubble } from '@/ui/LingGuideBubble';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { PlayerData } from '@/game/PlayerData';
import { TUTORIAL_FLAGS } from '@/game/tutorialFlags';

/** 开场欢迎。禁止相对进度描述。 */
export const HOME_WELCOME_TIP = '欢迎来到灵兽森林～\n我是小灵，往后由我陪你闯关。';
/** 欢迎之后再指路。 */
export const HOME_START_TIP = '点这一关，我们去冒险～';

export interface HomeStartGuideDeps {
  /** 当前进度关在屏幕上的位置（节点中心） */
  target: { x: number; y: number };
}

type Page = 'welcome' | 'point';

export class HomeStartGuide {
  private readonly _deps: HomeStartGuideDeps;
  private readonly _root = new PIXI.Container();
  private readonly _welcome = new PIXI.Container();
  private readonly _point = new PIXI.Container();
  private readonly _fx = new PIXI.Graphics();
  private _page: Page = 'welcome';
  private _elapsed = 0;
  private _shown = false;
  private _destroyed = false;
  private _ticker = (): void => this._update();

  constructor(deps: HomeStartGuideDeps) {
    this._deps = deps;
  }

  static get needed(): boolean {
    return !PlayerData.isTutorialDone(TUTORIAL_FLAGS.homeStart);
  }

  build(parent: PIXI.Container): void {
    parent.addChild(this._root);
    this._buildWelcome();
    this._buildPoint();
    this._point.visible = false;
    this._root.addChild(this._welcome);
    this._root.addChild(this._point);

    this._shown = true;
    analytics.trackTutorialStep(TUTORIAL_STEPS.homeStartShown);
    Game.ticker.add(this._ticker);
    void ensureAssets([UI_GUIDE_IMAGES.xiaoling]).catch(() => { /* 没图也把字先亮出来 */ });
  }

  /** 玩家点进关卡详情 = 已经知道往哪走 */
  complete(): void {
    if (!this._shown) return;
    this._shown = false;
    PlayerData.markTutorialDone(TUTORIAL_FLAGS.homeStart);
    analytics.trackTutorialStep(TUTORIAL_STEPS.homeStartTapped);
    this.destroy();
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    Game.ticker.remove(this._ticker);
    if (this._root.parent) this._root.parent.removeChild(this._root);
    this._root.destroy({ children: true });
  }

  private _buildWelcome(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    const dim = new PIXI.Graphics();
    dim.beginFill(COLORS.scrim, 0.42);
    dim.drawRect(0, 0, w, h);
    dim.endFill();
    this._welcome.addChild(dim);

    const card = makeLingGuideBubble({
      text: HOME_WELCOME_TIP,
      maxWidth: 400,
      portraitSize: 110,
      textSize: FONT_SIZE.md,
      footer: '点击继续 ›',
    });
    card.root.position.set(w / 2, Math.max(h * 0.42, Game.safeTop + 220));
    this._welcome.addChild(card.root);
    popIn(card.root, { fromScale: 0.88, duration: 0.3 });
    void ensureAssets([UI_GUIDE_IMAGES.xiaoling])
      .then(() => card.applyPortrait())
      .catch(() => { /* 降级纯文字 */ });

    // 全屏热区盖在卡上：点卡 / 点暗处都能翻到下一步
    const hit = new PIXI.Container();
    hit.eventMode = 'static';
    hit.hitArea = new PIXI.Rectangle(0, 0, w, h);
    hit.cursor = 'pointer';
    bindPointerTap(hit, () => this._showPoint());
    this._welcome.addChild(hit);
  }

  private _buildPoint(): void {
    this._point.eventMode = 'none';
    const { x, y } = this._deps.target;
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    this._fx.position.set(x, y);
    this._point.addChild(this._fx);

    const bubble = makeLingGuideBubble({ text: HOME_START_TIP });
    const bubbleX = Math.min(w - bubble.boxW / 2 - 24, Math.max(bubble.boxW / 2 + 24, x));
    const preferAbove = y - bubble.boxH / 2 - 78;
    const bubbleY = preferAbove > Game.safeTop + 90
      ? preferAbove
      : Math.min(h - 220, y + 110);
    bubble.root.position.set(bubbleX, bubbleY);
    this._point.addChild(bubble.root);
    void ensureAssets([UI_GUIDE_IMAGES.xiaoling])
      .then(() => bubble.applyPortrait())
      .catch(() => { /* 降级纯文字 */ });
  }

  private _showPoint(): void {
    if (this._page !== 'welcome' || this._destroyed) return;
    this._page = 'point';
    this._welcome.visible = false;
    this._welcome.eventMode = 'none';
    this._point.visible = true;
    popIn(this._point, { fromScale: 0.94, duration: 0.22 });
    analytics.trackTutorialStep(TUTORIAL_STEPS.homeWelcomeContinue);
    this._redrawFx();
  }

  private _update(): void {
    if (this._page !== 'point') return;
    this._elapsed += Game.ticker.deltaMS;
    this._redrawFx();
  }

  private _redrawFx(): void {
    const g = this._fx;
    g.clear();
    if (this._page !== 'point') return;
    const t = this._elapsed / 1000;
    const pulse = 1 + 0.08 * Math.sin(t * 5);

    g.lineStyle(6, 0xffd66b, 0.95);
    g.drawCircle(0, -4, 46 * pulse);
    g.lineStyle(3, 0xffffff, 0.55);
    g.drawCircle(0, -4, 58 * pulse);

    const hop = Math.sin(t * 6) * 8;
    const fy = -92 + hop;
    g.lineStyle(5, 0xffffff, 0.95);
    g.beginFill(0xffffff, 0.9);
    g.drawCircle(0, fy, 16);
    g.endFill();
    g.beginFill(0xffffff, 0.95);
    g.moveTo(-10, fy + 12);
    g.lineTo(10, fy + 12);
    g.lineTo(0, fy + 36);
    g.closePath();
    g.endFill();
  }
}
