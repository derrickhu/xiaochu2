/**
 * 全屏 cover 背景（场景共用，缺图回退 theme 底色）
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { COLORS } from './theme';

export function makeCoverBackground(imagePath: string, w: number, h: number): PIXI.Container {
  const layer = new PIXI.Container();
  const tex = TextureCache.get(imagePath);
  if (tex) {
    const bg = new PIXI.Sprite(tex);
    bg.anchor.set(0.5);
    bg.scale.set(Math.max(w / tex.width, h / tex.height));
    bg.position.set(w / 2, h / 2);
    layer.addChild(bg);
  } else {
    const bg = new PIXI.Graphics();
    bg.beginFill(COLORS.bgFallback);
    bg.drawRect(0, 0, w, h);
    bg.endFill();
    layer.addChild(bg);
  }
  return layer;
}
