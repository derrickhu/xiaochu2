/**
 * 全屏闪光层（引擎级，零业务依赖）
 *
 * 已关闭实际闪光：战斗里全屏白/彩闪观感差（震光）。
 * 保留 API 与挂载，避免调用方改动；clear/destroy 仍可用。
 */
import * as PIXI from 'pixi.js';
import { TweenManager } from './TweenManager';

export class FlashOverlay {
  readonly container = new PIXI.Container();

  private readonly _rect: PIXI.Sprite;

  constructor(width: number, height: number) {
    this._rect = new PIXI.Sprite(PIXI.Texture.WHITE);
    this._rect.width = width;
    this._rect.height = height;
    this._rect.alpha = 0;
    this.container.addChild(this._rect);
    this.container.eventMode = 'none';
    this.container.visible = false;
  }

  /** 全屏闪光已关闭 */
  flash(_color: number, _peakAlpha = 0.3, _duration = 0.3): void {
    // no-op
  }

  clear(): void {
    TweenManager.cancelTarget(this._rect);
    this._rect.alpha = 0;
    this.container.visible = false;
  }

  destroy(): void {
    TweenManager.cancelTarget(this._rect);
    this.container.destroy({ children: true });
  }
}
