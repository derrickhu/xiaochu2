/**
 * 震屏工具（引擎级，零业务依赖）
 *
 * 位移目标容器（通常是场景根容器）制造震感，由宿主场景每帧 update(dt) 驱动。
 * 多次叠加时取较强的一次（避免连续小震覆盖大震）。
 */
import * as PIXI from 'pixi.js';

export class ScreenShake {
  private readonly _target: PIXI.Container;
  private readonly _baseX: number;
  private readonly _baseY: number;

  private _timeLeft = 0;
  private _duration = 0;
  private _intensity = 0;

  constructor(target: PIXI.Container) {
    this._target = target;
    this._baseX = target.x;
    this._baseY = target.y;
  }

  /** @param intensity 最大偏移（设计像素） @param duration 持续秒数 */
  shake(intensity: number, duration: number): void {
    // 已有更强的震动在进行时不被弱震打断
    if (this._timeLeft > 0 && this._intensity * (this._timeLeft / this._duration) > intensity) {
      return;
    }
    this._intensity = intensity;
    this._duration = duration;
    this._timeLeft = duration;
  }

  light(): void {
    this.shake(5, 0.12);
  }

  medium(): void {
    this.shake(11, 0.22);
  }

  heavy(): void {
    this.shake(20, 0.32);
  }

  update(dt: number): void {
    if (this._timeLeft <= 0) return;
    this._timeLeft -= dt;
    if (this._timeLeft <= 0 || this._target.destroyed) {
      this._timeLeft = 0;
      if (!this._target.destroyed) {
        this._target.position.set(this._baseX, this._baseY);
      }
      return;
    }
    // 线性衰减 + 随机方向
    const decay = this._timeLeft / this._duration;
    const amp = this._intensity * decay;
    this._target.position.set(
      this._baseX + (Math.random() * 2 - 1) * amp,
      this._baseY + (Math.random() * 2 - 1) * amp,
    );
  }

  /** 立即停止并复位 */
  reset(): void {
    this._timeLeft = 0;
    if (!this._target.destroyed) {
      this._target.position.set(this._baseX, this._baseY);
    }
  }
}
