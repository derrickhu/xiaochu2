/**
 * 局内点破气泡：不遮罩、不锁操作，说完一句就走。
 */
import * as PIXI from 'pixi.js';

import { analytics, TUTORIAL_STEPS } from '@/analytics';
import { UI_GUIDE_IMAGES } from '@/config/Assets';
import { ensureAssets } from '@/config/Subpackages';
import { PlayerData } from '@/game/PlayerData';
import { popIn } from '@/ui';
import { makeLingGuideBubble, type LingGuideBubble } from '@/ui/LingGuideBubble';
import type { CoachLine } from './battleCoach';

/** 够读完一句，拖珠会提前收 */
const HOLD_MS = 5200;

export class BattleCoachHint {
  private readonly _root = new PIXI.Container();
  private readonly _anchor: { x: number; y: number };
  private _bubble: LingGuideBubble | null = null;
  private _holdMs = 0;
  private _active = false;

  constructor(anchor: { x: number; y: number }) {
    this._anchor = anchor;
  }

  build(parent: PIXI.Container): void {
    this._root.eventMode = 'none';
    this._root.visible = false;
    parent.addChild(this._root);
    void ensureAssets([UI_GUIDE_IMAGES.xiaoling]).catch(() => { /* 降级纯文字 */ });
  }

  raise(parent: PIXI.Container): void {
    parent.addChild(this._root);
  }

  show(line: CoachLine): void {
    this._clearBubble();
    const bubble = makeLingGuideBubble({ text: line.text });
    bubble.root.position.set(this._anchor.x, this._anchor.y);
    this._root.addChild(bubble.root);
    this._bubble = bubble;
    this._root.visible = true;
    this._active = true;
    this._holdMs = 0;
    popIn(bubble.root, { fromScale: 0.9, duration: 0.22 });
    void ensureAssets([UI_GUIDE_IMAGES.xiaoling])
      .then(() => bubble.applyPortrait())
      .catch(() => { /* 没图也把字亮出来 */ });
    PlayerData.markTutorialDone(line.flag);
    analytics.trackTutorialStep(TUTORIAL_STEPS.coachHint, {
      topic: line.topic,
      kind: line.kind,
    });
  }

  /** 玩家又动手了：这句话的时机已经过了 */
  dismiss(): void {
    this._root.visible = false;
    this._active = false;
    this._clearBubble();
  }

  update(dt: number): void {
    if (!this._active) return;
    this._holdMs += dt * 1000;
    if (this._holdMs >= HOLD_MS) this.dismiss();
  }

  destroy(): void {
    this.dismiss();
    if (this._root.parent) this._root.parent.removeChild(this._root);
    this._root.destroy({ children: true });
  }

  private _clearBubble(): void {
    if (!this._bubble) return;
    const root = this._bubble.root;
    if (root.parent) root.parent.removeChild(root);
    root.destroy({ children: true });
    this._bubble = null;
  }
}
