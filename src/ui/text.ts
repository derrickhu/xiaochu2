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
import { Game } from '@/core/Game';
import { resolveBodyFontFamily, resolveCalligraphyFontFamily } from './calligraphyFont';
import { FONT_FAMILY, COLORS, FONT_SIZE } from './theme';

/** 文字语义角色 */
export type TextRole = 'title' | 'body' | 'system';

/**
 * 文字光栅化倍率。
 *
 * stage 整体被 Game.scale 放大后上屏，而 PIXI.Text 默认只按 1x 把字光栅化成位图，
 * 位图再被放大就会发虚 —— 这是「设计稿清晰、真机发糊」的根因。
 * 按上屏倍率光栅化，字的像素才与屏幕 1:1。
 *
 * 下限取 2 而不是 1：小字号中文（15px 上下）笔画密，即使 1:1 也只有十几个物理
 * 像素可用，靠超采样再缩回去比精确 1:1 明显更实。
 * 上限 3 是显存与清晰度的折中：超过 3 倍肉眼已无差别，但纹理面积按平方增长。
 */
export function textResolution(): number {
  const s = Game.scale;
  if (!Number.isFinite(s) || s <= 0) return 2;
  // 量化到 0.5 档：避免每台设备生成一套独有尺寸的字纹理
  return Math.min(3, Math.max(2, Math.ceil(s * 2) / 2));
}

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

/**
 * 合成加粗的最小可用字号。
 *
 * 文楷 / 马善政都是单字重字体，fontWeight:'bold' 只能让宿主做合成加粗
 * （把字形轮廓向外膨胀）。中文小字笔画间距本就只有一两个像素，膨胀后直接
 * 粘连成墨块 —— 看上去就是「糊」。故小字一律走 normal，靠字色拉对比。
 */
const SYNTHETIC_BOLD_MIN_SIZE = 17;

/**
 * 小字加粗改走「同色细描边」。
 *
 * 合成加粗把整个字形向外膨胀，中文小字会粘连成墨块；而同色描边只按固定像素
 * 加宽笔画（不随字形密度放大），既拿到设计稿那种「粗而清楚」的观感，又不糊。
 * 已显式传 strokeColor 的（亮底描边强调）不叠，避免描边打架。
 */
function fauxBoldThickness(fontSize: number): number {
  return fontSize <= 16 ? 0.9 : 1.3;
}

function resolveFontFamily(opts: MakeTextOpts): string {
  if (opts.fontFamily) return opts.fontFamily;
  const role = opts.role ?? 'body';
  if (role === 'title') return resolveCalligraphyFontFamily();
  if (role === 'system') return FONT_FAMILY;
  return resolveBodyFontFamily();
}

/**
 * 给不走 makeText 的 Text 补上光栅化倍率。
 *
 * 战斗飘字 / HUD 为了对齐真机安全路径自带 style（禁斜体、薄描边、无阴影），
 * 不能套 makeText 的字体族，但同样需要按上屏倍率光栅化，否则一样发虚。
 */
export function applyTextResolution<T extends PIXI.Text>(text: T): T {
  text.resolution = textResolution();
  return text;
}

export function makeText(content: string, opts: MakeTextOpts = {}): PIXI.Text {
  const fontSize = opts.size ?? FONT_SIZE.sm;
  const style: Partial<PIXI.ITextStyle> = {
    fontFamily: resolveFontFamily(opts),
    fontSize,
    fill: opts.fill ?? COLORS.textMain,
    fontWeight: opts.bold && fontSize >= SYNTHETIC_BOLD_MIN_SIZE ? 'bold' : 'normal',
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
  } else if (opts.bold && fontSize < SYNTHETIC_BOLD_MIN_SIZE) {
    style.stroke = style.fill as number;
    style.strokeThickness = fauxBoldThickness(fontSize);
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
  t.resolution = textResolution();
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
