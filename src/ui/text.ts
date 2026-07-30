/**
 * 文本工厂：统一字体族与默认色，避免各处裸写 PIXI.TextStyle。
 *
 * 语义角色（推荐）：
 * - title：马善政书法展示体（页标题、匾额、CTA、宠名）
 * - body：霞鹜文楷正文（说明、列表、数值旁白）—— makeText 默认
 * - system：系统无衬线（GM / Loading 等工具面）
 *
 * 优先用 makeTitleText / makeBodyText；显式 fontFamily 可覆盖 role。
 */
import * as PIXI from 'pixi.js';
import { resolveBodyFontFamily, resolveCalligraphyFontFamily } from './calligraphyFont';
import { FONT_FAMILY, COLORS, FONT_SIZE } from './theme';

/** 文字语义角色 */
export type TextRole = 'title' | 'body' | 'system';

export interface MakeTextOpts {
  /** 字号（用 FONT_SIZE token），默认正文 sm */
  size?: number;
  /** 颜色（用 COLORS token），默认主文字色 */
  fill?: number;
  /**
   * 加粗。书法展示体无独立粗体字重，title 默认 false；
   * body/system 默认 false，需要时再传 true。
   */
  bold?: boolean;
  /**
   * 语义字体：title=书法 / body=文楷 / system=系统体。
   * 默认 body。若同时传 fontFamily，以 fontFamily 为准。
   */
  role?: TextRole;
  /** 覆盖 role 解析出的字体族 */
  fontFamily?: string;
  /** 锚点，默认 [0,0] */
  anchor?: number | [number, number];
  /** 自动换行宽度 */
  wordWrapWidth?: number;
  /**
   * 中文等无空格文本换行（默认：开启 wordWrap 时为 true）。
   * PIXI 默认只按空格断行，不设则中文会长串溢出。
   */
  breakWords?: boolean;
  align?: 'left' | 'center' | 'right';
  /** 描边色（用于亮底上的强调标题），不传则无描边 */
  strokeColor?: number;
  strokeWidth?: number;
  /** 轻投影（召唤引导白字等，对齐原型；勿叠粗描边） */
  dropShadow?: boolean | {
    color?: number;
    blur?: number;
    distance?: number;
    alpha?: number;
    angle?: number;
  };
}

function resolveFontFamily(opts: MakeTextOpts): string {
  if (opts.fontFamily) return opts.fontFamily;
  const role = opts.role ?? 'body';
  if (role === 'title') return resolveCalligraphyFontFamily();
  if (role === 'system') return FONT_FAMILY;
  return resolveBodyFontFamily();
}

export function makeText(content: string, opts: MakeTextOpts = {}): PIXI.Text {
  const style: Partial<PIXI.ITextStyle> = {
    fontFamily: resolveFontFamily(opts),
    fontSize: opts.size ?? FONT_SIZE.sm,
    fill: opts.fill ?? COLORS.textMain,
    fontWeight: opts.bold ? 'bold' : 'normal',
    align: opts.align ?? 'left',
  };
  if (opts.wordWrapWidth) {
    style.wordWrap = true;
    style.wordWrapWidth = opts.wordWrapWidth;
    style.breakWords = opts.breakWords ?? true;
  } else if (opts.breakWords !== undefined) {
    style.breakWords = opts.breakWords;
  }
  if (opts.strokeColor !== undefined) {
    style.stroke = opts.strokeColor;
    style.strokeThickness = opts.strokeWidth ?? 4;
  }
  if (opts.dropShadow) {
    const ds = opts.dropShadow === true ? {} : opts.dropShadow;
    style.dropShadow = true;
    style.dropShadowColor = ds.color ?? 0x2a1a0c;
    style.dropShadowBlur = ds.blur ?? 3;
    style.dropShadowDistance = ds.distance ?? 2;
    style.dropShadowAlpha = ds.alpha ?? 0.4;
    style.dropShadowAngle = ds.angle ?? Math.PI / 4;
  }
  const t = new PIXI.Text(content, style);
  if (opts.anchor !== undefined) {
    if (typeof opts.anchor === 'number') t.anchor.set(opts.anchor);
    else t.anchor.set(opts.anchor[0], opts.anchor[1]);
  }
  return t;
}

/** 标题 / 匾额 / CTA：书法展示体 */
export function makeTitleText(
  content: string,
  opts: Omit<MakeTextOpts, 'role'> = {},
): PIXI.Text {
  return makeText(content, { bold: false, ...opts, role: 'title' });
}

/** 正文 / 说明：霞鹜文楷 */
export function makeBodyText(
  content: string,
  opts: Omit<MakeTextOpts, 'role'> = {},
): PIXI.Text {
  return makeText(content, { ...opts, role: 'body' });
}
