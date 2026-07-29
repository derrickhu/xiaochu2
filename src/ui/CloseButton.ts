/**
 * 弹窗关闭钮：用 Graphics 画 ×，不用 Unicode「✕」。
 *
 * 真机（尤其部分 Android 微信/抖音）系统字体缺 ✕ 字形时，文字关闭钮会整块空白，
 * 看起来像「图片没拉下来」。矢量绘制与字体无关。
 */
import * as PIXI from 'pixi.js';
import { COLORS } from './theme';
import { bindPointerTap } from '@/utils/bindPointerTap';

export interface CloseButtonOpts {
  onTap: () => void;
  /** 点击热区边长，默认 56 */
  size?: number;
  /** × 线条颜色 */
  color?: number;
  /** × 臂长（中心到端点），默认 12 */
  arm?: number;
}

export function makeCloseButton(opts: CloseButtonOpts): PIXI.Container {
  const size = opts.size ?? 56;
  const color = opts.color ?? COLORS.textSub;
  const arm = opts.arm ?? 12;
  const btn = new PIXI.Container();
  btn.hitArea = new PIXI.Rectangle(-size / 2, -size / 2, size, size);
  btn.eventMode = 'static';
  btn.cursor = 'pointer';

  const g = new PIXI.Graphics();
  g.lineStyle(4, color, 0.92, 0.5);
  g.moveTo(-arm, -arm);
  g.lineTo(arm, arm);
  g.moveTo(arm, -arm);
  g.lineTo(-arm, arm);
  g.eventMode = 'none';
  btn.addChild(g);

  bindPointerTap(btn, opts.onTap);
  return btn;
}
