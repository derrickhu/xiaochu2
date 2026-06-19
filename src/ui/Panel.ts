/**
 * 面板 / 卡片底（程序绘制圆角 + 描边）。
 *
 * 单点改全局：底色/描边走 theme token。支持 selected/disabled 视觉态与自定义描边色
 * （如关卡卡片用五行色描边，仍由调用方传 theme/已有单一真源色）。
 */
import * as PIXI from 'pixi.js';
import { COLORS, RADIUS } from './theme';

export interface PanelOpts {
  width: number;
  height: number;
  /** 圆角，默认 card */
  radius?: number;
  /** 底色，默认 panelBg；不可用态传 panelBgAlt */
  bg?: number;
  bgAlpha?: number;
  /** 描边色，默认 panelBorder */
  border?: number;
  borderWidth?: number;
  borderAlpha?: number;
  /** 锚点：true=中心(0,0)，false=左上(0,0)。默认 center */
  centered?: boolean;
}

export function makePanel(opts: PanelOpts): PIXI.Graphics {
  const {
    width,
    height,
    radius = RADIUS.card,
    bg = COLORS.panelBg,
    bgAlpha = 1,
    border = COLORS.panelBorder,
    borderWidth = 3,
    borderAlpha = 1,
    centered = true,
  } = opts;

  const g = new PIXI.Graphics();
  g.beginFill(bg, bgAlpha);
  g.lineStyle(borderWidth, border, borderAlpha);
  const x = centered ? -width / 2 : 0;
  const y = centered ? -height / 2 : 0;
  g.drawRoundedRect(x, y, width, height, radius);
  g.endFill();
  return g;
}
