/**
 * 抽卡揭示演出序列（职责解耦：抽卡场景只做编排与构建，时间轴/特效集中在此）。
 *
 * 时间轴（高品质会追加庆祝段）：
 *   全屏属性闪 → 召唤法阵旋入 + 光柱升起 + V2 金色放射光
 *   → 标题入场 → 结果卡逐张揭示 → 花瓣飘落
 *   → 若含 SSR/UR：星爆 + 光环脉冲 + 金色粒子 + 重震屏 + 强震动。
 *
 * 提供 skip()：随时跳到最终态（法阵淡出、所有卡到位、按钮回调触发）。
 */
import * as PIXI from 'pixi.js';
import { TweenManager, Ease } from '@/core/TweenManager';
import { getRarity, type Rarity } from '@/balance/rarity';
import type { PullOutcome } from '@/game/gacha/Gacha';
import { popIn } from '@/ui';

export interface GachaRevealHandles {
  /** 卡片之下的特效层：法阵 / 光柱 / 光环 / 放射光挂这里 */
  fxBack: PIXI.Container;
  /** 卡片之上的特效层：星爆 / 粒子 / 花瓣挂这里 */
  fxFront: PIXI.Container;
  /** 已构建好的结果卡（已定位到最终坐标），逐张揭示 */
  cards: readonly PIXI.Container[];
  /** 结果标题（起始隐藏） */
  heading: PIXI.Container;
}

export interface GachaRevealTextures {
  pillar: PIXI.Texture | null;
  circle: PIXI.Texture | null;
  starburst: PIXI.Texture | null;
  aura: PIXI.Texture | null;
  spark: PIXI.Texture | null;
  rays: PIXI.Texture | null;
  petal: PIXI.Texture | null;
}

export interface GachaRevealDeps {
  w: number;
  h: number;
  centerY: number;
  outcomes: readonly PullOutcome[];
  handles: GachaRevealHandles;
  textures: GachaRevealTextures;
  flash: (color: number, peak?: number, dur?: number) => void;
  shake: (level: 'light' | 'medium' | 'heavy') => void;
  burst: (x: number, y: number, color: number, strong: boolean) => void;
  vibrate: (pattern: 'light' | 'medium' | 'heavy') => void;
  onDone: () => void;
}

export class GachaRevealSequence {
  private readonly _timers: ReturnType<typeof setTimeout>[] = [];
  private readonly _transient: PIXI.Container[] = [];
  /** 收尾时保留较高 alpha 的氛围光（放射光） */
  private readonly _ambient: PIXI.Container[] = [];
  private readonly _cardFinalY: number[] = [];
  private _done = false;

  constructor(private readonly _deps: GachaRevealDeps) {}

  play(): void {
    const d = this._deps;
    const highest = d.outcomes.reduce<Rarity>((m, o) => (o.rarity > m ? o.rarity : m), 1);
    const color = getRarity(highest).color;
    const celebrate = highest >= 3;
    const cx = d.w / 2;
    const cy = d.centerY;

    d.handles.cards.forEach((c) => this._cardFinalY.push(c.y));
    d.handles.cards.forEach((c) => { c.alpha = 0; });
    d.handles.heading.alpha = 0;

    // 0ms：属性闪 + 法阵 + 光柱 + V2 放射光
    d.flash(color, 0.5, 0.4);
    d.shake('light');
    d.vibrate('light');
    this._spawnSummonCircle(cx, cy, color);
    this._spawnLightPillar(cx, cy, color);
    this._spawnRays(cx, cy, color);

    // 700ms：标题入场
    this._at(700, () => popIn(d.handles.heading, { duration: 0.3 }));

    // 900ms 起：结果卡逐张揭示
    const revealStart = 900;
    const stepMs = d.outcomes.length > 1 ? 110 : 0;
    d.handles.cards.forEach((card, i) => {
      this._at(revealStart + i * stepMs, () => {
        const o = d.outcomes[i];
        card.alpha = 1;
        popIn(card, { duration: 0.34, fromScale: 0.6 });
        if (o.rarity >= 3) {
          d.burst(card.x, card.y, getRarity(o.rarity).color, o.rarity >= 4);
        }
      });
    });

    // 花瓣：卡揭示后飘落
    const petalAt = revealStart + Math.max(0, (d.outcomes.length - 1) * stepMs) + 80;
    this._at(petalAt, () => this._spawnPetals(12 + (celebrate ? 10 : 0)));

    const celebrateAt = revealStart + d.outcomes.length * stepMs + 240;
    if (celebrate) {
      this._at(celebrateAt, () => {
        this._spawnStarburst(cx, cy, color);
        this._spawnAuraRing(cx, cy, color);
        d.flash(color, 0.42, 0.5);
        d.shake(highest >= 4 ? 'heavy' : 'medium');
        d.vibrate('heavy');
        d.burst(cx, cy, color, true);
      });
    }

    const endAt = celebrate ? celebrateAt + 650 : celebrateAt;
    this._at(endAt, () => {
      this._dimBackdrop();
      this._finish();
    });
  }

  skip(): void {
    if (this._done) return;
    for (const t of this._timers) clearTimeout(t);
    this._timers.length = 0;

    const d = this._deps;
    d.handles.heading.alpha = 1;
    d.handles.heading.scale.set(1);
    d.handles.cards.forEach((card, i) => {
      TweenManager.cancelTarget(card);
      TweenManager.cancelTarget(card.scale);
      card.alpha = 1;
      card.scale.set(1);
      card.y = this._cardFinalY[i] ?? card.y;
    });
    // skip 时仍补一层氛围光 + 少量花瓣，避免结果页「干瘪」
    if (this._ambient.length === 0) {
      this._spawnRays(d.w / 2, d.centerY, getRarity(
        d.outcomes.reduce<Rarity>((m, o) => (o.rarity > m ? o.rarity : m), 1),
      ).color);
    }
    this._spawnPetals(8);
    this._dimBackdrop(true);
    this._finish();
  }

  destroy(): void {
    for (const t of this._timers) clearTimeout(t);
    this._timers.length = 0;
    for (const c of [...this._transient, ...this._ambient]) {
      TweenManager.cancelTarget(c);
      if (!c.destroyed) c.destroy();
    }
    this._transient.length = 0;
    this._ambient.length = 0;
  }

  private _finish(): void {
    if (this._done) return;
    this._done = true;
    this._deps.onDone();
  }

  private _at(ms: number, fn: () => void): void {
    this._timers.push(setTimeout(() => {
      if (this._done) return;
      fn();
    }, ms));
  }

  private _addGlow(
    tex: PIXI.Texture | null,
    parent: PIXI.Container,
    x: number,
    y: number,
    ambient = false,
  ): PIXI.Sprite | null {
    if (!tex) return null;
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5);
    sp.position.set(x, y);
    sp.blendMode = PIXI.BLEND_MODES.ADD;
    parent.addChild(sp);
    (ambient ? this._ambient : this._transient).push(sp);
    return sp;
  }

  private _spawnSummonCircle(x: number, y: number, color: number): void {
    const sp = this._addGlow(this._deps.textures.circle, this._deps.handles.fxBack, x, y);
    if (!sp) return;
    sp.tint = color;
    sp.scale.set(0.3);
    sp.alpha = 0;
    const targetScale = (this._deps.w * 0.95) / sp.texture.width;
    // V2 结果页以卡后放射光为主，法阵只作轻点缀
    TweenManager.to({ target: sp, props: { alpha: 0.28 }, duration: 0.4, ease: Ease.easeOutQuad });
    TweenManager.to({
      target: sp.scale, props: { x: targetScale * 0.85, y: targetScale * 0.85 },
      duration: 0.6, ease: Ease.easeOutCubic,
    });
    TweenManager.to({ target: sp, props: { rotation: Math.PI * 2 }, duration: 8, ease: Ease.linear });
  }

  private _spawnLightPillar(x: number, y: number, color: number): void {
    const sp = this._addGlow(this._deps.textures.pillar, this._deps.handles.fxBack, x, y);
    if (!sp) return;
    sp.tint = color;
    const baseScale = (this._deps.h * 1.1) / sp.texture.height;
    sp.scale.set(baseScale * 0.35, 0);
    sp.alpha = 0;
    TweenManager.to({ target: sp, props: { alpha: 0.32 }, duration: 0.35, ease: Ease.easeOutQuad });
    TweenManager.to({
      target: sp.scale, props: { x: baseScale * 0.45, y: baseScale * 0.9 },
      duration: 0.5, ease: Ease.easeOutCubic,
    });
  }

  /** V2 核心：卡后金色放射光（暖金、更亮、收尾仍保留） */
  private _spawnRays(x: number, y: number, _color: number): void {
    const sp = this._addGlow(this._deps.textures.rays, this._deps.handles.fxBack, x, y, true);
    if (!sp) return;
    // 固定暖金，不被稀有度染成灰绿
    sp.tint = 0xffe08a;
    sp.scale.set(0.25);
    sp.alpha = 0;
    const target = (this._deps.w * 1.55) / sp.texture.width;
    TweenManager.to({ target: sp, props: { alpha: 1 }, duration: 0.4, ease: Ease.easeOutQuad });
    TweenManager.to({
      target: sp.scale, props: { x: target, y: target },
      duration: 0.65, ease: Ease.easeOutCubic,
    });
    TweenManager.to({
      target: sp, props: { rotation: Math.PI * 0.06 },
      duration: 6, ease: Ease.linear,
    });
  }

  private _spawnStarburst(x: number, y: number, color: number): void {
    const sp = this._addGlow(this._deps.textures.starburst, this._deps.handles.fxFront, x, y);
    if (!sp) return;
    sp.tint = color;
    sp.scale.set(0.2);
    sp.alpha = 1;
    const target = (this._deps.w * 1.2) / sp.texture.width;
    TweenManager.to({
      target: sp.scale, props: { x: target, y: target },
      duration: 0.6, ease: Ease.easeOutCubic,
    });
    TweenManager.to({ target: sp, props: { alpha: 0 }, duration: 0.7, ease: Ease.easeOutQuad });
  }

  private _spawnAuraRing(x: number, y: number, color: number): void {
    const sp = this._addGlow(this._deps.textures.aura, this._deps.handles.fxBack, x, y);
    if (!sp) return;
    sp.tint = color;
    sp.scale.set(0.4);
    sp.alpha = 0.9;
    const target = (this._deps.w * 1.0) / sp.texture.width;
    TweenManager.to({
      target: sp.scale, props: { x: target, y: target },
      duration: 0.7, ease: Ease.easeOutCubic,
    });
    TweenManager.to({ target: sp, props: { alpha: 0 }, duration: 0.8, ease: Ease.easeOutQuad });
  }

  /** 花瓣飘落（对齐 V2 氛围） */
  private _spawnPetals(count: number): void {
    const tex = this._deps.textures.petal;
    if (!tex) return;
    const d = this._deps;
    for (let i = 0; i < count; i++) {
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      const scale = 0.18 + Math.random() * 0.22;
      sp.scale.set(scale);
      sp.alpha = 0.55 + Math.random() * 0.35;
      sp.rotation = Math.random() * Math.PI * 2;
      const x = d.w * (0.08 + Math.random() * 0.84);
      const y0 = d.h * (0.05 + Math.random() * 0.25);
      sp.position.set(x, y0);
      d.handles.fxFront.addChild(sp);
      this._transient.push(sp);
      const dur = 2.4 + Math.random() * 1.8;
      const drift = (Math.random() - 0.5) * d.w * 0.25;
      TweenManager.to({
        target: sp,
        props: { y: d.h * 0.92, x: x + drift, rotation: sp.rotation + Math.PI * (1 + Math.random()) },
        duration: dur,
        ease: Ease.linear,
      });
      TweenManager.to({
        target: sp,
        props: { alpha: 0 },
        duration: dur,
        ease: Ease.easeInQuad,
        delay: dur * 0.55,
      });
    }
  }

  private _dimBackdrop(instant = false): void {
    for (const c of this._transient) {
      if (c.destroyed) continue;
      if (instant) { c.alpha = Math.min(c.alpha, 0.12); continue; }
      TweenManager.to({ target: c, props: { alpha: 0.12 }, duration: 0.4, ease: Ease.easeOutQuad });
    }
    // 放射光收尾仍很亮（V2 宠卡「亮丽」主光源）
    for (const c of this._ambient) {
      if (c.destroyed) continue;
      if (instant) { c.alpha = Math.min(c.alpha, 0.72); continue; }
      TweenManager.to({ target: c, props: { alpha: 0.72 }, duration: 0.45, ease: Ease.easeOutQuad });
    }
  }
}
