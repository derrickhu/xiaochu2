/**
 * 贴图图标按钮：圆底 + 贴图图标 + 可选文字标签（用于底栏导航 / 返回等）。
 *
 * 图标贴图缺失时回退为不带图标的圆底 + 文字，保证不崩。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { COLORS } from './theme';
import { makeText } from './text';

export interface IconButtonOpts {
  /** 图标贴图路径（Assets 常量），可空 */
  iconPath?: string;
  /** 图标显示边长 */
  iconSize: number;
  /** 底部文字标签 */
  label?: string;
  labelSize?: number;
  labelColor?: number;
  /** 圆底直径，不传则无圆底（纯图标） */
  discSize?: number;
  discColor?: number;
  onTap: () => void;
}

export function makeIconButton(opts: IconButtonOpts): PIXI.Container {
  const btn = new PIXI.Container();

  if (opts.discSize) {
    const disc = new PIXI.Graphics();
    disc.beginFill(opts.discColor ?? COLORS.panelBg, 0.92);
    disc.lineStyle(2, COLORS.panelBorder, 0.9);
    disc.drawCircle(0, 0, opts.discSize / 2);
    disc.endFill();
    btn.addChild(disc);
  }

  const tex = opts.iconPath ? TextureCache.get(opts.iconPath) : null;
  if (tex) {
    const icon = new PIXI.Sprite(tex);
    icon.anchor.set(0.5);
    const scale = opts.iconSize / Math.max(tex.width, tex.height);
    icon.scale.set(scale);
    icon.position.set(0, opts.label ? -opts.iconSize * 0.12 : 0);
    btn.addChild(icon);
  }

  if (opts.label) {
    const labelY = tex ? opts.iconSize * 0.5 : 0;
    const label = makeText(opts.label, {
      size: opts.labelSize ?? 22,
      fill: opts.labelColor ?? COLORS.navText,
      bold: true,
      anchor: 0.5,
    });
    label.position.set(0, labelY);
    btn.addChild(label);
  }

  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.on('pointertap', opts.onTap);
  return btn;
}
