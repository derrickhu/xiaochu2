/**
 * 战斗 HUD：敌人区（立绘 / 名字 / 属性克制标签 / 血条 / 倒计时 / 区域背景）、
 * 英雄血条、Combo 大字、拖珠倒计时条、buff 状态行，以及所有「敌人/血条」相关的受击演出。
 *
 * 拥有这些显示对象与其补间显示状态；读取 BattleController 取数据，
 * 演出所需的粒子/震屏由调用方传入 BattleFx，本类不持有特效层。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { TextureCache } from '@/core/TextureCache';
import { flashWhite } from '@/core/FxLayer';
import { Platform } from '@/core/PlatformService';
import { UI, ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import { counterElementOf, resistedElementOf, type Element } from '@/balance/combat';
import { enemyImage, battleBgImage, ORB_IMAGES } from '@/config/Assets';
import type { BattleController } from '@/game/battle/BattleController';
import type { BoardView } from '@/game/board/BoardView';
import { delay } from './battleWidgets';
import type { BattleLayout } from './BattleLayout';
import type { BattleFx } from './BattleFx';
import { ComboDisplay } from './ComboDisplay';

export class BattleHud {
  private _waveText!: PIXI.Text;
  private _enemySprite!: PIXI.Sprite;
  private _enemyBgSprite!: PIXI.Sprite;
  private _enemyAreaTop = 0;
  private _enemyAreaBottom = 0;
  private _enemyContainer!: PIXI.Container;
  private _enemyHpBar!: PIXI.Graphics;
  private _enemyHpText!: PIXI.Text;
  private _enemyNameText!: PIXI.Text;
  private _enemyElementRow!: PIXI.Container;
  private _enemyCdText!: PIXI.Text;
  private _heroHpBar!: PIXI.Graphics;
  private _heroHpText!: PIXI.Text;
  private _dragBar!: PIXI.Graphics;
  private _combo!: ComboDisplay;
  private _statusText!: PIXI.Text;

  /** 血条显示状态：shown = 主条（快速跟随），white = 损血白条（延迟收缩） */
  private _enemyHpDisp = { shown: 1, white: 1 };
  private _heroHpDisp = { shown: 1, white: 1 };

  constructor(private readonly _ctrl: BattleController, private readonly _layout: BattleLayout) {}

  // ════════════ 构建 ════════════

  /** 敌人区背景：宽适配 + 底对齐（对齐 xiao_chu），仅底渐隐，顶部不压暗 */
  buildEnemyBg(parent: PIXI.Container): void {
    const w = Game.logicWidth;
    const areaTop = this._layout.enemyAreaTop;
    const areaBottom = this._layout.enemyAreaBottom;
    const areaH = areaBottom - areaTop;
    this._enemyAreaTop = areaTop;
    this._enemyAreaBottom = areaBottom;

    const layer = new PIXI.Container();
    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawRect(0, areaTop, w, areaH);
    mask.endFill();
    layer.mask = mask;
    layer.addChild(mask);

    this._enemyBgSprite = new PIXI.Sprite();
    this._enemyBgSprite.anchor.set(0.5, 1);
    this._enemyBgSprite.position.set(w / 2, areaBottom);
    layer.addChild(this._enemyBgSprite);

    const dim = new PIXI.Graphics();
    dim.beginFill(0x000000, 0.15);
    dim.drawRect(0, areaTop, w, areaH);
    dim.endFill();
    layer.addChild(dim);

    // xiao_chu 只有底部 20% 渐隐，顶部让背景图自然延伸供关卡信息区使用
    layer.addChild(this._makeVerticalFade(
      0, areaBottom - areaH * 0.2, w, areaH * 0.2, 0x0a0810, 0, 0.5,
    ));

    parent.addChild(layer);
  }

  /** 敌人区：波次文字 + 立绘容器 + 名字 + 属性克制行 + 血条 + 倒计时 */
  buildEnemyArea(parent: PIXI.Container): void {
    const w = Game.logicWidth;
    const { enemyCenterX, enemyCenterY, headerY, enemyNameY, enemyTagY, enemyHpBarY } = this._layout;

    this._waveText = new PIXI.Text('', { fontSize: 26, fill: 0x9b8cc4 });
    this._waveText.anchor.set(1, 0.5);
    this._waveText.position.set(w - 30, headerY);
    parent.addChild(this._waveText);

    this._enemyContainer = new PIXI.Container();
    this._enemyContainer.position.set(enemyCenterX, enemyCenterY);
    this._enemySprite = new PIXI.Sprite();
    this._enemySprite.anchor.set(0.5);
    this._enemyContainer.addChild(this._enemySprite);
    parent.addChild(this._enemyContainer);

    this._enemyNameText = new PIXI.Text('', {
      fontSize: 26, fill: 0xffffff, fontWeight: 'bold',
      dropShadow: true, dropShadowColor: 0x000000, dropShadowBlur: 4, dropShadowDistance: 2,
    });
    this._enemyNameText.anchor.set(0.5);
    this._enemyNameText.position.set(w / 2, enemyNameY);
    parent.addChild(this._enemyNameText);

    this._enemyElementRow = new PIXI.Container();
    this._enemyElementRow.position.set(w / 2, enemyTagY);
    parent.addChild(this._enemyElementRow);

    this._enemyHpBar = new PIXI.Graphics();
    parent.addChild(this._enemyHpBar);
    this._enemyHpText = new PIXI.Text('', { fontSize: 22, fill: 0xffffff });
    this._enemyHpText.anchor.set(0.5);
    this._enemyHpText.position.set(
      w / 2, enemyHpBarY + UI.battle.enemyHpBarHeight / 2,
    );
    parent.addChild(this._enemyHpText);

    this._enemyCdText = new PIXI.Text('', { fontSize: 24, fill: 0xffb74d });
    this._enemyCdText.anchor.set(0.5);
    this._enemyCdText.position.set(w / 2, enemyHpBarY + UI.battle.enemyHpBarHeight + 22);
    parent.addChild(this._enemyCdText);
  }

  buildHeroBar(parent: PIXI.Container): void {
    this._heroHpBar = new PIXI.Graphics();
    parent.addChild(this._heroHpBar);
    this._heroHpText = new PIXI.Text('', { fontSize: 22, fill: 0xffffff });
    this._heroHpText.anchor.set(0.5);
    this._heroHpText.position.set(
      Game.logicWidth / 2, this._layout.heroBarY + UI.battle.heroHpBarHeight / 2,
    );
    parent.addChild(this._heroHpText);
  }

  buildDragBar(parent: PIXI.Container): void {
    this._dragBar = new PIXI.Graphics();
    parent.addChild(this._dragBar);
  }

  buildCombo(parent: PIXI.Container): void {
    this._combo = new ComboDisplay(this._layout);
    this._combo.build(parent);
  }

  /** 增伤 buff 状态行（护盾已在血条上展示） */
  buildStatus(parent: PIXI.Container): void {
    this._statusText = new PIXI.Text('', { fontSize: 22, fill: 0x8fd4ff, fontWeight: 'bold' });
    this._statusText.anchor.set(1, 0.5);
    this._statusText.position.set(Game.logicWidth - UI.board.marginX, this._layout.heroBarY - 20);
    parent.addChild(this._statusText);
  }

  /** 纯 Graphics 竖向渐隐（避免依赖 canvas 渐变，兼容小游戏端） */
  private _makeVerticalFade(
    x: number, y: number, w: number, h: number,
    color: number, fromAlpha: number, toAlpha: number,
  ): PIXI.Graphics {
    const g = new PIXI.Graphics();
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const a = fromAlpha + (toAlpha - fromAlpha) * t;
      g.beginFill(color, a);
      g.drawRect(x, y + (h / steps) * i, w, h / steps + 1);
      g.endFill();
    }
    return g;
  }

  // ════════════ 每帧重绘 ════════════

  /** 每帧重绘双方血条（主条 + 损血白条均为补间值） */
  redrawHpBars(): void {
    // ---- 敌人 ----
    {
      const { enemyHpBarWidth: bw, enemyHpBarHeight: bh } = UI.battle;
      const x = (Game.logicWidth - bw) / 2;
      const y = this._layout.enemyHpBarY;
      const g = this._enemyHpBar;
      const { shown, white } = this._enemyHpDisp;
      g.clear();
      g.beginFill(0x1a1126);
      g.drawRoundedRect(x, y, bw, bh, bh / 2);
      g.endFill();
      if (white > 0.001) {
        g.beginFill(0xf5e0d3);
        g.drawRoundedRect(x, y, Math.max(bw * white, bh), bh, bh / 2);
        g.endFill();
      }
      if (shown > 0.001) {
        g.beginFill(shown > 0.3 ? 0xe8554d : 0xff2d2d);
        g.drawRoundedRect(x, y, Math.max(bw * shown, bh), bh, bh / 2);
        g.endFill();
      }
    }
    // ---- 英雄（绿条从起点按 hp/max；护盾从起点同色段覆盖，先扣覆盖段再扣绿条） ----
    {
      const { heroHpBarHeight: bh } = UI.battle;
      const x = UI.board.marginX;
      const bw = Game.logicWidth - x * 2;
      const g = this._heroHpBar;
      const { shown, white } = this._heroHpDisp;
      const heroBarY = this._layout.heroBarY;
      const shield = this._ctrl.shield;
      const maxHp = this._ctrl.heroMaxHp;

      g.clear();
      g.beginFill(0x1a1126);
      g.drawRoundedRect(x, heroBarY, bw, bh, bh / 2);
      g.endFill();

      if (white > shown + 0.001) {
        g.beginFill(0xeadfc8);
        g.drawRoundedRect(x, heroBarY, Math.max(bw * white, bh), bh, bh / 2);
        g.endFill();
      }

      const greenW = shown > 0.001 ? Math.max(bw * shown, bh) : 0;
      if (greenW > 0.001) {
        g.beginFill(shown > 0.3 ? 0x6fd86a : 0xffb74d);
        g.drawRoundedRect(x, heroBarY, greenW, bh, bh / 2);
        g.endFill();
      }

      if (shield > 0 && maxHp > 0 && greenW > 0.001) {
        const shieldW = Math.min(bw * (shield / maxHp), greenW);
        if (shieldW > 1) {
          g.beginFill(0x40b8e0);
          g.drawRoundedRect(x, heroBarY, shieldW, bh, bh / 2);
          g.endFill();
          g.beginFill(0xffffff, 0.35);
          g.drawRoundedRect(x + 2, heroBarY + 1, Math.max(shieldW - 4, 0), bh * 0.35, bh / 4);
          g.endFill();
        }
        const hpHighlightW = Math.max(greenW - shieldW - 4, 0);
        if (hpHighlightW > 0) {
          g.beginFill(0xffffff, 0.35);
          g.drawRoundedRect(x + shieldW + 2, heroBarY + 1, hpHighlightW, bh * 0.35, bh / 4);
          g.endFill();
        }
      } else if (greenW > 0.001) {
        g.beginFill(0xffffff, 0.35);
        g.drawRoundedRect(x + 2, heroBarY + 1, Math.max(greenW - 4, 0), bh * 0.35, bh / 4);
        g.endFill();
      }
    }
  }

  redrawDragBar(boardView: BoardView | null): void {
    const g = this._dragBar;
    g.clear();
    if (!boardView?.dragging) return;
    const left = boardView.dragTimeLeft;
    const w = boardView.boardWidth * left;
    const y = this._layout.boardY - UI.battle.dragBarHeight - 4;
    g.beginFill(0x3a2d58);
    g.drawRoundedRect(this._layout.boardX, y, boardView.boardWidth, UI.battle.dragBarHeight, 5);
    g.endFill();
    g.beginFill(left > 0.3 ? 0x6fd86a : 0xff7a5c);
    g.drawRoundedRect(this._layout.boardX, y, Math.max(w, 8), UI.battle.dragBarHeight, 5);
    g.endFill();
  }

  /** 血条补间：主条快速跟随，掉血时白条延迟收缩展示刚损失的部分 */
  private _animateHp(disp: { shown: number; white: number }, ratio: number): void {
    TweenManager.cancelTarget(disp);
    if (ratio >= disp.white) {
      disp.white = ratio;
    }
    TweenManager.to({
      target: disp, props: { shown: ratio },
      duration: UI.anim.hpTween, ease: Ease.easeOutQuad,
    });
    if (ratio < disp.white) {
      TweenManager.to({
        target: disp, props: { white: ratio },
        duration: UI.anim.hpWhiteTween, delay: UI.anim.hpWhiteDelay, ease: Ease.easeOutQuad,
      });
    }
  }

  // ════════════ 数据刷新 ════════════

  /** 刷新敌人立绘/名字/血条/倒计时（switchWave = 是否波次切换） */
  refreshEnemy(switchWave: boolean): void {
    const enemy = this._ctrl.enemy;
    const tex = TextureCache.get(enemy.def.image ?? enemyImage(enemy.def.id));
    if (tex) {
      this._enemySprite.texture = tex;
      const scale = UI.battle.enemySize / Math.max(tex.width, tex.height);
      this._enemySprite.scale.set(scale);
    }
    if (!switchWave) this._enemyContainer.alpha = 1;
    const ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
    TweenManager.cancelTarget(this._enemyHpDisp);
    this._enemyHpDisp.shown = ratio;
    this._enemyHpDisp.white = ratio;
    this._enemyNameText.text =
      `${enemy.def.name} · ${ELEMENT_NAME[enemy.def.element]}属性`;
    this._enemyNameText.style.fill = ORB_COLOR[enemy.def.element];
    this._refreshEnemyElementTags(enemy.def.element);
    // 背景按关卡属性（与 assetPreload / 场景设计一致），不按当前敌人属性
    this._refreshEnemyBg(this._ctrl.stage.element);
    this._waveText.text = `第 ${this._ctrl.waveIndex + 1}/${this._ctrl.totalWaves} 波`;
    this.refreshEnemyHp();
    this.refreshEnemyCd();
  }

  /** 切换敌人区背景：底对齐；高度不足时 cover 补顶，避免顶部蓝黑留空 */
  private _refreshEnemyBg(element: Element): void {
    const tex = TextureCache.get(battleBgImage(element));
    if (!tex) {
      this._enemyBgSprite.visible = false;
      return;
    }
    this._enemyBgSprite.visible = true;
    this._enemyBgSprite.texture = tex;
    const w = Game.logicWidth;
    const areaH = this._enemyAreaBottom - this._enemyAreaTop;
    const fitW = w / tex.width;
    const fitH = areaH / tex.height;
    this._enemyBgSprite.scale.set(Math.max(fitW, fitH));
  }

  /** 敌人属性克制提示：弱点珠 / 抵抗珠（对齐 xiao_chu） */
  private _refreshEnemyElementTags(element: Element): void {
    this._enemyElementRow.removeChildren();
    const weak = counterElementOf(element);
    const resist = resistedElementOf(element);
    const gap = 10;
    const weakBanned = this._ctrl.bannedElements.has(weak);
    const weakLabel = weakBanned
      ? `拖${ELEMENT_NAME[weak]}珠克制·本关封印`
      : `拖${ELEMENT_NAME[weak]}珠克制`;
    const weakTag = this._makeElementCounterTag(weakLabel, weak, !weakBanned);
    const resistTag = this._makeElementCounterTag(
      `抵抗${ELEMENT_NAME[resist]}珠`, resist, false,
    );
    const totalW = weakTag.tagW + gap + resistTag.tagW;
    weakTag.position.set(-totalW / 2, -weakTag.tagH / 2);
    resistTag.position.set(-totalW / 2 + weakTag.tagW + gap, -resistTag.tagH / 2);
    this._enemyElementRow.addChild(weakTag, resistTag);
  }

  private _makeElementCounterTag(
    label: string,
    element: Element,
    highlight: boolean,
  ): PIXI.Container & { tagW: number; tagH: number } {
    const color = ORB_COLOR[element];
    const fontSize = 20;
    const orbSize = 14;
    const padX = 8;
    const padY = 4;
    const text = new PIXI.Text(label, {
      fontSize,
      fill: highlight ? 0xffffff : 0xaaaaaa,
      fontWeight: 'bold',
    });
    const tagW = text.width + orbSize + padX * 2 + 6;
    const tagH = Math.max(text.height, orbSize) + padY * 2;
    const bg = new PIXI.Graphics();
    if (highlight) {
      bg.beginFill(color, 0.25);
      bg.lineStyle(1.5, color, 0.6);
    } else {
      bg.beginFill(0x3c3c50, 0.6);
      bg.lineStyle(1, 0x9696aa, 0.4);
    }
    bg.drawRoundedRect(0, 0, tagW, tagH, tagH / 2);
    bg.endFill();
    text.position.set(padX, (tagH - text.height) / 2);
    const orb = new PIXI.Sprite(TextureCache.get(ORB_IMAGES[element]) ?? PIXI.Texture.WHITE);
    orb.width = orbSize;
    orb.height = orbSize;
    orb.anchor.set(0.5);
    orb.position.set(padX + text.width + 3 + orbSize / 2, tagH / 2);
    if (!orb.texture || orb.texture === PIXI.Texture.WHITE) orb.tint = color;
    const tag = new PIXI.Container() as PIXI.Container & { tagW: number; tagH: number };
    tag.tagW = tagW;
    tag.tagH = tagH;
    tag.addChild(bg, text, orb);
    return tag;
  }

  refreshEnemyHp(): void {
    const enemy = this._ctrl.enemy;
    const ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
    this._enemyHpText.text = `${enemy.hp} / ${enemy.maxHp}`;
    this._animateHp(this._enemyHpDisp, ratio);
  }

  /** 敌人状态行：蓄力预告（红字）优先于普攻倒计时，附加减伤状态 */
  refreshEnemyCd(): void {
    const enemy = this._ctrl.enemy;
    if (enemy.hp <= 0) {
      this._enemyCdText.text = '';
      return;
    }
    const parts: string[] = [];
    if (enemy.charging) {
      parts.push(`⚠ 蓄力中！下回合重击 ×${enemy.charging.mult}`);
      this._enemyCdText.style.fill = 0xff5252;
      TweenManager.cancelTarget(this._enemyCdText.scale);
      this._enemyCdText.scale.set(1.25);
      TweenManager.to({
        target: this._enemyCdText.scale, props: { x: 1, y: 1 },
        duration: UI.anim.chargeWarn, ease: Ease.easeOutQuad,
      });
    } else {
      parts.push(`${enemy.attackCountdown} 回合后攻击`);
      this._enemyCdText.style.fill = 0xffb74d;
    }
    if (enemy.dmgReduction) {
      parts.push(`减伤${Math.round(enemy.dmgReduction.reduction * 100)}%·剩${enemy.dmgReduction.turnsLeft}回合`);
    }
    this._enemyCdText.text = parts.join('  ');
  }

  refreshHeroHp(): void {
    const ratio = this._ctrl.heroHp / this._ctrl.heroMaxHp;
    this._refreshHeroHpText();
    this._animateHp(this._heroHpDisp, ratio);
  }

  private _refreshHeroHpText(): void {
    const sh = this._ctrl.shield;
    this._heroHpText.text = sh > 0
      ? `${this._ctrl.heroHp} / ${this._ctrl.heroMaxHp}  +${sh}`
      : `${this._ctrl.heroHp} / ${this._ctrl.heroMaxHp}`;
  }

  /** 增伤等 buff 状态行（护盾由血条青色段展示） */
  refreshStatus(): void {
    this._refreshHeroHpText();
    const parts: string[] = [];
    if (this._ctrl.dmgBuff) {
      parts.push(`伤害×${this._ctrl.dmgBuff.mult} 剩${this._ctrl.dmgBuff.turnsLeft}回合`);
    }
    this._statusText.text = parts.join('   ');
  }

  // ════════════ Combo ════════════

  /** Combo 跳字 + 粒子/闪光（对齐 xiao_chu 棋盘中央展示） */
  showCombo(combo: number, fx: BattleFx): void {
    this._combo.show(combo, fx);
  }

  hideCombo(): void {
    this._combo.hide();
  }

  updateCombo(dt: number): void {
    this._combo.update(dt);
  }

  /** 英雄血条数字受击跳动 */
  pulseHeroHpText(heavy: boolean): void {
    TweenManager.cancelTarget(this._heroHpText.scale);
    const s = heavy ? 1.38 : 1.22;
    this._heroHpText.scale.set(s);
    TweenManager.to({
      target: this._heroHpText.scale,
      props: { x: 1, y: 1 },
      duration: 0.28,
      ease: Ease.easeOutBack,
    });
  }

  // ════════════ 敌人受击 / 行动演出 ════════════

  /** 受击三件套：闪白 + 击退回弹 + 属性色粒子飞溅；大伤害附加震屏 */
  playEnemyHit(fx: BattleFx, element: Element, damage: number, forceStrong = false): void {
    const c = this._enemyContainer;
    const { enemyCenterX, enemyCenterY } = this._layout;
    TweenManager.cancelTarget(c);
    c.x = enemyCenterX;
    flashWhite(this._enemySprite, UI.anim.enemyWhiteFlash);
    fx.burst({
      x: enemyCenterX + (Math.random() - 0.5) * 60,
      y: enemyCenterY + (Math.random() - 0.5) * 60,
      color: ORB_COLOR[element],
      count: 9, speed: 430, size: 15, life: 0.4,
    });
    TweenManager.to({
      target: c, props: { x: enemyCenterX + 18 },
      duration: UI.anim.enemyHitFlash / 2, ease: Ease.easeOutQuad,
      onComplete: () => {
        TweenManager.to({
          target: c, props: { x: enemyCenterX },
          duration: UI.anim.enemyHitFlash, ease: Ease.easeOutQuad,
        });
      },
    });
    if (forceStrong || damage >= this._ctrl.enemy.maxHp * 0.15) {
      fx.shakeMedium();
      Platform.vibrateShort('medium');
    }
  }

  /** 敌人死亡：闪白 + 碎裂粒子 + 缩小淡出 */
  playEnemyDeath(fx: BattleFx): Promise<void> {
    const { enemyCenterX, enemyCenterY } = this._layout;
    flashWhite(this._enemySprite, 0.16, 0.95);
    const color = ORB_COLOR[this._ctrl.enemy.def.element];
    fx.burst({
      x: enemyCenterX, y: enemyCenterY,
      color: 0xffffff, count: 12, speed: 520, size: 20, life: 0.55,
    });
    fx.burst({
      x: enemyCenterX, y: enemyCenterY,
      color, count: 10, speed: 380, size: 15, life: 0.5,
    });
    fx.shakeMedium();
    Platform.vibrateShort('heavy');
    return new Promise((resolve) => {
      TweenManager.to({
        target: this._enemyContainer, props: { alpha: 0 },
        duration: UI.anim.enemyDeath, ease: Ease.easeInQuad,
        onComplete: resolve,
      });
      TweenManager.to({
        target: this._enemyContainer.scale, props: { x: 0.7, y: 0.7 },
        duration: UI.anim.enemyDeath, ease: Ease.easeInCubic,
      });
    });
  }

  playWaveEnter(): Promise<void> {
    this.refreshEnemy(true);
    const { enemyCenterX } = this._layout;
    return new Promise((resolve) => {
      this._enemyContainer.alpha = 0;
      this._enemyContainer.scale.set(1);
      this._enemyContainer.x = enemyCenterX + 160;
      TweenManager.to({
        target: this._enemyContainer, props: { alpha: 1, x: enemyCenterX },
        duration: UI.anim.waveEnter, ease: Ease.easeOutQuad,
        onComplete: resolve,
      });
    });
  }

  /** 敌人攻击：蓄力缩放 → 属性弹道飞向英雄血条 → 命中反馈（onHeroHit 由编排者注入） */
  playEnemyAttack(
    fx: BattleFx, damage: number, absorbed: number, heavy: boolean, onHeroHit: () => void,
  ): Promise<void> {
    const element = this._ctrl.enemy.def.element;
    const { enemyCenterX, enemyCenterY, heroBarY } = this._layout;
    const toX = Game.logicWidth / 2;
    const toY = heroBarY;
    const baseScale = this._enemySprite.scale.x;

    return new Promise((resolve) => {
      TweenManager.cancelTarget(this._enemySprite.scale);
      TweenManager.to({
        target: this._enemySprite.scale,
        props: {
          x: baseScale * (heavy ? 1.14 : 1.08),
          y: baseScale * (heavy ? 1.14 : 1.08),
        },
        duration: heavy ? 0.14 : 0.1,
        ease: Ease.easeOutQuad,
        onComplete: () => {
          void fx.fireProjectileBetween(
            enemyCenterX, enemyCenterY, toX, toY, element,
            {
              heavy,
              size: heavy ? 58 : 46,
              duration: heavy ? UI.anim.enemyProjectileHeavy : UI.anim.enemyProjectile,
            },
          ).then(() => {
            TweenManager.to({
              target: this._enemySprite.scale,
              props: { x: baseScale, y: baseScale },
              duration: 0.12,
              ease: Ease.easeOutQuad,
            });
            onHeroHit();
            resolve();
          });
        },
      });
    });
  }

  /** 蓄力起手：红色凝聚粒子 + 立绘膨胀脉冲（预告文字由 refreshEnemyCd 常驻） */
  async playEnemyCharge(fx: BattleFx): Promise<void> {
    const { enemyCenterX, enemyCenterY } = this._layout;
    fx.burst({
      x: enemyCenterX, y: enemyCenterY,
      color: 0xff5252, count: 14, speed: 200, gravity: -350,
      size: 14, life: UI.anim.chargeWarn,
    });
    fx.spawnFloat('蓄力中！', enemyCenterX, enemyCenterY - 60, 0xff5252, 1.3);
    Platform.vibrateShort('medium');
    const s = this._enemyContainer.scale;
    await new Promise<void>((resolve) => {
      TweenManager.to({
        target: s, props: { x: 1.12, y: 1.12 },
        duration: UI.anim.chargeWarn / 2, ease: Ease.easeOutQuad,
        onComplete: () => {
          TweenManager.to({
            target: s, props: { x: 1, y: 1 },
            duration: UI.anim.chargeWarn / 2, ease: Ease.easeInQuad,
            onComplete: resolve,
          });
        },
      });
    });
  }

  async playEnemyHeal(fx: BattleFx, healed: number): Promise<void> {
    const { enemyCenterX, enemyCenterY } = this._layout;
    fx.burst({
      x: enemyCenterX, y: enemyCenterY,
      color: 0x8be78b, count: 12, speed: 240, gravity: -250, size: 14, life: 0.55,
    });
    fx.spawnFloat(`+${healed}`, enemyCenterX, enemyCenterY - 50, 0x8be78b, 1.2);
    this.refreshEnemyHp();
    await delay(0.45);
  }

  async playEnemyShield(fx: BattleFx): Promise<void> {
    const { enemyCenterX, enemyCenterY } = this._layout;
    fx.burst({
      x: enemyCenterX, y: enemyCenterY,
      color: 0xb0c4de, count: 12, speed: 260, gravity: -150, size: 15, life: 0.5,
    });
    fx.spawnFloat('减伤护壁！', enemyCenterX, enemyCenterY - 50, 0xb0c4de, 1.2);
    this.refreshEnemyCd();
    await delay(0.45);
  }
}
