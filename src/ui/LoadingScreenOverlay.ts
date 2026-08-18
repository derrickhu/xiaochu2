/**
 * 启动全屏 Loading（对齐花花 LoadingScreenOverlay）
 * 插画 cover + 标题 logo + 暖金进度条 + 软著/健康游戏忠告
 */
import * as PIXI from 'pixi.js';
import { LOADING_IMAGES } from '@/config/Assets';
import { Game } from '@/core/Game';
import { TextureCache } from '@/core/TextureCache';
import { COLORS } from '@/ui/theme';
import { resolveSystemFontFamily } from '@/ui/calligraphyFont';

/** Loading 首批资源：专用 splash + 标题（须在主包，勿走 CDN） */
export const LOADING_SPLASH_IMAGES = [
  LOADING_IMAGES.splash,
  LOADING_IMAGES.title,
] as const;

const TITLE_MAX_W = 520;
const TITLE_SCALE = 0.92;
const TITLE_NUDGE_Y = -24;
const TITLE_BELOW_SAFE = 18;

const LEGAL_BOTTOM_INSET = 28;
const BAR_ABOVE_LEGAL_GAP = 14;
const LEGAL_FONT_SIZE = 13;
const LEGAL_LINE_HEIGHT = 19;

/** 软著登记号：2026SR0617816（计算机软件著作权登记证书） */
const LOADING_LEGAL_TEXT = [
  '著作权人：深圳幸运呱科技有限公司',
  '软著编号：2026SR0617816',
  '',
  '《健康游戏忠告》',
  '抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。',
  '适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。',
].join('\n');

const BAR_MAX_W = 560;
const BAR_PAD_X = 24;
const BAR_H = 38;
const BAR_R = BAR_H / 2;
const INNER_PAD = 4;

const TRACK_LINE = COLORS.panelBorder;
const TRACK_FILL = COLORS.panelBg;
const BAR_FILL = COLORS.accent;
const BAR_FILL_DEEP = COLORS.accentDeep;

const SHADOW_OFF_Y = 5;
const SHADOW_ALPHA = 0.22;

export class LoadingScreenOverlay extends PIXI.Container {
  private _lw = 750;
  private _lh = 1334;
  private _bg = new PIXI.Graphics();
  private _splash: PIXI.Sprite | null = null;
  private _title: PIXI.Sprite | null = null;
  private _barShadow = new PIXI.Graphics();
  private _track = new PIXI.Graphics();
  private _fill = new PIXI.Graphics();
  private _pctText: PIXI.Text;
  private _legalText: PIXI.Text;
  private _barW = 480;
  private _barX = 0;
  private _barY = 0;
  private _progress = 0;

  constructor() {
    super();
    this.zIndex = 50000;
    this.sortableChildren = true;
    this._bg.zIndex = 0;
    this._barShadow.zIndex = 10;
    this._track.zIndex = 11;
    this._fill.zIndex = 12;

    this._pctText = new PIXI.Text('0%', {
      fontSize: 22,
      fill: 0xffffff,
      fontFamily: resolveSystemFontFamily(),
      fontWeight: 'bold',
      stroke: COLORS.accentDeep,
      strokeThickness: 5,
      dropShadow: true,
      dropShadowColor: 0x3a2e22,
      dropShadowBlur: 3,
      dropShadowAngle: Math.PI / 2,
      dropShadowDistance: 2,
    });
    this._pctText.anchor.set(0.5, 0.5);
    this._pctText.zIndex = 13;

    this._legalText = new PIXI.Text(LOADING_LEGAL_TEXT, {
      fontSize: LEGAL_FONT_SIZE,
      fill: 0xffffff,
      fontFamily: resolveSystemFontFamily(),
      align: 'center',
      lineHeight: LEGAL_LINE_HEIGHT,
      wordWrap: true,
      dropShadow: true,
      dropShadowColor: 0x1a2838,
      dropShadowBlur: 2,
      dropShadowAngle: Math.PI / 2,
      dropShadowDistance: 1,
      dropShadowAlpha: 0.65,
    });
    this._legalText.anchor.set(0.5, 1);
    this._legalText.zIndex = 14;

    this.addChild(this._bg);
    this.addChild(this._barShadow);
    this.addChild(this._track);
    this.addChild(this._fill);
    this.addChild(this._pctText);
    this.addChild(this._legalText);
    this._relayout();
  }

  private _relayout(): void {
    this._lw = Game.logicWidth;
    this._lh = Game.logicHeight;

    this._bg.clear();
    this._bg.beginFill(COLORS.bgFallback, 1);
    this._bg.drawRect(0, 0, this._lw, this._lh);
    this._bg.endFill();

    if (this._splash?.texture?.valid) {
      const tex = this._splash.texture;
      const scale = Math.max(this._lw / tex.width, this._lh / tex.height);
      this._splash.scale.set(scale);
      this._splash.position.set(this._lw * 0.5, this._lh * 0.5);
    }

    if (this._title?.texture?.valid) {
      const tex = this._title.texture;
      const maxW = Math.min(TITLE_MAX_W, this._lw - 32);
      const s = Math.min(1, maxW / tex.width) * TITLE_SCALE;
      this._title.scale.set(s);
      const cy = Game.safeTop + TITLE_BELOW_SAFE + (tex.height * s) / 2 + TITLE_NUDGE_Y;
      this._title.position.set(this._lw * 0.5, cy);
    }

    this._barW = Math.min(BAR_MAX_W, this._lw - BAR_PAD_X * 2);
    this._barX = (this._lw - this._barW) / 2;

    this._legalText.style.wordWrapWidth = this._barW;
    this._legalText.position.set(this._lw * 0.5, this._lh - LEGAL_BOTTOM_INSET);
    this._barY = this._legalText.position.y
      - this._legalText.height
      - BAR_ABOVE_LEGAL_GAP
      - BAR_H;

    this._pctText.position.set(this._lw * 0.5, this._barY + BAR_H * 0.5);

    this._drawShadow();
    this._drawTrack();
    this._drawFill();
    this._syncPercentLabel();
  }

  /** 预载 LOADING_SPLASH_IMAGES 后调用 */
  applySplashTexture(): void {
    const tex = TextureCache.get(LOADING_IMAGES.splash);
    if (!tex?.valid) return;

    if (this._splash) {
      this.removeChild(this._splash);
      this._splash.destroy();
      this._splash = null;
    }

    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5, 0.5);
    sp.zIndex = 1;
    this.addChildAt(sp, 1);
    this._splash = sp;
    this._relayout();
  }

  applyTitleTexture(): void {
    const tex = TextureCache.get(LOADING_IMAGES.title);
    if (!tex?.valid) return;

    if (this._title) {
      this.removeChild(this._title);
      this._title.destroy();
      this._title = null;
    }

    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5, 0.5);
    sp.zIndex = 5;
    if (this._splash) {
      this.addChildAt(sp, this.getChildIndex(this._splash) + 1);
    } else {
      this.addChildAt(sp, 1);
    }
    this._title = sp;
    this._relayout();
  }

  setProgress(ratio: number): void {
    const p = Math.max(0, Math.min(1, ratio));
    if (p < this._progress) return;
    this._progress = p;
    this._drawFill();
    this._syncPercentLabel();
  }

  private _syncPercentLabel(): void {
    this._pctText.text = `${Math.round(this._progress * 100)}%`;
  }

  private _drawShadow(): void {
    this._barShadow.clear();
    const pad = 3;
    this._barShadow.beginFill(0x5a4a30, SHADOW_ALPHA);
    this._barShadow.drawRoundedRect(
      this._barX - pad,
      this._barY - pad + SHADOW_OFF_Y,
      this._barW + pad * 2,
      BAR_H + pad * 2,
      BAR_R + pad * 0.6,
    );
    this._barShadow.endFill();
  }

  private _drawTrack(): void {
    this._track.clear();
    this._track.lineStyle(3.5, TRACK_LINE, 0.95);
    this._track.beginFill(TRACK_FILL, 0.82);
    this._track.drawRoundedRect(this._barX, this._barY, this._barW, BAR_H, BAR_R);
    this._track.endFill();
    this._track.lineStyle(2, 0xffffff, 0.45);
    this._track.drawRoundedRect(
      this._barX + 2,
      this._barY + 2,
      this._barW - 4,
      BAR_H - 4,
      Math.max(12, BAR_R - 2),
    );
  }

  private _drawFill(): void {
    this._fill.clear();
    const innerW = this._barW - INNER_PAD * 2;
    const innerH = BAR_H - INNER_PAD * 2;
    const w = Math.max(0, innerW * this._progress);
    if (w < 0.5) return;

    const x0 = this._barX + INNER_PAD;
    const y0 = this._barY + INNER_PAD;
    const r = Math.max(10, BAR_R - INNER_PAD);

    this._fill.beginFill(BAR_FILL_DEEP, 0.98);
    this._fill.drawRoundedRect(x0, y0, w, innerH, r);
    this._fill.endFill();

    const hiH = Math.max(3, Math.floor(innerH * 0.45));
    this._fill.beginFill(BAR_FILL, 0.88);
    this._fill.drawRoundedRect(x0, y0, w, hiH, r);
    this._fill.endFill();
  }

  refreshLayout(): void {
    this._relayout();
  }
}
