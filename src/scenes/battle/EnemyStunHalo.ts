/**
 * 敌人眩晕常驻头顶环 —— 业界（PAD / 消除 RPG / 回合制）共识：
 * 控制态必须在立绘头顶持续可见，不能只靠施法瞬间飘字或名旁小图标。
 *
 * 设计：
 * - 3 颗星绕椭圆轨道旋转（透视压扁），眩晕整段期间常亮
 * - 不叠「晕 N」文案（名旁状态图标已有回合数，头顶只做图形信号）
 * - 锚在立绘额头偏上，并夹在关卡匾下沿以下
 * - 旋转用 update(dt) 驱动，微信真机不走 rotation tween
 */
import * as PIXI from 'pixi.js';
import type { BattleController } from '@/game/battle/BattleController';
import type { BattleLayout } from './BattleLayout';
import { applyTextResolution } from '@/ui/text';
import { displayAlive } from '@/core/animationGuard';

const STAR_COUNT = 3;
const ORBIT_RX = 78;
const ORBIT_RY = 30;
const STAR_SIZE = 52;
const SPIN_RAD_PER_SEC = 2.2;
const COLOR = 0xffd54f;
const COLOR_SOFT = 0xfff59d;
/** 环心到轨道上沿的大致高度，用于顶栏避让 */
const HALO_TOP_PAD = ORBIT_RY + STAR_SIZE * 0.55 + 6;

export class EnemyStunHalo {
  private _root = new PIXI.Container();
  private _orbit = new PIXI.Container();
  private _stars: PIXI.Text[] = [];
  private _angle = 0;
  private _shown = false;
  private _pulse = 0;

  build(parent: PIXI.Container): void {
    this._root.visible = false;
    this._root.alpha = 0;
    parent.addChild(this._root);

    // 只留转星，不加椭圆底色——暗底会在立绘上糊出一块脏斑
    this._orbit = new PIXI.Container();
    this._root.addChild(this._orbit);
    for (let i = 0; i < STAR_COUNT; i++) {
      const star = applyTextResolution(new PIXI.Text('✦', {
        fontSize: STAR_SIZE,
        fill: i === 0 ? COLOR_SOFT : COLOR,
        fontWeight: 'bold',
        stroke: 0x3a2808,
        strokeThickness: 6,
      }));
      star.anchor.set(0.5);
      this._stars.push(star);
      this._orbit.addChild(star);
    }
    this._placeStars(0);
  }

  /** 与状态库对账：有眩晕则亮，无则灭；位置贴立绘额头偏上并避开关卡匾 */
  sync(ctrl: BattleController, layout: BattleLayout): void {
    if (!displayAlive(this._root)) return;
    const stun = ctrl.statuses.find((s) => s.owner === 'enemy' && s.kind === 'stun');
    const want = !!stun && (stun.turnsLeft ?? 0) > 0;
    this._root.position.set(layout.enemyCenterX, this._headY(layout));

    if (want) {
      if (!this._shown) {
        this._shown = true;
        this._root.visible = true;
        this._root.alpha = 0;
        this._root.scale.set(0.75);
        this._pulse = 0.35;
      }
    } else if (this._shown) {
      this._shown = false;
      this._pulse = 0;
      this._root.alpha = 0;
      this._root.visible = false;
      this._root.scale.set(1);
    }
  }

  /** 敌人因眩晕跳过回合时轻轻弹一下 */
  pulseSkip(): void {
    if (!this._shown || !displayAlive(this._root)) return;
    this._pulse = 0.45;
  }

  update(dt: number): void {
    if (!this._shown || !displayAlive(this._root)) return;
    this._angle += dt * SPIN_RAD_PER_SEC;
    this._placeStars(this._angle);

    if (this._pulse > 0) {
      this._pulse = Math.max(0, this._pulse - dt);
      const t = 1 - this._pulse / 0.45;
      const pop = t < 0.35
        ? 0.75 + (t / 0.35) * 0.5
        : 1.25 - ((t - 0.35) / 0.65) * 0.25;
      this._root.scale.set(pop);
      this._root.alpha = Math.min(1, t / 0.2);
    } else {
      this._root.scale.set(1);
      this._root.alpha = 1;
      const breath = 1 + Math.sin(this._angle * 1.6) * 0.05;
      this._orbit.scale.set(breath);
    }
  }

  destroy(): void {
    if (!this._root.destroyed) this._root.destroy({ children: true });
    this._stars = [];
  }

  /**
   * 环心落在立绘上半偏上（约 16%），并保证整环不超过 spriteZoneTop。
   */
  private _headY(layout: BattleLayout): number {
    const zoneH = Math.max(120, layout.spriteZoneBottom - layout.spriteZoneTop);
    const preferred = layout.spriteZoneTop + zoneH * 0.16;
    const minY = layout.spriteZoneTop + HALO_TOP_PAD;
    const maxY = layout.enemyCenterY - 24;
    return Math.max(minY, Math.min(maxY, preferred));
  }

  private _placeStars(baseAngle: number): void {
    for (let i = 0; i < this._stars.length; i++) {
      const a = baseAngle + (i / STAR_COUNT) * Math.PI * 2;
      const star = this._stars[i];
      star.position.set(Math.cos(a) * ORBIT_RX, Math.sin(a) * ORBIT_RY);
      const depth = (Math.sin(a) + 1) * 0.5;
      star.scale.set(0.9 + depth * 0.35);
      star.alpha = 0.7 + depth * 0.3;
    }
  }
}
