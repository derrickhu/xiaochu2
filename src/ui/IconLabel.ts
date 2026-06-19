/**
 * 图标 + 数值文本（资源条用：货币/经验/碎片等）。
 * 图标贴图缺失时仅显示文本，保证不崩。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { COLORS, FONT_SIZE } from './theme';
import { makeText } from './text';

export interface IconLabelOpts {
  iconPath?: string;
  iconSize?: number;
  /** 图标与数值之间的名称，如「灵宠币」「经验」 */
  caption?: string;
  captionSize?: number;
  captionFill?: number;
  text: string;
  size?: number;
  fill?: number;
  bold?: boolean;
  gap?: number;
  captionGap?: number;
  /** inline = 图标·名称·数值同一行；stacked = 左列图标+名称，右侧数值垂直居中 */
  layout?: 'inline' | 'stacked';
  stackGap?: number;
  /** stacked：左列与数值之间的间距 */
  valueGap?: number;
}

export interface IconLabelHandle extends PIXI.Container {
  setText(text: string): void;
}

export function makeIconLabel(opts: IconLabelOpts): IconLabelHandle {
  const iconSize = opts.iconSize ?? 32;
  const gap = opts.gap ?? 8;
  const captionGap = opts.captionGap ?? 6;
  const layout = opts.layout ?? 'inline';
  const stackGap = opts.stackGap ?? 4;
  const valueGap = opts.valueGap ?? 10;
  const valSize = opts.size ?? FONT_SIZE.md;
  const capSize = opts.captionSize ?? FONT_SIZE.xs;

  const cont = new PIXI.Container() as IconLabelHandle;
  const tex = opts.iconPath ? TextureCache.get(opts.iconPath) : null;

  const label = makeText(opts.text, {
    size: valSize,
    fill: opts.fill ?? COLORS.textMain,
    bold: opts.bold ?? true,
    anchor: [0, 0.5],
  });

  if (layout === 'stacked') {
    const cap = opts.caption
      ? makeText(opts.caption, {
        size: capSize,
        fill: opts.captionFill ?? COLORS.textSub,
        bold: true,
        anchor: 0.5,
      })
      : null;
    const leftW = Math.max(iconSize, cap?.width ?? 0);
    const capLineH = capSize;
    const leftH = iconSize + (cap ? stackGap + capLineH : 0);
    const topY = -leftH / 2;

    if (tex) {
      const icon = new PIXI.Sprite(tex);
      icon.anchor.set(0.5);
      icon.scale.set(iconSize / Math.max(tex.width, tex.height));
      icon.position.set(leftW / 2, topY + iconSize / 2);
      cont.addChild(icon);
    }

    if (cap) {
      cap.position.set(leftW / 2, topY + iconSize + stackGap + capLineH / 2);
      cont.addChild(cap);
    }

    label.anchor.set(0, 0.5);
    label.position.set(leftW + valueGap, 0);
    cont.addChild(label);
  } else {
    let x = 0;

    if (tex) {
      const icon = new PIXI.Sprite(tex);
      icon.anchor.set(0, 0.5);
      icon.scale.set(iconSize / Math.max(tex.width, tex.height));
      icon.position.set(0, 0);
      cont.addChild(icon);
      x = iconSize + gap;
    }

    if (opts.caption) {
      const cap = makeText(opts.caption, {
        size: capSize,
        fill: opts.captionFill ?? COLORS.textSub,
        bold: true,
        anchor: [0, 0.5],
      });
      cap.position.set(x, 0);
      cont.addChild(cap);
      x += cap.width + captionGap;
    }

    label.position.set(x, 0);
    cont.addChild(label);
  }

  cont.setText = (t: string): void => {
    label.text = t;
  };
  return cont;
}
