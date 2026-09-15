/**
 * 新模式解锁通告：先说这是什么，再指给他看在哪。
 *
 * ── 为什么要有这一下 ──
 *
 * 秘境和通天塔按 game/featureGate.ts 的门在通关 1-4 / 1-8 后才出现在底栏。
 * 门本身是对的（新号进去只会被秒杀），但「底栏凭空多一格」对玩家是无解的：
 * 他不知道那是什么、不知道进去能拿什么、更不知道自己是因为通了哪一关才拿到的。
 * 少了这一句，把入口藏起来反而制造了新的困惑。
 *
 * 视觉语言刻意与 HomeStartGuide 完全一致（轻遮罩 → 小灵说话 → 圈选目标 → 点一下继续）：
 * 同一个游戏里「小灵出来说一句并圈一个东西」应当永远是同一套观感，
 * 玩家第二次见到时就已经知道该怎么处理它了。别为这一个场景再发明一套弹窗。
 *
 * 底线与 BattleDragHint 一致：不锁操作。点任意位置即收，收完就永久不再出现。
 */
import * as PIXI from 'pixi.js';

import { analytics } from '@/analytics';
import { UI_GUIDE_IMAGES } from '@/config/Assets';
import { ensureAssets } from '@/config/Subpackages';
import { Game } from '@/core/Game';
import { COLORS, FONT_SIZE, popIn } from '@/ui';
import { makeLingGuideBubble } from '@/ui/LingGuideBubble';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { markFeatureNoticeSeen, type FeatureGateDef } from '@/game/featureGate';

export interface FeatureUnlockGuideDeps {
  gate: FeatureGateDef;
  /** 底栏新格子的中心（buildBottomNav 的返回值，别自己算） */
  target: { x: number; y: number };
  /** 收起后回调：用于接着弹下一条待通告 */
  onDismiss?: () => void;
}

export class FeatureUnlockGuide {
  private readonly _deps: FeatureUnlockGuideDeps;
  private readonly _root = new PIXI.Container();
  private readonly _fx = new PIXI.Graphics();
  private _elapsed = 0;
  private _dismissed = false;
  private _destroyed = false;
  private _ticker = (): void => this._update();

  constructor(deps: FeatureUnlockGuideDeps) {
    this._deps = deps;
  }

  build(parent: PIXI.Container): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const { gate, target } = this._deps;

    parent.addChild(this._root);

    const dim = new PIXI.Graphics();
    dim.beginFill(COLORS.scrim, 0.42);
    dim.drawRect(0, 0, w, h);
    dim.endFill();
    this._root.addChild(dim);

    // 圈选在遮罩之上：底栏那一格要能透出来，玩家才知道说的是哪个
    this._fx.position.set(target.x, target.y);
    this._root.addChild(this._fx);

    const card = makeLingGuideBubble({
      text: gate.notice,
      maxWidth: 400,
      portraitSize: 110,
      textSize: FONT_SIZE.sm,
      footer: '点击继续 ›',
    });
    /*
     * 卡片放在屏幕中上部，且与被圈的底栏格子留出足够距离 ——
     * 压在圈上会把「说明」和「它在哪」这两件事叠成一团，等于两件都没讲清。
     */
    const cardY = Math.max(h * 0.38, Game.safeTop + 200);
    card.root.position.set(w / 2, Math.min(cardY, target.y - card.boxH / 2 - 90));
    this._root.addChild(card.root);
    popIn(card.root, { fromScale: 0.88, duration: 0.3 });
    void ensureAssets([UI_GUIDE_IMAGES.xiaoling])
      .then(() => card.applyPortrait())
      .catch(() => { /* 降级纯文字 */ });

    const hit = new PIXI.Container();
    hit.eventMode = 'static';
    hit.hitArea = new PIXI.Rectangle(0, 0, w, h);
    hit.cursor = 'pointer';
    bindPointerTap(hit, () => this.dismiss());
    this._root.addChild(hit);

    Game.ticker.add(this._ticker);
    this._redrawFx();
    analytics.track('feature_unlock_notice_shown', { feature: gate.id });
  }

  dismiss(): void {
    if (this._dismissed) return;
    this._dismissed = true;
    markFeatureNoticeSeen(this._deps.gate.id);
    analytics.track('feature_unlock_notice_tapped', { feature: this._deps.gate.id });
    const onDismiss = this._deps.onDismiss;
    this.destroy();
    onDismiss?.();
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    Game.ticker.remove(this._ticker);
    if (this._root.parent) this._root.parent.removeChild(this._root);
    this._root.destroy({ children: true });
  }

  private _update(): void {
    this._elapsed += Game.ticker.deltaMS;
    this._redrawFx();
  }

  /** 脉冲金环 + 向下指的箭头（与 HomeStartGuide 同一套，方向朝底栏） */
  private _redrawFx(): void {
    const g = this._fx;
    g.clear();
    const t = this._elapsed / 1000;
    const pulse = 1 + 0.08 * Math.sin(t * 5);

    g.lineStyle(6, 0xffd66b, 0.95);
    g.drawCircle(0, 0, 62 * pulse);
    g.lineStyle(3, 0xffffff, 0.55);
    g.drawCircle(0, 0, 76 * pulse);

    const hop = Math.sin(t * 6) * 8;
    const fy = -122 - hop;
    g.lineStyle(0);
    g.beginFill(0xffffff, 0.95);
    g.drawCircle(0, fy, 16);
    g.endFill();
    g.beginFill(0xffffff, 0.95);
    g.moveTo(-10, fy + 24);
    g.lineTo(10, fy + 24);
    g.lineTo(0, fy + 48);
    g.closePath();
    g.endFill();
  }
}
