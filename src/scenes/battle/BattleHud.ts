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
  enemySpriteCenterY,
  enemySpriteScale,
  enemySpriteTint,
  formatEnemyBattleName,
} from '@/balance/enemyDisplay';
import { counterElementOf, resistedElementOf, type Element } from '@/balance/combat';
import { SKILL_IMPACT, type SkillImpactTier } from '@/balance/skillVfx';
import { enemyImage, UI_BATTLE_IMAGES, UI_FX_IMAGES } from '@/config/Assets';
import { makeElementOrb } from '@/ui';
import { formatStageBattleHeader } from '@/balance/stages';
import {
  formatBattleStarTurnValue,
  starsFromTurns,
  starTurnPace,
  type StarTurnPace,
} from '@/formulas/stars';
import type { BattleController, EnemyActResult } from '@/game/battle/BattleController';
import { phaseHpMarkers } from '@/game/battle/bossPhase';
import type { BoardView } from '@/game/board/BoardView';
import { delay } from './battleWidgets';
import type { BattleLayout } from './BattleLayout';
import type { BattleFx } from './BattleFx';
import { ComboDisplay } from './ComboDisplay';
import { COLORS, FONT_SIZE, BATTLE_STAR_TURN } from '@/ui/theme';
import { applyTextResolution, makeText } from '@/ui/text';
import { makeStarRow } from '@/ui/GrowthVisual';
import { bindPointerTap } from '@/utils/bindPointerTap';

function paceRank(pace: StarTurnPace): number {
  if (pace === 'onTrack') return 0;
  if (pace === 'twoStar') return 1;
  return 2;
}

export class BattleHud {
  private _stageTitleText!: PIXI.Text;
  /** 关卡匾下方：三星回合胶囊（星行 + 回合 n/m） */
  private _stageStarTurnChip!: PIXI.Container;
  private _stageTurnPillBg!: PIXI.Graphics;
  private _stageTurnStars: PIXI.Container | null = null;
  private _stageTurnPrefix!: PIXI.Text;
  private _stageTurnValue!: PIXI.Text;
  private _starTurnFilled = -1;
  private _lastStarTurnNumber = 0;
  private _lastStarTurnPace: ReturnType<typeof starTurnPace> | null = null;
  private _stageSubText!: PIXI.Text;
  /** 关卡匾贴图（宽随标题自适应） */
  private _stageBannerSprite: PIXI.Sprite | null = null;
  /** 关卡匾 Graphics 回退 */
  private _stageBannerFallback: PIXI.Graphics | null = null;
  /** 敌人名匾底板（随文字宽度动态重绘） */
  private _enemyNameBg!: PIXI.Graphics;
  private _waveText!: PIXI.Text;
  private _enemySprite!: PIXI.Sprite;
  private _enemyAreaTop = 0;
  private _enemyAreaBottom = 0;
  private _enemyContainer!: PIXI.Container;
  /** 点击立绘/血条区打开怪物详情（透明热区） */
  private _enemyHitZone!: PIXI.Container;
  private _enemyHpFill!: PIXI.Graphics;
  private _enemyHpFrame!: PIXI.Sprite | null;
  private _enemyHpText!: PIXI.Text;
  private _enemyElementRow!: PIXI.Container;
  /** 技能/蓄力倒计时：圆形底框 + 文案（怪右侧侧挂） */
  private _enemyCdBadge!: PIXI.Container;
  private _enemyCdText!: PIXI.Text;
  private _heroHpFill!: PIXI.Graphics;
  private _heroHpFrame!: PIXI.Sprite | null;
  private _heroHpText!: PIXI.Text;
  private _shieldBadge!: PIXI.Container;
  private _shieldText!: PIXI.Text;
  private _dragBar!: PIXI.Graphics;
  private _dragClock: PIXI.Sprite | null = null;
  private _combo: ComboDisplay | null = null;
  private _statusText!: PIXI.Text;

  /** 血条显示状态：shown = 主条（快速跟随），white = 损血白条（延迟收缩） */
  private _enemyHpDisp = { shown: 1, white: 1 };
  private _heroHpDisp = { shown: 1, white: 1 };

  constructor(
    private readonly _ctrl: BattleController,
    private readonly _layout: BattleLayout,
    private readonly _showStarTurnHud = true,
  ) {}

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
   * 顶栏：关卡匾只留关卡名；三星回合独立胶囊挂在匾下（对齐 xiao_chu / PAD 目标芯片）。
   * 敌人名匾仍叠在血条上方。
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

    this._stageTitleText = makeText(this._stageTitleLabel(), {
      size: FONT_SIZE.sm, fill: COLORS.battlePlaqueText, bold: true, anchor: 0.5,
    });
    parent.addChild(this._stageTitleText);

    this._stageStarTurnChip = new PIXI.Container();
    this._stageTurnPillBg = new PIXI.Graphics();
    this._stageStarTurnChip.addChild(this._stageTurnPillBg);
    this._stageTurnPrefix = makeText('回合', {
      size: FONT_SIZE.xxs, fill: BATTLE_STAR_TURN.onTrack.muted, bold: true, anchor: 0.5,
    });
    this._stageTurnValue = makeText('1/1', {
      size: FONT_SIZE.xs, fill: BATTLE_STAR_TURN.onTrack.text, bold: true, anchor: 0.5,
      strokeColor: COLORS.battleStarTurnShadow, strokeWidth: 3,
    });
    this._stageStarTurnChip.addChild(this._stageTurnPrefix);
    this._stageStarTurnChip.addChild(this._stageTurnValue);
    parent.addChild(this._stageStarTurnChip);
    this._fitStageBannerAndTitle();

    // 敌人名：血条正上方独立匾（浅金底 + 深棕字）
    this._enemyNameBg = new PIXI.Graphics();
    parent.addChild(this._enemyNameBg);

    this._stageSubText = makeText(this._stageSubLabel(), {
      size: FONT_SIZE.xs, fill: COLORS.battleEnemyNameText, bold: true, anchor: 0.5,
    });
    this._stageSubText.position.set(w / 2, this._layout.enemyNameY);
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
    // Debuff 图标锚在名匾右侧，与左右侧挂 HUD 错开
    const iconSize = 34;
    const gap = 8;
    const maxX = Game.logicWidth - UI.board.marginX - iconSize / 2;
    this._layout.enemyStatusIconX = Math.min(maxX, cx + bw / 2 + gap + iconSize / 2);
    this._layout.enemyStatusIconY = cy;
  }

  /** 刷新顶栏关卡号 / 三星回合 / 多波进度 / 敌人名匾 */
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
   * 关卡匾只包标题：宽随文字，长名缩放避开卷尖。
   * 三星回合胶囊另挂匾下，不再和标题抢同一层。
   */
  private _fitStageBannerAndTitle(): void {
    if (!displayAlive(this._stageTitleText)) return;
    const { stageBannerW, stageBannerH, stageBannerPadX, stageBannerMinW } = UI.battle;
    const cy = this._layout.headerY;
    const t = this._stageTitleText;
    t.scale.set(1);
    t.style.fontSize = FONT_SIZE.sm;
    try { t.updateText(true); } catch { /* 部分运行时无 updateText */ }

    const maxBannerW = Math.min(stageBannerW, Game.logicWidth - 280);
    const contentW0 = Math.max(1, t.width);
    let bannerW = Math.min(maxBannerW, Math.max(stageBannerMinW, contentW0 + stageBannerPadX * 2));
    const innerMax = bannerW - stageBannerPadX * 2;
    if (contentW0 > innerMax) {
      const scale = innerMax / contentW0;
      t.scale.set(scale);
      bannerW = Math.min(maxBannerW, Math.max(stageBannerMinW, contentW0 * scale + stageBannerPadX * 2));
    }
    t.position.set(Game.logicWidth / 2, cy);
    this._applyStageBannerSize(bannerW, stageBannerH);
    this._layoutStarTurnChip();
  }

  /** 匾下居中胶囊：★★★ 回合 n/m，绿/琥珀/锈红三档 */
  private _layoutStarTurnChip(): void {
    const chip = this._stageStarTurnChip;
    if (!displayAlive(chip)) return;
    const limit = this._ctrl.stage.starTurnLimit;
    const show = this._showStarTurnHud && limit > 0;
    chip.visible = show;
    if (!show) return;

    const turn = this._currentTurnNumber();
    const pace = starTurnPace(turn, limit);
    const palette = BATTLE_STAR_TURN[pace];
    const filled = starsFromTurns(turn, limit);
    this._syncStarTurnStars(filled);

    this._stageTurnPrefix.style.fill = palette.muted;
    this._stageTurnValue.style.fill = palette.text;
    this._stageTurnValue.text = formatBattleStarTurnValue(turn, limit);
    try { this._stageTurnPrefix.updateText(true); } catch { /* 部分运行时无 updateText */ }
    try { this._stageTurnValue.updateText(true); } catch { /* 部分运行时无 updateText */ }

    const {
      stageBannerH, stageTurnPillPadX, stageTurnPillGap, stageTurnPillH, stageTurnStarSize,
    } = UI.battle;
    const starGap = 1;
    const starW = this._stageTurnStars
      ? 3 * stageTurnStarSize + 2 * starGap
      : 0;
    const gapStar = 6;
    const gapLabel = 5;
    const innerW = starW + gapStar
      + Math.ceil(this._stageTurnPrefix.width) + gapLabel
      + Math.ceil(this._stageTurnValue.width);
    const pillW = innerW + stageTurnPillPadX * 2;
    const pillH = stageTurnPillH;
    const r = pillH / 2;

    let x = -pillW / 2 + stageTurnPillPadX;
    if (this._stageTurnStars && displayAlive(this._stageTurnStars)) {
      this._stageTurnStars.position.set(x, 0);
      x += starW + gapStar;
    }
    this._stageTurnPrefix.position.set(x + this._stageTurnPrefix.width / 2, 0);
    x += this._stageTurnPrefix.width + gapLabel;
    this._stageTurnValue.position.set(x + this._stageTurnValue.width / 2, 0);

    this._drawStarTurnPill(pillW, pillH, r, palette);

    const pillCy = this._layout.headerY + stageBannerH / 2 + stageTurnPillGap + pillH / 2;
    chip.position.set(Game.logicWidth / 2, pillCy);

    const worsened = this._lastStarTurnPace != null
      && paceRank(pace) > paceRank(this._lastStarTurnPace);
    if (this._lastStarTurnNumber > 0 && turn !== this._lastStarTurnNumber) {
      this._pulseStarTurnChip(worsened);
    }
    this._lastStarTurnNumber = turn;
    this._lastStarTurnPace = pace;
  }

  private _syncStarTurnStars(filled: number): void {
    if (this._starTurnFilled === filled && this._stageTurnStars && displayAlive(this._stageTurnStars)) {
      return;
    }
    this._starTurnFilled = filled;
    if (this._stageTurnStars) {
      this._stageTurnStars.destroy({ children: true });
      this._stageTurnStars = null;
    }
    const stars = makeStarRow({
      star: filled,
      maxStar: 3,
      starSize: UI.battle.stageTurnStarSize,
      gap: 1,
      anchor: 'left',
    });
    this._stageStarTurnChip.addChildAt(stars, 1);
    this._stageTurnStars = stars;
  }

  private _drawStarTurnPill(
    bw: number,
    bh: number,
    r: number,
    palette: (typeof BATTLE_STAR_TURN)[StarTurnPace],
  ): void {
    if (!displayAlive(this._stageTurnPillBg)) return;
    const g = this._stageTurnPillBg;
    g.clear();
    const x = -bw / 2;
    const y = -bh / 2;
    g.beginFill(COLORS.battleStarTurnShadow, 0.38);
    g.drawRoundedRect(x + 1, y + 2, bw, bh, r);
    g.endFill();
    g.beginFill(palette.bg, 0.94);
    g.lineStyle(2, palette.rim, 0.95);
    g.drawRoundedRect(x, y, bw, bh, r);
    g.endFill();
    g.lineStyle(1.2, palette.inner, 0.4);
    g.drawRoundedRect(x + 2.5, y + 2.5, bw - 5, bh - 5, Math.max(2, r - 2.5));
  }

  private _pulseStarTurnChip(strong: boolean): void {
    const chip = this._stageStarTurnChip;
    if (!displayAlive(chip) || !chip.visible) return;
    cancelDisplayTweens(chip);
    resetScale(chip);
    const peak = strong ? 1.12 : 1.06;
    void tweenScale(chip, { x: peak, y: peak }, { duration: 0.08, ease: Ease.easeOutQuad })
      .then(() => {
        if (!displayAlive(chip)) return;
        return tweenScale(chip, { x: 1, y: 1 }, { duration: 0.16, ease: Ease.easeOutBack });
      });
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

  /** 当前回合序号：玩家回合显示「即将进行」的回合，其余阶段显示已完成回合 */
  private _currentTurnNumber(): number {
    if (this._ctrl.state === 'playerTurn') return this._ctrl.turnsUsed + 1;
    return Math.max(1, this._ctrl.turnsUsed);
  }

  private _stageSubLabel(): string {
    return formatEnemyBattleName(this._ctrl.enemy.def);
  }

  /** 敌人区：立绘 + 金框血条 + 侧挂倒计时/克制（敌人名叠在血条上，见 buildStageHeader） */
  buildEnemyArea(parent: PIXI.Container): void {
    const w = Game.logicWidth;
    const { enemyCenterX, enemyCenterY, headerY, enemyTagY, enemyHpBarY, enemyCdY } = this._layout;

    this._waveText = applyTextResolution(
      new PIXI.Text('', { fontSize: 22, fill: COLORS.textSub }),
    );
    this._waveText.anchor.set(1, 0.5);
    this._waveText.position.set(w - 30, headerY);
    this._waveText.visible = false;
    parent.addChild(this._waveText);

    this._enemyContainer = new PIXI.Container();
    this._enemyContainer.position.set(enemyCenterX, enemyCenterY);
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
      // 描边过粗时「/」会像血条上的斜划痕
      strokeColor: 0x5a3a1a, strokeWidth: 3,
    });
    this._enemyHpText.position.set(w / 2, enemyHpBarY + ebh / 2);
    parent.addChild(this._enemyHpText);

    // 倒计时：怪右侧侧挂（圆形金框底 + 双行描边字）
    this._enemyCdBadge = new PIXI.Container();
    this._enemyCdBadge.position.set(this._layout.enemyCdX, enemyCdY);
    const cdBadgeSize = UI.battle.enemyAttackCdBadgeSize;
    const cdBadgeTex = TextureCache.get(UI_BATTLE_IMAGES.attackCdBadge);
    if (cdBadgeTex) {
      const frame = new PIXI.Sprite(cdBadgeTex);
      frame.anchor.set(0.5);
      const s = cdBadgeSize / Math.max(cdBadgeTex.width, cdBadgeTex.height);
      frame.scale.set(s);
      this._enemyCdBadge.addChild(frame);
    } else {
      const g = new PIXI.Graphics();
      const r = cdBadgeSize / 2 - 4;
      g.beginFill(COLORS.battleTagBg, 0.96);
      g.lineStyle(3, COLORS.battleTagBorder, 1);
      g.drawCircle(0, 0, r);
      g.endFill();
      this._enemyCdBadge.addChild(g);
      // CDN/分包未就绪时异步补贴图
      void TextureCache.load(UI_BATTLE_IMAGES.attackCdBadge).then((tex) => {
        if (!displayAlive(this._enemyCdBadge) || this._enemyCdBadge.children.some((c) => c instanceof PIXI.Sprite)) {
          return;
        }
        this._enemyCdBadge.removeChildren();
        const frame = new PIXI.Sprite(tex);
        frame.anchor.set(0.5);
        const s = cdBadgeSize / Math.max(tex.width, tex.height);
        frame.scale.set(s);
        this._enemyCdBadge.addChildAt(frame, 0);
        this._enemyCdBadge.addChild(this._enemyCdText);
      }).catch(() => {});
    }
    this._enemyCdText = makeText('', {
      size: FONT_SIZE.xs, fill: COLORS.battleTagText, bold: true, anchor: 0.5,
      strokeColor: COLORS.battleTagTextStroke, strokeWidth: 4,
      wordWrapWidth: Math.floor(cdBadgeSize * 0.72), align: 'center',
    });
    this._enemyCdBadge.addChild(this._enemyCdText);
    parent.addChild(this._enemyCdBadge);

    // 克制/抵抗：怪左侧竖排（现有胶囊标签样式）
    this._enemyElementRow = new PIXI.Container();
    this._enemyElementRow.position.set(this._layout.enemyTagX, enemyTagY);
    parent.addChild(this._enemyElementRow);

    // 透明热区：立绘区上沿 → 血条叠层下沿（不盖顶栏返回钮）
    const hitTop = this._layout.spriteZoneTop;
    const hitBottom = this._layout.spriteZoneBottom;
    this._enemyHitZone = new PIXI.Container();
    this._enemyHitZone.eventMode = 'static';
    this._enemyHitZone.cursor = 'pointer';
    this._enemyHitZone.hitArea = new PIXI.Rectangle(0, hitTop, w, Math.max(40, hitBottom - hitTop));
    parent.addChild(this._enemyHitZone);
  }

  /**
   * 绑定「点怪看详情」。须在 buildEnemyArea 之后调用。
   * guard：结算/演出中可禁止打开。
   */
  bindEnemyDetailTap(onTap: () => void, guard?: () => boolean): void {
    bindPointerTap(this._enemyHitZone, onTap, { guard });
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
      strokeColor: 0x2a4a1a, strokeWidth: 3,
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
    // 与 heroAnnounce 同侧靠右，落在两血条空隙，避免压敌血条数字
    this._statusText.position.set(
      Game.logicWidth - UI.board.marginX,
      this._layout.teamStatusIconY,
    );
    parent.addChild(this._statusText);
  }

  /**
   * 血条数字抬到就绪箭头之上。
   * raiseSlotsLayer 会把宠物槽（含上伸双箭头）叠到血条框上面，数字若不跟着抬，
   * 「711 / 1717」会被箭头戳穿——和中毒飘字是同一类层级问题。
   */
  raiseHpReadouts(parent: PIXI.Container): void {
    if (displayAlive(this._enemyHpText)) parent.addChild(this._enemyHpText);
    if (displayAlive(this._heroHpText)) parent.addChild(this._heroHpText);
    if (displayAlive(this._shieldBadge)) parent.addChild(this._shieldBadge);
    if (displayAlive(this._statusText)) parent.addChild(this._statusText);
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
        phaseHpMarkers(this._ctrl.enemy.def),
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
    /** Boss 阶段血线（0~1），在条上画竖直刻线预告转阶段位置 */
    phaseMarkers: readonly number[] = [],
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

    // 阶段血线：已跨过的转暗，未到的亮金——让玩家能预判「还有几段」
    for (const m of phaseMarkers) {
      if (m <= 0 || m >= 1) continue;
      const passed = shown <= m;
      g.beginFill(passed ? 0x6b5320 : 0xffd451, passed ? 0.5 : 0.95);
      g.drawRect(ix + iw * m - 1.5, iy, 3, ih);
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
    // 真叠层：立绘可用满「匾后 → 标签下」整段高度，名/血条叠在怪身上
    const zoneH = Math.max(40, spriteZoneBottom - spriteZoneTop);
    const enemyPath = def.image ?? enemyImage(def.id);
    const tex = TextureCache.get(enemyPath);
    let displaySize = enemyDisplaySize(tier);
    const applyEnemyTex = (t: PIXI.Texture) => {
      if (!displayAlive(this._enemySprite)) return;
      this._enemySprite.texture = t;
      const s = readScale(this._enemySprite);
      if (s) {
        const scale = enemySpriteScale(t.width, t.height, tier, zoneH);
        s.set(scale);
        displaySize = t.height * scale;
        this._layout.enemyCenterY = enemySpriteCenterY(spriteZoneTop, spriteZoneBottom, displaySize, 4);
        if (displayAlive(this._enemyContainer)) {
          this._enemyContainer.position.set(enemyCenterX, this._layout.enemyCenterY);
        }
        this._syncEnemySideHudPos();
      }
      this._enemySprite.tint = enemySpriteTint(tier);
    };
    if (tex) {
      applyEnemyTex(tex);
    } else {
      displaySize = Math.min(displaySize, zoneH);
      // CDN / 分包未就绪：不卡主流程，到货后异步贴上
      void TextureCache.load(enemyPath).then(applyEnemyTex).catch(() => {});
    }
    // 贴顶上移：头顶靠近关卡匾，脚伸入名/血条叠层
    this._layout.enemyCenterY = enemySpriteCenterY(spriteZoneTop, spriteZoneBottom, displaySize, 4);
    if (displayAlive(this._enemyContainer)) {
      this._enemyContainer.position.set(enemyCenterX, this._layout.enemyCenterY);
    }
    this._syncEnemySideHudPos();
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

  /** 敌人属性克制提示：弱点珠 / 抵抗珠，怪左侧竖排 */
  private _refreshEnemyElementTags(element: Element): void {
    this._enemyElementRow.removeChildren();
    const weak = counterElementOf(element);
    const resist = resistedElementOf(element);
    const gap = 10;
    const weakBanned = this._ctrl.bannedElements.has(weak);
    const weakLabel = weakBanned ? '克制·本关封印' : '克制';
    const weakTag = this._makeElementCounterTag(weakLabel, weak, !weakBanned);
    const resistTag = this._makeElementCounterTag('抵抗', resist, false);
    const totalH = weakTag.tagH + gap + resistTag.tagH;
    weakTag.position.set(-weakTag.tagW / 2, -totalH / 2);
    resistTag.position.set(-resistTag.tagW / 2, -totalH / 2 + weakTag.tagH + gap);
    this._enemyElementRow.addChild(weakTag, resistTag);
    this._syncEnemySideHudPos();
  }

  /** 侧挂 HUD 贴怪心（立绘刷新后调用） */
  private _syncEnemySideHudPos(): void {
    const y = this._layout.enemyCenterY;
    this._layout.enemyTagY = y;
    this._layout.enemyCdY = y;
    if (displayAlive(this._enemyElementRow)) {
      this._enemyElementRow.position.set(this._layout.enemyTagX, y);
    }
    if (displayAlive(this._enemyCdBadge)) {
      this._enemyCdBadge.position.set(this._layout.enemyCdX, y);
    }
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

  /**
   * 敌人侧挂倒计时：蓄力 > 下次技能 >（仅慢攻怪）普攻间隔。
   * 间隔=1 的普攻每回合都打，报「N 回合后攻击」没有决策价值，故不显示。
   */
  refreshEnemyCd(): void {
    const enemy = this._ctrl.enemy;
    if (!displayAlive(this._enemyCdBadge)) return;
    if (enemy.hp <= 0) {
      this._enemyCdBadge.visible = false;
      this._enemyCdText.text = '';
      return;
    }
    const lines: string[] = [];
    if (enemy.charging) {
      lines.push('蓄力中', `×${enemy.charging.mult}`);
      this._enemyCdText.style.fill = 0xffe0a8;
      const cdScale = readScale(this._enemyCdBadge);
      if (cdScale) {
        TweenManager.cancelTarget(cdScale);
        cdScale.set(1.18);
        TweenManager.to({
          target: cdScale, props: { x: 1, y: 1 },
          duration: UI.anim.chargeWarn, ease: Ease.easeOutQuad,
        });
      }
    } else {
      const nextSkill = this._ctrl.nextSkillCountdown();
      if (nextSkill) {
        if (nextSkill.turns <= 0) lines.push('即将', '放技能');
        else lines.push(`${nextSkill.turns}回合后`, '技能');
      } else if (enemy.attackInterval > 1) {
        // 无技能的慢攻怪：间隔本身才是威胁节奏
        lines.push(`${enemy.attackCountdown}回合后`, '攻击');
      }
      this._enemyCdText.style.fill = COLORS.battleTagText;
    }
    if (enemy.dmgReduction) {
      lines.push(`减伤${Math.round(enemy.dmgReduction.reduction * 100)}%`);
    }
    if (lines.length === 0) {
      this._enemyCdBadge.visible = false;
      this._enemyCdText.text = '';
      return;
    }
    this._enemyCdBadge.visible = true;
    this._enemyCdText.text = lines.join('\n');
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
    this._combo?.show(combo, fx);
  }

  hideCombo(immediate = false): void {
    this._combo?.hide(immediate);
  }

  destroyCombo(): void {
    this._combo?.destroy();
    this._combo = null;
  }

  updateCombo(dt: number): void {
    this._combo?.update(dt);
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

  /**
   * 技能命中停拍：敌人立绘推近 → 停一拍 → 弹回（参数与理由见 SKILL_IMPACT）。
   *
   * 只做推近与停顿，闪白/击退/粒子仍由紧邻的 playEnemyHit 负责，避免同一帧两套反馈打架。
   * 不 cancel 容器 tween：击退动的是 position、这里动的是 scale，互不干扰，
   * 硬 cancel 反而会把击退停在半路，让敌人歪着不回位。
   */
  async playSkillImpact(fx: BattleFx, tier: SkillImpactTier): Promise<void> {
    const cfg = SKILL_IMPACT[tier];
    if (tier === 'heavy') {
      fx.shakeHeavy();
      Platform.vibrateShort('heavy');
    }
    const c = this._enemyContainer;
    if (!displayAlive(c)) {
      await delay(cfg.hold);
      return;
    }
    await tweenScale(c, { x: cfg.punchScale, y: cfg.punchScale }, {
      duration: cfg.punchIn, ease: Ease.easeOutQuad,
    });
    await delay(cfg.hold);
    await tweenScale(c, { x: 1, y: 1 }, {
      duration: cfg.settle, ease: Ease.easeOutBack,
    }, {
      onFallback: () => {
        resetScale(c, 1);
      },
    });
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

  /** 敌人攻击：蓄力下压 → 敌对能量矛砸向英雄血条 → 命中反馈 */
  playEnemyAttack(
    fx: BattleFx, _damage: number, _absorbed: number, heavy: boolean, onHeroHit: () => void,
  ): Promise<void> {
    return this._playEnemyAttackTween(fx, heavy, onHeroHit);
  }

  /**
   * 敌人出手预警：头顶大字 + 警示粒子，再进入弹道打血。
   * 让玩家先意识到「要挨打了」，而不是数字突然跳出来。
   */
  async playEnemyAttackTelegraph(fx: BattleFx, heavy: boolean): Promise<void> {
    const { enemyCenterX, enemyCenterY } = this._layout;
    const label = heavy ? '蓄力攻击！' : '敌人攻击！';
    const color = heavy ? 0xff3b30 : 0xff6b3d;
    fx.spawnFloat(label, enemyCenterX, enemyCenterY - 72, color, heavy ? 1.55 : 1.4);
    fx.burst({
      x: enemyCenterX,
      y: enemyCenterY,
      color,
      count: heavy ? 16 : 12,
      speed: heavy ? 260 : 220,
      gravity: -220,
      size: heavy ? 15 : 13,
      life: UI.anim.enemyAttackTelegraph * 0.85,
      texture: TextureCache.get(UI_BATTLE_IMAGES.skillReadyMote)
        ?? TextureCache.get(UI_FX_IMAGES.particleSpark)
        ?? undefined,
      blendMode: PIXI.BLEND_MODES.ADD,
    });
    Platform.vibrateShort(heavy ? 'medium' : 'light');
    await delay(UI.anim.enemyAttackTelegraph);
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

    const container = this._enemyContainer;
    const baseY = container.y;
    TweenManager.cancelTarget(spriteScale);
    TweenManager.cancelTarget(container);
    await Promise.all([
      guardedTween({
        target: spriteScale,
        props: {
          x: baseScale * (heavy ? 1.16 : 1.1),
          y: baseScale * (heavy ? 1.16 : 1.1),
        },
        duration: heavy ? 0.16 : 0.12,
        ease: Ease.easeOutQuad,
      }),
      guardedTween({
        target: container,
        props: { y: baseY + (heavy ? 28 : 20) },
        duration: heavy ? 0.16 : 0.12,
        ease: Ease.easeInQuad,
      }),
    ]);
    await fx.fireEnemyBolt(
      enemyCenterX, container.y, toX, toY, element,
      {
        heavy,
        duration: heavy ? UI.anim.enemyProjectileHeavy : UI.anim.enemyProjectile,
      },
    );
    void guardedTween({
      target: spriteScale,
      props: { x: baseScale, y: baseScale },
      duration: 0.14,
      ease: Ease.easeOutQuad,
    });
    void guardedTween({
      target: container,
      props: { y: baseY },
      duration: 0.16,
      ease: Ease.easeOutBack,
    });
    onHeroHit();
  }

  private _castMote(): PIXI.Texture | undefined {
    return TextureCache.get(UI_BATTLE_IMAGES.skillReadyMote)
      ?? TextureCache.get(UI_FX_IMAGES.particleSpark)
      ?? undefined;
  }

  /** 蓄力起手：红色凝聚粒子 + 立绘膨胀脉冲（预告文字由 refreshEnemyCd 常驻） */
  async playEnemyCharge(fx: BattleFx, skillName?: string): Promise<void> {
    const { enemyCenterX, enemyCenterY } = this._layout;
    await fx.playEnemySkillCast(enemyCenterX, enemyCenterY, skillName || '蓄力', {
      color: 0xff5252, footY: enemyCenterY + 70,
    });
    fx.burst({
      x: enemyCenterX, y: enemyCenterY,
      color: 0xff5252, count: 14, speed: 200, gravity: -350,
      size: 14, life: UI.anim.chargeWarn,
      texture: this._castMote(),
      blendMode: PIXI.BLEND_MODES.ADD,
    });
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

  async playEnemyHeal(fx: BattleFx, healed: number, skillName?: string): Promise<void> {
    const { enemyCenterX, enemyCenterY } = this._layout;
    await fx.playEnemySkillCast(enemyCenterX, enemyCenterY, skillName || '回复', {
      color: 0x8be78b, footY: enemyCenterY + 70,
    });
    fx.burst({
      x: enemyCenterX, y: enemyCenterY,
      color: 0x8be78b, count: 12, speed: 240, gravity: -250, size: 14, life: 0.55,
      texture: this._castMote(),
      blendMode: PIXI.BLEND_MODES.ADD,
    });
    fx.spawnFloat(`+${healed}`, enemyCenterX, enemyCenterY - 50, 0x8be78b, 1.2);
    this.refreshEnemyHp();
    await delay(0.45);
  }

  async playEnemyShield(fx: BattleFx, skillName?: string): Promise<void> {
    const { enemyCenterX, enemyCenterY } = this._layout;
    await fx.playEnemySkillCast(enemyCenterX, enemyCenterY, skillName || '护壁', {
      color: 0xb0c4de, footY: enemyCenterY + 70,
    });
    fx.burst({
      x: enemyCenterX, y: enemyCenterY,
      color: 0xb0c4de, count: 12, speed: 260, gravity: -150, size: 15, life: 0.5,
      texture: this._castMote(),
      blendMode: PIXI.BLEND_MODES.ADD,
    });
    fx.spawnFloat('减伤护壁！', enemyCenterX, enemyCenterY - 50, 0xb0c4de, 1.2);
    this.refreshEnemyCd();
    await delay(0.45);
  }

  /**
   * 敌人对我方施加 debuff（封珠/中毒/时间压缩/禁疗/技能封印）：
   * 敌人侧技能名 + 紫色施法粒子 → 英雄区 debuff 飘字 + 暗紫闪屏
   */
  async playEnemyDebuff(
    fx: BattleFx,
    result: EnemyActResult,
    text: string,
    opts?: { beamTo?: readonly { x: number; y: number }[] },
  ): Promise<void> {
    const { enemyCenterX, enemyCenterY } = this._layout;
    await fx.playEnemySkillCast(
      enemyCenterX, enemyCenterY, result.skillName || '技能',
      { color: 0xc06cf0, footY: enemyCenterY + 70 },
    );
    if (opts?.beamTo && opts.beamTo.length > 0) {
      fx.playEnemySealBeams(enemyCenterX, enemyCenterY, opts.beamTo);
    }
    fx.burst({
      x: enemyCenterX, y: enemyCenterY,
      color: 0xc06cf0, count: 12, speed: 240, gravity: -180, size: 14, life: 0.5,
      texture: this._castMote(),
      blendMode: PIXI.BLEND_MODES.ADD,
    });
    Platform.vibrateShort('medium');
    fx.flash(0x7a3cb8, 0.24, 0.3);
    const { statusAnnounceX, statusAnnounceY } = this._layout;
    fx.spawnStatusAnnounceFloat(text, statusAnnounceX, statusAnnounceY, 0xc06cf0);
    fx.burst({
      x: statusAnnounceX, y: statusAnnounceY,
      color: 0xc06cf0, count: 10, speed: 260, size: 13, life: 0.45,
      texture: this._castMote(),
      blendMode: PIXI.BLEND_MODES.ADD,
    });
    await delay(0.72);
  }

  /**
   * 眩晕跳过回合反馈：飘字 + 星爆。
   * 头顶转圈由 EnemyStunHalo 常驻承担（整段眩晕期间可见）；这里只补「这回合它跳过了」的瞬时确认。
   */
  async playEnemyStunned(fx: BattleFx): Promise<void> {
    const { enemyCenterX, enemyCenterY } = this._layout;
    const headY = enemyCenterY - UI.battle.enemySize / 2 - 16;
    fx.spawnFloat('眩晕中', enemyCenterX, headY - 34, 0xffd54f, 1.2);
    fx.burst({
      x: enemyCenterX, y: headY,
      color: 0xffd54f, count: 10, speed: 180, gravity: -100, size: 13, life: 0.55,
    });
    await delay(0.55);
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

  /**
   * 我方中毒 tick。
   *
   * 和普攻 `-155` 必须一眼能分：色（紫）/ 字号（小）/ 锚点（毒图标）全不同。
   * 旧实现用 hit 大红字写「中毒 -77」贴在公告位，和这一刀并排时玩家读成「打了两下」。
   */
  async playHeroDotTick(
    fx: BattleFx,
    amount: number,
    fromIcon?: { x: number; y: number } | null,
  ): Promise<void> {
    const fallbackX = UI.board.marginX + 40;
    const fallbackY = this._layout.teamStatusIconY;
    const x = fromIcon?.x ?? fallbackX;
    const y = fromIcon?.y ?? fallbackY;
    fx.spawnHeroDotFloat(amount, x, y - 8);
    fx.burst({
      x, y,
      color: 0xc06cf0, count: 6, speed: 160, gravity: -80, size: 10, life: 0.35,
    });
    Platform.vibrateShort('light');
    this.refreshHeroHp();
    await delay(0.28);
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

  /** 敌人狂暴：施法拍 + 红色爆发粒子 + 立绘膨胀脉冲 + 红闪 */
  async playEnemyEnrage(fx: BattleFx, atkMult: number, skillName?: string): Promise<void> {
    const { enemyCenterX, enemyCenterY } = this._layout;
    await fx.playEnemySkillCast(enemyCenterX, enemyCenterY, skillName || '狂暴', {
      color: 0xff5252, footY: enemyCenterY + 70,
    });
    fx.flash(0xff2d2d, 0.3, 0.4);
    fx.burst({
      x: enemyCenterX, y: enemyCenterY,
      color: 0xff3030, count: 18, speed: 360, gravity: -120, size: 17, life: 0.6,
      texture: this._castMote(),
      blendMode: PIXI.BLEND_MODES.ADD,
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

  /**
   * Boss 转阶段：金紫爆发 + 立绘拉伸 + 阶段名横幅。
   * 比狂暴更重（时长、震屏、粒子量），因为这是一场战斗里最多两三次的结构性节点，
   * 玩家必须清楚意识到「打法要变了」。
   */
  async playEnemyPhaseShift(fx: BattleFx, label: string): Promise<void> {
    const { enemyCenterX, enemyCenterY } = this._layout;
    await fx.playEnemySkillCast(enemyCenterX, enemyCenterY, '转阶段', {
      color: 0xffd451, footY: enemyCenterY + 70,
    });
    fx.flash(0xffc447, 0.34, 0.5);
    fx.burst({
      x: enemyCenterX, y: enemyCenterY,
      color: 0xffd451, count: 26, speed: 420, gravity: -90, size: 19, life: 0.75,
      texture: this._castMote(),
      blendMode: PIXI.BLEND_MODES.ADD,
    });
    fx.burst({
      x: enemyCenterX, y: enemyCenterY,
      color: 0x9b5cff, count: 18, speed: 300, gravity: -60, size: 15, life: 0.9,
      texture: this._castMote(),
      blendMode: PIXI.BLEND_MODES.ADD,
    });
    fx.spawnFloat(label, enemyCenterX, enemyCenterY - 70, 0xffd451, 1.8);
    fx.shakeMedium();
    Platform.vibrateLong();
    this.refreshEnemyHp();
    const c = this._enemyContainer;
    if (!displayAlive(c)) return;
    cancelDisplayTweens(c);
    await tweenScale(c, { x: 1.26, y: 0.86 }, { duration: 0.14, ease: Ease.easeOutQuad });
    await tweenScale(c, { x: 0.92, y: 1.16 }, { duration: 0.14, ease: Ease.easeInOutQuad });
    await tweenScale(c, { x: 1, y: 1 }, {
      duration: 0.22, ease: Ease.easeOutBack,
    }, {
      onFallback: () => {
        resetScale(c, 1);
      },
    });
  }
}
