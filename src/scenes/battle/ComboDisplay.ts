/**
 * Combo 连击展示 — 位图印章版
 *
 * 业界惯例（PAD / 三消）：固定字表预烘焙 stamp PNG（描边/渐变/发光进像素），
 * 运行时只缩放 Sprite。真机动态 Text 斜体+厚描边会糊成底板，故里程碑与「连击」
 * 及数字全部走位图；倍率仍用轻量 Text（字少、描边薄）。
 *
 * 素材：scripts/bake_combo_stamps.py → pkg-battle/.../combo/
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TextureCache } from '@/core/TextureCache';
import { UI } from '@/balance/ui';
import { COMBAT } from '@/balance/combat';
import { comboMultiplier } from '@/formulas/damage';
import {
  COMBO_MS_IMAGES,
  COMBO_TEXT_PATHS,
  UI_BATTLE_IMAGES,
  comboDigitImage,
  comboLabelImage,
} from '@/config/Assets';
import type { BattleLayout } from './BattleLayout';
import type { BattleFx } from './BattleFx';
import { dmgFloatScale } from './damageFloatStyle';
import { displayAlive, readScale } from '@/core/animationGuard';
import { applyTextResolution } from '@/ui/text';

const COMBO_FONT = '"Avenir Next Condensed","Arial Black","PingFang SC",sans-serif';

export interface ComboMilestone {
  threshold: number;
  text: string;
  /** bake_combo_stamps.py 的 key */
  stampKey: string;
  color: string;
  tier: number;
}

/** 对齐 xiao_chu COMBO_MILESTONES；展示用位图印章，text 仅作调试/埋点 */
export const COMBO_MILESTONES: readonly ComboMilestone[] = [
  { threshold: 3, text: '破!', stampKey: 'break', color: '#4d88ff', tier: 1 },
  { threshold: 6, text: '无双!', stampKey: 'wushuang', color: '#ff8c00', tier: 2 },
  { threshold: 9, text: '神威!', stampKey: 'shenwei', color: '#ff4d6a', tier: 3 },
  { threshold: 12, text: '天选!', stampKey: 'tianxuan', color: '#9d4dff', tier: 4 },
  { threshold: 15, text: '传说!', stampKey: 'chuanshuo', color: '#ffd700', tier: 5 },
  { threshold: 18, text: '神话!', stampKey: 'shenhua', color: '#ff2a6a', tier: 6 },
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

/**
 * 战斗预加载：连击位图全表。数字与「连击」每档一套色，去重后共 6 套；
 * 全量预载是为了升档那一帧不出现空贴图——档位切换正是最该炸的瞬间。
 */
export const COMBO_STAMP_PATHS: readonly string[] = [
  UI_BATTLE_IMAGES.comboFlare,
  ...Object.values(COMBO_MS_IMAGES),
  ...COMBO_TEXT_PATHS,
];

interface ComboAnim {
  combo: number;
  timer: number;
  initScale: number;
  tier: number;
  isMilestone: boolean;
  /** 入场倾斜方向，逐连交替左右，避免每次都从同一侧砸下来 */
  tiltDir: number;
}

/**
 * 文字冲击时间线（帧 @60fps）。
 *
 * 参照王者击杀播报 / 格斗 combo counter 的拆解：真正的「炸」不是把字放大，
 * 而是同一瞬间叠了六件事——残影向外扩散、光刃扫过字面、挤压拉伸、倾斜回正、
 * 高频抖动、速度带从中心冲出。单独拿出任何一条都平淡，叠在 0.25 秒里才有冲击力。
 * 全部窗口都压在 POP_END 附近结束，因为最短的连击节拍只有 13 帧。
 */
const POP_END = 16;
const HOLD_END = 60;
const TOTAL_END = 86;
const GHOST_END = 13;
const SHINE_START = 2;
const SHINE_END = 15;
const JITTER_END = 11;
const BANNER_END = 20;
const TILT_END = 9;
/** 多位数逐位入场的错帧，第二位晚落一点更有节奏 */
const DIGIT_STAGGER = 2;
const DIGIT_POP = 8;

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
  // 印章是「高光时刻」，宁大勿小；烘焙纹理高 190~300px，放到这个尺寸仍是缩小采样，不会糊
  const baseSz = tier >= 4 ? 68 * S
    : tier >= 3 ? 60 * S
      : tier >= 2 ? 52 * S
        : tier >= 1 ? 44 * S
          : 28 * S;
  return { tier, isLow, isSuper: tier >= 2, isMega: tier >= 4, mainColor, glowColor, baseSz };
}

function hex(c: string): number {
  return parseInt(c.replace('#', ''), 16);
}

function styledMulText(content: string, fontSize: number, fill: string): PIXI.Text {
  const S = dmgFloatScale();
  const t = new PIXI.Text(content, {
    fontFamily: COMBO_FONT,
    fontSize,
    fontStyle: 'normal',
    fontWeight: '900',
    fill,
    stroke: '#1a1028',
    strokeThickness: 2.2 * S,
    dropShadow: false,
    align: 'center',
    padding: 0,
  });
  t.style.dropShadow = false;
  return applyTextResolution(t);
}

function makeSprite(path: string): PIXI.Sprite {
  const tex = TextureCache.get(path) ?? PIXI.Texture.EMPTY;
  const sp = new PIXI.Sprite(tex);
  sp.anchor.set(0.5);
  return sp;
}

export class ComboDisplay {
  private _root!: PIXI.Container;
  private _banner!: PIXI.Graphics;
  private _ring!: PIXI.Graphics;
  private _flare!: PIXI.Sprite;
  private _milestone!: PIXI.Sprite;
  private _ghostRow!: PIXI.Container;
  private _ghostNumRow!: PIXI.Container;
  private _ghostSuffix!: PIXI.Sprite;
  private _numRow!: PIXI.Container;
  private _suffix!: PIXI.Sprite;
  private _shine!: PIXI.Graphics;
  private _mul!: PIXI.Text;
  private _mainRow!: PIXI.Container;
  private _anim: ComboAnim | null = null;
  private _inBattle = false;
  private _anchorY = 0;
  private _laidCombo = -1;
  private _msBaseScale = 1;
  private _flareBaseScale = 1;
  private _msColor = 0xffd700;
  private _digits: PIXI.Sprite[] = [];
  private _digitBase: number[] = [];
  private _rowW = 0;
  private _rowH = 0;

  constructor(private readonly _layout: BattleLayout) {}

  build(parent: PIXI.Container): void {
    this._root = new PIXI.Container();
    parent.addChild(this._root);

    this._banner = new PIXI.Graphics();
    this._banner.blendMode = PIXI.BLEND_MODES.ADD;
    this._root.addChild(this._banner);

    this._ring = new PIXI.Graphics();
    this._root.addChild(this._ring);

    this._flare = makeSprite(UI_BATTLE_IMAGES.comboFlare);
    this._flare.visible = false;
    this._flare.blendMode = PIXI.BLEND_MODES.ADD;
    this._root.addChild(this._flare);

    this._milestone = makeSprite(UI_BATTLE_IMAGES.comboMsBreak);
    this._milestone.visible = false;
    this._root.addChild(this._milestone);

    /*
     * 残影是主行的等价副本，垫在主行之下放大淡出，ADD 让它像光一样散开而不是脏叠影。
     * 混合模式要逐个挂在 Sprite 上：Container 自身不参与绘制，设在容器上不会传给子级。
     */
    this._ghostRow = new PIXI.Container();
    this._ghostRow.visible = false;
    this._root.addChild(this._ghostRow);
    this._ghostNumRow = new PIXI.Container();
    this._ghostRow.addChild(this._ghostNumRow);
    this._ghostSuffix = makeSprite(comboLabelImage(0));
    this._ghostSuffix.blendMode = PIXI.BLEND_MODES.ADD;
    this._ghostRow.addChild(this._ghostSuffix);

    this._mainRow = new PIXI.Container();
    this._root.addChild(this._mainRow);

    this._numRow = new PIXI.Container();
    this._mainRow.addChild(this._numRow);

    this._suffix = makeSprite(comboLabelImage(0));
    this._mainRow.addChild(this._suffix);

    this._shine = new PIXI.Graphics();
    this._shine.blendMode = PIXI.BLEND_MODES.ADD;
    this._shine.visible = false;
    this._root.addChild(this._shine);

    this._mul = styledMulText('x1.0', 18, '#ffe082');
    this._mul.anchor.set(0.5, 0);
    this._root.addChild(this._mul);

    this._root.visible = false;
  }

  private _comboCenter(combo: number): { x: number; y: number } {
    const cell = UI.board.cellSize;
    const boardH = cell * COMBAT.boardRows;
    const style = comboStyle(combo);
    const yRatio = style.isLow ? 0.12 : 0.28;
    return {
      x: Game.logicWidth / 2,
      y: this._layout.boardY + boardH * yRatio,
    };
  }

  private _setSpriteTex(sp: PIXI.Sprite, path: string): void {
    const tex = TextureCache.get(path);
    if (tex) sp.texture = tex;
  }

  private _layoutDigits(
    row: PIXI.Container,
    combo: number,
    targetH: number,
    tier: number,
  ): number {
    row.removeChildren().forEach((c) => c.destroy());
    const digits = String(combo).split('');
    const sprites: PIXI.Sprite[] = [];
    let totalW = 0;
    const overlap = targetH * 0.08;
    for (const ch of digits) {
      const path = comboDigitImage(Number(ch), tier);
      const sp = makeSprite(path);
      this._setSpriteTex(sp, path);
      const tex = sp.texture;
      const scale = tex.height > 0 ? targetH / tex.height : 1;
      sp.scale.set(scale);
      sprites.push(sp);
      totalW += sp.width - overlap;
    }
    totalW += overlap;
    let x = -totalW / 2;
    for (const sp of sprites) {
      sp.position.set(x + sp.width / 2, 0);
      x += sp.width - overlap;
      row.addChild(sp);
    }
    if (row === this._numRow) {
      this._digits = sprites;
      this._digitBase = sprites.map((s) => s.scale.x);
    }
    return totalW;
  }

  /** 仅在 combo 变化时重建主行；里程碑脉冲在 update 里改 scale */
  private _layoutStatic(combo: number, style: ComboStyle): void {
    const S = dmgFloatScale();
    const numH = style.baseSz * (style.isMega ? 1.35 : style.isSuper ? 1.22 : 1.1);
    const suffixH = style.baseSz * (style.isMega ? 0.95 : style.isSuper ? 0.88 : 0.82);
    const gap = Math.max(6 * S, style.baseSz * 0.12);

    const numW = this._layoutDigits(this._numRow, combo, numH, style.tier);

    this._setSpriteTex(this._suffix, comboLabelImage(style.tier));
    const suffixTex = this._suffix.texture;
    const suffixScale = suffixTex.height > 0 ? suffixH / suffixTex.height : 1;
    this._suffix.scale.set(suffixScale);

    const totalW = numW + gap + this._suffix.width;
    this._numRow.position.set(-totalW / 2 + numW / 2, 0);
    this._suffix.position.set(
      this._numRow.x + numW / 2 + gap + this._suffix.width / 2,
      style.baseSz * 0.06,
    );
    this._rowW = totalW;
    this._rowH = numH;

    // 残影与主行同排同位，只是整体染成里程碑色
    this._layoutDigits(this._ghostNumRow, combo, numH, style.tier);
    this._setSpriteTex(this._ghostSuffix, comboLabelImage(style.tier));
    this._ghostSuffix.scale.set(suffixScale);
    this._ghostNumRow.position.copyFrom(this._numRow.position);
    this._ghostSuffix.position.copyFrom(this._suffix.position);
    const ghostTint = hex(style.mainColor);
    for (const sp of this._ghostNumRow.children as PIXI.Sprite[]) {
      sp.tint = ghostTint;
      sp.blendMode = PIXI.BLEND_MODES.ADD;
    }
    this._ghostSuffix.tint = ghostTint;

    this._mul.text = `x${comboMultiplier(combo).toFixed(1)}`;
    this._mul.style.fontSize = style.baseSz * 0.42;
    this._mul.style.fill = style.mainColor;
    this._mul.position.set(0, style.baseSz * 0.72);

    const milestoneDef = COMBO_MILESTONES.find((m) => m.threshold === combo);
    if (milestoneDef) {
      const path = COMBO_MS_IMAGES[milestoneDef.stampKey];
      this._setSpriteTex(this._milestone, path);
      this._milestone.visible = true;
      // baseSz 整体放大后，倍率与上移量都要收一档，否则高 tier 的印章会顶出棋盘
      const msH = style.baseSz * (style.isMega ? 1.35 : 1.2);
      const tex = this._milestone.texture;
      this._msBaseScale = tex.height > 0 ? msH / tex.height : 1;
      this._milestone.scale.set(this._msBaseScale);
      this._milestone.position.set(0, -style.baseSz * 1.55);
      this._msColor = hex(milestoneDef.color);

      this._setSpriteTex(this._flare, UI_BATTLE_IMAGES.comboFlare);
      this._flareBaseScale = (style.baseSz * 2.8) / 128;
      this._flare.scale.set(this._flareBaseScale);
      this._flare.position.set(0, -style.baseSz * 1.55);
      this._flare.tint = this._msColor;
      this._flare.visible = true;
    } else {
      this._milestone.visible = false;
      this._flare.visible = false;
    }

    this._laidCombo = combo;
  }

  private _updateMilestonePulse(timer: number): void {
    if (!this._milestone.visible) return;
    if (timer > 58) {
      this._milestone.visible = false;
      this._flare.visible = false;
      return;
    }
    const pulse = timer <= 34 ? 1 + (1 - timer / 34) * 0.35 : 1;
    this._milestone.scale.set(this._msBaseScale * pulse);
    if (timer <= 34) {
      this._flare.visible = true;
      this._flare.alpha = Math.max(0, 1 - timer / 28) * 0.9;
      this._flare.rotation = timer * 0.12;
      this._flare.scale.set(this._flareBaseScale * (1 + (1 - timer / 28) * 0.4));
    } else {
      this._flare.visible = false;
    }
  }

  /** 里程碑局部冲击环 + 放射速度线（控制半径，避免旧版「全屏外圈」感） */
  private _drawRing(combo: number, style: ComboStyle, timer: number): void {
    this._ring.clear();
    if (!isComboMilestone(combo) || timer > 22) return;
    const S = dmgFloatScale();
    const p = timer / 22;
    const r = style.baseSz * (0.55 + p * 1.65);
    const alpha = (1 - p) * 0.85;
    const color = hex(style.glowColor);
    this._ring.lineStyle(Math.max(2, (6 - p * 3.5) * S), color, alpha);
    this._ring.drawCircle(0, 0, r);
    if (timer > 3) {
      const p2 = (timer - 3) / 22;
      const r2 = style.baseSz * (0.35 + p2 * 1.35);
      this._ring.lineStyle(Math.max(1.5, (4 - p2 * 2.5) * S), color, Math.max(0, 1 - p2) * 0.5);
      this._ring.drawCircle(0, 0, r2);
    }
    // 放射速度线：格斗/MOBA 播报的标志性元素，条数随 tier 增加
    if (style.tier < 2) return;
    const n = 6 + style.tier * 2;
    const r0 = style.baseSz * (0.9 + p * 1.9);
    const len = style.baseSz * 0.5 * (1 - p);
    this._ring.lineStyle(Math.max(1.5, 3 * S), color, (1 - p) * 0.65);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + style.tier * 0.4;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      this._ring.moveTo(cos * r0, sin * r0);
      this._ring.lineTo(cos * (r0 + len), sin * (r0 + len));
    }
  }

  /**
   * 光刃扫过字面。真机上给文字做 mask 会打断批处理，这里直接让斜条压在主行上层
   * 并向两侧溢出——溢出的部分反而更像一道横切过去的刃光。
   */
  private _drawShine(timer: number): void {
    this._shine.clear();
    if (timer < SHINE_START || timer > SHINE_END || this._rowH <= 0) {
      this._shine.visible = false;
      return;
    }
    this._shine.visible = true;
    const p = (timer - SHINE_START) / (SHINE_END - SHINE_START);
    const S = dmgFloatScale();
    const reach = this._rowW * 0.5 + this._rowH;
    const x = -reach + p * reach * 2;
    const bandW = Math.max(10 * S, this._rowH * 0.28);
    const h = this._rowH * 0.75;
    const skew = h * 0.45;
    this._shine.beginFill(0xffffff, Math.sin(p * Math.PI) * 0.5);
    this._shine.drawPolygon([
      x - bandW / 2 + skew, -h,
      x + bandW / 2 + skew, -h,
      x + bandW / 2 - skew, h,
      x - bandW / 2 - skew, h,
    ]);
    this._shine.endFill();
  }

  /** 里程碑速度带：两条斜切色带从文字两侧冲出去，制造「撞进画面」的横向动势 */
  private _drawBanner(style: ComboStyle, timer: number, isMilestone: boolean): void {
    this._banner.clear();
    if (!isMilestone || timer > BANNER_END) return;
    const p = timer / BANNER_END;
    const h = style.baseSz * 0.5;
    const gapX = style.baseSz * 0.55;
    const len = style.baseSz * (1.0 + p * 4.0);
    const skew = h * 0.9;
    const color = hex(style.mainColor);
    this._banner.beginFill(color, (1 - p) * 0.45);
    this._banner.drawPolygon([
      gapX + skew, -h, gapX + len + skew, -h, gapX + len - skew, h, gapX - skew, h,
    ]);
    this._banner.drawPolygon([
      -gapX - skew, -h, -gapX - len - skew, -h, -gapX - len + skew, h, -gapX + skew, h,
    ]);
    this._banner.endFill();
  }

  /** 残影：主行副本放大淡出，tier 越高扩得越远 */
  private _updateGhost(style: ComboStyle, timer: number): void {
    if (timer > GHOST_END) {
      this._ghostRow.visible = false;
      return;
    }
    const p = timer / GHOST_END;
    this._ghostRow.visible = true;
    // 起手就比主行大一档：完全重合会 ADD 成一团过曝白，看不出是残影
    this._ghostRow.scale.set(1.06 + p * (0.7 + style.tier * 0.12));
    this._ghostRow.alpha = (1 - p) * 0.55;
  }

  /** 逐位入场：多位数时第二位晚 2 帧砸下来，比整体缩放更有打击节奏 */
  private _updateDigits(timer: number): void {
    for (let i = 0; i < this._digits.length; i++) {
      const sp = this._digits[i];
      const base = this._digitBase[i] ?? 1;
      const st = timer - i * DIGIT_STAGGER;
      if (st <= 0) {
        sp.alpha = 0;
        sp.scale.set(base * 1.9);
      } else if (st < DIGIT_POP) {
        const p = st / DIGIT_POP;
        sp.alpha = 1;
        sp.scale.set(base * (1.9 - 0.9 * p));
      } else {
        sp.alpha = 1;
        sp.scale.set(base);
      }
    }
  }

  private _spawnVfx(combo: number, fx: BattleFx): void {
    const style = comboStyle(combo);
    const tier = style.tier;
    const isTierBreak = isComboMilestone(combo);
    const center = this._comboCenter(combo);

    const palettes = tier >= 4
      ? ['#ff2050', '#ff6040', '#ffaa00', '#ffffff']
      : tier >= 3
        ? ['#ff4d6a', '#ff8060', '#ffd700', '#ffffff']
        : tier >= 2
          ? ['#ff8c00', '#ffd700', '#ffffff', '#ffcc66']
          : tier >= 1
            ? ['#4d88ff', '#ffd700', '#ffffff', '#8ec5ff']
            : ['#ffd700', '#ffe066', '#ffffff'];

    const baseCount = (tier >= 4 ? 22 : tier >= 3 ? 18 : tier >= 2 ? 14 : tier >= 1 ? 12 : 7)
      + (isTierBreak ? 8 : 0);
    const count = Math.min(30, baseCount);
    fx.burst({
      x: center.x,
      y: center.y,
      color: hex(palettes[Math.min(tier, palettes.length - 1)] ?? palettes[0]),
      count,
      speed: 200 + tier * 28 + (isTierBreak ? 40 : 0),
      gravity: -90,
      size: 9 + tier + (isTierBreak ? 3 : 0),
      life: isTierBreak ? 0.55 : 0.42,
      alpha: 0.9,
    });
    if (isTierBreak) {
      fx.burst({
        x: center.x,
        y: center.y - style.baseSz * 1.6,
        color: hex(style.mainColor),
        count: 10,
        speed: 160,
        gravity: -40,
        size: 12,
        life: 0.45,
        alpha: 0.85,
      });
    }
  }

  /** 每组消除 +1 时调用（combo≥2 才显示文字，VFX 每连都播） */
  show(combo: number, fx: BattleFx): void {
    if (combo <= 0 || !displayAlive(this._root)) return;
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

    const milestone = isComboMilestone(combo);
    const initScale = milestone ? (style.tier >= 4 ? 4.2 : 3.4) : 3.0;
    this._anim = {
      combo,
      timer: 0,
      initScale,
      tier: style.tier,
      isMilestone: milestone,
      tiltDir: combo % 2 === 0 ? 1 : -1,
    };
    this._layoutStatic(combo, style);
    this._updateMilestonePulse(0);
    this._updateGhost(style, 0);
    this._updateDigits(0);
    readScale(this._root)?.set(initScale);
    this._root.alpha = style.isLow ? 0.65 : 1;
  }

  hide(immediate = false): void {
    this._inBattle = false;
    if (immediate) {
      this._root.visible = false;
      this._root.alpha = 0;
      this._ring.clear();
      this._banner.clear();
      this._shine.clear();
      this._shine.visible = false;
      this._ghostRow.visible = false;
      this._mainRow.rotation = 0;
      this._ghostRow.rotation = 0;
      this._milestone.visible = false;
      this._flare.visible = false;
      this._anim = null;
      this._laidCombo = -1;
    }
  }

  update(dt: number): void {
    if (!this._anim || !displayAlive(this._root) || !this._root.visible) return;

    const S = dmgFloatScale();
    /*
     * 旧版在战斗中冻结 timer，好处是里程碑光效停住不散，代价是所有入场特效
     * 都被按在第 16 帧——残影、光刃、速度带全都演不完就卡住。现在让 timer 照常走，
     * 靠 _inBattle 分支维持 hold 姿态不淡出，印章的可见性单独在脉冲里兜住。
     */
    if (this._anim.timer < TOTAL_END) {
      this._anim.timer += dt * UI.fps.battle;
    }

    const t = this._anim.timer;
    const initScale = this._anim.initScale;
    let scale: number;
    let alpha = 1;
    let offsetY = 0;
    /** 挤压拉伸：砸下来的瞬间横向撑开一点，回正得越快越像被「摔」在屏幕上 */
    let stretch = 0;

    if (t <= POP_END) {
      const p = t / POP_END;
      if (p < 0.25) scale = initScale - (initScale - 0.72) * (p / 0.25);
      else if (p < 0.52) scale = 0.72 + 0.48 * ((p - 0.25) / 0.27);
      else if (p < 0.74) scale = 1.2 - 0.24 * ((p - 0.52) / 0.22);
      else scale = 0.96 + 0.07 * ((p - 0.74) / 0.26);
      offsetY = p < 0.45 ? (1 - p / 0.45) * 10 * S : 0;
      if (p < 0.35) stretch = (1 - p / 0.35) * 0.22;
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
        this._laidCombo = -1;
        return;
      }
    }

    const style = comboStyle(this._anim.combo);
    if (this._laidCombo !== this._anim.combo) {
      this._layoutStatic(this._anim.combo, style);
    }

    // 里程碑落地那几帧高频抖动，衰减到 0；tier 越高抖得越狠
    let jx = 0;
    let jy = 0;
    if (this._anim.isMilestone && t < JITTER_END) {
      const k = (1 - t / JITTER_END) * (1.6 + this._anim.tier) * S;
      jx = (Math.random() - 0.5) * 2 * k;
      jy = (Math.random() - 0.5) * 2 * k;
    }

    readScale(this._root)?.set(scale * (1 + stretch), scale * (1 - stretch * 0.55));
    this._root.alpha = alpha * (style.isLow ? 0.65 : 1);
    this._root.position.set(Game.logicWidth / 2 + jx, this._anchorY + offsetY + jy);
    // 入场倾斜回正：弹性收敛，末尾归零免得停在歪的
    this._mainRow.rotation = t < TILT_END
      ? this._anim.tiltDir * 0.17 * (1 - t / TILT_END) ** 2
      : 0;
    this._ghostRow.rotation = this._mainRow.rotation;
    this._drawRing(this._anim.combo, style, t);
    /*
     * 速度带反向抵消 root 的入场缩放。不抵消的话，前几帧 root 还是 3~4 倍，
     * 两条带子会被撑成横贯全屏的色块，抢掉文字本身。
     */
    this._banner.scale.set(1 / Math.max(0.35, scale));
    this._drawBanner(style, t, this._anim.isMilestone);
    this._drawShine(t);
    this._updateGhost(style, t);
    this._updateDigits(t);
    // 战斗中把脉冲时钟钳在收尾点，印章保持可见等下一连，而不是中途消失
    this._updateMilestonePulse(this._inBattle ? Math.min(t, 40) : t);
  }
}
