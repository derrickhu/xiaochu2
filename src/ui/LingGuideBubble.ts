/**
 * 小灵说话气泡：首页指路与战斗拖珠示意共用。
 *
 * 上一版气泡用了 xxs（15px）+ 52px 头像，真机上几乎看不清就结束了。
 * 这里按「能在一臂之遥读完」来定尺寸，两处必须走同一套，避免再各写各的小条。
 */
import * as PIXI from 'pixi.js';

import { UI_GUIDE_IMAGES } from '@/config/Assets';
import { TextureCache } from '@/core/TextureCache';
import { makeText } from './text';
import { FONT_SIZE } from './theme';

export interface LingGuideBubbleOpts {
  text: string;
  /** 正文最大行宽，默认 420 */
  maxWidth?: number;
  /** 头像边长，默认 88 */
  portraitSize?: number;
  /** 正文字号，默认 FONT_SIZE.sm */
  textSize?: number;
  /** 底部提示（如「点击继续 ›」），欢迎卡用 */
  footer?: string;
}

export interface LingGuideBubble {
  root: PIXI.Container;
  boxW: number;
  boxH: number;
  applyPortrait: () => void;
}

export function makeLingGuideBubble(opts: LingGuideBubbleOpts): LingGuideBubble {
  const maxWidth = opts.maxWidth ?? 420;
  const portraitBox = opts.portraitSize ?? 88;
  const padX = 22;
  const padY = 16;
  const gap = 14;

  const speaker = makeText('小灵', {
    size: FONT_SIZE.xs,
    fill: 0xb8863a,
    bold: true,
    role: 'title',
    anchor: [0, 0],
  });
  const label = makeText(opts.text, {
    size: opts.textSize ?? FONT_SIZE.sm,
    fill: 0x5b4632,
    bold: true,
    role: 'title',
    anchor: [0, 0],
    wordWrapWidth: maxWidth,
  });
  const footer = opts.footer
    ? makeText(opts.footer, {
      size: FONT_SIZE.xs,
      fill: 0xb8863a,
      bold: true,
      role: 'title',
      anchor: [0, 0],
    })
    : null;
  try { speaker.updateText(true); } catch { /* noop */ }
  try { label.updateText(true); } catch { /* noop */ }
  try { footer?.updateText(true); } catch { /* noop */ }

  const textW = Math.max(speaker.width, label.width, footer?.width ?? 0);
  const footerH = footer ? footer.height + 10 : 0;
  const textH = speaker.height + 6 + label.height + footerH;
  const boxW = padX * 2 + portraitBox + gap + Math.ceil(textW);
  const boxH = Math.max(portraitBox + padY * 2, textH + padY * 2);

  const root = new PIXI.Container();
  root.eventMode = 'none';

  const plate = new PIXI.Graphics();
  plate.beginFill(0xfff6e2, 0.98);
  plate.lineStyle(4, 0xe0b877, 1);
  plate.drawRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 28);
  plate.endFill();
  root.addChild(plate);

  const portrait = new PIXI.Sprite(PIXI.Texture.EMPTY);
  portrait.anchor.set(0.5);
  portrait.position.set(-boxW / 2 + padX + portraitBox / 2, 0);
  portrait.visible = false;
  root.addChild(portrait);

  const textX = -boxW / 2 + padX + portraitBox + gap;
  const textTop = -textH / 2;
  speaker.position.set(textX, textTop);
  label.position.set(textX, textTop + speaker.height + 6);
  root.addChild(speaker);
  root.addChild(label);
  if (footer) {
    footer.position.set(textX, textTop + speaker.height + 6 + label.height + 10);
    root.addChild(footer);
  }

  const applyPortrait = (): void => {
    const tex = TextureCache.get(UI_GUIDE_IMAGES.xiaoling);
    if (!tex || portrait.destroyed) return;
    portrait.texture = tex;
    const scale = portraitBox / Math.max(tex.width, tex.height);
    portrait.scale.set(scale);
    portrait.visible = true;
  };
  applyPortrait();

  return { root, boxW, boxH, applyPortrait };
}
