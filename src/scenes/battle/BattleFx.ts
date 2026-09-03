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
import { UI, FX_ELEMENT_COLOR, FX_ENEMY_HOSTILE } from '@/balance/ui';
import type { Element } from '@/balance/combat';
import { ELEMENT_BLADE_IMAGES, ELEMENT_IMPACT_IMAGES, ORB_IMAGES, UI_BATTLE_IMAGES, UI_FX_IMAGES } from '@/config/Assets';
import { applyTextResolution } from '@/ui/text';
import { resolveLatinHudFontFamily } from '@/ui/calligraphyFont';
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
  type HeroHitDmgStyleKey,
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
  /** 本回合各宠物累计伤害（总伤害出现时同步常驻于槽位） */
  petSummaries?: readonly TurnPetDamageSummary[];
}

export interface TurnPetDamageSummary {
  slotX: number;
  slotY: number;
  element: Element;
  damage: number;
  isCrit?: boolean;
}

type ScopedPetDamageRuntime = PetDamageFloatRuntime & {
  scopeId: number;
  onDone?: () => void;
  /** 回合总伤等：不受 clearTransient / scope 切换提前回收，播完再消失 */
  persistUntilDone?: boolean;
};

export type BladeWeight = 'basic' | 'skill' | 'heavy';

function bladeScaleOf(weight: BladeWeight): number {
  if (weight === 'skill') return 1.14;
  if (weight === 'heavy') return 1.06;
  return 0.96;
}

/**
 * 弹道节奏：出手快离开宠物、中段匀速让色相可读、末段加速砸进去。
 * easeInOut 两端都慢，刃会在脚边和脸上各停一拍，又大又飘。
 */
function bladeFlightEase(t: number): number {
  if (t < 0.22) {
    const p = t / 0.22;
    return 0.36 * (p * (2 - p));
  }
  if (t < 0.66) {
    return 0.36 + 0.34 * ((t - 0.22) / 0.44);
  }
  const p = (t - 0.66) / 0.34;
  return 0.70 + 0.30 * (p * p);
}

function impactMulOf(weight: BladeWeight, crit: boolean): number {
  const base = weight === 'skill' ? 1.38 : weight === 'heavy' ? 1.22 : 1;
  return crit ? base * 1.12 : base;
}

function trailCountOf(weight: BladeWeight, crit: boolean): number {
  if (weight === 'skill') return 4;
  if (weight === 'heavy' || crit) return 3;
  return 2;
}

/** 沿飞行方向的法线微弧，lane 错开左右，避免五宠同一条线 */
function bladeArc(
  fromX: number, fromY: number, toX: number, toY: number, lane: number,
): { midX: number; midY: number } {
  const vx = toX - fromX;
  const vy = toY - fromY;
  const len = Math.hypot(vx, vy) || 1;
  const nx = -vy / len;
  const ny = vx / len;
  const curve = 44 + (Math.abs(lane) % 3) * 8;
  const sign = lane % 2 === 0 ? 1 : -1;
  return {
    midX: (fromX + toX) / 2 + nx * curve * sign,
    midY: (fromY + toY) / 2 + ny * curve * sign,
  };
}

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
        const t = applyTextResolution(new PIXI.Text('', {
          fontSize: 40, fill: 0xffffff, fontWeight: 'bold',
          stroke: 0x000000, strokeThickness: 4,
        }));
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
        const t = applyTextResolution(new PIXI.Text('', { fontSize: 42, fill: 0xffffff }));
        t.anchor.set(0.5, 0.5);
        return t;
      },
      onGet: (t) => {
        t.visible = true;
        t.alpha = 1;
        t.style.dropShadow = false;
        // 公告飘字会开 wordWrap；回收后必须关掉，否则数字飘字也会被折行
        t.style.wordWrap = false;
        t.style.breakWords = false;
        setScaleSafe(t, 1);
      },
      onRelease: (t) => {
        TweenManager.cancelTarget(t);
        const sc = readScale(t);
        if (sc) TweenManager.cancelTarget(sc);
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
      const staleScope = !rt.persistUntilDone && rt.scopeId !== this._scopeId;
      if (!displayAlive(rt.text) || staleScope) {
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

  /**
   * 等待指定 scope 内「命中飘字」播完（不含 persistUntilDone 的总伤/英雄飘字）。
   * 用于击杀后延迟弹出结算，避免伤害数字未出全就盖住战场。
   * legacy spawnFloat（灼烧等）无 runtime，由调用方 victoryFloatHold 超时兜底。
   */
  waitForDamageFloats(scopeId = this._scopeId): Promise<void> {
    const pending = this._petDmgRuntimes.filter(
      (rt) => rt.scopeId === scopeId && !rt.persistUntilDone,
    );
    if (pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      let left = pending.length;
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        left -= 1;
        if (left <= 0) {
          settled = true;
          resolve();
        }
      };
      for (const rt of pending) {
        if (!this._petDmgRuntimes.includes(rt)) {
          finish();
          continue;
        }
        const prev = rt.onDone;
        rt.onDone = () => {
          prev?.();
          finish();
        };
      }
    });
  }

  /** 回合/战斗收尾：清理某个 scope 内所有不应跨回合残留的表现层对象。 */
  clearTransient(scopeId = this._scopeId): void {
    for (const rt of this._petDmgRuntimes) {
      if (rt.scopeId === scopeId && !rt.persistUntilDone) {
        this._petDmgPool.release(rt.text);
        rt.onDone?.();
      }
    }
    this._petDmgRuntimes = this._petDmgRuntimes.filter(
      (rt) => rt.scopeId !== scopeId || rt.persistUntilDone,
    );

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

  /**
   * 状态施加公告（中毒 / 禁疗 / 封珠…）：大字 + 长停留，persistUntilDone。
   * 居中 + 自动换行，宽文案不会裁出屏外（曾把「中毒！每回合 -77（3回合）」贴在右侧）。
   */
  spawnStatusAnnounceFloat(text: string, x: number, y: number, color: number): void {
    if (!text) return;
    const motion = DMG_MOTION.heroStatusAnnounce;
    const t = this._petDmgPool.get();
    t.text = text;
    t.anchor.set(0.5);
    t.style.fontSize = 28;
    t.style.fill = color;
    t.style.stroke = 0x101010;
    t.style.strokeThickness = 6;
    t.style.fontWeight = '800';
    t.style.fontFamily = resolveLatinHudFontFamily();
    t.style.align = 'center';
    t.style.wordWrap = true;
    t.style.wordWrapWidth = Math.max(240, Game.logicWidth - 80);
    t.style.breakWords = true;
    this._floatLayer.addChild(t);
    this._petDmgRuntimes.push({
      ...createPetDamageFloatRuntime({
        text: t,
        baseX: x,
        baseY: y,
        baseScale: 1.08,
        styleKey: 'heroStatusAnnounce',
        motion,
      }),
      scopeId: this._scopeId,
      persistUntilDone: true,
    });
  }

  /**
   * 英雄受击数字（扣血 / 盾挡）：帧动画 + 停留段，persistUntilDone 避免下回合转珠被 clearTransient 清掉。
   */
  spawnHeroHitFloat(
    text: string,
    x: number,
    y: number,
    kind: 'damage' | 'shield',
    heavy = false,
  ): void {
    const motionKey: HeroHitDmgStyleKey = kind === 'shield'
      ? 'heroHitShield'
      : (heavy ? 'heroHitDamageHeavy' : 'heroHitDamage');
    const motion = DMG_MOTION[motionKey];
    const baseScale = kind === 'shield' ? 1.05 : (heavy ? 1.35 : 1.15);
    const t = this._petDmgPool.get();
    t.text = text;
    t.anchor.set(0.5);
    t.style.fontSize = kind === 'shield' ? 26 : (heavy ? 34 : 30);
    t.style.fill = kind === 'shield' ? 0x8fd4ff : 0xff5252;
    t.style.stroke = 0x101010;
    t.style.strokeThickness = kind === 'shield' ? 5 : (heavy ? 7 : 6);
    t.style.fontWeight = '900';
    t.style.fontFamily = resolveLatinHudFontFamily();
    t.style.align = 'center';
    this._floatLayer.addChild(t);
    this._petDmgRuntimes.push({
      ...createPetDamageFloatRuntime({
        text: t,
        baseX: x,
        baseY: y,
        baseScale,
        styleKey: motionKey,
        motion,
      }),
      scopeId: this._scopeId,
      persistUntilDone: true,
    });
  }

  /**
   * 英雄中毒 tick：紫色小号「毒 -N」，从状态图标冒出。
   * 刻意不用 hit 的大红字——和普攻 `-155` 并排时，玩家分不清谁是这一刀、谁是持续掉血。
   */
  spawnHeroDotFloat(amount: number, x: number, y: number): void {
    if (amount <= 0) return;
    const motion = DMG_MOTION.heroDot;
    const t = this._petDmgPool.get();
    t.text = `毒 -${amount}`;
    t.anchor.set(0.5);
    t.style.fontSize = 24;
    t.style.fill = 0xc06cf0;
    t.style.stroke = 0x2a1040;
    t.style.strokeThickness = 5;
    t.style.fontWeight = '800';
    t.style.fontFamily = resolveLatinHudFontFamily();
    t.style.align = 'center';
    this._floatLayer.addChild(t);
    this._petDmgRuntimes.push({
      ...createPetDamageFloatRuntime({
        text: t,
        baseX: x,
        baseY: y,
        baseScale: 0.95,
        styleKey: 'heroDot',
        motion,
      }),
      scopeId: this._scopeId,
      persistUntilDone: true,
    });
  }

  /** 英雄回血 +N：帧动画 + 停留段，persistUntilDone 避免 scope 清理 */
  spawnHeroHealFloat(amount: number, x: number, y: number): void {
    if (amount <= 0) return;
    const motion = DMG_MOTION.heroHeal;
    const t = this._petDmgPool.get();
    t.text = `+${amount}`;
    t.anchor.set(0.5);
    t.style.fontSize = 30;
    t.style.fill = 0x6fd86a;
    t.style.stroke = 0x101010;
    t.style.strokeThickness = 6;
    t.style.fontWeight = '900';
    t.style.fontFamily = resolveLatinHudFontFamily();
    t.style.align = 'center';
    this._floatLayer.addChild(t);
    this._petDmgRuntimes.push({
      ...createPetDamageFloatRuntime({
        text: t,
        baseX: x,
        baseY: y,
        baseScale: 1.12,
        styleKey: 'heroHeal',
        motion,
      }),
      scopeId: this._scopeId,
      persistUntilDone: true,
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
   * 本回合总伤害：敌人处总伤害 + 各宠物槽位累计伤害（异步播放，不阻塞回合推进）。
   */
  showTurnTotalDamage(opts: TurnTotalDamageOpts): Promise<void> {
    const { total, combo, hitCount, x, y, enemyMaxHp, petSummaries = [] } = opts;
    if (total <= 0) return Promise.resolve();

    this._clearTurnTotalFloats();
    this._clearScopePetDamageFloats();

    const tier = resolveTurnTotalTier(total, combo, hitCount, enemyMaxHp);
    const isHighTier = tier === 'mega' || tier === 'high';
    const styleKey = (isHighTier || tier === 'mid' ? 'enemyHitCrit' : 'enemyHitMain') as 'enemyHitCrit' | 'enemyHitMain';
    const motion = DMG_MOTION.turnTotalSummary;
    // 分档再叠一层 scale：字号在 applyDmgRenderStyle 里已按 sizeMul 放大，这里负责「弹出感」
    const tierPop = { normal: 1.08, mid: 1.2, high: 1.35, mega: 1.48 }[tier];
    const baseScale = PET_FLOAT_CFG.normalAtk.scale * tierPop;
    const S = dmgFloatScale();

    return new Promise((resolve) => {
      let pending = 2 + petSummaries.length;
      const done = (): void => {
        pending -= 1;
        if (pending <= 0) resolve();
      };

      for (const pet of petSummaries) {
        this._pushTurnRecapFloat(pet, done);
      }

      const captionText = this._petDmgPool.get();
      captionText.text = '总伤害';
      applyDmgRenderStyle(captionText, 'slotDamageMinor', 'totalCaption', { totalTier: tier });
      this._floatLayer.addChild(captionText);

      const numText = this._petDmgPool.get();
      numText.text = formatDmgNumber(total);
      applyDmgRenderStyle(numText, styleKey, 'total', { totalTier: tier });
      this._floatLayer.addChild(numText);

      // 标题贴数字上方一点点：只留小缝不重叠，并夹在关卡匾下沿以下
      const numFont = numText.style.fontSize as number;
      const settle = baseScale * motion.settleScale;
      const tightY = y - (numFont * settle * 0.38 + 8 * S);
      const bannerBottom = Game.safeHeaderCenterY + UI.battle.stageBannerH / 2 + 8;
      const captionY = Math.max(bannerBottom, tightY);

      if (tier === 'mega') this.shakeHeavy();
      else if (isHighTier) this.shakeMedium();
      else if (tier === 'mid') this.shakeLight();

      const floatOpts = { baseX: x, baseScale, styleKey, motion };
      this._petDmgRuntimes.push({
        ...createPetDamageFloatRuntime({
          ...floatOpts,
          text: captionText,
          baseY: captionY,
        }),
        scopeId: this._scopeId,
        onDone: done,
        persistUntilDone: true,
      });
      this._petDmgRuntimes.push({
        ...createPetDamageFloatRuntime({
          ...floatOpts,
          text: numText,
          baseY: y,
        }),
        scopeId: this._scopeId,
        onDone: done,
        persistUntilDone: true,
      });
    });
  }

  /** 清掉上一段仍在播放的回合总伤（含槽位 recap） */
  private _clearTurnTotalFloats(): void {
    for (let i = this._petDmgRuntimes.length - 1; i >= 0; i--) {
      const rt = this._petDmgRuntimes[i];
      if (!rt.persistUntilDone) continue;
      this._petDmgPool.release(rt.text);
      rt.onDone?.();
      this._petDmgRuntimes.splice(i, 1);
    }
  }

  /** 清除当前 scope 内已有槽位/总伤飘字，为回合汇总让路 */
  private _clearScopePetDamageFloats(): void {
    for (let i = this._petDmgRuntimes.length - 1; i >= 0; i--) {
      const rt = this._petDmgRuntimes[i];
      if (rt.persistUntilDone || rt.scopeId !== this._scopeId) continue;
      this._petDmgPool.release(rt.text);
      rt.onDone?.();
      this._petDmgRuntimes.splice(i, 1);
    }
  }

  /**
   * 槽位伤害 recap：与转珠普攻回合末同一套字号 / 运动 / 停留。
   * 直伤技能打完后也走这里，避免玩家只在敌人身上找到数字。
   */
  showPetSlotDamageRecap(pet: TurnPetDamageSummary): void {
    if (pet.damage <= 0) return;
    this._pushTurnRecapFloat(pet, () => {});
  }

  /** 回合末：单只宠物本回合累计伤害（槽位常驻） */
  private _pushTurnRecapFloat(pet: TurnPetDamageSummary, onDone: () => void): void {
    const anchor = petSlotDamageAnchor(pet.slotX, pet.slotY, 'main');
    const styleKey = pet.isCrit ? 'slotDamageCrit' : 'slotDamageRecap';
    const motion = DMG_MOTION.turnTotalSummary;
    const baseScale = PET_FLOAT_CFG.normalAtk.scale * 1.04;
    const t = this._petDmgPool.get();
    t.text = buildPetDmgLabel(pet.element, pet.damage);
    applyDmgRenderStyle(t, styleKey, undefined, { element: pet.element });
    this._floatLayer.addChild(t);
    this._petDmgRuntimes.push({
      ...createPetDamageFloatRuntime({
        text: t,
        baseX: anchor.x,
        baseY: anchor.y,
        baseScale,
        styleKey,
        motion,
      }),
      scopeId: this._scopeId,
      onDone,
      persistUntilDone: true,
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
    const baseScale = skill
      ? (minor ? PET_FLOAT_CFG.skill.minorScale : PET_FLOAT_CFG.skill.scale)
      : PET_FLOAT_CFG.normalAtk.scale;
    const isCounter = counter === 1 && !minor;

    const t = this._petDmgPool.get();
    t.text = buildPetDmgLabel(element, damage);
    applyDmgRenderStyle(t, styleKey, undefined, { counter: isCounter, element });
    if (onEnemy && !minor) {
      t.style.fontSize = (t.style.fontSize as number) * 1.12;
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

  /**
   * 玩家属性刃弹道（普攻 / 技能直伤）。敌人来弹走 fireEnemyBolt，不共用这套新月刃。
   *
   * 枪口闪 → 定尺寸刃 + 残影/光点 → 命中按入射角分层。
   * 技能档更粗；暴击更快、多一层星芒、命中停 2 帧。缺刃图才降级圆珠。
   */
  fireElementBladeVolley(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    element: Element,
    opts?: { duration?: number; weight?: BladeWeight; lane?: number; crit?: boolean },
  ): Promise<void> {
    const weight = opts?.weight ?? 'basic';
    const crit = opts?.crit ?? false;
    const bladeTex = TextureCache.get(ELEMENT_BLADE_IMAGES[element]);
    if (!bladeTex) {
      return this._fireOrbFallback(fromX, fromY, toX, toY, element, {
        duration: opts?.duration ?? UI.anim.projectile,
        heavy: weight !== 'basic' || crit,
      });
    }

    const impactTex = TextureCache.get(ELEMENT_IMPACT_IMAGES[element]);
    const color = FX_ELEMENT_COLOR[element];
    const flyDur = (opts?.duration ?? UI.anim.projectile) * (crit ? 0.92 : 1);
    const impactDur = UI.anim.bladeImpact;
    const scale = bladeScaleOf(weight) * (crit ? 1.08 : 1);
    const baseW = 128;
    const baseH = 76;
    const { midX, midY } = bladeArc(fromX, fromY, toX, toY, opts?.lane ?? 0);
    const mote = this._moteTex();
    const trailN = trailCountOf(weight, crit);
    const ghostEvery = 2;

    this._spawnMuzzle(fromX, fromY, color, weight);

    return new Promise((resolve) => {
      const done = once(() => resolve());
      minigameFallback(flyDur + (crit ? 0.22 : 0.18), done, 120);

      // 沿速度拉长、垂直方向收薄：业界弹道是一条光带，不是一张跟着飞的贴纸
      const bladeW = baseW * scale * 1.38;
      const bladeH = baseH * scale * 0.82;

      // 色晕垫在核下面：同一张刃图放大、染成发光色。
      // 不能用 mote 做 NORMAL 色板——那张图底是实心黑，一 Normal 就露出黑方框。
      const glow = new PIXI.Sprite(bladeTex);
      glow.anchor.set(0.5);
      glow.blendMode = PIXI.BLEND_MODES.ADD;
      glow.tint = color;
      glow.width = bladeW * 1.4;
      glow.height = bladeH * 1.22;
      glow.alpha = 0.7;
      glow.position.set(fromX, fromY);

      const blade = new PIXI.Sprite(bladeTex);
      blade.anchor.set(0.5);
      blade.blendMode = PIXI.BLEND_MODES.ADD;
      // 核不染色：白热保证轮廓；色相全部交给外圈 glow，五属性才分得开
      blade.width = bladeW;
      blade.height = bladeH;
      blade.alpha = 1;
      blade.position.set(fromX, fromY);
      const scopeId = this._scopeId;
      this._projectiles.set(glow, scopeId);
      this._projectiles.set(blade, scopeId);
      this._fx.container.addChild(glow);
      this._fx.container.addChild(blade);

      const state = { t: 0 };
      let frame = 0;
      let hitAngle = Math.atan2(toY - fromY, toX - fromX);

      const finishBladeAndImpact = once(() => {
        TweenManager.cancelTarget(state);
        this._projectiles.delete(glow);
        this._projectiles.delete(blade);
        if (displayAlive(glow)) glow.destroy();
        if (displayAlive(blade)) blade.destroy();
        void this._playElementImpact(toX, toY, element, impactTex, impactDur, hitAngle, weight, crit);
        if (crit) {
          this._waitHitstop(2 / 60, done);
          return;
        }
        done();
      });

      minigameFallback(flyDur + (crit ? 0.14 : 0.1), finishBladeAndImpact, 90);
      TweenManager.to({
        target: state,
        props: { t: 1 },
        duration: flyDur,
        ease: bladeFlightEase,
        onUpdate: () => {
          if (!displayAlive(blade)) return;
          const t = state.t;
          const u = 1 - t;
          const x = u * u * fromX + 2 * u * t * midX + t * t * toX;
          const y = u * u * fromY + 2 * u * t * midY + t * t * toY;
          const dx = 2 * u * (midX - fromX) + 2 * t * (toX - midX);
          const dy = 2 * u * (midY - fromY) + 2 * t * (toY - midY);
          hitAngle = Math.atan2(dy, dx);
          // 越飞越快时沿速度再拉长，末段才有「砸进去」的速度感
          const stretch = t < 0.66 ? 1 : 1 + ((t - 0.66) / 0.34) * 0.32;
          blade.position.set(x, y);
          blade.rotation = hitAngle;
          blade.width = bladeW * stretch;
          blade.height = bladeH * (1 - (stretch - 1) * 0.4);
          if (displayAlive(glow)) {
            glow.position.set(x, y);
            glow.rotation = hitAngle;
            glow.width = blade.width * 1.4;
            glow.height = blade.height * 1.22;
          }
          if (++frame % 2 === 0) {
            this._fx.burst({
              x, y, color,
              count: trailN,
              speed: 28,
              gravity: 0,
              size: weight === 'skill' ? 12 : 10,
              life: 0.14,
              alpha: crit ? 0.8 : 0.68,
              texture: mote,
              blendMode: PIXI.BLEND_MODES.ADD,
              angle: hitAngle + Math.PI,
              spread: 0.45,
              drag: 0.88,
            });
            this._spawnBladeStreak(x, y, hitAngle, color, mote, scopeId, weight, stretch);
          }
          if (frame % ghostEvery === 0) {
            this._spawnBladeGhost(blade, bladeTex, scopeId, color, hitAngle);
          }
        },
        onComplete: finishBladeAndImpact,
      });
    });
  }

  /** @deprecated 请用 fireElementBladeVolley */
  fireWaterBladeVolley(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    opts?: { duration?: number; weight?: BladeWeight; lane?: number; crit?: boolean },
  ): Promise<void> {
    return this.fireElementBladeVolley(fromX, fromY, toX, toY, 'water', opts);
  }

  /**
   * 敌人打英雄：专用敌对能量矛，从上往下砸血条。
   * 不用玩家新月刃。核不染色（贴图本身是品红白热矛），外圈敌对红晕。
   * 比玩家刃更粗、更慢：来弹必须一眼能看见。贴图未到时用软光点顶上。
   */
  fireEnemyBolt(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    _element: Element,
    opts?: { duration?: number; heavy?: boolean },
  ): Promise<void> {
    const heavy = opts?.heavy ?? false;
    const color = FX_ENEMY_HOSTILE;
    const flyDur = opts?.duration ?? UI.anim.enemyProjectile;
    const boltTex = TextureCache.get(UI_FX_IMAGES.enemyBolt) ?? this._moteTex();
    const impactTex = TextureCache.get(UI_FX_IMAGES.enemyImpact);
    const mote = this._moteTex();
    const vx = toX - fromX;
    const vy = toY - fromY;
    const len = Math.hypot(vx, vy) || 1;
    const side = (heavy ? 1 : -1) * 22;
    const midX = (fromX + toX) / 2 + (-vy / len) * side;
    const midY = (fromY + toY) / 2 + (vx / len) * side;
    const scale = heavy ? 1.32 : 1.12;
    const boltW = 112 * scale;
    const boltH = 176 * scale;

    this._spawnMuzzle(fromX, fromY, color, heavy ? 'heavy' : 'basic');

    return new Promise((resolve) => {
      const done = once(() => resolve());
      minigameFallback(flyDur + 0.22, done, 120);

      const glow = new PIXI.Sprite(boltTex);
      glow.anchor.set(0.5);
      glow.blendMode = PIXI.BLEND_MODES.ADD;
      glow.tint = color;
      glow.width = boltW * 1.48;
      glow.height = boltH * 1.28;
      glow.alpha = 0.78;
      glow.position.set(fromX, fromY);

      const bolt = new PIXI.Sprite(boltTex);
      bolt.anchor.set(0.5);
      bolt.blendMode = PIXI.BLEND_MODES.ADD;
      bolt.width = boltW;
      bolt.height = boltH;
      bolt.alpha = 1;
      bolt.position.set(fromX, fromY);
      const scopeId = this._scopeId;
      this._projectiles.set(glow, scopeId);
      this._projectiles.set(bolt, scopeId);
      this._fx.container.addChild(glow);
      this._fx.container.addChild(bolt);

      const state = { t: 0 };
      let frame = 0;
      let hitAngle = Math.atan2(toY - fromY, toX - fromX);

      const finish = once(() => {
        TweenManager.cancelTarget(state);
        this._projectiles.delete(glow);
        this._projectiles.delete(bolt);
        if (displayAlive(glow)) glow.destroy();
        if (displayAlive(bolt)) bolt.destroy();
        void this._playEnemyBoltImpact(toX, toY, color, impactTex, hitAngle, heavy);
        done();
      });

      minigameFallback(flyDur + 0.14, finish, 90);
      TweenManager.to({
        target: state,
        props: { t: 1 },
        duration: flyDur,
        ease: bladeFlightEase,
        onUpdate: () => {
          if (!displayAlive(bolt)) return;
          const t = state.t;
          const u = 1 - t;
          const x = u * u * fromX + 2 * u * t * midX + t * t * toX;
          const y = u * u * fromY + 2 * u * t * midY + t * t * toY;
          const dx = 2 * u * (midX - fromX) + 2 * t * (toX - midX);
          const dy = 2 * u * (midY - fromY) + 2 * t * (toY - midY);
          hitAngle = Math.atan2(dy, dx);
          const stretch = t < 0.66 ? 1 : 1 + ((t - 0.66) / 0.34) * 0.28;
          const rot = hitAngle - Math.PI / 2;
          bolt.position.set(x, y);
          bolt.rotation = rot;
          bolt.width = boltW * (1 - (stretch - 1) * 0.25);
          bolt.height = boltH * stretch;
          if (displayAlive(glow)) {
            glow.position.set(x, y);
            glow.rotation = rot;
            glow.width = bolt.width * 1.48;
            glow.height = bolt.height * 1.28;
          }
          if (++frame % 2 === 0) {
            this._fx.burst({
              x, y, color,
              count: heavy ? 3 : 2,
              speed: 36,
              gravity: 0,
              size: heavy ? 18 : 14,
              life: 0.16,
              alpha: 0.72,
              texture: mote,
              blendMode: PIXI.BLEND_MODES.ADD,
              angle: hitAngle + Math.PI,
              spread: 0.4,
              drag: 0.86,
            });
            this._spawnEnemyBoltStreak(x, y, hitAngle, color, mote, scopeId, heavy, stretch);
          }
          if (frame % 3 === 0) {
            this._spawnBladeGhost(bolt, boltTex, scopeId, color, hitAngle);
          }
        },
        onComplete: finish,
      });
    });
  }

  private _playEnemyBoltImpact(
    x: number,
    y: number,
    color: number,
    tex: PIXI.Texture | null,
    incomingAngle: number,
    heavy: boolean,
  ): Promise<void> {
    return new Promise((resolve) => {
      const done = once(() => resolve());
      minigameFallback(0.32, done, 120);
      const mote = this._moteTex();
      const wMul = heavy ? 1.25 : 1;

      this._fx.burst({
        x, y, color,
        count: heavy ? 12 : 8,
        speed: 260,
        gravity: 70,
        size: 13,
        life: 0.3,
        alpha: 0.9,
        texture: mote,
        blendMode: PIXI.BLEND_MODES.ADD,
        angle: incomingAngle,
        spread: 1.2,
        drag: 0.9,
      });
      this._spawnImpactFlash(x, y, wMul);
      this._spawnImpactRing(x, y, color, wMul);

      if (!tex) {
        done();
        return;
      }
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      sp.blendMode = PIXI.BLEND_MODES.ADD;
      sp.position.set(x, y);
      sp.rotation = incomingAngle - Math.PI / 2;
      setScaleSafe(sp, 1.05 * wMul);
      sp.alpha = 1;
      this._scopeChildren.set(sp, this._scopeId);
      this._fx.container.addChild(sp);
      const cleanup = once(() => {
        this._scopeChildren.delete(sp);
        if (displayAlive(sp)) sp.destroy();
        done();
      });
      void tweenScale(sp, { x: 1.55 * wMul, y: 1.55 * wMul }, {
        duration: 0.1, ease: Ease.easeOutCubic,
        onComplete: () => {
          void guardedTween({
            target: sp,
            props: { alpha: 0 },
            duration: 0.16,
            delay: 0.06,
            ease: Ease.easeInQuad,
            onComplete: cleanup,
          }, { onFallback: cleanup });
        },
      }, { onFallback: cleanup });
    });
  }

  /** 刃图未就绪时的圆珠降级：拖尾仍用软光点，不再撒白方块 */
  private _fireOrbFallback(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    element: Element,
    opts: { duration: number; heavy: boolean },
  ): Promise<void> {
    return new Promise((resolve) => {
      const color = FX_ELEMENT_COLOR[element];
      const size = opts.heavy ? 40 : 32;
      const tex = TextureCache.get(ORB_IMAGES[element]);
      const mote = this._moteTex();
      const p = new PIXI.Sprite(tex ?? PIXI.Texture.WHITE);
      p.anchor.set(0.5);
      p.width = size;
      p.height = size;
      if (!tex) p.tint = color;
      p.position.set(fromX, fromY);
      const scopeId = this._scopeId;
      this._projectiles.set(p, scopeId);
      this._fx.container.addChild(p);
      this._spawnMuzzle(fromX, fromY, color, opts.heavy ? 'heavy' : 'basic');

      let frame = 0;
      const complete = once(() => {
        TweenManager.cancelTarget(p);
        this._projectiles.delete(p);
        if (displayAlive(p)) {
          this._fx.burst({
            x: toX, y: toY, color,
            count: opts.heavy ? 10 : 6,
            speed: 260,
            size: 12,
            life: 0.28,
            texture: mote,
            blendMode: PIXI.BLEND_MODES.ADD,
          });
          p.destroy();
        }
        resolve();
      });
      minigameFallback(opts.duration, complete, 100);
      TweenManager.to({
        target: p, props: { x: toX, y: toY },
        duration: opts.duration, ease: Ease.easeInCubic,
        onUpdate: () => {
          if (!displayAlive(p)) return;
          if (++frame % 2 === 0) {
            this._fx.burst({
              x: p.x, y: p.y, color,
              count: 2, speed: 32, gravity: 0, size: 12, life: 0.16, alpha: 0.7,
              texture: mote,
              blendMode: PIXI.BLEND_MODES.ADD,
            });
          }
        },
        onComplete: complete,
      });
    });
  }

  private _moteTex(): PIXI.Texture {
    return TextureCache.get(UI_BATTLE_IMAGES.skillReadyMote)
      ?? TextureCache.get(UI_FX_IMAGES.particleSpark)
      ?? PIXI.Texture.WHITE;
  }

  private _spawnBladeGhost(
    src: PIXI.Sprite, tex: PIXI.Texture, scopeId: number, tint?: number, angle?: number,
  ): void {
    const ghost = new PIXI.Sprite(tex);
    ghost.anchor.set(0.5);
    ghost.blendMode = PIXI.BLEND_MODES.ADD;
    // 残影沿来向退半步并再拉长一点，才是拖尾而不是叠在弹体上的第二张贴纸
    const back = 16;
    const ang = angle ?? src.rotation;
    ghost.position.set(src.x - Math.cos(ang) * back, src.y - Math.sin(ang) * back);
    ghost.rotation = src.rotation;
    ghost.width = src.width * 1.12;
    ghost.height = src.height * 0.78;
    if (tint !== undefined) ghost.tint = tint;
    ghost.alpha = 0.38;
    this._scopeChildren.set(ghost, scopeId);
    this._fx.container.addChildAt(ghost, Math.max(0, this._fx.container.getChildIndex(src)));
    const fade = once(() => {
      this._scopeChildren.delete(ghost);
      if (displayAlive(ghost)) ghost.destroy();
    });
    TweenManager.to({
      target: ghost, props: { alpha: 0, width: ghost.width * 1.15 },
      duration: 0.16, ease: Ease.easeOutQuad, onComplete: fade,
    });
  }

  /** 敌人来弹尾迹：比玩家刃更粗，敌对红，砸下来的压迫感靠宽度而不是再叠一张贴纸 */
  private _spawnEnemyBoltStreak(
    x: number, y: number, angle: number, color: number, tex: PIXI.Texture, scopeId: number,
    heavy: boolean,
    stretch = 1,
  ): void {
    const streak = new PIXI.Sprite(tex);
    streak.anchor.set(0.85, 0.5);
    streak.blendMode = PIXI.BLEND_MODES.ADD;
    streak.tint = color;
    streak.position.set(x, y);
    streak.rotation = angle;
    streak.width = (heavy ? 188 : 164) * stretch;
    streak.height = heavy ? 26 : 20;
    streak.alpha = heavy ? 0.7 : 0.6;
    this._scopeChildren.set(streak, scopeId);
    this._fx.container.addChild(streak);
    const fade = once(() => {
      this._scopeChildren.delete(streak);
      if (displayAlive(streak)) streak.destroy();
    });
    TweenManager.to({
      target: streak, props: { alpha: 0, width: streak.width * 1.18 },
      duration: 0.16, ease: Ease.easeOutQuad, onComplete: fade,
    });
  }

  /** 沿速度拉长的软光带：细长才像轨迹，方一块就是噪点 */
  private _spawnBladeStreak(
    x: number, y: number, angle: number, color: number, tex: PIXI.Texture, scopeId: number,
    weight: BladeWeight,
    stretch = 1,
  ): void {
    const streak = new PIXI.Sprite(tex);
    streak.anchor.set(0.85, 0.5);
    streak.blendMode = PIXI.BLEND_MODES.ADD;
    streak.tint = color;
    streak.position.set(x, y);
    streak.rotation = angle;
    streak.width = (weight === 'skill' ? 150 : 128) * stretch;
    streak.height = weight === 'skill' ? 14 : 11;
    streak.alpha = weight === 'skill' ? 0.62 : 0.52;
    this._scopeChildren.set(streak, scopeId);
    this._fx.container.addChild(streak);
    const fade = once(() => {
      this._scopeChildren.delete(streak);
      if (displayAlive(streak)) streak.destroy();
    });
    TweenManager.to({
      target: streak, props: { alpha: 0, width: streak.width * 1.2 }, duration: 0.14, ease: Ease.easeOutQuad, onComplete: fade,
    });
  }

  /** 命中：白闪 + 爆炸图转入射角 + 细环 + 软光点沿法线溅出 */
  private _playElementImpact(
    x: number,
    y: number,
    element: Element,
    tex: PIXI.Texture | null,
    duration: number,
    incomingAngle: number,
    weight: BladeWeight,
    crit = false,
  ): Promise<void> {
    return new Promise((resolve) => {
      const done = once(() => resolve());
      minigameFallback(duration + 0.25, done, 140);
      const color = FX_ELEMENT_COLOR[element];
      const mote = this._moteTex();
      const wMul = impactMulOf(weight, crit);

      this._fx.burst({
        x, y, color,
        count: weight === 'skill' ? 14 : (crit ? 12 : 8),
        speed: 280,
        gravity: 90,
        size: 12,
        life: 0.28,
        alpha: 0.9,
        texture: mote,
        blendMode: PIXI.BLEND_MODES.ADD,
        angle: incomingAngle,
        spread: 1.35,
        drag: 0.9,
      });

      this._spawnImpactFlash(x, y, wMul);
      this._spawnImpactRing(x, y, color, wMul);
      if (crit) this._spawnCritStar(x, y, incomingAngle);

      if (!tex) {
        done();
        return;
      }

      const halo = new PIXI.Sprite(tex);
      halo.anchor.set(0.5);
      halo.blendMode = PIXI.BLEND_MODES.ADD;
      halo.tint = color;
      halo.position.set(x, y);
      halo.rotation = incomingAngle;
      setScaleSafe(halo, 1.35 * wMul);
      halo.alpha = 0.7;
      this._scopeChildren.set(halo, this._scopeId);
      this._fx.container.addChild(halo);

      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      sp.blendMode = PIXI.BLEND_MODES.ADD;
      sp.tint = color;
      sp.position.set(x, y);
      sp.rotation = incomingAngle;
      setScaleSafe(sp, 1.0 * wMul);
      sp.alpha = 1;
      this._scopeChildren.set(sp, this._scopeId);
      this._fx.container.addChild(sp);

      const cleanup = once(() => {
        this._scopeChildren.delete(halo);
        this._scopeChildren.delete(sp);
        if (displayAlive(halo)) halo.destroy();
        if (displayAlive(sp)) sp.destroy();
        done();
      });

      void tweenScale(sp, { x: 1.12 * wMul, y: 1.12 * wMul }, {
        duration: duration * 0.22, ease: Ease.easeOutCubic,
        onComplete: () => {
          void guardedTween({
            target: halo,
            props: { alpha: 0 },
            duration: duration * 0.4,
            delay: duration * 0.22,
            ease: Ease.easeInQuad,
          });
          void guardedTween({
            target: sp,
            props: { alpha: 0 },
            duration: duration * 0.4,
            delay: duration * 0.22,
            ease: Ease.easeInQuad,
            onComplete: cleanup,
          }, { onFallback: cleanup });
        },
      }, { onFallback: cleanup });
    });
  }

  /** 枪口：热核 + 细环，4～6 帧，不挡飞行 */
  private _spawnMuzzle(x: number, y: number, color: number, weight: BladeWeight): void {
    const mote = this._moteTex();
    const flare = TextureCache.get(UI_BATTLE_IMAGES.comboFlare) ?? mote;
    const mul = weight === 'skill' ? 1.25 : 1;
    const core = new PIXI.Sprite(flare);
    core.anchor.set(0.5);
    core.blendMode = PIXI.BLEND_MODES.ADD;
    core.tint = color;
    core.position.set(x, y);
    const sz = 28 * mul;
    core.width = sz;
    core.height = sz;
    core.alpha = 0.95;
    this._scopeChildren.set(core, this._scopeId);
    this._fx.container.addChild(core);
    const fadeCore = once(() => {
      this._scopeChildren.delete(core);
      if (displayAlive(core)) core.destroy();
    });
    TweenManager.to({
      target: core,
      props: { alpha: 0, width: sz * 1.7, height: sz * 1.7 },
      duration: 0.12,
      ease: Ease.easeOutQuad,
      onComplete: fadeCore,
    });

    const ring = new PIXI.Graphics();
    ring.blendMode = PIXI.BLEND_MODES.ADD;
    ring.position.set(x, y);
    this._scopeChildren.set(ring, this._scopeId);
    this._fx.container.addChild(ring);
    const state = { r: 6 * mul, a: 0.75 };
    const draw = (): void => {
      if (!displayAlive(ring)) return;
      ring.clear();
      ring.lineStyle(2, color, state.a);
      ring.drawCircle(0, 0, state.r);
    };
    draw();
    const fadeRing = once(() => {
      this._scopeChildren.delete(ring);
      if (displayAlive(ring)) ring.destroy();
    });
    TweenManager.to({
      target: state,
      props: { r: 26 * mul, a: 0 },
      duration: 0.13,
      ease: Ease.easeOutQuad,
      onUpdate: draw,
      onComplete: fadeRing,
    });

    this._fx.burst({
      x, y, color,
      count: weight === 'skill' ? 6 : 4,
      speed: 90,
      gravity: 0,
      size: 10,
      life: 0.16,
      alpha: 0.8,
      texture: mote,
      blendMode: PIXI.BLEND_MODES.ADD,
      drag: 0.84,
    });
  }

  private _spawnCritStar(x: number, y: number, angle: number): void {
    const tex = TextureCache.get(UI_BATTLE_IMAGES.comboStarFlare) ?? this._moteTex();
    const star = new PIXI.Sprite(tex);
    star.anchor.set(0.5);
    star.blendMode = PIXI.BLEND_MODES.ADD;
    star.tint = 0xfff2c8;
    star.position.set(x, y);
    star.rotation = angle;
    star.width = 72;
    star.height = 40;
    star.alpha = 0.95;
    this._scopeChildren.set(star, this._scopeId);
    this._fx.container.addChild(star);
    const fade = once(() => {
      this._scopeChildren.delete(star);
      if (displayAlive(star)) star.destroy();
    });
    TweenManager.to({
      target: star,
      props: { alpha: 0, width: 110, height: 58 },
      duration: 0.16,
      ease: Ease.easeOutQuad,
      onComplete: fade,
    });
  }

  /** 暴击命中停 2 帧，让受击/飘字晚一拍出现 */
  private _waitHitstop(sec: number, done: () => void): void {
    const dummy = { t: 0 };
    const finish = once(done);
    minigameFallback(sec, finish, 30);
    TweenManager.to({
      target: dummy, props: { t: 1 }, duration: sec, onComplete: finish,
    });
  }

  private _spawnImpactFlash(x: number, y: number, wMul: number): void {
    const tex = TextureCache.get(UI_BATTLE_IMAGES.comboFlare) ?? this._moteTex();
    const flash = new PIXI.Sprite(tex);
    flash.anchor.set(0.5);
    flash.blendMode = PIXI.BLEND_MODES.ADD;
    flash.tint = 0xffffff;
    flash.position.set(x, y);
    const sz = 42 * wMul;
    flash.width = sz;
    flash.height = sz;
    flash.alpha = 0.95;
    this._scopeChildren.set(flash, this._scopeId);
    this._fx.container.addChild(flash);
    const fade = once(() => {
      this._scopeChildren.delete(flash);
      if (displayAlive(flash)) flash.destroy();
    });
    TweenManager.to({
      target: flash,
      props: { alpha: 0, width: sz * 1.8, height: sz * 1.8 },
      duration: 0.08,
      ease: Ease.easeOutQuad,
      onComplete: fade,
    });
  }

  private _spawnImpactRing(x: number, y: number, color: number, wMul: number): void {
    const ring = new PIXI.Graphics();
    ring.blendMode = PIXI.BLEND_MODES.ADD;
    ring.position.set(x, y);
    this._scopeChildren.set(ring, this._scopeId);
    this._fx.container.addChild(ring);
    const state = { r: 10 * wMul, a: 0.7 };
    const draw = (): void => {
      if (!displayAlive(ring)) return;
      ring.clear();
      ring.lineStyle(2.4, color, state.a);
      ring.drawCircle(0, 0, state.r);
    };
    draw();
    const fade = once(() => {
      this._scopeChildren.delete(ring);
      if (displayAlive(ring)) ring.destroy();
    });
    TweenManager.to({
      target: state,
      props: { r: 52 * wMul, a: 0 },
      duration: 0.18,
      ease: Ease.easeOutQuad,
      onUpdate: draw,
      onComplete: fade,
    });
  }

  /**
   * 星爆命中：改为局部粒子，避免 ADD 大图扩开展成全屏震光。
   */
  spawnStarburst(x: number, y: number, color: number): void {
    this.burst({ x, y, color: 0xffffff, count: 8, speed: 280, size: 12, life: 0.32 });
    this.burst({ x, y, color, count: 6, speed: 220, size: 10, life: 0.28 });
  }

  /**
   * 治疗/护盾/净化用的局部光环：细圈外扩 + 粒子，不用 ADD 大图（会铺成全屏震光）。
   */
  spawnAuraRing(x: number, y: number, color: number): void {
    this._spawnImpactRing(x, y, color, 1.7);
    this.burst({
      x, y, color, count: 10, speed: 220, gravity: -160, size: 12, life: 0.45,
    });
  }

  /**
   * 英雄受击冲击：仅局部粒子，不要星爆/光环铺屏。
   */
  spawnHeroHitImpact(x: number, y: number, element: Element, heavy = false): void {
    const elColor = FX_ELEMENT_COLOR[element];
    const impactColor = heavy ? 0xff1744 : FX_ENEMY_HOSTILE;
    const mote = this._moteTex();
    this.burst({
      x, y,
      color: elColor,
      count: heavy ? 12 : 8,
      speed: heavy ? 320 : 240,
      size: heavy ? 14 : 11,
      life: 0.36,
      texture: mote,
      blendMode: PIXI.BLEND_MODES.ADD,
    });
    this.burst({
      x, y,
      color: impactColor,
      count: heavy ? 8 : 5,
      speed: 200,
      size: heavy ? 12 : 9,
      life: 0.3,
      texture: mote,
      blendMode: PIXI.BLEND_MODES.ADD,
    });
    this._spawnSparkBurst(x, y, heavy ? 5 : 3, impactColor);
  }

  /** 护盾全挡：局部蓝粒子（仍要有受击反馈） */
  spawnHeroShieldImpact(x: number, y: number): void {
    this.burst({
      x, y,
      color: 0x8fd4ff,
      count: 8,
      speed: 180,
      size: 11,
      life: 0.3,
    });
    this._spawnSparkBurst(x, y, 3, 0xb3e5fc);
  }

  /** particleSpark 贴图散射（无贴图时降级为 burst） */
  private _spawnSparkBurst(x: number, y: number, count: number, color: number): void {
    const tex = TextureCache.get(UI_FX_IMAGES.particleSpark);
    if (!tex) {
      this.burst({ x, y, color, count, speed: 340, size: 12, life: 0.32 });
      return;
    }
    for (let i = 0; i < count; i++) {
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      sp.tint = color;
      sp.blendMode = PIXI.BLEND_MODES.ADD;
      sp.position.set(x, y);
      setScaleSafe(sp, 0.35 + Math.random() * 0.25);
      sp.alpha = 0.95;
      this._scopeChildren.set(sp, this._scopeId);
      this._fx.container.addChild(sp);
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const dist = 50 + Math.random() * 40;
      const targetX = x + Math.cos(angle) * dist;
      const targetY = y + Math.sin(angle) * dist - 20;
      const cleanup = once(() => {
        this._scopeChildren.delete(sp);
        if (displayAlive(sp)) sp.destroy();
      });
      void guardedTween({
        target: sp,
        props: { x: targetX, y: targetY, alpha: 0 },
        duration: 0.32 + Math.random() * 0.12,
        ease: Ease.easeOutQuad,
        onComplete: cleanup,
      }, { onFallback: cleanup });
    }
  }

  /**
   * 怪物技能施法拍：脚下法阵 + 敌对技能匾 + 软光点。
   * 比宠物横幅更靠上、更暗，用来和普攻「敌人攻击！」区分。
   */
  playEnemySkillCast(
    x: number,
    y: number,
    name: string,
    opts?: { color?: number; footY?: number },
  ): Promise<void> {
    const color = opts?.color ?? 0xc06cf0;
    const footY = opts?.footY ?? y + 72;
    const mote = this._moteTex();
    this._spawnEnemyCastCircle(x, footY, color);
    this._spawnMuzzle(x, y, color, 'skill');
    this.burst({
      x, y, color,
      count: 10,
      speed: 160,
      gravity: -80,
      size: 12,
      life: 0.36,
      alpha: 0.85,
      texture: mote,
      blendMode: PIXI.BLEND_MODES.ADD,
    });
    return this._showEnemySkillPlaque(name, color, x, y - 88);
  }

  /** 从怪物拉光到被封的珠，再在珠上闪一下 */
  playEnemySealBeams(fromX: number, fromY: number, targets: readonly { x: number; y: number }[]): void {
    const mote = this._moteTex();
    for (const to of targets) {
      const line = new PIXI.Graphics();
      line.blendMode = PIXI.BLEND_MODES.ADD;
      line.lineStyle(2.4, 0xe8c36a, 0.85);
      line.moveTo(fromX, fromY);
      line.lineTo(to.x, to.y);
      this._scopeChildren.set(line, this._scopeId);
      this._fx.container.addChild(line);
      const fade = once(() => {
        this._scopeChildren.delete(line);
        if (displayAlive(line)) line.destroy();
      });
      TweenManager.to({
        target: line, props: { alpha: 0 }, duration: 0.28, ease: Ease.easeInQuad, onComplete: fade,
      });
      this.burst({
        x: to.x, y: to.y, color: 0xe8c36a,
        count: 5, speed: 90, gravity: 0, size: 11, life: 0.22, alpha: 0.9,
        texture: mote, blendMode: PIXI.BLEND_MODES.ADD,
      });
    }
  }

  private _spawnEnemyCastCircle(x: number, y: number, color: number): void {
    const tex = TextureCache.get(UI_FX_IMAGES.summonCircle);
    if (!tex) {
      this._spawnEnemyCastCircleFallback(x, y, color);
      return;
    }
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5);
    sp.blendMode = PIXI.BLEND_MODES.ADD;
    sp.tint = color;
    sp.position.set(x, y);
    const dest = 210 / Math.max(1, tex.width);
    sp.scale.set(dest * 0.45);
    sp.alpha = 0;
    this._scopeChildren.set(sp, this._scopeId);
    this._fx.container.addChild(sp);
    const fade = once(() => {
      this._scopeChildren.delete(sp);
      if (displayAlive(sp)) sp.destroy();
    });
    TweenManager.to({
      target: sp, props: { alpha: 0.72 }, duration: 0.12, ease: Ease.easeOutQuad,
    });
    const sc = readScale(sp);
    if (sc) {
      TweenManager.to({
        target: sc, props: { x: dest, y: dest }, duration: 0.36, ease: Ease.easeOutCubic,
      });
    }
    TweenManager.to({
      target: sp, props: { rotation: 0.7, alpha: 0 },
      duration: 0.22, delay: 0.28, ease: Ease.easeInQuad, onComplete: fade,
    });
  }

  /** 法阵图未到时：两圈描边，直径卡在约 210，避免空拍 */
  private _spawnEnemyCastCircleFallback(x: number, y: number, color: number): void {
    const g = new PIXI.Graphics();
    g.blendMode = PIXI.BLEND_MODES.ADD;
    g.position.set(x, y);
    g.lineStyle(3.2, color, 0.9);
    g.drawCircle(0, 0, 78);
    g.lineStyle(1.6, 0xe8c36a, 0.6);
    g.drawCircle(0, 0, 52);
    g.alpha = 0;
    g.scale.set(0.45);
    this._scopeChildren.set(g, this._scopeId);
    this._fx.container.addChild(g);
    const fade = once(() => {
      this._scopeChildren.delete(g);
      if (displayAlive(g)) g.destroy();
    });
    TweenManager.to({
      target: g, props: { alpha: 0.8 }, duration: 0.12, ease: Ease.easeOutQuad,
    });
    const sc = readScale(g);
    if (sc) {
      TweenManager.to({
        target: sc, props: { x: 1, y: 1 }, duration: 0.36, ease: Ease.easeOutCubic,
      });
    }
    TweenManager.to({
      target: g, props: { rotation: 0.55, alpha: 0 },
      duration: 0.22, delay: 0.28, ease: Ease.easeInQuad, onComplete: fade,
    });
  }

  private _showEnemySkillPlaque(name: string, color: number, x: number, y: number): Promise<void> {
    return new Promise((resolve) => {
      const label = name.trim() || '技能';
      const root = new PIXI.Container();
      root.position.set(x, y);
      root.alpha = 0;
      setScaleSafe(root, 0.82);

      const text = applyTextResolution(new PIXI.Text(label, {
        fontSize: 28, fill: 0xf6efe4, fontWeight: 'bold',
        stroke: 0x1a1020, strokeThickness: 4,
      }));
      text.anchor.set(0.5);
      const padX = 22;
      const padY = 10;
      const w = Math.min(Game.logicWidth - 48, text.width + padX * 2);
      const h = text.height + padY * 2;
      const plate = new PIXI.Graphics();
      plate.beginFill(0x1c1224, 0.92);
      plate.lineStyle(2.5, color, 0.95);
      plate.drawRoundedRect(-w / 2, -h / 2, w, h, 10);
      plate.endFill();
      plate.lineStyle(1, 0xe8c36a, 0.55);
      plate.drawRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 8);
      root.addChild(plate, text);
      this._scopeChildren.set(root, this._scopeId);
      this._floatLayer.addChild(root);

      const finish = once(() => {
        this._scopeChildren.delete(root);
        if (displayAlive(root)) root.destroy({ children: true });
        resolve();
      });
      minigameFallback(0.52, finish, 80);
      TweenManager.to({
        target: root, props: { alpha: 1 }, duration: 0.1, ease: Ease.easeOutQuad,
      });
      void tweenScale(root, { x: 1, y: 1 }, {
        duration: 0.12, ease: Ease.easeOutBack,
        onComplete: () => {
          void guardedTween({
            target: root, props: { alpha: 0, y: y - 18 },
            duration: 0.16, delay: 0.22, ease: Ease.easeInQuad, onComplete: finish,
          }, { onFallback: finish });
        },
      }, { onFallback: finish });
    });
  }

  /** 技能名横幅：放大弹入 → 短暂停留 → 淡出 */
  showSkillBanner(name: string, color: number): Promise<void> {
    return new Promise((resolve) => {
      const t = applyTextResolution(new PIXI.Text(name, {
        fontSize: 64, fill: color, fontWeight: 'bold',
        stroke: 0x1a1126, strokeThickness: 7,
      }));
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
            duration: UI.anim.skillBanner * 0.32, delay: UI.anim.skillBanner * 0.55,
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
