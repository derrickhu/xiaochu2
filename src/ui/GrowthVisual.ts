/**
 * 等级 / 星级 UI 组件 — 灵宠页 / 编队页 / 详情等统一引用 getGrowthUi() 配色。
 *
 * 单一真源：balance/growth.ts 的 GROWTH_UI；
 * 战斗 Q 版星贴图走 style:'sprite'（与 BattlePetBar 同一 battle_pet_star）。
 * 场景禁止再写 0x... / 手写 ★ 循环区分等级与星级。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { UI_BATTLE_IMAGES } from '@/config/Assets';
import {
  MAX_PET_STAR, getGrowthUi, type GrowthUiVariant,
} from '@/balance/growth';
import { getStatUi, type StatKey } from '@/balance/petRoles';
import { UI } from '@/balance/ui';
import { makeText } from './text';
import { FONT_SIZE } from './theme';

function resolveSize(opts: { size?: number; scale?: number }, fallback: number): number {
  if (opts.size !== undefined) return opts.size;
  if (opts.scale !== undefined) return Math.round(9 * opts.scale);
  return fallback;
}

function levelTextOpts(
  ui: ReturnType<typeof getGrowthUi>,
  size: number,
  bold = true,
): { size: number; fill: number; bold: boolean; strokeColor?: number; strokeWidth?: number } {
  const base = { size, fill: ui.levelColor, bold };
  if (ui.levelStroke) {
    return { ...base, strokeColor: ui.levelStroke, strokeWidth: Math.max(2, Math.round(size * 0.2)) };
  }
  return base;
}

export interface StarRowOpts {
  star: number;
  maxStar?: number;
  size?: number;
  /** xiao_chu 设计缩放 S = logicWidth / 375 */
  scale?: number;
  variant?: GrowthUiVariant;
  /** dim = 灰色 ★；hollow = ☆ */
  emptyStyle?: 'dim' | 'hollow';
  /** center = 以 (0,0) 为中心；left = 左对齐 */
  anchor?: 'center' | 'left';
  /**
   * glyph = ★ 文字（默认）；
   * sprite = 战斗 Q 版星贴图 battle_pet_star（详情/战斗统一）
   */
  style?: 'glyph' | 'sprite';
  /** sprite 单星边长；不传则用 size / UI.battle.petStarSize */
  starSize?: number;
  /** sprite 星间距 */
  gap?: number;
}

/** 星级行（默认 5 槽） */
export function makeStarRow(opts: StarRowOpts): PIXI.Container {
  if (opts.style === 'sprite') {
    return makeSpriteStarRow(opts);
  }
  return makeGlyphStarRow(opts);
}

function makeGlyphStarRow(opts: StarRowOpts): PIXI.Container {
  const maxStar = opts.maxStar ?? MAX_PET_STAR;
  const star = Math.max(0, Math.min(maxStar, opts.star));
  const ui = getGrowthUi(opts.variant ?? 'panel');
  const size = resolveSize(opts, FONT_SIZE.xxs);
  const slot = size * 0.92;
  const emptyStyle = opts.emptyStyle ?? 'dim';
  const totalW = slot * maxStar;

  const cont = new PIXI.Container();
  const startX = opts.anchor === 'center' ? -totalW / 2 : 0;
  for (let i = 0; i < maxStar; i++) {
    const filled = i < star;
    const glyph = filled ? '★' : (emptyStyle === 'hollow' ? '☆' : '★');
    const st = makeText(glyph, {
      size,
      fill: filled ? ui.starFilled : ui.starEmpty,
      anchor: [0, 0.5],
    });
    st.position.set(startX + i * slot, 0);
    cont.addChild(st);
  }
  return cont;
}

/** 战斗同款 Q 版星贴图行 */
function makeSpriteStarRow(opts: StarRowOpts): PIXI.Container {
  const maxStar = opts.maxStar ?? MAX_PET_STAR;
  const filled = Math.max(0, Math.min(maxStar, opts.star));
  const starSize = opts.starSize
    ?? opts.size
    ?? resolveSize(opts, UI.battle.petStarSize);
  const gap = opts.gap ?? 4;
  const rowW = maxStar * starSize + (maxStar - 1) * gap;
  const ui = getGrowthUi(opts.variant ?? 'panel');
  const tex = TextureCache.get(UI_BATTLE_IMAGES.petStar);

  const cont = new PIXI.Container();
  const startX = opts.anchor === 'center' ? -rowW / 2 : 0;
  for (let i = 0; i < maxStar; i++) {
    const lit = i < filled;
    const x = startX + starSize / 2 + i * (starSize + gap);
    if (tex) {
      const star = new PIXI.Sprite(tex);
      star.anchor.set(0.5);
      star.width = starSize;
      star.height = starSize;
      if (!lit) {
        star.tint = 0x9a8a70;
        star.alpha = 0.35;
      }
      star.position.set(x, 0);
      cont.addChild(star);
    } else {
      const fallback = makeText('★', {
        size: starSize,
        fill: lit ? 0xf5c84a : ui.starEmpty,
        bold: true,
        anchor: 0.5,
        strokeColor: lit ? 0xb5701f : 0x8a7a60,
        strokeWidth: 2,
      });
      if (!lit) fallback.alpha = 0.45;
      fallback.position.set(x, 0);
      cont.addChild(fallback);
    }
  }
  return cont;
}

export interface LevelLabelOpts {
  level: number;
  maxLevel?: number;
  size?: number;
  scale?: number;
  variant?: GrowthUiVariant;
  bold?: boolean;
  anchor?: number | [number, number];
}

/** 等级文字：Lv.5 或 Lv.5/50 */
export function makeLevelLabel(opts: LevelLabelOpts): PIXI.Text {
  const ui = getGrowthUi(opts.variant ?? 'panel');
  const size = resolveSize(opts, FONT_SIZE.xxs);
  const text = opts.maxLevel !== undefined
    ? `Lv.${opts.level}/${opts.maxLevel}`
    : `Lv.${opts.level}`;
  return makeText(text, {
    ...levelTextOpts(ui, size, opts.bold ?? true),
    anchor: opts.anchor ?? [0, 0.5],
  });
}

export interface LevelStarLineOpts {
  level: number;
  star: number;
  maxLevel?: number;
  maxStar?: number;
  size?: number;
  scale?: number;
  variant?: GrowthUiVariant;
  /** 仅显示已点亮星（编队列表紧凑模式） */
  filledOnly?: boolean;
  emptyStyle?: 'dim' | 'hollow';
}

/** 一行：「Lv.5 ★★★☆☆」或「Lv.5/50 ★★★☆☆」 */
export function makeLevelStarLine(opts: LevelStarLineOpts): PIXI.Container {
  const ui = getGrowthUi(opts.variant ?? 'panel');
  const size = resolveSize(opts, FONT_SIZE.xxs);
  const maxStar = opts.maxStar ?? MAX_PET_STAR;
  const cont = new PIXI.Container();

  const levelStr = opts.maxLevel !== undefined
    ? `Lv.${opts.level}/${opts.maxLevel}`
    : `Lv.${opts.level}`;
  const gap = opts.filledOnly ? ' ' : '  ';
  const levelText = makeText(`${levelStr}${gap}`, {
    ...levelTextOpts(ui, size),
    anchor: [0, 0.5],
  });
  cont.addChild(levelText);

  if (opts.filledOnly && opts.star > 0) {
    const stars = makeText('★'.repeat(opts.star), {
      size, fill: ui.starFilled, bold: true, anchor: [0, 0.5],
    });
    stars.position.set(levelText.width, 0);
    cont.addChild(stars);
  } else if (!opts.filledOnly) {
    const stars = makeStarRow({
      star: opts.star,
      maxStar,
      size,
      variant: opts.variant,
      emptyStyle: opts.emptyStyle ?? 'hollow',
      anchor: 'left',
    });
    stars.position.set(levelText.width, 0);
    cont.addChild(stars);
  }

  return cont;
}

export interface LevelStatLineOpts {
  level: number;
  /** 展示哪一维（默认攻击） */
  stat?: StatKey;
  statValue: number | string;
  size?: number;
  scale?: number;
  variant?: GrowthUiVariant;
}

/** 灵宠卡信息行：「Lv.5  攻:53」 */
export function makeLevelStatLine(opts: LevelStatLineOpts): PIXI.Container {
  const ui = getGrowthUi(opts.variant ?? 'card');
  const statDef = getStatUi(opts.stat ?? 'atk');
  const size = resolveSize(opts, FONT_SIZE.xxs);
  const cont = new PIXI.Container();
  let x = 0;

  const lvText = makeText(`Lv.${opts.level}  `, {
    ...levelTextOpts(ui, size),
    anchor: [0, 0.5],
  });
  cont.addChild(lvText);
  x += lvText.width;

  const labelText = makeText(`${statDef.shortLabel}:`, {
    size, fill: statDef.color, bold: true, anchor: [0, 0.5],
    strokeColor: ui.levelStroke || undefined,
    strokeWidth: ui.levelStroke ? Math.max(2, Math.round(size * 0.2)) : undefined,
  });
  labelText.position.set(x, 0);
  cont.addChild(labelText);
  x += labelText.width;

  const valText = makeText(`${opts.statValue}`, {
    ...levelTextOpts(ui, size),
    anchor: [0, 0.5],
  });
  valText.position.set(x, 0);
  cont.addChild(valText);

  return cont;
}
