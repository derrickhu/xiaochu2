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
  UI_FX_IMAGES,
  comboDigitImage,
  comboLabelImage,
} from '@/config/Assets';
import type { BattleLayout } from './BattleLayout';
import type { BattleFx } from './BattleFx';
import { dmgFloatScale } from './damageFloatStyle';
import { displayAlive, readScale, resetScale } from '@/core/animationGuard';
import { applyTextResolution } from '@/ui/text';
import { FxLayer } from '@/core/FxLayer';

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
  UI_FX_IMAGES.particleSpark,
  UI_BATTLE_IMAGES.comboEnergy,
  UI_BATTLE_IMAGES.comboRays,
  UI_BATTLE_IMAGES.comboRaysCore,
  UI_BATTLE_IMAGES.comboStarFlare,
  UI_BATTLE_IMAGES.comboGoldFlake,
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
/**
 * 能量爆发窗口。
 *
 * 背景光效不用 Graphics 画：圆环用 drawCircle、放射用等分 lineTo，出来的是数学上
 * 完美的圆和等长直线，人眼一看就知道是代码画的，靠调参数（更大更亮更多粒子）
 * 救不回来。改用离线烘焙的贴图（scripts/bake_combo_fx.py），边缘的不规则、粗细
 * 变化、末端飞散都是噪声算出来的。
 *
 * 底层刻意是「亮色」而不是暗色。先做过一版水墨暗底托字，玩家的原话是「黑色
 * 一大坨，还不如没有」——暗色底靠遮挡制造对比，压在五彩珠子上必然脏。同一块底
 * 改成 ADD 亮色，珠子非但不被遮黑反而被照亮，既撑得起场面又不脏。
 *
 * 四层各司其职，少一层都塌：放射冲出去给动势、能量团给体量、白热核给刺眼的
 * 亮度、星芒给「高光时刻」的招牌感。
 */
const FLASH_END = 5;
const RAYS_END = 15;
const ENERGY_BURST_END = 7;
const ENERGY_SETTLE_END = 16;
const FLARE_IN_END = 4;
const FLARE_SETTLE_END = 22;
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

function comboPalette(tier: number): readonly string[] {
  if (tier >= 4) return ['#ff2050', '#ff6040', '#ffaa00', '#ffffff', '#ff80aa'];
  if (tier >= 3) return ['#ff4d6a', '#ff8060', '#ffd700', '#ffffff'];
  if (tier >= 2) return ['#ff8c00', '#ffd700', '#ffffff', '#ffcc66'];
  if (tier >= 1) return ['#4d88ff', '#ffd700', '#ffffff', '#8ec5ff'];
  return ['#ffd700', '#ffe066', '#ffffff'];
}

/**
 * 特效色，刻意与文字色（COMBO_MILESTONES.color）解耦。
 *
 * 棋盘底是米黄的、还铺满金色珠子，橙和金这两档一旦照搬字色就会融进背景，
 * 亮度调多高都不跳——试过「金色 + 超强白热核」，结果整块糊成白饼。只能靠色相
 * 岔开：低档走青蓝、无双走洋红、传说走赤橙。
 */
function fxTint(tier: number): number {
  switch (tier) {
    case 1: return 0x38ccff;
    case 2: return 0xff2d95;
    case 3: return 0xff2a5a;
    case 4: return 0xa24dff;
    case 5: return 0xff600a;
    case 6: return 0xff2a6a;
    default: return 0xff961e;
  }
}

/**
 * 能量底的常驻强度。爆发过后要留一层托住文字，但压太亮会把珠面洗白，
 * 低档尤其要克制——每两三次消除就闪一次满屏的话，高档就没有惊喜了。
 */
function energyAlpha(tier: number): number {
  if (tier >= 5) return 0.70;
  if (tier >= 4) return 0.66;
  if (tier >= 3) return 0.60;
  if (tier >= 2) return 0.54;
  if (tier >= 1) return 0.42;
  return 0.26;
}

/** 传说档没法靠色相跳出暖底，只能把白热核开大压过背景 */
function hotBoost(tier: number): number {
  return tier === 5 ? 1.15 : 1;
}

function comboParticleTex(kind: 'star' | 'flake'): PIXI.Texture {
  if (kind === 'flake') {
    return TextureCache.get(UI_BATTLE_IMAGES.comboGoldFlake)
      ?? TextureCache.get(UI_FX_IMAGES.particleSpark)
      ?? PIXI.Texture.WHITE;
  }
  return TextureCache.get(UI_BATTLE_IMAGES.petStar)
    ?? TextureCache.get(UI_FX_IMAGES.particleSpark)
    ?? PIXI.Texture.WHITE;
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
  /** 文字冲击层：只缩放这一层，背后光效/粒子保持世界尺寸 */
  private _pop!: PIXI.Container;
  /** 全屏泛光：爆发那一瞬整块屏幕被照亮，不遮挡任何东西 */
  private _flash!: PIXI.Graphics;
  /** 放射彩色层：宽光锥给体量 + 彩色宽线给存在感 */
  private _rays!: PIXI.Sprite;
  /** 放射白芯层：细白线单给锐度，不跟着 tint 染色 */
  private _raysCore!: PIXI.Sprite;
  /** 能量团主体，托住文字 */
  private _energy!: PIXI.Sprite;
  /** 白热核：比能量团小得多，铺大了会洗白棋盘 */
  private _hot!: PIXI.Sprite;
  /** 六角星芒 + 横向长条 */
  private _starFlare!: PIXI.Sprite;
  private _comboFx!: FxLayer;
  private _banner!: PIXI.Graphics;
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

  private _energyBaseX = 1;
  private _energyBaseY = 1;
  private _hotBaseX = 1;
  private _hotBaseY = 1;
  private _raysBaseX = 1;
  private _raysBaseY = 1;
  private _starBaseX = 1;
  private _starBaseY = 1;
  private _energyPeak = 0.6;
  /** 逐连翻转贴图，同一张连着出两次就会被认出来 */
  private _fxFlipX = 1;
  private _fxFlipY = 1;
  private _raysSpin = 0;

  constructor(private readonly _layout: BattleLayout) {}

  build(parent: PIXI.Container): void {
    this._root = new PIXI.Container();
    parent.addChild(this._root);

    /*
     * 从下往上：泛光 → 放射 → 能量团 → 白热核 → 星芒 → 粒子 → 文字。
     * 顺序不能乱：放射必须垫在能量团下面，不然细线会盖在能量团上像划痕；
     * 星芒必须压在最上层，它是「高光时刻」的招牌，被能量团糊住就没意义了。
     */
    this._flash = new PIXI.Graphics();
    this._flash.blendMode = PIXI.BLEND_MODES.ADD;
    this._flash.visible = false;
    this._root.addChild(this._flash);

    this._rays = makeSprite(UI_BATTLE_IMAGES.comboRays);
    this._rays.blendMode = PIXI.BLEND_MODES.ADD;
    this._rays.visible = false;
    this._root.addChild(this._rays);

    this._raysCore = makeSprite(UI_BATTLE_IMAGES.comboRaysCore);
    this._raysCore.blendMode = PIXI.BLEND_MODES.ADD;
    this._raysCore.visible = false;
    this._root.addChild(this._raysCore);

    this._energy = makeSprite(UI_BATTLE_IMAGES.comboEnergy);
    this._energy.blendMode = PIXI.BLEND_MODES.ADD;
    this._energy.visible = false;
    this._root.addChild(this._energy);

    this._hot = makeSprite(UI_BATTLE_IMAGES.comboFlare);
    this._hot.blendMode = PIXI.BLEND_MODES.ADD;
    this._hot.visible = false;
    this._root.addChild(this._hot);

    this._starFlare = makeSprite(UI_BATTLE_IMAGES.comboStarFlare);
    this._starFlare.blendMode = PIXI.BLEND_MODES.ADD;
    this._starFlare.visible = false;
    this._root.addChild(this._starFlare);

    this._comboFx = new FxLayer();
    this._root.addChild(this._comboFx.container);

    this._banner = new PIXI.Graphics();
    this._banner.blendMode = PIXI.BLEND_MODES.ADD;
    this._root.addChild(this._banner);

    this._pop = new PIXI.Container();
    this._root.addChild(this._pop);

    this._flare = makeSprite(UI_BATTLE_IMAGES.comboFlare);
    this._flare.visible = false;
    this._flare.blendMode = PIXI.BLEND_MODES.ADD;
    this._pop.addChild(this._flare);

    this._milestone = makeSprite(UI_BATTLE_IMAGES.comboMsBreak);
    this._milestone.visible = false;
    this._pop.addChild(this._milestone);

    /*
     * 残影是主行的等价副本，垫在主行之下放大淡出，ADD 让它像光一样散开而不是脏叠影。
     * 混合模式要逐个挂在 Sprite 上：Container 自身不参与绘制，设在容器上不会传给子级。
     */
    this._ghostRow = new PIXI.Container();
    this._ghostRow.visible = false;
    this._pop.addChild(this._ghostRow);
    this._ghostNumRow = new PIXI.Container();
    this._ghostRow.addChild(this._ghostNumRow);
    this._ghostSuffix = makeSprite(comboLabelImage(0));
    this._ghostSuffix.blendMode = PIXI.BLEND_MODES.ADD;
    this._ghostRow.addChild(this._ghostSuffix);

    this._mainRow = new PIXI.Container();
    this._pop.addChild(this._mainRow);

    this._numRow = new PIXI.Container();
    this._mainRow.addChild(this._numRow);

    this._suffix = makeSprite(comboLabelImage(0));
    this._mainRow.addChild(this._suffix);

    this._shine = new PIXI.Graphics();
    this._shine.blendMode = PIXI.BLEND_MODES.ADD;
    this._shine.visible = false;
    this._pop.addChild(this._shine);

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

    this._layoutFx(style);
    this._laidCombo = combo;
  }

  /**
   * 背景特效的尺寸与配色。
   *
   * 贴图都是方形，这里统一压成横向椭圆去贴合文字行的长宽比——竖着铺开的能量
   * 会跑到棋盘上下方去，既盖住珠子又跟文字对不上。压扁不会露馅，因为能量舌和
   * 放射本来就是各向发散的，横向拉开反而更像被文字撞开。
   */
  private _layoutFx(style: ComboStyle): void {
    const tint = fxTint(style.tier);
    const texW = (sp: PIXI.Sprite): number => Math.max(1, sp.texture.width || 512);

    // 能量团要兜住整行字，上限卡在屏宽：最高档行宽本就接近棋盘，再乘系数就甩出屏幕了
    const energyW = Math.min(
      Math.max(this._rowW * 2.1, style.baseSz * 4.2),
      Game.logicWidth * 1.1,
    );
    this._energyBaseX = energyW / texW(this._energy);
    this._energyBaseY = this._energyBaseX * 0.66;
    this._energy.tint = tint;
    this._energyPeak = energyAlpha(style.tier);

    const hotW = energyW * 0.34 * hotBoost(style.tier);
    this._hotBaseX = hotW / texW(this._hot);
    this._hotBaseY = this._hotBaseX * 0.62;
    this._hot.tint = 0xfffaf0;

    // 放射铺得比能量团更开，冲出棋盘边缘才有「炸开」的感觉
    const raysW = Math.min(this._rowW * 2.9, Game.logicWidth * 1.5);
    this._raysBaseX = raysW / texW(this._rays);
    this._raysBaseY = this._raysBaseX * 0.72;
    this._rays.tint = tint;

    const starW = this._rowW * 1.9;
    this._starBaseX = starW / texW(this._starFlare);
    this._starBaseY = this._starBaseX * 0.5;
    this._starFlare.tint = 0xffecbe;

    // 低档不给星芒和泛光：每两三次消除就闪一次满屏的话，高档就没有惊喜了
    this._starFlare.visible = style.tier >= 2;
    this._flash.visible = style.tier >= 2;
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

  /**
   * 背景能量爆发。
   *
   * 四层各走各的时间线，错开才有层次：泛光只闪 5 帧（久了就是蒙了层色片）、
   * 放射一路冲出去后彻底消失（留着会挡住后续操作）、能量团 7 帧甩到最大再
   * 回落到常驻托住文字、星芒最后淡到低亮度当装饰。
   *
   * 贴图不做旋转，只做镜像。旋转会让人一眼看穿是同一张图在转；而且这些图都被
   * 压成了横向椭圆，转过 90° 就立起来跟文字对不上了。
   */
  private _updateFx(style: ComboStyle, timer: number): void {
    const fx = this._fxFlipX;
    const fy = this._fxFlipY;

    if (this._flash.visible) {
      const p = Math.min(1, timer / FLASH_END);
      this._flash.alpha = (1 - p) * 0.10;
      if (timer > FLASH_END) this._flash.visible = false;
    }

    if (timer <= RAYS_END) {
      // 加速冲出：起手快、末段慢，比线性更像被炸开
      const p = timer / RAYS_END;
      const mul = 0.35 + (1 - (1 - p) ** 2) * 1.05;
      const a = Math.min(1, p * 5) * (1 - p) ** 0.8;
      const spin = this._raysSpin;
      this._rays.visible = true;
      this._raysCore.visible = true;
      this._rays.rotation = spin;
      this._raysCore.rotation = spin;
      this._rays.scale.set(this._raysBaseX * mul * fx, this._raysBaseY * mul * fy);
      this._raysCore.scale.set(this._raysBaseX * mul * fx, this._raysBaseY * mul * fy);
      this._rays.alpha = a;
      this._raysCore.alpha = a * 0.85;
    } else {
      this._rays.visible = false;
      this._raysCore.visible = false;
    }

    let mul: number;
    let a: number;
    if (timer <= ENERGY_BURST_END) {
      const p = timer / ENERGY_BURST_END;
      mul = 0.45 + 0.85 * p;
      a = this._energyPeak * Math.min(1, p * 2.4);
    } else if (timer <= ENERGY_SETTLE_END) {
      const p = (timer - ENERGY_BURST_END) / (ENERGY_SETTLE_END - ENERGY_BURST_END);
      mul = 1.30 - 0.30 * p;
      a = this._energyPeak;
    } else {
      mul = 1;
      a = this._energyPeak;
    }
    this._energy.visible = true;
    this._energy.scale.set(this._energyBaseX * mul * fx, this._energyBaseY * mul * fy);
    this._energy.alpha = a;

    // 热核收缩得比能量团更快，模拟高温部分先冷却
    const hotP = Math.min(1, timer / ENERGY_SETTLE_END);
    const hotMul = 1.5 - 0.6 * hotP;
    this._hot.visible = true;
    this._hot.scale.set(this._hotBaseX * hotMul, this._hotBaseY * hotMul);
    this._hot.alpha = (0.95 - 0.5 * hotP) * (a / Math.max(this._energyPeak, 0.01));

    if (!this._starFlare.visible) return;
    let starMul: number;
    let starA: number;
    if (timer <= FLARE_IN_END) {
      const p = timer / FLARE_IN_END;
      starMul = 1.45 - 0.45 * p;
      starA = p;
    } else if (timer <= FLARE_SETTLE_END) {
      const p = (timer - FLARE_IN_END) / (FLARE_SETTLE_END - FLARE_IN_END);
      starMul = 1 + p * 0.12;
      starA = 1 - 0.62 * p;
    } else {
      starMul = 1.12;
      starA = 0.38;
    }
    this._starFlare.scale.set(this._starBaseX * starMul * fx, this._starBaseY * starMul);
    this._starFlare.alpha = starA;
  }

  /** 全屏泛光的矩形。root 挂在棋盘中上部，往四周铺满够一屏即可 */
  private _drawFlash(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._flash.clear();
    this._flash.beginFill(0xffffff, 1);
    this._flash.drawRect(-w / 2, -h, w, h * 2);
    this._flash.endFill();
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

  /**
   * 飞溅粒子分三种，缺一种都会露怯：
   *   能量屑  染成档位色、ADD，数量最多，负责「有东西被炸出去」的实感
   *   金箔    偏白的亮片，在彩色能量里打出高光，没有它整团颜色会发闷
   *   星屑    少量彩色高光，只在里程碑加，负责最后那一下闪
   */
  private _spawnVfx(combo: number): void {
    const style = comboStyle(combo);
    const tier = style.tier;
    const isTierBreak = isComboMilestone(combo);
    const S = dmgFloatScale();
    const flakeTex = comboParticleTex('flake');

    const speedMul = tier >= 4 ? 1.8 : tier >= 3 ? 1.65 : tier >= 2 ? 1.5 : tier >= 1 ? 1.25 : 1.05;
    const sizeMul = tier >= 4 ? 1.55 : tier >= 3 ? 1.42 : tier >= 2 ? 1.28 : tier >= 1 ? 1.12 : 1;
    const speed = 420 * S * speedMul;
    const size = Math.min(9.5 * S * sizeMul, 22);
    // 0.97 远高于默认阻尼，碎屑要飞得开才像被甩出去而不是原地淡出
    const drag = 0.97;

    const motesCount = (tier >= 4 ? 24 : tier >= 3 ? 19 : tier >= 2 ? 15 : tier >= 1 ? 11 : 6)
      + (isTierBreak ? 8 : 0);
    this._comboFx.burst({
      x: 0,
      y: 0,
      color: fxTint(tier),
      count: motesCount,
      speed,
      speedVar: 0.6,
      gravity: 110 * S,
      size: size * 1.25,
      life: isTierBreak ? 0.66 : 0.54,
      alpha: 0.95,
      texture: flakeTex,
      blendMode: PIXI.BLEND_MODES.ADD,
      drag,
    });

    const flakeCount = (tier >= 4 ? 18 : tier >= 3 ? 14 : tier >= 2 ? 11 : tier >= 1 ? 8 : 5)
      + (isTierBreak ? 8 : 0);
    this._comboFx.burst({
      x: 0,
      y: 0,
      color: 0xfff2d0,
      count: flakeCount,
      speed: speed * 0.92,
      speedVar: 0.55,
      gravity: 95 * S,
      size,
      life: isTierBreak ? 0.62 : 0.5,
      alpha: 0.95,
      texture: flakeTex,
      blendMode: PIXI.BLEND_MODES.ADD,
      drag,
    });

    if (!isTierBreak) return;

    const starTex = comboParticleTex('star');
    const palettes = comboPalette(tier);
    const perColor = Math.max(2, Math.round((tier >= 4 ? 16 : 11) / palettes.length));
    for (const color of palettes) {
      this._comboFx.burst({
        x: 0,
        y: 0,
        color: hex(color),
        count: perColor,
        speed: speed * 1.05,
        speedVar: 0.5,
        gravity: 60 * S,
        size: size + 4,
        life: 0.6,
        alpha: 0.95,
        texture: starTex,
        blendMode: PIXI.BLEND_MODES.ADD,
        drag,
      });
    }
  }

  /** 每组消除 +1 时调用（combo≥2 才显示文字，VFX 每连都播） */
  show(combo: number, _fx: BattleFx): void {
    if (combo <= 0 || !displayAlive(this._root)) return;
    const center = this._comboCenter(combo);
    this._anchorY = center.y;
    this._root.position.set(center.x, center.y);
    this._root.visible = true;
    this._root.alpha = 1;
    this._spawnVfx(combo);

    if (combo < 2) {
      this._pop.visible = false;
      this._mul.visible = false;
      this._hideFx();
      this._banner.clear();
      this._anim = null;
      return;
    }

    const style = comboStyle(combo);
    this._pop.visible = true;
    this._pop.position.set(0, 0);
    this._mul.visible = true;
    this._inBattle = true;

    // 每连换一种镜像与放射角度：同一张图连着出两次就会被认出来
    this._fxFlipX = Math.random() < 0.5 ? 1 : -1;
    this._fxFlipY = Math.random() < 0.5 ? 1 : -1;
    this._raysSpin = Math.random() * Math.PI;

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
    this._drawFlash();
    this._updateMilestonePulse(0);
    this._updateGhost(style, 0);
    this._updateDigits(0);
    this._updateFx(style, 0);
    readScale(this._pop)?.set(initScale);
    this._root.alpha = 1;
    this._pop.alpha = style.isLow ? 0.7 : 1;
  }

  hide(immediate = false): void {
    this._inBattle = false;
    /*
     * 淡出窗口是第 HOLD_END~TOTAL_END 帧，而 hold 期间 timer 照常走到 TOTAL_END 就封顶。
     * 于是 hold 超过一秒再收，timer 早已越过淡出段，退场会「啪」地瞬间消失。把 timer
     * 拉回淡出起点，无论托了多久都能走完整的淡出。
     */
    if (!immediate && this._anim && this._anim.timer > HOLD_END) {
      this._anim.timer = HOLD_END;
    }
    if (immediate) {
      this._root.visible = false;
      this._root.alpha = 0;
      this._pop.visible = false;
      resetScale(this._pop);
      this._banner.clear();
      this._shine.clear();
      this._shine.visible = false;
      this._ghostRow.visible = false;
      this._mainRow.rotation = 0;
      this._ghostRow.rotation = 0;
      this._milestone.visible = false;
      this._flare.visible = false;
      this._hideFx();
      this._comboFx.clear();
      this._anim = null;
      this._laidCombo = -1;
    }
  }

  private _hideFx(): void {
    this._flash.visible = false;
    this._rays.visible = false;
    this._raysCore.visible = false;
    this._energy.visible = false;
    this._hot.visible = false;
    this._starFlare.visible = false;
  }

  destroy(): void {
    this.hide(true);
    if (this._comboFx.container.parent) {
      this._comboFx.container.parent.removeChild(this._comboFx.container);
    }
    this._comboFx.destroy();
  }

  update(dt: number): void {
    this._comboFx.update(dt);
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

    let jx = 0;
    let jy = 0;
    if (this._anim.isMilestone && t < JITTER_END) {
      const k = (1 - t / JITTER_END) * (1.6 + this._anim.tier) * S;
      jx = (Math.random() - 0.5) * 2 * k;
      jy = (Math.random() - 0.5) * 2 * k;
    }

    readScale(this._pop)?.set(scale * (1 + stretch), scale * (1 - stretch * 0.55));
    this._pop.alpha = alpha * (style.isLow ? 0.7 : 1);
    this._pop.position.set(jx, offsetY + jy);
    this._root.position.set(Game.logicWidth / 2, this._anchorY);
    this._root.alpha = alpha;
    this._mul.alpha = alpha;
    this._mainRow.rotation = t < TILT_END
      ? this._anim.tiltDir * 0.17 * (1 - t / TILT_END) ** 2
      : 0;
    this._ghostRow.rotation = this._mainRow.rotation;
    this._updateFx(style, t);
    this._drawBanner(style, t, this._anim.isMilestone);
    this._drawShine(t);
    this._updateGhost(style, t);
    this._updateDigits(t);
    this._updateMilestonePulse(this._inBattle ? Math.min(t, 40) : t);
  }
}
