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

function armIcon(sprite: PIXI.Sprite, path: string, size: number): void {
  const apply = (tex: PIXI.Texture): void => {
    if (sprite.destroyed || !tex.width) return;
    sprite.texture = tex;
    sprite.scale.set(size / Math.max(tex.width, tex.height));
  };
  const cached = TextureCache.get(path);
  if (cached?.width) {
    apply(cached);
    return;
  }
  const unsub = TextureCache.onTextureLoaded((loaded) => {
    if (loaded !== path) return;
    unsub();
    const tex = TextureCache.get(path);
    if (tex) apply(tex);
  });
  sprite.once('destroyed', unsub);
  void TextureCache.load(path).catch(() => null);
}

/** 先占住图标宽，图到了再填，避免文字先顶到左边、到图后再整行重排。 */
function addIconSlot(
  cont: PIXI.Container,
  path: string,
  size: number,
  anchorX: number,
  x: number,
  y: number,
): void {
  const slot = new PIXI.Container();
  slot.position.set(x, y);
  const spacer = new PIXI.Graphics();
  spacer.beginFill(0xffffff, 0.001);
  spacer.drawRect(anchorX === 0 ? 0 : -size / 2, -size / 2, size, size);
  spacer.endFill();
  slot.addChild(spacer);
  const icon = new PIXI.Sprite(PIXI.Texture.EMPTY);
  icon.anchor.set(anchorX, 0.5);
  slot.addChild(icon);
  cont.addChild(slot);
  armIcon(icon, path, size);
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

    if (opts.iconPath) {
      addIconSlot(cont, opts.iconPath, iconSize, 0.5, leftW / 2, topY + iconSize / 2);
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

    if (opts.iconPath) {
      addIconSlot(cont, opts.iconPath, iconSize, 0, 0, 0);
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
