/**
 * 通用按钮（程序绘制：胶囊圆角 + 描边 + 居中文字）
 *
 * 单点改全局：所有按钮配色集中在下方 VARIANTS（variant → theme token）映射，
 * 场景只传 variant，不传裸色值。改一个 variant 取值，全局同类按钮一起变。
 *
 * 取舍：xiao_chu 的按钮贴图多为「特定文案成品图」或不规则水墨笔触，
 * 不适合任意文案/九宫格拉伸；故通用按钮用 theme 程序绘制（水墨配色，稳定可控）。
 * 贴图型图标按钮见 IconButton.ts。
 */
import * as PIXI from 'pixi.js';
import { COLORS, RADIUS } from './theme';
import { makeText } from './text';

export type ButtonVariant = 'primary' | 'success' | 'danger' | 'recruit' | 'ghost';

interface VariantStyle {
  bg: number;
  border: number;
  text: number;
}

const VARIANTS: Record<ButtonVariant, VariantStyle> = {
  primary: { bg: COLORS.btnPrimaryBg, border: COLORS.btnPrimaryBorder, text: COLORS.btnText },
  success: { bg: COLORS.btnSuccessBg, border: COLORS.btnSuccessBorder, text: COLORS.btnText },
  danger: { bg: COLORS.btnDangerBg, border: COLORS.btnDangerBorder, text: COLORS.btnText },
  recruit: { bg: COLORS.btnRecruitBg, border: COLORS.btnRecruitBorder, text: COLORS.btnText },
  ghost: { bg: COLORS.btnGhostBg, border: COLORS.btnGhostBorder, text: COLORS.btnGhostText },
};

const DISABLED: VariantStyle = {
  bg: COLORS.btnDisabledBg,
  border: COLORS.btnDisabledBorder,
  text: COLORS.textDisabled,
};

export interface ButtonOpts {
  label: string;
  width: number;
  height: number;
  variant?: ButtonVariant;
  /** 字号，默认按高度推导 */
  fontSize?: number;
  enabled?: boolean;
  onTap: () => void;
}

export interface ButtonHandle extends PIXI.Container {
  setEnabled(enabled: boolean): void;
  setLabel(label: string): void;
}

export function makeButton(opts: ButtonOpts): ButtonHandle {
  const { label, width, height, variant = 'primary', onTap } = opts;
  const fontSize = opts.fontSize ?? Math.round(height * 0.42);

  const btn = new PIXI.Container() as ButtonHandle;
  const bg = new PIXI.Graphics();
  const text = makeText(label, { size: fontSize, bold: true, anchor: 0.5 });
  btn.addChild(bg, text);

  let enabled = opts.enabled ?? true;

  const redraw = (): void => {
    const s = enabled ? VARIANTS[variant] : DISABLED;
    bg.clear();
    bg.beginFill(s.bg);
    bg.lineStyle(3, s.border, 1);
    bg.drawRoundedRect(-width / 2, -height / 2, width, height, Math.min(RADIUS.button, height / 2));
    bg.endFill();
    text.style.fill = s.text;
  };

  btn.setEnabled = (v: boolean): void => {
    enabled = v;
    btn.eventMode = v ? 'static' : 'none';
    btn.cursor = v ? 'pointer' : 'default';
    redraw();
  };
  btn.setLabel = (v: string): void => {
    text.text = v;
  };

  btn.on('pointertap', () => {
    if (enabled) onTap();
  });
  btn.setEnabled(enabled);
  redraw();
  return btn;
}
