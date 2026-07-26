/**
 * 全局返回按钮（单一真源）
 *
 * 玉佩流苏图标（btn_back.png）：顶绳 + 青绿玉璧左箭头 + 底穗。
 * 各场景顶栏 / 战斗顶栏统一引用 makeBackButton，禁止再手写 ghost「返回」。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { UI_IMAGES } from '@/config/Assets';
import { pressFeedback } from './motion';
import { bindPointerTap } from '@/utils/bindPointerTap';

export interface BackButtonOpts {
  onTap: () => void;
  /** @deprecated 玉佩图标不再显示文字，保留仅为兼容旧调用 */
  label?: string;
  /** 显示高度（含绳与流苏）；宽度按贴图比例 */
  height?: number;
  width?: number;
}

/**
 * 标准显示尺寸（设计坐标 750 宽）。
 * 玉璧中心对齐顶栏 safeHeaderCenterY；绳在上、穗在下。
 */
export const BACK_BUTTON_SIZE = { width: 72, height: 120 } as const;

/** 贴图内玉璧中心相对坐标（相对整图宽高） */
const JADE_ANCHOR = { x: 0.5, y: 0.396 } as const;

function drawFallback(parent: PIXI.Container, displayH: number): void {
  const r = displayH * 0.22;
  const g = new PIXI.Graphics();
  g.beginFill(0x6db8a8, 0.95);
  g.lineStyle(3, 0xd8c49a, 1);
  g.drawCircle(0, 0, r);
  g.endFill();
  // 左箭头
  g.lineStyle(0);
  g.beginFill(0xfff8ec, 1);
  g.moveTo(r * 0.25, -r * 0.35);
  g.lineTo(-r * 0.35, 0);
  g.lineTo(r * 0.25, r * 0.35);
  g.lineTo(r * 0.1, r * 0.15);
  g.lineTo(-r * 0.05, 0);
  g.lineTo(r * 0.1, -r * 0.15);
  g.closePath();
  g.endFill();
  parent.addChild(g);
}

export function makeBackButton(opts: BackButtonOpts): PIXI.Container {
  const displayH = opts.height ?? BACK_BUTTON_SIZE.height;
  const displayW = opts.width
    ?? Math.round(displayH * (BACK_BUTTON_SIZE.width / BACK_BUTTON_SIZE.height));

  const btn = new PIXI.Container();
  const slot = new PIXI.Container();
  btn.addChild(slot);

  const apply = (tex: PIXI.Texture): void => {
    slot.removeChildren().forEach((c) => c.destroy());
    const sp = new PIXI.Sprite(tex);
    // 锚在玉璧中心，使 position 的 Y 对齐顶栏中心
    sp.anchor.set(JADE_ANCHOR.x, JADE_ANCHOR.y);
    const scale = Math.min(displayW / Math.max(1, tex.width), displayH / Math.max(1, tex.height));
    sp.scale.set(scale);
    slot.addChild(sp);
  };

  const path = UI_IMAGES.btnBack;
  const cached = TextureCache.get(path);
  if (cached) {
    apply(cached);
  } else {
    drawFallback(slot, displayH);
    void TextureCache.load(path).then((tex) => {
      if (!slot.destroyed) apply(tex);
    }).catch(() => null);
  }

  // 点击区覆盖玉璧为主，并略含上下绳穗，避免点空
  const hitW = displayW + 16;
  const hitH = displayH * 0.72;
  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.hitArea = new PIXI.Rectangle(-hitW / 2, -hitH * 0.42, hitW, hitH);
  btn.interactiveChildren = false;
  bindPointerTap(btn, opts.onTap);
  pressFeedback(btn);
  return btn;
}
