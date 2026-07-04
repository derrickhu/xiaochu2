/**
 * 战斗特效层：粒子 / 飘字 / 弹道 / 震屏 / 全屏闪光 / 技能横幅。
 *
 * 拥有并管理所有「表现层」显示对象与对象池，向编排者（BattleScene）暴露语义化方法，
 * 不依赖战斗数据（BattleController）。z 序由 build() 按调用顺序加入父容器决定。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { guardedTween, minigameFallback, once, displayAlive, readScale, setScaleSafe, tweenScale } from '@/core/animationGuard';
import { TextureCache } from '@/core/TextureCache';
import { ObjectPool } from '@/core/ObjectPool';
import { FxLayer, type BurstOptions } from '@/core/FxLayer';
import { ScreenShake } from '@/core/ScreenShake';
import { FlashOverlay } from '@/core/FlashOverlay';
import { UI, ORB_COLOR } from '@/balance/ui';
import type { Element } from '@/balance/combat';
import { ORB_IMAGES, UI_FX_IMAGES } from '@/config/Assets';
import {
  applyDmgRenderStyle,
  buildPetDmgLabel,
  createPetDamageFloatRuntime,
  dmgFloatScale,
  DMG_MOTION,
  enemyDamageAnchor,
  formatDmgNumber,
  PET_FLOAT_CFG,
  petSlotDamageAnchor,
  resolveEnemyDmgStyleKey,
  resolvePetDmgStyleKey,
  resolveTurnTotalTier,
  type PetDamageFloatRuntime,
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

/** 打在敌人身上的单段伤害飘字 */
export interface EnemyHitDamageOpts {
  enemyX: number;
  enemyY: number;
  element: Element;
  damage: number;
  isCrit?: boolean;
  counter?: 1 | 0 | -1;
  orderIdx?: number;
  /** 本回合总出手段数，用于错位 */
  hitCount?: number;
  minor?: boolean;
  skill?: boolean;
}

export interface TurnTotalDamageOpts {
  total: number;
  combo: number;
  hitCount: number;
  x: number;
  y: number;
  enemyMaxHp: number;
}

type ScopedPetDamageRuntime = PetDamageFloatRuntime & { scopeId: number; onDone?: () => void };

export class BattleFx {
  private _fx!: FxLayer;
  private _shake!: ScreenShake;
  private _flash!: FlashOverlay;
  private _floatLayer!: PIXI.Container;
  private _floatPool!: ObjectPool<PIXI.Text>;
  private _petDmgPool!: ObjectPool<PIXI.Text>;
  private _petDmgRuntimes: ScopedPetDamageRuntime[] = [];
  private _scopeId = 0;
  private readonly _activeFloats = new Map<PIXI.Text, number>();
  private readonly _scopeChildren = new Map<PIXI.Container, number>();
  private readonly _projectiles = new Map<PIXI.Sprite, number>();

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
        t.style.dropShadow = false;
        setScaleSafe(t, 1);
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
        t.style.dropShadow = false;
        setScaleSafe(t, 1);
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
      if (!displayAlive(rt.text) || rt.scopeId !== this._scopeId) {
        if (displayAlive(rt.text)) this._petDmgPool.release(rt.text);
        rt.onDone?.();
        this._petDmgRuntimes.splice(i, 1);
        continue;
      }
      if (rt.update(dt)) {
        rt.onDone?.();
        this._petDmgPool.release(rt.text);
        this._petDmgRuntimes.splice(i, 1);
      }
    }
  }

  destroy(): void {
    this._petDmgRuntimes.length = 0;
    for (const p of this._projectiles.keys()) {
      TweenManager.cancelTarget(p);
      if (!p.destroyed) p.destroy();
    }
    this._projectiles.clear();
    this._floatPool?.clear();
    this._petDmgPool?.clear();
    this._fx?.destroy();
    this._flash?.destroy();
    this._shake?.reset();
  }

  /** 开始一段新的临时特效作用域；旧作用域全部失效。 */
  beginTransientScope(): number {
    this._scopeId++;
    this.clearTransient(this._scopeId - 1);
    return this._scopeId;
  }

  /** 回合/战斗收尾：清理某个 scope 内所有不应跨回合残留的表现层对象。 */
  clearTransient(scopeId = this._scopeId): void {
    for (const rt of this._petDmgRuntimes) {
      if (rt.scopeId === scopeId) {
        this._petDmgPool.release(rt.text);
        rt.onDone?.();
      }
    }
    this._petDmgRuntimes = this._petDmgRuntimes.filter(rt => rt.scopeId !== scopeId);

    for (const [p, pScope] of Array.from(this._projectiles.entries())) {
      if (pScope !== scopeId) continue;
      TweenManager.cancelTarget(p);
      if (!p.destroyed) p.destroy();
      this._projectiles.delete(p);
    }

    for (const [t, tScope] of Array.from(this._activeFloats.entries())) {
      if (tScope !== scopeId) continue;
      this._activeFloats.delete(t);
      this._floatPool.release(t);
    }

    for (const [child, childScope] of Array.from(this._scopeChildren.entries())) {
      if (childScope !== scopeId) continue;
      this._scopeChildren.delete(child);
      if (displayAlive(child)) {
        TweenManager.cancelTarget(child);
        const childScale = readScale(child);
        if (childScale) TweenManager.cancelTarget(childScale);
        child.destroy({ children: true });
      }
    }

    this._fx.clear();
    this._flash.clear();
    this._shake.reset();
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
    this._scopeChildren.set(obj, this._scopeId);
    this._floatLayer.addChild(obj);
  }

  /** 通用飘字（回血 / 受击等） */
  spawnFloat(text: string, x: number, y: number, color: number, scale = 1): void {
    const scopeId = this._scopeId;
    const t = this._floatPool.get();
    t.text = text;
    t.style.fill = color;
    t.style.fontSize = 36;
    t.style.strokeThickness = 5;
    t.position.set(x, y);
    setScaleSafe(t, scale);
    this._activeFloats.set(t, scopeId);
    this._floatLayer.addChild(t);
    TweenManager.to({
      target: t, props: { y: y - 70, alpha: 0 },
      duration: UI.anim.damageFloat, ease: Ease.easeOutQuad,
      onComplete: () => {
        if (this._activeFloats.get(t) !== scopeId) return;
        this._activeFloats.delete(t);
        this._floatPool.release(t);
      },
    });
  }

  /** 宠物槽位伤害飘字（兼容旧路径） */
  spawnPetDamageFloat(opts: PetDamageFloatOpts): void {
    const {
      slotX, slotY, element, damage, isCrit = false, counter = 0,
      orderIdx = 0, skill = false, minor = false,
      lane = minor ? (orderIdx === 0 ? 'minorUpper' : 'minorLower') : 'main',
    } = opts;
    const anchor = petSlotDamageAnchor(slotX, slotY, lane);
    const x = anchor.x + (minor ? (orderIdx - 0.5) * PET_FLOAT_CFG.multiHit.xStep : 0);
    this._pushDamageFloat({
      x,
      y: anchor.y,
      element,
      damage,
      isCrit,
      counter,
      orderIdx,
      skill,
      minor,
      onEnemy: false,
    });
  }

  /** 命中敌人时的伤害数字（主路径） */
  spawnEnemyHitDamage(opts: EnemyHitDamageOpts): void {
    if (opts.damage <= 0) return;
    const hitCount = opts.hitCount ?? 1;
    const orderIdx = opts.orderIdx ?? 0;
    const anchor = enemyDamageAnchor(opts.enemyX, opts.enemyY, orderIdx, hitCount);
    this._pushDamageFloat({
      x: anchor.x,
      y: anchor.y,
      element: opts.element,
      damage: opts.damage,
      isCrit: opts.isCrit ?? false,
      counter: opts.counter ?? 0,
      orderIdx,
      skill: opts.skill ?? false,
      minor: opts.minor ?? false,
      onEnemy: true,
    });
  }

  /**
   * 本回合总伤害：与单段伤害同款飘字动画，上方保留「总伤害」说明文字。
   */
  showTurnTotalDamage(opts: TurnTotalDamageOpts): Promise<void> {
    const { total, combo, hitCount, x, y, enemyMaxHp } = opts;
    if (total <= 0) return Promise.resolve();

    const tier = resolveTurnTotalTier(total, combo, hitCount, enemyMaxHp);
    const isHighTier = tier === 'mega' || tier === 'high';
    const styleKey = (isHighTier ? 'enemyHitCrit' : 'enemyHitMain') as 'enemyHitCrit' | 'enemyHitMain';
    const motion = DMG_MOTION[styleKey];
    const baseScale = PET_FLOAT_CFG.normalAtk.scale;
    const S = dmgFloatScale();
    const caption = '总伤害';
    const captionY = y - 40 * S;

    return new Promise((resolve) => {
      let pending = 2;
      const done = (): void => {
        pending -= 1;
        if (pending <= 0) resolve();
      };

      const captionText = this._petDmgPool.get();
      captionText.text = caption;
      applyDmgRenderStyle(captionText, 'slotDamageMinor', 'totalCaption');
      captionText.style.fontSize = (captionText.style.fontSize as number) * 1.45;
      this._floatLayer.addChild(captionText);

      const numText = this._petDmgPool.get();
      numText.text = formatDmgNumber(total);
      applyDmgRenderStyle(numText, styleKey, 'total');
      numText.style.fontSize = (numText.style.fontSize as number) * 1.08;
      this._floatLayer.addChild(numText);

      if (isHighTier) this.shakeLight();

      const floatOpts = { baseX: x, baseScale, styleKey, motion };
      this._petDmgRuntimes.push({
        ...createPetDamageFloatRuntime({
          ...floatOpts,
          text: captionText,
          baseY: captionY,
        }),
        scopeId: this._scopeId,
        onDone: done,
      });
      this._petDmgRuntimes.push({
        ...createPetDamageFloatRuntime({
          ...floatOpts,
          text: numText,
          baseY: y,
        }),
        scopeId: this._scopeId,
        onDone: done,
      });
    });
  }

  private _pushDamageFloat(opts: {
    x: number;
    y: number;
    element: Element;
    damage: number;
    isCrit: boolean;
    counter: 1 | 0 | -1;
    orderIdx: number;
    skill: boolean;
    minor: boolean;
    onEnemy: boolean;
  }): void {
    const {
      x, y, element, damage, isCrit, counter, orderIdx, skill, minor, onEnemy,
    } = opts;
    const styleKey = onEnemy
      ? resolveEnemyDmgStyleKey(isCrit && !minor, minor)
      : resolvePetDmgStyleKey(isCrit && !minor, minor);
    const motion = DMG_MOTION[styleKey];
    const baseScale = skill ? PET_FLOAT_CFG.skill.scale : PET_FLOAT_CFG.normalAtk.scale;
    const isCounter = counter === 1 && !minor;

    const t = this._petDmgPool.get();
    t.text = buildPetDmgLabel(element, damage);
    applyDmgRenderStyle(t, styleKey, undefined, { counter: isCounter });
    if (onEnemy && !minor) {
      t.style.fontSize = (t.style.fontSize as number) * 1.08;
    }
    this._floatLayer.addChild(t);

    const delayFrames = minor
      ? orderIdx * 3
      : Math.max(0, orderIdx) * PET_FLOAT_CFG.normalAtk.delayStep;

    this._petDmgRuntimes.push({
      ...createPetDamageFloatRuntime({
        text: t,
        baseX: x,
        baseY: y,
        baseScale,
        styleKey,
        motion,
        delayFrames,
      }),
      scopeId: this._scopeId,
    });

    if (isCounter) {
      const mark = this._petDmgPool.get();
      mark.text = '克';
      applyDmgRenderStyle(mark, 'slotDamageMinor', 'counterMark');
      this._floatLayer.addChild(mark);
      this._petDmgRuntimes.push({
        ...createPetDamageFloatRuntime({
          text: mark,
          baseX: x + t.width / 2 + 12,
          baseY: y - 16,
          baseScale,
          styleKey: 'slotDamageMinor',
          motion: DMG_MOTION[styleKey],
          delayFrames,
        }),
        scopeId: this._scopeId,
      });
    }

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
      const scopeId = this._scopeId;
      this._projectiles.set(p, scopeId);
      this._fx.container.addChild(p);

      let frame = 0;
      const complete = once(() => {
        TweenManager.cancelTarget(p);
        this._fx.burst({
          x: toX, y: toY, color,
          count: heavy ? 10 : 6,
          speed: heavy ? 320 : 240,
          size: heavy ? 16 : 12,
          life: 0.35,
        });
        this._projectiles.delete(p);
        p.destroy();
        resolve();
      });
      minigameFallback(duration, complete, 100);
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
        onComplete: complete,
      });
    });
  }

  /**
   * 星爆命中（pkg-fx starburst，ADD 混合）：UR 招牌技命中的高光反馈。
   * 贴图未加载（分包懒加载中 / 低端真机跳过）时降级为大号白色粒子 burst。
   */
  spawnStarburst(x: number, y: number, color: number): void {
    const tex = TextureCache.get(UI_FX_IMAGES.starburst);
    if (!tex) {
      this.burst({ x, y, color: 0xffffff, count: 14, speed: 480, size: 18, life: 0.5 });
      this.burst({ x, y, color, count: 10, speed: 360, size: 14, life: 0.45 });
      return;
    }
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5);
    sp.blendMode = PIXI.BLEND_MODES.ADD;
    sp.tint = color;
    sp.position.set(x, y);
    setScaleSafe(sp, 0.25);
    sp.alpha = 1;
    this._scopeChildren.set(sp, this._scopeId);
    this._fx.container.addChild(sp);
    const cleanup = once(() => {
      this._scopeChildren.delete(sp);
      if (displayAlive(sp)) sp.destroy();
    });
    void tweenScale(sp, { x: 1.5, y: 1.5 }, {
      duration: 0.4, ease: Ease.easeOutCubic,
    }, { onFallback: cleanup });
    void guardedTween({
      target: sp, props: { alpha: 0, rotation: 0.5 },
      duration: 0.45, ease: Ease.easeOutQuad,
      onComplete: cleanup,
    }, { onFallback: cleanup });
  }

  /**
   * 光环扩散（pkg-fx aura_ring，ADD 混合）：buff / 治疗 / 护盾类技能的我方反馈。
   * 贴图未加载时降级为上升粒子 burst。
   */
  spawnAuraRing(x: number, y: number, color: number): void {
    const tex = TextureCache.get(UI_FX_IMAGES.auraRing);
    if (!tex) {
      this.burst({ x, y, color, count: 12, speed: 280, gravity: -200, size: 14, life: 0.55 });
      return;
    }
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5);
    sp.blendMode = PIXI.BLEND_MODES.ADD;
    sp.tint = color;
    sp.position.set(x, y);
    setScaleSafe(sp, 0.3);
    sp.alpha = 0.95;
    this._scopeChildren.set(sp, this._scopeId);
    this._fx.container.addChild(sp);
    const cleanup = once(() => {
      this._scopeChildren.delete(sp);
      if (displayAlive(sp)) sp.destroy();
    });
    void tweenScale(sp, { x: 1.9, y: 1.9 }, {
      duration: 0.5, ease: Ease.easeOutCubic,
    }, { onFallback: cleanup });
    void guardedTween({
      target: sp, props: { alpha: 0 },
      duration: 0.55, ease: Ease.easeInQuad,
      onComplete: cleanup,
    }, { onFallback: cleanup });
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
      setScaleSafe(t, 1.8);
      t.alpha = 0;
      this._floatLayer.addChild(t);
      const scopeId = this._scopeId;
      this._scopeChildren.set(t, scopeId);
      const finish = once(() => {
        if (this._scopeChildren.get(t) === scopeId) this._scopeChildren.delete(t);
        if (displayAlive(t)) t.destroy();
        resolve();
      });
      TweenManager.to({
        target: t, props: { alpha: 1 },
        duration: UI.anim.comboPop,
      });
      void tweenScale(t, { x: 1, y: 1 }, {
        duration: UI.anim.comboPop, ease: Ease.easeOutBack,
        onComplete: () => {
          void guardedTween({
            target: t, props: { alpha: 0, y: t.y - 40 },
            duration: UI.anim.skillBanner * 0.4, delay: UI.anim.skillBanner * 0.35,
            ease: Ease.easeOutQuad,
            onComplete: () => {
              finish();
            },
          }, {
            fallbackSec: UI.anim.skillBanner * 0.75,
            onFallback: finish,
          });
        },
      }, {
        fallbackSec: UI.anim.comboPop,
        onFallback: finish,
      });
    });
  }
}
