/**
 * 全局 GM 入口（开发者工具 + GM 已激活时显示）
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { EventBus } from '@/core/EventBus';
import { GMManager } from '@/core/GMManager';
import { FONT_FAMILY } from './theme';
import { bindPointerTap } from '@/utils/bindPointerTap';

export class GMEntryButton extends PIXI.Container {
  constructor() {
    super();
    this.zIndex = 8500;
    this._build();
    this._syncVisible();
    EventBus.on('gm:activated', () => this._syncVisible());
  }

  private _build(): void {
    const w = 56;
    const h = 32;
    const g = new PIXI.Graphics();
    g.beginFill(0xc81e3c, 0.88);
    g.lineStyle(1.5, 0xff6688, 1);
    g.drawRoundedRect(0, 0, w, h, 8);
    g.endFill();
    this.addChild(g);

    const label = new PIXI.Text('GM', {
      fontSize: 16, fill: 0xffffff, fontFamily: FONT_FAMILY, fontWeight: 'bold',
    });
    label.anchor.set(0.5);
    label.position.set(w / 2, h / 2);
    this.addChild(label);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    // 显式 hitArea：小游戏 tap 走自绘 hitTest，缺了它会回退到 getLocalBounds()，
    // 边缘几像素容易判不中，点击就漏到下层（战斗里下层是全宽点怪热区）
    this.hitArea = new PIXI.Rectangle(0, 0, w, h);
    this.interactiveChildren = false;
    bindPointerTap(this, () => GMManager.openPanel());

    this._layout();
  }

  private _layout(): void {
    const w = 56;
    const gap = 6;
    const inset = 8;
    // 贴屏幕右缘、胶囊正下方，避开章节左右箭头
    const x = Math.max(8, Game.logicWidth - w - inset);
    const y = Game.safeCapsuleBottom + gap;
    this.position.set(x, y);
  }

  private _syncVisible(): void {
    this.visible = GMManager.isEnabled;
  }
}
