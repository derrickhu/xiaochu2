/**
 * Combo 连击展示 — 对齐 xiao_chu battleComboView.js（棋盘中央、N连击 + 倍率 + 里程碑）
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { UI } from '@/balance/ui';
import { COMBAT } from '@/balance/combat';
import { comboMultiplier } from '@/formulas/damage';
import type { BattleLayout } from './BattleLayout';
import type { BattleFx } from './BattleFx';
import { dmgFloatScale } from './damageFloatStyle';

const COMBO_FONT = '"Avenir Next Condensed","Arial Black","PingFang SC",sans-serif';

export interface ComboMilestone {
  threshold: number;
  text: string;
  color: string;
  tier: number;
}

/** xiao_chu COMBO_MILESTONES */
export const COMBO_MILESTONES: readonly ComboMilestone[] = [
  { threshold: 3, text: '破!', color: '#4d88ff', tier: 1 },
  { threshold: 6, text: '无双!', color: '#ff8c00', tier: 2 },
  { threshold: 9, text: '神威!', color: '#ff4d6a', tier: 3 },
  { threshold: 12, text: '天选!', color: '#9d4dff', tier: 4 },
  { threshold: 15, text: '传说!', color: '#ffd700', tier: 5 },
  { threshold: 18, text: '神话!', color: '#ff2a6a', tier: 6 },
];

export function getComboTier(combo: number): number {
  if (!combo || combo < COMBO_MILESTONES[0].threshold) return 0;
  for (let i = COMBO_MILESTONES.length - 1; i >= 0; i--) {
    if (combo >= COMBO_MILESTONES[i].threshold) return COMBO_MILESTONES[i].tier;
  }
  return 0;
}

export function isComboMilestone(combo: number): boolean {
  return COMBO_MILESTONES.some((m) => m.threshold === combo);
}

interface ComboAnim {
  combo: number;
  timer: number;
  initScale: number;
}

interface ComboStyle {
  tier: number;
  isLow: boolean;
  isSuper: boolean;
  isMega: boolean;
  mainColor: string;
  glowColor: string;
  baseSz: number;
}

function comboStyle(combo: number): ComboStyle {
  const tier = getComboTier(combo);
  const isLow = tier === 0;
  const milestone = COMBO_MILESTONES.find((m) => m.tier === tier);
  const mainColor = milestone?.color ?? '#ffd700';
  const glowColor = tier >= 4 ? '#ff4060' : tier >= 2 ? '#ff6080' : tier >= 1 ? '#ffaa33' : '#ffe066';
  const S = dmgFloatScale();
  const baseSz = tier >= 4 ? 52 * S
    : tier >= 3 ? 46 * S
      : tier >= 2 ? 40 * S
        : tier >= 1 ? 34 * S
          : 22 * S;
  return { tier, isLow, isSuper: tier >= 2, isMega: tier >= 4, mainColor, glowColor, baseSz };
}

function hex(c: string): number {
  return parseInt(c.replace('#', ''), 16);
}

/** 微信小游戏 Canvas Text 对 fill 渐变数组不稳定，使用纯色 + 描边/阴影 */
function styledText(content: string, fontSize: number, fill: string, strokeW: number): PIXI.Text {
  const S = dmgFloatScale();
  return new PIXI.Text(content, {
    fontFamily: COMBO_FONT,
    fontSize,
    fontStyle: 'italic',
    fontWeight: '900',
    fill,
    stroke: '#000000',
    strokeThickness: strokeW * S,
    dropShadow: true,
    dropShadowColor: fill,
    dropShadowBlur: fontSize * 0.45,
    dropShadowDistance: 0,
    dropShadowAlpha: 0.9,
    align: 'center',
  });
}

export class ComboDisplay {
  private _root!: PIXI.Container;
  private _ring!: PIXI.Graphics;
  private _milestone!: PIXI.Text;
  private _num!: PIXI.Text;
  private _suffix!: PIXI.Text;
  private _mul!: PIXI.Text;
  private _mainRow!: PIXI.Container;
  private _anim: ComboAnim | null = null;
  private _inBattle = false;
  private _anchorY = 0;

  constructor(private readonly _layout: BattleLayout) {}

  build(parent: PIXI.Container): void {
    this._root = new PIXI.Container();
    parent.addChild(this._root);

    this._ring = new PIXI.Graphics();
    this._root.addChild(this._ring);

    this._milestone = styledText('', 40, '#ffd700', 5);
    this._milestone.anchor.set(0.5);
    this._milestone.visible = false;
    this._root.addChild(this._milestone);

    this._mainRow = new PIXI.Container();
    this._root.addChild(this._mainRow);

    this._num = styledText('0', 44, '#ffd700', 5);
    this._num.anchor.set(0.5);
    this._mainRow.addChild(this._num);

    this._suffix = styledText('连击', 32, '#ffe7a8', 4);
    this._suffix.anchor.set(0.5);
    this._mainRow.addChild(this._suffix);

    this._mul = styledText('x1.0', 18, '#ffe082', 3);
    this._mul.anchor.set(0.5, 0);
    this._root.addChild(this._mul);

    this._root.visible = false;
  }

  private _comboCenter(combo: number): { x: number; y: number } {
    const cell = UI.board.cellSize;
    const boardH = cell * COMBAT.boardRows;
    const style = comboStyle(combo);
    const yRatio = style.isLow ? 0.12 : 0.32;
    return {
      x: Game.logicWidth / 2,
      y: this._layout.boardY + boardH * yRatio,
    };
  }

  private _layoutTexts(combo: number, style: ComboStyle): void {
    const S = dmgFloatScale();
    const numSz = style.baseSz * (style.isMega ? 1.1 : style.isSuper ? 1.05 : 1);
    const suffixSz = style.baseSz * (style.isMega ? 0.82 : style.isSuper ? 0.78 : 0.72);
    const gap = Math.max(8 * S, style.baseSz * 0.16);

    this._num.text = String(combo);
    this._num.style.fontSize = numSz;
    this._num.style.strokeThickness = (style.isMega ? 7 : style.isSuper ? 6 : 5) * S;
    this._num.style.fill = style.mainColor;
    this._num.style.dropShadowColor = style.glowColor;
    this._num.style.dropShadowBlur = (style.isMega ? 34 : style.isSuper ? 28 : 22) * S;

    this._suffix.style.fontSize = suffixSz;
    this._suffix.style.strokeThickness = (style.isMega ? 4.5 : 4) * S;
    this._suffix.style.fill = '#ffe7a8';
    this._suffix.style.dropShadowColor = style.glowColor;
    this._suffix.style.dropShadowBlur = (style.isMega ? 22 : 18) * S;

    const totalW = this._num.width + gap + this._suffix.width;
    this._num.position.set(-totalW / 2 + this._num.width / 2, 0);
    this._suffix.position.set(this._num.x + this._num.width / 2 + gap + this._suffix.width / 2, style.baseSz * 0.04);

    this._mul.text = `x${comboMultiplier(combo).toFixed(1)}`;
    this._mul.style.fontSize = style.baseSz * 0.42;
    this._mul.position.set(0, style.baseSz * 0.62);

    const milestoneDef = COMBO_MILESTONES.find((m) => m.threshold === combo);
    if (milestoneDef && this._anim && this._anim.timer <= 58) {
      this._milestone.visible = true;
      this._milestone.text = milestoneDef.text;
      this._milestone.style.fontSize = style.baseSz * 1.18;
      this._milestone.style.fill = milestoneDef.color;
      this._milestone.style.dropShadowColor = milestoneDef.color;
      this._milestone.position.set(0, -style.baseSz * 1.95);
    } else {
      this._milestone.visible = false;
    }
  }

  private _drawRing(combo: number, style: ComboStyle, timer: number): void {
    const g = this._ring;
    g.clear();
    if (!isComboMilestone(combo) || timer >= 22) return;

    const S = dmgFloatScale();
    const ringP = timer / 22;
    const ringR = style.baseSz * (0.58 + ringP * 3.9);
    const ringAlpha = (1 - ringP) * 0.88;
    const ringColor = style.isMega ? 0xff2050 : style.isSuper ? 0xff4d6a : 0xffd700;

    g.lineStyle((7 - ringP * 4.8) * S, ringColor, ringAlpha);
    g.drawCircle(0, 0, ringR);

    if (timer > 3) {
      const ringP2 = (timer - 3) / 22;
      const ringR2 = style.baseSz * (0.34 + ringP2 * 3.25);
      g.lineStyle((4.5 - ringP2 * 3.2) * S, ringColor, Math.max(0, 1 - ringP2) * 0.58);
      g.drawCircle(0, 0, ringR2);
    }
  }

  private _spawnVfx(combo: number, fx: BattleFx): void {
    const style = comboStyle(combo);
    const tier = style.tier;
    const isTierBreak = isComboMilestone(combo);
    const center = this._comboCenter(combo);

    const tierFlash = tier >= 3 ? 18 : tier >= 1 ? 14 : 10;
    const flashMax = isTierBreak ? (tier >= 4 ? 24 : 20) : tierFlash;
    const flashAlpha = combo >= 12 ? 0.46 : combo >= 8 ? 0.36 : combo >= 5 ? 0.28 : 0.24;
    fx.flash(0xfffff0, flashMax / UI.fps.battle, flashAlpha);

    const palettes = tier >= 4
      ? ['#ff2050', '#ff6040', '#ffaa00', '#ffffff']
      : tier >= 3
        ? ['#ff4d6a', '#ff8060', '#ffd700', '#ffffff']
        : tier >= 2
          ? ['#ff8c00', '#ffd700', '#ffffff', '#ffcc66']
          : tier >= 1
            ? ['#4d88ff', '#ffd700', '#ffffff', '#8ec5ff']
            : ['#ffd700', '#ffe066', '#ffffff'];

    const baseCount = (tier >= 4 ? 30 : tier >= 3 ? 24 : tier >= 2 ? 18 : tier >= 1 ? 13 : 8) + (isTierBreak ? 12 : 0);
    const count = Math.min(38, baseCount);
    fx.burst({
      x: center.x,
      y: center.y,
      color: hex(palettes[tier] ?? palettes[0]),
      count,
      speed: 240 + tier * 40,
      gravity: -90,
      size: 10 + tier * 2,
      life: 0.5,
      alpha: 0.88,
    });

    if (isTierBreak) fx.shakeLight();
  }

  /** 每组消除 +1 时调用（xiao_chu：combo≥2 才显示文字，VFX 每连都播） */
  show(combo: number, fx: BattleFx): void {
    if (combo <= 0) return;
    this._spawnVfx(combo, fx);

    if (combo < 2) {
      this._root.visible = false;
      return;
    }

    const style = comboStyle(combo);
    const center = this._comboCenter(combo);
    this._anchorY = center.y;
    this._root.position.set(center.x, center.y);
    this._root.visible = true;
    this._inBattle = true;

    const initScale = isComboMilestone(combo) ? (style.tier >= 4 ? 4.0 : 2.9) : 2.9;
    this._anim = { combo, timer: 0, initScale };
    this._layoutTexts(combo, style);
    this._root.scale.set(initScale);
    this._root.alpha = style.isLow ? 0.5 : 1;
  }

  hide(immediate = false): void {
    this._inBattle = false;
    if (immediate) {
      this._root.visible = false;
      this._root.alpha = 0;
      this._ring.clear();
      this._milestone.visible = false;
      this._anim = null;
    }
  }

  update(dt: number): void {
    if (!this._anim || !this._root.visible) return;

    const S = dmgFloatScale();
    const POP_END = 16;
    const HOLD_END = 60;
    const TOTAL_END = 86;
    const freezeTimer = this._inBattle && this._anim.timer >= POP_END;

    if (!freezeTimer && this._anim.timer < TOTAL_END) {
      this._anim.timer += dt * UI.fps.battle;
    }

    const t = this._anim.timer;
    const initScale = this._anim.initScale;
    let scale: number;
    let alpha = 1;
    let offsetY = 0;

    if (t <= POP_END) {
      const p = t / POP_END;
      if (p < 0.25) scale = initScale - (initScale - 0.72) * (p / 0.25);
      else if (p < 0.52) scale = 0.72 + 0.48 * ((p - 0.25) / 0.27);
      else if (p < 0.74) scale = 1.2 - 0.24 * ((p - 0.52) / 0.22);
      else scale = 0.96 + 0.07 * ((p - 0.74) / 0.26);
      offsetY = p < 0.45 ? (1 - p / 0.45) * 10 * S : 0;
    } else if (this._inBattle) {
      scale = 1.03;
    } else if (t <= HOLD_END) {
      scale = 1.03 + Math.sin((t - POP_END) * 0.18) * 0.055;
      offsetY = Math.sin((t - POP_END) * 0.09) * -1.5 * S;
    } else {
      const fadeP = Math.min(1, (t - HOLD_END) / (TOTAL_END - HOLD_END));
      scale = 1.03 - 0.16 * fadeP;
      alpha = 1 - fadeP;
      offsetY = -fadeP * 30 * S;
      if (fadeP >= 1) {
        this._root.visible = false;
        this._anim = null;
        return;
      }
    }

    const style = comboStyle(this._anim.combo);
    this._root.scale.set(scale);
    this._root.alpha = alpha * (style.isLow ? 0.5 : 1);
    this._root.position.set(Game.logicWidth / 2, this._anchorY + offsetY);
    this._drawRing(this._anim.combo, style, t);
    if (t <= 58) this._layoutTexts(this._anim.combo, style);
  }
}
