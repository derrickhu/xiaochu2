/**
 * 战斗特效层：粒子 / 飘字 / 弹道 / 震屏 / 全屏闪光 / 技能横幅。
 *
 * 拥有并管理所有「表现层」显示对象与对象池，向编排者（BattleScene）暴露语义化方法，
 * 不依赖战斗数据（BattleController）。z 序由 build() 按调用顺序加入父容器决定。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { TextureCache } from '@/core/TextureCache';
import { ObjectPool } from '@/core/ObjectPool';
import { FxLayer, type BurstOptions } from '@/core/FxLayer';
import { ScreenShake } from '@/core/ScreenShake';
import { FlashOverlay } from '@/core/FlashOverlay';
import { UI, ORB_COLOR } from '@/balance/ui';
import type { Element } from '@/balance/combat';
import { ORB_IMAGES } from '@/config/Assets';
import {
  applyDmgRenderStyle,
  buildPetDmgLabel,
  createPetDamageFloatRuntime,
  DMG_MOTION,
  PET_FLOAT_CFG,
  petSlotDamageAnchor,
  resolvePetDmgStyleKey,
  SLOT_ATTR_PALETTE,
  type PetDamageFloatRuntime,
  type PetDmgStyleKey,
} from './damageFloatStyle';

export interface PetDamageFloatOpts {
  slotX: number;
  slotY: number;
  element: Element;
  damage: number;
  isCrit?: boolean;
  counter?: 1 | 0 | -1;
  /** 同回合多段出手时的横向/时序错开 */
  orderIdx?: number;
  /** 技能伤害：仅数字、scale 1.04 */
  skill?: boolean;
  /** 多段次要命中 */
  minor?: boolean;
  lane?: 'main' | 'minorUpper' | 'minorLower';
}

export class BattleFx {
  private _fx!: FxLayer;
  private _shake!: ScreenShake;
  private _flash!: FlashOverlay;
  private _floatLayer!: PIXI.Container;
  private _floatPool!: ObjectPool<PIXI.Text>;
  private _petDmgPool!: ObjectPool<PIXI.Text>;
  private _petDmgRuntimes: PetDamageFloatRuntime[] = [];

  /** 创建并按 z 序加入父容器：粒子层（最底）→ 飘字层 → 全屏闪光（最顶）。 */
  build(parent: PIXI.Container, w: number, h: number): void {
    this._fx = new FxLayer();
    parent.addChild(this._fx.container);

    this._floatLayer = new PIXI.Container();
    parent.addChild(this._floatLayer);

    this._flash = new FlashOverlay(w, h);
    parent.addChild(this._flash.container);

    this._shake = new ScreenShake(parent);

    this._floatPool = new ObjectPool<PIXI.Text>({
      create: () => {
        const t = new PIXI.Text('', {
          fontSize: 40, fill: 0xffffff, fontWeight: 'bold',
          stroke: 0x000000, strokeThickness: 4,
        });
        t.anchor.set(0.5);
        return t;
      },
      onGet: (t) => {
        t.visible = true;
        t.alpha = 1;
        t.scale.set(1);
      },
      onRelease: (t) => {
        TweenManager.cancelTarget(t);
        t.visible = false;
        if (t.parent) t.parent.removeChild(t);
      },
      maxSize: 24,
      onDiscard: (t) => t.destroy(),
    });

    this._petDmgPool = new ObjectPool<PIXI.Text>({
      create: () => {
        const t = new PIXI.Text('', { fontSize: 42, fill: 0xffffff });
        t.anchor.set(0.5, 0.5);
        return t;
      },
      onGet: (t) => {
        t.visible = true;
        t.alpha = 1;
        t.scale.set(1);
      },
      onRelease: (t) => {
        t.visible = false;
        if (t.parent) t.parent.removeChild(t);
      },
      maxSize: 16,
      onDiscard: (t) => t.destroy(),
    });
  }

  update(dt: number): void {
    this._fx.update(dt);
    this._shake.update(dt);
    for (let i = this._petDmgRuntimes.length - 1; i >= 0; i--) {
      const rt = this._petDmgRuntimes[i];
      if (rt.update(dt)) {
        this._petDmgPool.release(rt.text);
        this._petDmgRuntimes.splice(i, 1);
      }
    }
  }

  destroy(): void {
    this._petDmgRuntimes.length = 0;
    this._floatPool?.clear();
    this._petDmgPool?.clear();
    this._fx?.destroy();
    this._flash?.destroy();
    this._shake?.reset();
  }

  // ── 基础表现 ──

  burst(opts: BurstOptions): void {
    this._fx.burst(opts);
  }

  flash(color: number, duration: number, alpha: number): void {
    this._flash.flash(color, duration, alpha);
  }

  shakeLight(): void { this._shake.light(); }
  shakeMedium(): void { this._shake.medium(); }
  shakeHeavy(): void { this._shake.heavy(); }

  /** 把外部构造的临时显示对象挂到飘字层（如开场推荐解法横幅） */
  addFloatChild(obj: PIXI.Container): void {
    this._floatLayer.addChild(obj);
  }

  /** 通用飘字（回血 / 受击等） */
  spawnFloat(text: string, x: number, y: number, color: number, scale = 1): void {
    const t = this._floatPool.get();
    t.text = text;
    t.style.fill = color;
    t.style.fontSize = 36;
    t.style.strokeThickness = 5;
    t.position.set(x, y);
    t.scale.set(scale);
    this._floatLayer.addChild(t);
    TweenManager.to({
      target: t, props: { y: y - 70, alpha: 0 },
      duration: UI.anim.damageFloat, ease: Ease.easeOutQuad,
      onComplete: () => this._floatPool.release(t),
    });
  }

  /** 宠物槽位伤害飘字 — 样式/运动对齐 xiao_chu slotDamageMain / slotDamageCrit */
  spawnPetDamageFloat(opts: PetDamageFloatOpts): void {
    const {
      slotX, slotY, element, damage, isCrit = false,
      orderIdx = 0, skill = false, minor = false,
      lane = minor ? (orderIdx === 0 ? 'minorUpper' : 'minorLower') : 'main',
    } = opts;

    const styleKey: PetDmgStyleKey = resolvePetDmgStyleKey(isCrit && !minor, minor);
    const palette = SLOT_ATTR_PALETTE[element];
    const motion = DMG_MOTION[styleKey];
    const baseScale = skill ? PET_FLOAT_CFG.skill.scale : PET_FLOAT_CFG.normalAtk.scale;
    const anchor = petSlotDamageAnchor(slotX, slotY, lane);
    const x = anchor.x + (minor ? (orderIdx - 0.5) * PET_FLOAT_CFG.multiHit.xStep : 0);
    const y = anchor.y;

    const t = this._petDmgPool.get();
    t.text = buildPetDmgLabel(element, damage);
    applyDmgRenderStyle(t, styleKey, palette);
    this._floatLayer.addChild(t);

    const delayFrames = minor
      ? orderIdx * 3
      : Math.max(0, orderIdx) * PET_FLOAT_CFG.normalAtk.delayStep;

    this._petDmgRuntimes.push(createPetDamageFloatRuntime({
      text: t,
      baseX: x,
      baseY: y,
      baseScale,
      styleKey,
      motion,
      delayFrames,
    }));

    if (isCrit && !minor) this.shakeLight();
  }

  /** 属性色弹道：珠子贴图 + 拖尾粒子，从起点飞向终点（宠物 / 敌人共用） */
  fireProjectileBetween(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    element: Element,
    opts?: { size?: number; duration?: number; heavy?: boolean },
  ): Promise<void> {
    return new Promise((resolve) => {
      const heavy = opts?.heavy ?? false;
      const color = ORB_COLOR[element];
      const size = opts?.size ?? (heavy ? 56 : 48);
      const duration = opts?.duration ?? UI.anim.projectile;
      const tex = TextureCache.get(ORB_IMAGES[element]);
      const p = new PIXI.Sprite(tex ?? PIXI.Texture.WHITE);
      p.anchor.set(0.5);
      p.width = size;
      p.height = size;
      if (!tex) p.tint = color;
      p.position.set(fromX, fromY);
      this._fx.container.addChild(p);

      let frame = 0;
      TweenManager.to({
        target: p, props: { x: toX, y: toY },
        duration, ease: Ease.easeInQuad,
        onUpdate: () => {
          if (++frame % 2 === 0) {
            this._fx.burst({
              x: p.x, y: p.y, color,
              count: heavy ? 2 : 1,
              speed: heavy ? 55 : 40,
              gravity: 0,
              size: heavy ? 16 : 12,
              life: 0.22,
              alpha: 0.85,
            });
          }
        },
        onComplete: () => {
          this._fx.burst({
            x: toX, y: toY, color,
            count: heavy ? 10 : 6,
            speed: heavy ? 320 : 240,
            size: heavy ? 16 : 12,
            life: 0.35,
          });
          p.destroy();
          resolve();
        },
      });
    });
  }

  /** 技能名横幅：放大弹入 → 短暂停留 → 淡出 */
  showSkillBanner(name: string, color: number): Promise<void> {
    return new Promise((resolve) => {
      const t = new PIXI.Text(name, {
        fontSize: 64, fill: color, fontWeight: 'bold',
        stroke: 0x1a1126, strokeThickness: 7,
      });
      t.anchor.set(0.5);
      t.position.set(Game.logicWidth / 2, Game.logicHeight * 0.42);
      t.scale.set(1.8);
      t.alpha = 0;
      this._floatLayer.addChild(t);
      TweenManager.to({
        target: t, props: { alpha: 1 },
        duration: UI.anim.comboPop,
      });
      TweenManager.to({
        target: t.scale, props: { x: 1, y: 1 },
        duration: UI.anim.comboPop, ease: Ease.easeOutBack,
        onComplete: () => {
          TweenManager.to({
            target: t, props: { alpha: 0, y: t.y - 40 },
            duration: UI.anim.skillBanner * 0.4, delay: UI.anim.skillBanner * 0.35,
            ease: Ease.easeOutQuad,
            onComplete: () => {
              t.destroy();
              resolve();
            },
          });
        },
      });
    });
  }
}
