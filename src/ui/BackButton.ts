/**
 * 全局返回按钮（单一真源）
 *
 * 对齐原型：奶油胶囊 + 左侧返回箭头图标 +「返回」棕字。
 * 各场景顶栏 / 战斗顶栏统一引用 makeBackButton，禁止再手写 ghost「返回」。
 */
import * as PIXI from 'pixi.js';
import { COLORS, FONT_SIZE, RADIUS } from './theme';
import { makeText } from './text';
import { pressFeedback } from './motion';
import { bindPointerTap } from '@/utils/bindPointerTap';

export interface BackButtonOpts {
  onTap: () => void;
  /** 默认「返回」 */
  label?: string;
  width?: number;
  height?: number;
}

/** 标准尺寸（设计坐标 750 宽） */
export const BACK_BUTTON_SIZE = { width: 128, height: 54 } as const;

/**
 * 绘制左侧返回箭头（圆润左指 chevron，与原型小图标一致）。
 * 原点在图标中心；颜色走 theme.btnBackText。
 */
function drawBackChevron(g: PIXI.Graphics, color: number, scale = 1): void {
  const s = scale;
  // 厚实圆润「‹」：外侧轮廓略宽，内侧切出厚度
  g.beginFill(color, 1);
  g.moveTo(6 * s, -11 * s);
  g.quadraticCurveTo(5 * s, -11.5 * s, 4 * s, -10.5 * s);
  g.lineTo(-8 * s, -1 * s);
  g.quadraticCurveTo(-10 * s, 0, -8 * s, 1 * s);
  g.lineTo(4 * s, 10.5 * s);
  g.quadraticCurveTo(5 * s, 11.5 * s, 6 * s, 11 * s);
  g.lineTo(8.5 * s, 8 * s);
  g.lineTo(-3 * s, 0);
  g.lineTo(8.5 * s, -8 * s);
  g.closePath();
  g.endFill();
}

export function makeBackButton(opts: BackButtonOpts): PIXI.Container {
  const label = opts.label ?? '返回';
  const width = opts.width ?? BACK_BUTTON_SIZE.width;
  const height = opts.height ?? BACK_BUTTON_SIZE.height;
  const radius = Math.min(RADIUS.button, height / 2);

  const btn = new PIXI.Container();
  const bg = new PIXI.Graphics();

  // 外圈淡青晕
  bg.beginFill(COLORS.btnBackGlow, 0.55);
  bg.drawRoundedRect(-width / 2 - 3, -height / 2 - 3, width + 6, height + 6, radius + 3);
  bg.endFill();
  // 奶油底 + 金棕描边
  bg.beginFill(COLORS.btnBackBg, 1);
  bg.lineStyle(2.5, COLORS.btnBackBorder, 1);
  bg.drawRoundedRect(-width / 2, -height / 2, width, height, radius);
  bg.endFill();
  bg.lineStyle(0);

  const icon = new PIXI.Graphics();
  drawBackChevron(icon, COLORS.btnBackText, 1);

  const text = makeText(label, {
    size: FONT_SIZE.sm,
    fill: COLORS.btnBackText,
    bold: true,
    anchor: 0.5,
  });

  // 图标 + 文字水平居中为一组
  const gap = 8;
  const iconW = 18;
  const groupW = iconW + gap + text.width;
  const groupLeft = -groupW / 2;
  icon.position.set(groupLeft + iconW / 2, 0);
  text.position.set(groupLeft + iconW + gap + text.width / 2, 0);

  btn.addChild(bg, icon, text);
  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.hitArea = new PIXI.Rectangle(-width / 2 - 4, -height / 2 - 4, width + 8, height + 8);
  btn.interactiveChildren = false;
  bindPointerTap(btn, opts.onTap);
  pressFeedback(btn);
  return btn;
}
