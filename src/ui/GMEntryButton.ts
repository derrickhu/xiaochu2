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
    bindPointerTap(this, () => GMManager.openPanel());

    this._layout();
  }

  private _layout(): void {
    const w = 56;
    const h = 32;
    const pad = 10;
    // 避开微信右上角胶囊：放在胶囊左侧、垂直居中
    const x = Math.max(pad, Game.safeCapsuleLeft - w - pad);
    const capH = Math.max(28, Game.safeCapsuleBottom - Game.safeCapsuleTop);
    const y = Game.safeCapsuleTop + Math.round((capH - h) / 2);
    this.position.set(x, y);
  }

  private _syncVisible(): void {
    this.visible = GMManager.isEnabled;
  }
}
