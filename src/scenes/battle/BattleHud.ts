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
import { guardedTween, displayAlive, readScale, resetScale, cancelDisplayTweens, tweenScale } from '@/core/animationGuard';
import { UI, ORB_COLOR } from '@/balance/ui';
import {
  enemyDisplaySize,
  enemyDisplayTierOf,
  enemyShowsTierRing,
  enemySpriteCenterY,
  enemySpriteScale,
  enemySpriteTint,
  enemyTierRingRadius,
  ENEMY_TIER_COLOR,
  formatEnemyBattleName,
} from '@/balance/enemyDisplay';
import { counterElementOf, resistedElementOf, type Element } from '@/balance/combat';
import { enemyImage, UI_BATTLE_IMAGES } from '@/config/Assets';
import { makeElementOrb } from '@/ui';
import { formatStageBattleHeader } from '@/balance/stages';
import type { BattleController, EnemyActResult } from '@/game/battle/BattleController';
import type { BoardView } from '@/game/board/BoardView';
import { delay } from './battleWidgets';
import type { BattleLayout } from './BattleLayout';
import type { BattleFx } from './BattleFx';
import { ComboDisplay } from './ComboDisplay';
import { COLORS, FONT_SIZE, RADIUS } from '@/ui/theme';
import { makeText } from '@/ui/text';

export class BattleHud {
  private _stageTitleText!: PIXI.Text;
  private _stageSubText!: PIXI.Text;
  /** 关卡匾贴图（宽随标题自适应） */
  private _stageBannerSprite: PIXI.Sprite | null = null;
  /** 关卡匾 Graphics 回退 */
  private _stageBannerFallback: PIXI.Graphics | null = null;
  /** 敌人名匾底板（随文字宽度动态重绘） */
  private _enemyNameBg!: PIXI.Graphics;
  private _waveText!: PIXI.Text;
  private _enemySprite!: PIXI.Sprite;
  private _enemyTierRing!: PIXI.Graphics;
  private _enemyAreaTop = 0;
  private _enemyAreaBottom = 0;
  private _enemyContainer!: PIXI.Container;
  private _enemyHpFill!: PIXI.Graphics;
  private _enemyHpFrame!: PIXI.Sprite | null;
  private _enemyHpText!: PIXI.Text;
  private _enemyElementRow!: PIXI.Container;
  private _enemyCdText!: PIXI.Text;
  private _heroHpFill!: PIXI.Graphics;
  private _heroHpFrame!: PIXI.Sprite | null;
  private _heroHpText!: PIXI.Text;
  private _shieldBadge!: PIXI.Container;
  private _shieldText!: PIXI.Text;
  private _dragBar!: PIXI.Graphics;
  private _dragClock: PIXI.Sprite | null = null;
  private _combo!: ComboDisplay;
  private _statusText!: PIXI.Text;

  /** 血条显示状态：shown = 主条（快速跟随），white = 损血白条（延迟收缩） */
  private _enemyHpDisp = { shown: 1, white: 1 };
  private _heroHpDisp = { shown: 1, white: 1 };

  constructor(private readonly _ctrl: BattleController, private readonly _layout: BattleLayout) {}

  // ════════════ 构建 ════════════

  /**
   * 敌人区轻量遮罩：章节大背景已由 BattleScene 全屏铺开，
   * 此处仅在敌人区底部做极淡 cream 过渡，不再压暗场景图。
   */
  buildEnemyBg(parent: PIXI.Container): void {
    const w = Game.logicWidth;
    const areaTop = this._layout.enemyAreaTop;
    const areaBottom = this._layout.enemyAreaBottom;
    const areaH = areaBottom - areaTop;
    this._enemyAreaTop = areaTop;
    this._enemyAreaBottom = areaBottom;

    parent.addChild(this._makeVerticalFade(
      0, areaBottom - areaH * 0.28, w, areaH * 0.28, COLORS.bgFallback, 0, 0.35,
    ));
  }

  /**
   * 顶栏：关卡匾（仅关卡名）+ 其下独立敌人名匾（对齐 mockup）。
   */
  buildStageHeader(parent: PIXI.Container): void {
    const w = Game.logicWidth;
    const cy = this._layout.headerY;

    const plaqueTex = TextureCache.get(UI_BATTLE_IMAGES.stageBanner);
    if (plaqueTex) {
      const plaque = new PIXI.Sprite(plaqueTex);
      plaque.anchor.set(0.5);
      plaque.position.set(w / 2, cy);
      parent.addChild(plaque);
      this._stageBannerSprite = plaque;
      this._stageBannerFallback = null;
    } else {
      const fallback = new PIXI.Graphics();
      parent.addChild(fallback);
      this._stageBannerSprite = null;
      this._stageBannerFallback = fallback;
    }

    // 关卡匾只放关卡名（居中；mockup 深棕墨字，非金色）
    this._stageTitleText = makeText(this._stageTitleLabel(), {
      size: FONT_SIZE.sm, fill: COLORS.battlePlaqueText, bold: true, anchor: 0.5,
    });
    this._stageTitleText.position.set(w / 2, cy);
    parent.addChild(this._stageTitleText);
    this._fitStageBannerAndTitle();

    // 敌人名：关卡匾下方独立匾，宽随文字动态适应（截图浅金底 + 深棕字）
    const nameY = this._layout.enemyNameY;
    this._enemyNameBg = new PIXI.Graphics();
    parent.addChild(this._enemyNameBg);

    this._stageSubText = makeText(this._stageSubLabel(), {
      size: FONT_SIZE.xs, fill: COLORS.battleEnemyNameText, bold: true, anchor: 0.5,
    });
    this._stageSubText.position.set(w / 2, nameY);
    parent.addChild(this._stageSubText);
    this._layoutEnemyNamePlaque();
  }

  /** 敌人名匾：按文字宽度重绘底板（左右留白，勿固定过长） */
  private _layoutEnemyNamePlaque(): void {
    if (!displayAlive(this._stageSubText) || !displayAlive(this._enemyNameBg)) return;
    const { enemyNamePlaqueH } = UI.battle;
    const padX = 22;
    const minW = 120;
    const maxW = Game.logicWidth - 80;
    const tw = Math.ceil(this._stageSubText.width);
    const bw = Math.min(maxW, Math.max(minW, tw + padX * 2));
    const bh = enemyNamePlaqueH;
    const cx = Game.logicWidth / 2;
    const cy = this._layout.enemyNameY;
    const g = this._enemyNameBg;
    g.clear();
    g.beginFill(COLORS.battleEnemyNameBg, 0.96);
    g.lineStyle(2, COLORS.battleEnemyNameBorder, 1);
    g.drawRoundedRect(cx - bw / 2, cy - bh / 2, bw, bh, bh / 2);
    g.endFill();
    this._stageSubText.position.set(cx, cy);
  }

  /** 刷新顶栏关卡号 / 多波进度 / 敌人名匾 */
  refreshStageHeader(): void {
    if (displayAlive(this._stageTitleText)) {
      this._stageTitleText.text = this._stageTitleLabel();
      this._fitStageBannerAndTitle();
    }
    if (displayAlive(this._stageSubText)) {
      this._stageSubText.text = this._stageSubLabel();
      this._layoutEnemyNamePlaque();
    }
  }

  /**
   * 关卡匾 + 标题自适应：
   * 默认用较小字号；匾宽不超过默认值，避免压到返回/GM；文字落在花边内侧。
   */
  private _fitStageBannerAndTitle(): void {
    if (!displayAlive(this._stageTitleText)) return;
    const { stageBannerW, stageBannerH } = UI.battle;
    const t = this._stageTitleText;
    t.scale.set(1);
    t.style.fontSize = FONT_SIZE.sm;
    try { t.updateText(true); } catch { /* 部分运行时无 updateText */ }

    // 左右花边约占匾宽，文字只用中间约 66%
    const innerRatio = 0.66;
    // 返回钮右缘约 125、GM 左缘约 W-114，匾面勿再加宽
    const maxBannerW = Math.min(stageBannerW, Game.logicWidth - 300);
    const minBannerW = Math.min(stageBannerW, maxBannerW);

    const textW0 = Math.max(1, t.width);
    const bannerW = Math.min(maxBannerW, Math.max(minBannerW, textW0 / innerRatio));
    const innerMax = bannerW * innerRatio;
    if (t.width > innerMax) {
      t.scale.set(innerMax / t.width);
    }
    this._applyStageBannerSize(bannerW, stageBannerH);
    t.position.set(Game.logicWidth / 2, this._layout.headerY);
  }

  private _applyStageBannerSize(bannerW: number, bannerH: number): void {
    const cx = Game.logicWidth / 2;
    const cy = this._layout.headerY;
    if (this._stageBannerSprite && displayAlive(this._stageBannerSprite)) {
      const tex = this._stageBannerSprite.texture;
      // 横向拉宽、纵向保持设计高度，避免加宽时整匾变胖
      this._stageBannerSprite.scale.set(bannerW / Math.max(1, tex.width), bannerH / Math.max(1, tex.height));
      this._stageBannerSprite.position.set(cx, cy);
      return;
    }
    if (this._stageBannerFallback && displayAlive(this._stageBannerFallback)) {
      const g = this._stageBannerFallback;
      g.clear();
      g.beginFill(COLORS.panelBg, 0.96);
      g.lineStyle(4, COLORS.panelBorder, 1);
      g.drawRoundedRect(cx - bannerW / 2, cy - bannerH / 2, bannerW, bannerH, 28);
      g.endFill();
    }
  }

  private _stageTitleLabel(): string {
    let label = formatStageBattleHeader(this._ctrl.stage);
    if (this._ctrl.totalWaves > 1) {
      label += ` · ${this._ctrl.waveIndex + 1}/${this._ctrl.totalWaves}波`;
    }
    return label;
  }

  private _stageSubLabel(): string {
    return formatEnemyBattleName(this._ctrl.enemy.def);
  }

  /** 敌人区：立绘 + 金框血条 + 倒计时 + 克制标签（敌人名在独立匾，见 buildStageHeader） */
  buildEnemyArea(parent: PIXI.Container): void {
    const w = Game.logicWidth;
    const { enemyCenterX, enemyCenterY, headerY, enemyTagY, enemyHpBarY, enemyCdY } = this._layout;

    this._waveText = new PIXI.Text('', { fontSize: 22, fill: COLORS.textSub });
    this._waveText.anchor.set(1, 0.5);
    this._waveText.position.set(w - 30, headerY);
    this._waveText.visible = false;
    parent.addChild(this._waveText);

    this._enemyContainer = new PIXI.Container();
    this._enemyContainer.position.set(enemyCenterX, enemyCenterY);
    this._enemyTierRing = new PIXI.Graphics();
    this._enemyContainer.addChild(this._enemyTierRing);
    this._enemySprite = new PIXI.Sprite();
    this._enemySprite.anchor.set(0.5);
    this._enemyContainer.addChild(this._enemySprite);
    parent.addChild(this._enemyContainer);

    const { enemyHpBarWidth: ebw, enemyHpBarHeight: ebh } = this._layout;
    const enemyBarX = (w - ebw) / 2;
    this._enemyHpFill = new PIXI.Graphics();
    parent.addChild(this._enemyHpFill);
    this._enemyHpFrame = this._makeHpFrameSprite(
      UI_BATTLE_IMAGES.hpFrameEnemy, enemyBarX, enemyHpBarY, ebw, ebh,
    );
    if (this._enemyHpFrame) parent.addChild(this._enemyHpFrame);

    this._enemyHpText = makeText('', {
      size: FONT_SIZE.sm, fill: COLORS.white, bold: true, anchor: 0.5,
      strokeColor: 0x5a3a1a, strokeWidth: 5,
    });
    this._enemyHpText.position.set(w / 2, enemyHpBarY + ebh / 2);
    parent.addChild(this._enemyHpText);

    // 倒计时：血条与克制标签之间（mockup：白字 + 深棕描边）
    this._enemyCdText = makeText('', {
      size: FONT_SIZE.sm, fill: COLORS.white, bold: true, anchor: 0.5,
      strokeColor: COLORS.battlePlaqueText, strokeWidth: 5,
    });
    this._enemyCdText.position.set(w / 2, enemyCdY);
    parent.addChild(this._enemyCdText);

    this._enemyElementRow = new PIXI.Container();
    this._enemyElementRow.position.set(w / 2, enemyTagY);
    parent.addChild(this._enemyElementRow);
  }

  buildHeroBar(parent: PIXI.Container): void {
    const { heroHpBarWidth: bw, heroHpBarHeight: bh, heroBarY } = this._layout;
    const { shieldBadgeSize } = UI.battle;
    const barX = (Game.logicWidth - bw) / 2;

    this._heroHpFill = new PIXI.Graphics();
    parent.addChild(this._heroHpFill);
    this._heroHpFrame = this._makeHpFrameSprite(
      UI_BATTLE_IMAGES.hpFrameHero, barX, heroBarY, bw, bh,
    );
    if (this._heroHpFrame) parent.addChild(this._heroHpFrame);

    this._heroHpText = makeText('', {
      size: FONT_SIZE.sm, fill: COLORS.white, bold: true, anchor: 0.5,
      strokeColor: 0x2a4a1a, strokeWidth: 5,
    });
    this._heroHpText.position.set(Game.logicWidth / 2, heroBarY + bh / 2);
    parent.addChild(this._heroHpText);

    // 盾标：叠在绿色填充区最右端（中空槽尾，非卷饰框外沿），底边与血条底对齐
    const fillInsetX = this._hpFillInsetX(bw, !!this._heroHpFrame);
    const fillRight = barX + bw - fillInsetX;
    this._shieldBadge = new PIXI.Container();
    this._shieldBadge.position.set(
      fillRight - shieldBadgeSize * 0.35,
      heroBarY + bh - shieldBadgeSize / 2,
    );
    const shieldTex = TextureCache.get(UI_BATTLE_IMAGES.shieldBadge);
    if (shieldTex) {
      const sp = new PIXI.Sprite(shieldTex);
      sp.anchor.set(0.5);
      const s = shieldBadgeSize / Math.max(shieldTex.width, shieldTex.height);
      sp.scale.set(s);
      this._shieldBadge.addChild(sp);
    } else {
      const shieldG = new PIXI.Graphics();
      const r = shieldBadgeSize / 2;
      shieldG.beginFill(0x4aa8e8, 1);
      shieldG.lineStyle(3, 0xffffff, 0.95);
      shieldG.moveTo(0, -r + 2);
      shieldG.bezierCurveTo(r * 0.85, -r + 2, r * 0.9, -r * 0.2, r * 0.75, r * 0.15);
      shieldG.lineTo(0, r - 2);
      shieldG.lineTo(-r * 0.75, r * 0.15);
      shieldG.bezierCurveTo(-r * 0.9, -r * 0.2, -r * 0.85, -r + 2, 0, -r + 2);
      shieldG.closePath();
      shieldG.endFill();
      this._shieldBadge.addChild(shieldG);
    }

    this._shieldText = makeText('+0', {
      size: FONT_SIZE.xs, fill: COLORS.white, bold: true, anchor: 0.5,
      strokeColor: 0x1a4a7a, strokeWidth: 4,
    });
    this._shieldText.position.set(0, 2);
    this._shieldBadge.addChild(this._shieldText);
    this._shieldBadge.visible = false;
    parent.addChild(this._shieldBadge);
  }

  buildDragBar(parent: PIXI.Container): void {
    this._dragBar = new PIXI.Graphics();
    parent.addChild(this._dragBar);
    const clockTex = TextureCache.get(UI_BATTLE_IMAGES.dragClock);
    if (clockTex) {
      const clock = new PIXI.Sprite(clockTex);
      clock.anchor.set(0.5);
      const sz = UI.battle.dragClockSize;
      clock.width = sz;
      clock.height = sz;
      clock.visible = false;
      parent.addChild(clock);
      this._dragClock = clock;
    }
  }

  buildCombo(parent: PIXI.Container): void {
    this._combo = new ComboDisplay(this._layout);
    this._combo.build(parent);
  }

  /** 增伤 buff 状态行（护盾由右侧盾标展示） */
  buildStatus(parent: PIXI.Container): void {
    this._statusText = makeText('', {
      size: FONT_SIZE.xs, fill: COLORS.accentDeep, bold: true, anchor: [1, 0.5],
      strokeColor: COLORS.panelBg, strokeWidth: 3,
    });
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

  /**
   * 每帧只重绘血条填充（边框为静态贴图）。
   * 敌人短条鲜红 / 英雄长条翠绿；无圆点锚点。
   */
  redrawHpBars(): void {
    const L = this._layout;
    {
      const x = (Game.logicWidth - L.enemyHpBarWidth) / 2;
      const { shown, white } = this._enemyHpDisp;
      this._paintHpFill(
        this._enemyHpFill, x, L.enemyHpBarY,
        L.enemyHpBarWidth, L.enemyHpBarHeight, shown, white, 'enemy',
        !!this._enemyHpFrame,
      );
    }
    {
      const x = (Game.logicWidth - L.heroHpBarWidth) / 2;
      const { shown, white } = this._heroHpDisp;
      this._paintHpFill(
        this._heroHpFill, x, L.heroBarY,
        L.heroHpBarWidth, L.heroHpBarHeight, shown, white, 'hero',
        !!this._heroHpFrame,
      );
    }
  }

  /**
   * 血条装饰框：与血条同宽同高，贴图拉伸贴合，避免卷饰把框撑得过宽。
   */
  private _makeHpFrameSprite(
    path: string, x: number, y: number, bw: number, bh: number,
  ): PIXI.Sprite | null {
    const tex = TextureCache.get(path);
    if (!tex) return null;
    const sp = new PIXI.Sprite(tex);
    sp.position.set(x, y);
    sp.width = bw;
    sp.height = bh;
    return sp;
  }

  /**
   * 血条填充区左右内缩（与盾标定位共用）。
   * 敌条略贴中空槽内沿，避免满血时两端留缝。
   */
  private _hpFillInsetX(bw: number, hasFrame: boolean, kind: 'enemy' | 'hero' = 'hero'): number {
    if (!hasFrame) return 4;
    // 敌框中空约 14%；略收内缩让红条贴满内槽
    if (kind === 'enemy') return Math.max(28, bw * 0.128);
    return Math.max(36, bw * 0.145);
  }

  private _hpFillInsetY(bh: number, hasFrame: boolean): number {
    return hasFrame ? Math.max(5, bh * 0.12) : 4;
  }

  /**
   * 仅绘制槽底 + 损血白条 + 主填充。
   * 有边框贴图时只留金边内缩，让血条铺满框内槽。
   */
  private _paintHpFill(
    g: PIXI.Graphics,
    x: number, y: number, bw: number, bh: number,
    shown: number, white: number,
    kind: 'enemy' | 'hero',
    hasFrame: boolean,
  ): void {
    const r = bh / 2;
    g.clear();

    if (!hasFrame) {
      // 回退：干净金边胶囊，绝不画两端圆点
      g.beginFill(0xf8ecd0);
      g.lineStyle(3, COLORS.panelBorder, 1);
      g.drawRoundedRect(x, y, bw, bh, r);
      g.endFill();
    }

    // 填充区：敌条贴满内槽；圆角略小，避免两端圆头留空
    const insetX = this._hpFillInsetX(bw, hasFrame, kind);
    const insetY = this._hpFillInsetY(bh, hasFrame);
    const ix = x + insetX;
    const iy = y + insetY;
    const iw = bw - insetX * 2;
    const ih = bh - insetY * 2;
    const ir = kind === 'enemy' ? Math.max(4, ih * 0.35) : Math.max(ih / 2, 2);

    g.lineStyle(0);
    // 槽底（略深，衬托填充）
    g.beginFill(kind === 'enemy' ? 0x6b2e2a : 0x2f4a2a, 0.65);
    g.drawRoundedRect(ix, iy, iw, ih, ir);
    g.endFill();

    if (white > 0.001) {
      g.beginFill(0xf5e0d3);
      g.drawRoundedRect(ix, iy, Math.max(iw * white, ir), ih, ir);
      g.endFill();
    }

    if (shown > 0.001) {
      const { enemyHpFill, enemyHpFillLow, heroHpFill, heroHpFillLow } = UI.battle;
      const fill = kind === 'enemy'
        ? (shown > 0.3 ? enemyHpFill : enemyHpFillLow)
        : (shown > 0.3 ? heroHpFill : heroHpFillLow);
      g.beginFill(fill);
      g.drawRoundedRect(ix, iy, Math.max(iw * shown, ir), ih, ir);
      g.endFill();
      // 顶部高光（模拟 mockup 渐变）
      g.beginFill(0xffffff, 0.28);
      g.drawRoundedRect(ix + 2, iy + 1, Math.max(iw * shown - 4, 0), ih * 0.38, ir / 2);
      g.endFill();
    }
  }

  redrawDragBar(boardView: BoardView | null): void {
    const g = this._dragBar;
    g.clear();
    const clock = this._dragClock;
    if (!boardView?.dragging) {
      if (clock) clock.visible = false;
      return;
    }
    const left = boardView.dragTimeLeft;
    const pad = UI.battle.boardFramePad;
    const barH = UI.battle.dragBarHeight;
    const clockSz = UI.battle.dragClockSize;
    const inset = UI.battle.dragBarInset;
    // 倒计时在棋盘框顶边内侧，比棋盘短一截并居中（对齐截图）
    const barW = boardView.boardWidth - inset * 2;
    const barX = this._layout.boardX + inset;
    const barY = this._layout.boardY - pad + Math.round((pad - barH) / 2);
    const fillW = Math.max(8, barW * left);
    const radius = Math.floor(barH / 2);
    const low = left <= 0.25;

    g.beginFill(COLORS.battleDragTrack, 1);
    g.lineStyle(2.5, COLORS.battleDragBorder, 0.95);
    g.drawRoundedRect(barX, barY, barW, barH, radius);
    g.endFill();
    g.lineStyle(0);
    // 截图：左暖橙 → 右亮黄；将尽时整条改警示色
    g.beginFill(low ? COLORS.battleDragFillLow : COLORS.battleDragFill, 1);
    g.drawRoundedRect(barX, barY, fillW, barH, radius);
    g.endFill();
    if (!low && fillW > 16) {
      const brightW = Math.min(fillW, Math.max(12, fillW * 0.55));
      g.beginFill(COLORS.battleDragFillBright, 1);
      g.drawRoundedRect(barX + fillW - brightW, barY, brightW, barH, radius);
      g.endFill();
      // 顶部高光，贴近截图立体感
      g.beginFill(0xffffff, 0.22);
      g.drawRoundedRect(barX + 3, barY + 2, Math.max(0, fillW - 6), Math.max(3, barH * 0.32), radius / 2);
      g.endFill();
    }

    if (clock) {
      clock.visible = true;
      clock.position.set(barX + 2, barY + barH / 2);
      clock.width = clockSz;
      clock.height = clockSz;
    }
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
    const def = enemy.def;
    const tier = enemyDisplayTierOf(def);
    const { spriteZoneTop, spriteZoneBottom, enemyCenterX } = this._layout;
    // 预留头顶空隙，避免 Boss 晶体顶到名匾
    const zoneH = Math.max(40, spriteZoneBottom - spriteZoneTop - 20);
    const tex = TextureCache.get(def.image ?? enemyImage(def.id));
    let displaySize = enemyDisplaySize(tier);
    if (tex && displayAlive(this._enemySprite)) {
      this._enemySprite.texture = tex;
      const s = readScale(this._enemySprite);
      if (s) {
        const scale = enemySpriteScale(tex.width, tex.height, tier, zoneH);
        s.set(scale);
        displaySize = tex.height * scale;
      }
      this._enemySprite.tint = enemySpriteTint(tier);
    } else {
      displaySize = Math.min(displaySize, zoneH);
    }
    // 按实际显示高度贴立绘区下沿，头顶不顶进名匾
    this._layout.enemyCenterY = enemySpriteCenterY(spriteZoneTop, spriteZoneBottom, displaySize);
    if (displayAlive(this._enemyContainer)) {
      this._enemyContainer.position.set(enemyCenterX, this._layout.enemyCenterY);
    }
    this._enemyTierRing.clear();
    if (enemyShowsTierRing(tier)) {
      const r = enemyTierRingRadius(displaySize);
      const color = ENEMY_TIER_COLOR[tier];
      this._enemyTierRing.lineStyle(tier === 'boss' ? 5 : 4, color, tier === 'boss' ? 0.75 : 0.55);
      this._enemyTierRing.drawCircle(0, 0, r);
      this._enemyTierRing.beginFill(color, tier === 'boss' ? 0.08 : 0.05);
      this._enemyTierRing.drawCircle(0, 0, r);
      this._enemyTierRing.endFill();
    }
    if (!switchWave) this._enemyContainer.alpha = 1;
    const ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
    TweenManager.cancelTarget(this._enemyHpDisp);
    this._enemyHpDisp.shown = ratio;
    this._enemyHpDisp.white = ratio;
    this._refreshEnemyElementTags(enemy.def.element);
    this.refreshStageHeader();
    this.refreshEnemyHp();
    this.refreshEnemyCd();
  }

  /** 敌人属性克制提示：弱点珠 / 抵抗珠（对齐 xiao_chu） */
  private _refreshEnemyElementTags(element: Element): void {
    this._enemyElementRow.removeChildren();
    const weak = counterElementOf(element);
    const resist = resistedElementOf(element);
    const gap = 14;
    const weakBanned = this._ctrl.bannedElements.has(weak);
    const weakLabel = weakBanned ? '克制·本关封印' : '克制';
    const weakTag = this._makeElementCounterTag(weakLabel, weak, !weakBanned);
    const resistTag = this._makeElementCounterTag('抵抗', resist, false);
    const totalW = weakTag.tagW + gap + resistTag.tagW;
    weakTag.position.set(-totalW / 2, -weakTag.tagH / 2);
    resistTag.position.set(-totalW / 2 + weakTag.tagW + gap, -resistTag.tagH / 2);
    this._enemyElementRow.addChild(weakTag, resistTag);
  }

  /**
   * 克制/抵抗标签：截图样式——深棕金底 + 浅金边 + 奶油白字深描边 + 透明底珠图标。
   */
  private _makeElementCounterTag(
    label: string,
    element: Element,
    _highlight: boolean,
  ): PIXI.Container & { tagW: number; tagH: number } {
    const color = ORB_COLOR[element];
    const orbSize = 32;
    const padX = 14;
    const padY = 8;
    const gap = 6;
    const text = makeText(label, {
      size: FONT_SIZE.xs,
      fill: COLORS.battleTagText,
      bold: true,
      strokeColor: COLORS.battleTagTextStroke,
      strokeWidth: 4,
    });
    const tagH = Math.max(Math.ceil(text.height), orbSize) + padY * 2;
    const tagW = Math.ceil(padX + orbSize + gap + text.width + padX);

    const tag = new PIXI.Container() as PIXI.Container & { tagW: number; tagH: number };
    tag.tagW = tagW;
    tag.tagH = tagH;

    // 深棕金胶囊 + 浅金描边（对齐用户截图）
    const bg = new PIXI.Graphics();
    bg.beginFill(COLORS.battleTagBg, 0.96);
    bg.lineStyle(2, COLORS.battleTagBorder, 1);
    bg.drawRoundedRect(0, 0, tagW, tagH, tagH / 2);
    bg.endFill();
    tag.addChild(bg);

    // 棋盘同源珠图标
    const orb = makeElementOrb(element, orbSize);
    orb.position.set(padX + orbSize / 2, tagH / 2);
    if (orb.texture === PIXI.Texture.WHITE) orb.tint = color;
    tag.addChild(orb);

    text.position.set(padX + orbSize + gap, (tagH - text.height) / 2);
    tag.addChild(text);
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
      this._enemyCdText.style.fill = 0xc0392b;
      const cdScale = readScale(this._enemyCdText);
      if (cdScale) {
        TweenManager.cancelTarget(cdScale);
        cdScale.set(1.25);
        TweenManager.to({
          target: cdScale, props: { x: 1, y: 1 },
          duration: UI.anim.chargeWarn, ease: Ease.easeOutQuad,
        });
      }
    } else {
      parts.push(`${enemy.attackCountdown} 回合后攻击`);
      this._enemyCdText.style.fill = COLORS.white;
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

  /** 回合/战斗收尾：血条不再停留在补间中间态，直接对齐 controller 真实数值。 */
  snapHpBarsToModel(): void {
    const enemy = this._ctrl.enemy;
    const enemyRatio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
    const heroRatio = this._ctrl.heroMaxHp > 0 ? this._ctrl.heroHp / this._ctrl.heroMaxHp : 0;

    TweenManager.cancelTarget(this._enemyHpDisp);
    TweenManager.cancelTarget(this._heroHpDisp);
    this._enemyHpDisp.shown = enemyRatio;
    this._enemyHpDisp.white = enemyRatio;
    this._heroHpDisp.shown = heroRatio;
    this._heroHpDisp.white = heroRatio;

    this._enemyHpText.text = `${enemy.hp} / ${enemy.maxHp}`;
    this._refreshHeroHpText();
    this.redrawHpBars();
  }

  private _refreshHeroHpText(): void {
    this._heroHpText.text = `${this._ctrl.heroHp} / ${this._ctrl.heroMaxHp}`;
    const sh = this._ctrl.shield;
    if (displayAlive(this._shieldBadge)) {
      this._shieldBadge.visible = sh > 0;
      if (sh > 0) this._shieldText.text = `+${sh}`;
    }
  }

  /** 增伤等 buff 状态行（护盾由右侧盾标展示） */
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

  hideCombo(immediate = false): void {
    this._combo.hide(immediate);
  }

  updateCombo(dt: number): void {
    this._combo.update(dt);
  }

  /** 英雄血条数字受击跳动 */
  pulseHeroHpText(heavy: boolean): void {
    const hpScale = readScale(this._heroHpText);
    if (!hpScale) return;
    TweenManager.cancelTarget(hpScale);
    const s = heavy ? 1.38 : 1.22;
    hpScale.set(s);
    TweenManager.to({
      target: hpScale,
      props: { x: 1, y: 1 },
      duration: 0.28,
      ease: Ease.easeOutBack,
    });
  }

  /** 血条文字短暂变色，强化「被打到了」的反馈 */
  flashHeroHpBar(damage: boolean): void {
    if (!displayAlive(this._heroHpText)) return;
    this._heroHpText.style.fill = damage ? 0xff5252 : 0x4aa8e8;
    setTimeout(() => {
      if (displayAlive(this._heroHpText)) this._heroHpText.style.fill = COLORS.white;
    }, 280);
  }

  // ════════════ 敌人受击 / 行动演出 ════════════

  /** 受击三件套：闪白 + 击退回弹 + 属性色粒子飞溅；大伤害附加震屏 */
  playEnemyHit(fx: BattleFx, element: Element, damage: number, forceStrong = false): void {
    const c = this._enemyContainer;
    if (!c || c.destroyed) return;
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

  /** 技能直伤命中：仅立绘闪白，避免与弹道叠粒子/震屏 */
  playEnemyHitLight(): void {
    if (displayAlive(this._enemySprite)) {
      flashWhite(this._enemySprite, UI.anim.enemyWhiteFlash);
    }
  }

  /** 敌人死亡：闪白 + 碎裂粒子 + 缩小淡出 */
  playEnemyDeath(fx: BattleFx): Promise<void> {
    const c = this._enemyContainer;
    if (!displayAlive(c)) return Promise.resolve();
    const { enemyCenterX, enemyCenterY } = this._layout;
    if (displayAlive(this._enemySprite)) flashWhite(this._enemySprite, 0.16, 0.95);
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
    cancelDisplayTweens(c);
    return Promise.all([
      tweenScale(c, { x: 0.7, y: 0.7 }, {
        duration: UI.anim.enemyDeath, ease: Ease.easeInCubic,
      }),
      guardedTween({
        target: c, props: { alpha: 0 },
        duration: UI.anim.enemyDeath, ease: Ease.easeInQuad,
      }),
    ]).then(() => {});
  }

  playWaveEnter(): Promise<void> {
    this.refreshEnemy(true);
    const c = this._enemyContainer;
    if (!displayAlive(c)) return Promise.resolve();
    cancelDisplayTweens(c);
    const { enemyCenterX } = this._layout;
    c.alpha = 0;
    resetScale(c, 1);
    c.x = enemyCenterX + 160;
    return guardedTween({
      target: c, props: { alpha: 1, x: enemyCenterX },
      duration: UI.anim.waveEnter, ease: Ease.easeOutQuad,
      onComplete: () => {
        if (!displayAlive(c)) return;
        c.alpha = 1;
        c.x = enemyCenterX;
        resetScale(c, 1);
      },
    }, {
      onFallback: () => {
        if (!displayAlive(c)) return;
        c.alpha = 1;
        c.x = enemyCenterX;
        resetScale(c, 1);
      },
    });
  }

  /** 敌人攻击：蓄力缩放 → 属性弹道飞向英雄血条 → 命中反馈（onHeroHit 由编排者注入） */
  playEnemyAttack(
    fx: BattleFx, _damage: number, _absorbed: number, heavy: boolean, onHeroHit: () => void,
  ): Promise<void> {
    return this._playEnemyAttackTween(fx, heavy, onHeroHit);
  }

  private async _playEnemyAttackTween(
    fx: BattleFx, heavy: boolean, onHeroHit: () => void,
  ): Promise<void> {
    const element = this._ctrl.enemy.def.element;
    const { enemyCenterX, enemyCenterY, heroBarY } = this._layout;
    const toX = Game.logicWidth / 2;
    const toY = heroBarY;
    const sprite = this._enemySprite;
    if (!displayAlive(sprite)) {
      onHeroHit();
      return;
    }
    const spriteScale = readScale(sprite);
    if (!spriteScale) {
      onHeroHit();
      return;
    }
    const baseScale = spriteScale.x;

    TweenManager.cancelTarget(spriteScale);
    await guardedTween({
      target: spriteScale,
      props: {
        x: baseScale * (heavy ? 1.14 : 1.08),
        y: baseScale * (heavy ? 1.14 : 1.08),
      },
      duration: heavy ? 0.14 : 0.1,
      ease: Ease.easeOutQuad,
    });
    await fx.fireProjectileBetween(
      enemyCenterX, enemyCenterY, toX, toY, element,
      {
        heavy,
        size: heavy ? 58 : 46,
        duration: heavy ? UI.anim.enemyProjectileHeavy : UI.anim.enemyProjectile,
      },
    );
    void guardedTween({
      target: spriteScale,
      props: { x: baseScale, y: baseScale },
      duration: 0.12,
      ease: Ease.easeOutQuad,
    });
    onHeroHit();
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
    const c = this._enemyContainer;
    if (!displayAlive(c)) return;
    await tweenScale(c, { x: 1.12, y: 1.12 }, {
      duration: UI.anim.chargeWarn / 2, ease: Ease.easeOutQuad,
    });
    await tweenScale(c, { x: 1, y: 1 }, {
      duration: UI.anim.chargeWarn / 2, ease: Ease.easeInQuad,
    }, {
      onFallback: () => {
        resetScale(c, 1);
      },
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

  /**
   * 敌人对我方施加 debuff（封珠/中毒/时间压缩/禁疗/技能封印）：
   * 敌人侧技能名 + 紫色施法粒子 → 英雄区 debuff 飘字 + 暗紫闪屏
   */
  async playEnemyDebuff(fx: BattleFx, result: EnemyActResult, text: string): Promise<void> {
    const { enemyCenterX, enemyCenterY, heroBarY } = this._layout;
    if (result.skillName) {
      fx.spawnFloat(result.skillName, enemyCenterX, enemyCenterY - 60, 0xc06cf0, 1.25);
    }
    fx.burst({
      x: enemyCenterX, y: enemyCenterY,
      color: 0xc06cf0, count: 12, speed: 240, gravity: -180, size: 14, life: 0.5,
    });
    Platform.vibrateShort('medium');
    const debuffGap = Platform.isMinigame && !Platform.isDevtools ? 0.2 : 0.35;
    const debuffTail = Platform.isMinigame && !Platform.isDevtools ? 0.22 : 0.4;
    await delay(debuffGap);
    fx.flash(0x7a3cb8, 0.24, 0.3);
    fx.spawnFloat(text, Game.logicWidth / 2, heroBarY - 28, 0xc06cf0, 1.2);
    fx.burst({
      x: Game.logicWidth / 2, y: heroBarY,
      color: 0xc06cf0, count: 10, speed: 260, size: 13, life: 0.45,
    });
    await delay(debuffTail);
  }

  /** 眩晕跳过回合：头顶旋转星星 + 「眩晕中」飘字（真机用 delay 避免 rotation tween 挂死） */
  async playEnemyStunned(fx: BattleFx): Promise<void> {
    const { enemyCenterX, enemyCenterY } = this._layout;
    const headY = enemyCenterY - UI.battle.enemySize / 2 - 16;
    fx.spawnFloat('眩晕中', enemyCenterX, headY - 34, 0xffd54f, 1.2);
    fx.burst({
      x: enemyCenterX, y: headY,
      color: 0xffd54f, count: 8, speed: 160, gravity: -100, size: 12, life: 0.5,
    });
    if (Platform.isMinigame && !Platform.isDevtools) {
      await delay(0.42);
      return;
    }

    const ring = new PIXI.Container();
    ring.position.set(enemyCenterX, headY);
    const radius = 34;
    for (let i = 0; i < 3; i++) {
      const star = new PIXI.Text('✦', { fontSize: 26, fill: 0xffd54f, fontWeight: 'bold' });
      star.anchor.set(0.5);
      const a = (i / 3) * Math.PI * 2;
      star.position.set(Math.cos(a) * radius, Math.sin(a) * radius * 0.4);
      ring.addChild(star);
    }
    fx.addFloatChild(ring);
    fx.burst({
      x: enemyCenterX, y: headY,
      color: 0xffd54f, count: 8, speed: 160, gravity: -100, size: 12, life: 0.5,
    });
    await guardedTween({
      target: ring, props: { rotation: Math.PI * 3, alpha: 0 },
      duration: 0.85, ease: Ease.easeOutQuad,
    }, {
      onFallback: () => {
        ring.alpha = 0;
      },
    });
    if (!ring.destroyed) ring.destroy({ children: true });
  }

  /** 敌人 DoT tick：属性色飘字「灼烧 -N」+ 小 burst + 立绘 tint 脉冲 + 血条刷新 */
  async playEnemyDotTick(fx: BattleFx, amount: number): Promise<void> {
    const { enemyCenterX, enemyCenterY } = this._layout;
    const color = 0xff7a5c;
    fx.spawnFloat(`灼烧 -${amount}`, enemyCenterX, enemyCenterY - 40, color, 1.1);
    fx.burst({
      x: enemyCenterX, y: enemyCenterY,
      color, count: 8, speed: 220, gravity: -120, size: 12, life: 0.4,
    });
    // 立绘 tint 脉冲（真机安全：直接置色再复原，不依赖 filter）
    const sprite = this._enemySprite;
    sprite.tint = color;
    this.refreshEnemyHp();
    await delay(0.32);
    if (!sprite.destroyed) sprite.tint = 0xffffff;
  }

  /** 我方 DoT tick（中毒）：英雄血条紫色飘字 + burst + 血条刷新 */
  async playHeroDotTick(fx: BattleFx, amount: number): Promise<void> {
    const { heroBarY } = this._layout;
    const x = Game.logicWidth / 2;
    fx.spawnHeroHitFloat(`中毒 -${amount}`, x, heroBarY - 28, 'damage');
    fx.burst({
      x, y: heroBarY,
      color: 0xc06cf0, count: 8, speed: 220, size: 12, life: 0.4,
    });
    Platform.vibrateShort('light');
    this.refreshHeroHp();
    await delay(0.32);
  }

  /** 重力技命中：敌人立绘被压扁下沉再弹回（配合暗色闪屏与重震由调用方触发） */
  async playEnemyGravityCrush(fx: BattleFx): Promise<void> {
    const { enemyCenterX, enemyCenterY } = this._layout;
    fx.burst({
      x: enemyCenterX, y: enemyCenterY - 60,
      color: 0x9575cd, count: 16, speed: 300, gravity: 500, size: 15, life: 0.5,
    });
    const c = this._enemyContainer;
    if (!displayAlive(c)) return;
    cancelDisplayTweens(c);
    await tweenScale(c, { x: 1.08, y: 0.78 }, {
      duration: 0.16, ease: Ease.easeOutQuad,
    });
    await tweenScale(c, { x: 1, y: 1 }, {
      duration: 0.22, ease: Ease.easeOutBack,
    }, {
      onFallback: () => {
        resetScale(c, 1);
      },
    });
  }

  /** 敌人狂暴：红色爆发粒子 + 立绘膨胀脉冲 + 红闪 + 「狂暴」飘字 */
  async playEnemyEnrage(fx: BattleFx, atkMult: number): Promise<void> {
    const { enemyCenterX, enemyCenterY } = this._layout;
    fx.flash(0xff2d2d, 0.3, 0.4);
    fx.burst({
      x: enemyCenterX, y: enemyCenterY,
      color: 0xff3030, count: 18, speed: 360, gravity: -120, size: 17, life: 0.6,
    });
    fx.spawnFloat(`狂暴！攻击 ×${atkMult}`, enemyCenterX, enemyCenterY - 60, 0xff5252, 1.4);
    fx.shakeMedium();
    Platform.vibrateLong();
    const c = this._enemyContainer;
    if (!displayAlive(c)) return;
    cancelDisplayTweens(c);
    await tweenScale(c, { x: 1.18, y: 1.18 }, {
      duration: 0.16, ease: Ease.easeOutQuad,
    });
    await tweenScale(c, { x: 1, y: 1 }, {
      duration: 0.2, ease: Ease.easeInQuad,
    }, {
      onFallback: () => {
        resetScale(c, 1);
      },
    });
  }
}
