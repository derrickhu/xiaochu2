/**
 * 章节切换箭头 — 圆形金边 + 描边 chevron（避免微信渲染 Unicode 箭头）
 */
import * as PIXI from 'pixi.js';
import { COLORS } from './theme';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { pressFeedback } from './motion';

export interface ChapterNavArrowOpts {
  direction: 'left' | 'right';
  enabled?: boolean;
  onTap: () => void;
}

const SIZE = 56;
const R = SIZE / 2;

function drawChevron(g: PIXI.Graphics, dir: -1 | 1, color: number, alpha: number): void {
  const tipX = dir * 6;
  const armX = dir * -5;
  g.lineStyle(3.5, color, alpha, 0.5, true);
  g.moveTo(armX, -8);
  g.lineTo(tipX, 0);
  g.lineTo(armX, 8);
}

export function makeChapterNavArrow(opts: ChapterNavArrowOpts): PIXI.Container {
  const enabled = opts.enabled ?? true;
  const dir = opts.direction === 'left' ? -1 : 1;
  const btn = new PIXI.Container();
  const shadow = new PIXI.Graphics();
  const bg = new PIXI.Graphics();
  const shine = new PIXI.Graphics();
  const chevron = new PIXI.Graphics();
  btn.addChild(shadow, bg, shine, chevron);

  const fillTop = enabled ? 0xfff9ed : 0xf0e6d0;
  const fillBot = enabled ? 0xf2d8a8 : 0xd8ccb4;
  const ring = enabled ? COLORS.panelBorder : COLORS.panelBorderSoft;
  const chevColor = enabled ? COLORS.accentDeep : COLORS.textDisabled;

  shadow.beginFill(0x2a1f14, enabled ? 0.18 : 0.08);
  shadow.drawCircle(1.5, 2.5, R);
  shadow.endFill();

  bg.beginFill(fillBot, enabled ? 1 : 0.85);
  bg.drawCircle(0, 0, R);
  bg.endFill();
  bg.beginFill(fillTop, enabled ? 0.95 : 0.7);
  bg.drawCircle(0, -R * 0.12, R * 0.88);
  bg.endFill();

  bg.lineStyle(2.5, ring, 1);
  bg.drawCircle(0, 0, R - 1.2);
  bg.lineStyle(1, 0xffffff, enabled ? 0.45 : 0.2);
  bg.drawCircle(0, -R * 0.35, R * 0.55);

  shine.beginFill(0xffffff, enabled ? 0.35 : 0.15);
  shine.drawEllipse(-R * 0.22, -R * 0.38, R * 0.22, R * 0.1);
  shine.endFill();

  drawChevron(chevron, dir, chevColor, enabled ? 1 : 0.55);

  btn.hitArea = new PIXI.Circle(0, 0, R + 4);
  btn.interactiveChildren = false;

  if (enabled) {
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    bindPointerTap(btn, opts.onTap);
    pressFeedback(btn, { scale: 0.92 });
  } else {
    btn.eventMode = 'none';
  }

  return btn;
}
