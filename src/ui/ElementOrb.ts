/**
 * 属性 / 心珠图标 — 一律棋盘同源 ORB_IMAGES。
 * 场景禁止再手写 Sprite(ORB_IMAGES[…]) 或依赖相框内嵌旧角标。
 */
import * as PIXI from 'pixi.js';
import type { Element } from '@/balance/combat';
import type { OrbType } from '@/balance/combat';
import { TextureCache } from '@/core/TextureCache';
import { ORB_IMAGES } from '@/config/Assets';

/** 原相框 256 画布上旧角标圆心与直径（已从 PNG 抠除，仅作叠珠定位） */
const FRAME_ORB_CX = 48 / 256;
const FRAME_ORB_CY = 48 / 256;
const FRAME_ORB_DIAM = 84 / 256;

/**
 * 棋盘同源珠 Sprite（锚点中心）。
 * texture 未加载时退回白色方块，调用方应保证 ORB 已 preload。
 */
export function makeElementOrb(orb: Element | OrbType, size: number): PIXI.Sprite {
  const tex = TextureCache.get(ORB_IMAGES[orb]) ?? PIXI.Texture.WHITE;
  const s = new PIXI.Sprite(tex);
  s.anchor.set(0.5);
  s.width = size;
  s.height = size;
  return s;
}

export interface PetFrameOrbOpts {
  /**
   * 相框锚点：
   * - center（默认）：相框中心在 parent 原点
   * - topLeft：相框左上角在 parent 原点 / 指定 offset
   */
  frameAnchor?: 'center' | 'topLeft';
  /** topLeft 模式下相框左上角相对 parent 的偏移 */
  frameOffset?: { x: number; y: number };
  /**
   * 相对默认角标直径的缩放（默认 1）。
   * 详情大头像建议 ~0.72，避免珠子显「贴图感」。
   */
  scale?: number;
}

/**
 * 在五行相框左上角叠棋盘珠（遮住/替代已抠除的旧内嵌角标）。
 * @returns 珠 Sprite，便于调用方微调
 */
export function attachPetFrameOrb(
  parent: PIXI.Container,
  element: Element,
  frameSize: number,
  opts: PetFrameOrbOpts = {},
): PIXI.Sprite {
  const scale = opts.scale ?? 1;
  const orb = makeElementOrb(element, frameSize * FRAME_ORB_DIAM * scale);
  const anchor = opts.frameAnchor ?? 'center';
  if (anchor === 'center') {
    orb.position.set(
      -frameSize / 2 + frameSize * FRAME_ORB_CX,
      -frameSize / 2 + frameSize * FRAME_ORB_CY,
    );
  } else {
    const ox = opts.frameOffset?.x ?? 0;
    const oy = opts.frameOffset?.y ?? 0;
    orb.position.set(ox + frameSize * FRAME_ORB_CX, oy + frameSize * FRAME_ORB_CY);
  }
  parent.addChild(orb);
  return orb;
}
