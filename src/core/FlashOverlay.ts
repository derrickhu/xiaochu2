/**
 * 全屏闪光层（引擎级，零业务依赖）
 *
 * 白色矩形 + tint 着色 + alpha 补间，用于：
 * - 高 Combo / 技能释放的属性色全屏闪
 * - 英雄受击的红色警示闪
 * 挂在场景最上层，eventMode = none 不拦截触摸。
 */
import * as PIXI from 'pixi.js';
import { TweenManager, Ease } from './TweenManager';

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
  }

  /** 闪一下：瞬间到峰值 alpha，再衰减到 0 */
  flash(color: number, peakAlpha = 0.3, duration = 0.3): void {
    TweenManager.cancelTarget(this._rect);
    this._rect.tint = color;
    this._rect.alpha = peakAlpha;
    TweenManager.to({
      target: this._rect, props: { alpha: 0 },
      duration, ease: Ease.easeOutQuad,
    });
  }

  destroy(): void {
    TweenManager.cancelTarget(this._rect);
    this.container.destroy({ children: true });
  }
}
