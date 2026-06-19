/**
 * 文本工厂：统一字体族与默认色，避免各处裸写 PIXI.TextStyle。
 */
import * as PIXI from 'pixi.js';
import { FONT_FAMILY, COLORS, FONT_SIZE } from './theme';

export interface MakeTextOpts {
  /** 字号（用 FONT_SIZE token），默认正文 sm */
  size?: number;
  /** 颜色（用 COLORS token），默认主文字色 */
  fill?: number;
  bold?: boolean;
  /** 锚点，默认 [0,0] */
  anchor?: number | [number, number];
  /** 自动换行宽度 */
  wordWrapWidth?: number;
  align?: 'left' | 'center' | 'right';
  /** 描边色（用于亮底上的强调标题），不传则无描边 */
  strokeColor?: number;
  strokeWidth?: number;
}

export function makeText(content: string, opts: MakeTextOpts = {}): PIXI.Text {
  const style: Partial<PIXI.ITextStyle> = {
    fontFamily: FONT_FAMILY,
    fontSize: opts.size ?? FONT_SIZE.sm,
    fill: opts.fill ?? COLORS.textMain,
    fontWeight: opts.bold ? 'bold' : 'normal',
    align: opts.align ?? 'left',
  };
  if (opts.wordWrapWidth) {
    style.wordWrap = true;
    style.wordWrapWidth = opts.wordWrapWidth;
  }
  if (opts.strokeColor !== undefined) {
    style.stroke = opts.strokeColor;
    style.strokeThickness = opts.strokeWidth ?? 4;
  }
  const t = new PIXI.Text(content, style);
  if (opts.anchor !== undefined) {
    if (typeof opts.anchor === 'number') t.anchor.set(opts.anchor);
    else t.anchor.set(opts.anchor[0], opts.anchor[1]);
  }
  return t;
}
