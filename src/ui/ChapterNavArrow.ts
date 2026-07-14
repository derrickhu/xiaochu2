/**
 * 通用左右导航箭头按钮（主线章节切换等）。
 * 贴图：UI_IMAGES.iconNavArrowLeft / iconNavArrowRight；缺图时 Graphics 回退。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { UI_IMAGES } from '@/config/Assets';
import { COLORS } from './theme';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { pressFeedback } from './motion';

export interface NavArrowOpts {
  direction: 'left' | 'right';
  enabled?: boolean;
  onTap: () => void;
  /** 显示直径，默认 52（对齐 home_hub_v4） */
  size?: number;
}

/** 主线章节箭头默认直径（略小于页面级控件） */
export const NAV_ARROW_SIZE = 44;

function drawChevronFallback(g: PIXI.Graphics, dir: -1 | 1, color: number, alpha: number): void {
  const tipX = dir * 6;
  const armX = dir * -5;
  g.lineStyle(3.5, color, alpha, 0.5, true);
  g.moveTo(armX, -8);
  g.lineTo(tipX, 0);
  g.lineTo(armX, 8);
}

function makeGraphicsArrow(enabled: boolean, dir: -1 | 1, size: number): PIXI.Container {
  const R = size / 2;
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

  drawChevronFallback(chevron, dir, chevColor, enabled ? 1 : 0.55);
  return btn;
}

/**
 * 构建左右导航箭头（优先贴图，可全局复用）。
 */
export function makeNavArrowButton(opts: NavArrowOpts): PIXI.Container {
  const enabled = opts.enabled ?? true;
  const size = opts.size ?? NAV_ARROW_SIZE;
  const path = opts.direction === 'left'
    ? UI_IMAGES.iconNavArrowLeft
    : UI_IMAGES.iconNavArrowRight;
  const tex = TextureCache.get(path);

  const btn = new PIXI.Container();
  if (tex) {
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5);
    const s = size / Math.max(tex.width, tex.height);
    sp.scale.set(s);
    if (!enabled) sp.alpha = 0.45;
    btn.addChild(sp);
  } else {
    const dir = opts.direction === 'left' ? -1 : 1;
    btn.addChild(makeGraphicsArrow(enabled, dir, size));
  }

  const R = size / 2;
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

/** @deprecated 用 makeNavArrowButton；保留别名兼容章节导航旧调用 */
export function makeChapterNavArrow(opts: NavArrowOpts): PIXI.Container {
  return makeNavArrowButton(opts);
}
