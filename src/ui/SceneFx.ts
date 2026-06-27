/**
 * 非战斗场景的特效宿主：薄封装引擎级 FxLayer（粒子）+ FlashOverlay（全屏闪光）+ ScreenShake（震屏）。
 *
 * 用法：场景 onEnter 时 build(container, w, h)；在 Scene.update(dt) 里调 update(dt)
 * （SceneManager 已统一驱动 current.update）；onExit 时 destroy()。
 *
 * 与战斗的 BattleFx 区别：去掉弹道/飘字池等战斗语义，只保留通用粒子/闪光/震屏，供抽卡/养成等页复用。
 */
import * as PIXI from 'pixi.js';
import { FxLayer, type BurstOptions } from '@/core/FxLayer';
import { FlashOverlay } from '@/core/FlashOverlay';
import { ScreenShake } from '@/core/ScreenShake';

export class SceneFx {
  private _fx: FxLayer | null = null;
  private _flash: FlashOverlay | null = null;
  private _shake: ScreenShake | null = null;

  /**
   * 创建并按 z 序加入父容器：粒子层 → 全屏闪光（最顶）。
   * 震屏作用于 shakeTarget（通常是场景根容器），不传则不启用震屏。
   */
  build(parent: PIXI.Container, w: number, h: number, shakeTarget?: PIXI.Container): void {
    if (parent.destroyed) return;
    // 同实例重复 build 时先清旧层，避免 parent 上残留已 destroy 的子节点
    this.destroy();

    this._fx = new FxLayer();
    parent.addChild(this._fx.container);

    this._flash = new FlashOverlay(w, h);
    parent.addChild(this._flash.container);

    if (shakeTarget) this._shake = new ScreenShake(shakeTarget);
  }

  update(dt: number): void {
    this._fx?.update(dt);
    this._shake?.update(dt);
  }

  destroy(): void {
    this._fx?.destroy();
    this._flash?.destroy();
    this._shake?.reset();
    this._fx = null;
    this._flash = null;
    this._shake = null;
  }

  burst(opts: BurstOptions): void {
    this._fx?.burst(opts);
  }

  flash(color: number, peakAlpha = 0.3, duration = 0.3): void {
    this._flash?.flash(color, peakAlpha, duration);
  }

  shakeLight(): void { this._shake?.light(); }
  shakeMedium(): void { this._shake?.medium(); }
  shakeHeavy(): void { this._shake?.heavy(); }

  /** 暴露粒子层供需要直接挂临时 sprite 的演出使用（如抽卡光柱/法阵）。 */
  get fxContainer(): PIXI.Container | null {
    return this._fx ? this._fx.container : null;
  }
}
