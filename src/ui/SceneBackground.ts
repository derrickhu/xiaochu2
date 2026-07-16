/**
 * 全屏 cover 背景（场景共用，缺图回退 theme 底色；CDN 到货后自动换上）
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { COLORS } from './theme';

export function makeCoverBackground(imagePath: string, w: number, h: number): PIXI.Container {
  const layer = new PIXI.Container();

  const apply = (tex: PIXI.Texture) => {
    layer.removeChildren();
    const bg = new PIXI.Sprite(tex);
    bg.anchor.set(0.5);
    bg.scale.set(Math.max(w / tex.width, h / tex.height));
    bg.position.set(w / 2, h / 2);
    layer.addChild(bg);
  };

  const tex = TextureCache.get(imagePath);
  if (tex) {
    apply(tex);
  } else {
    const fallback = new PIXI.Graphics();
    fallback.beginFill(COLORS.bgFallback);
    fallback.drawRect(0, 0, w, h);
    fallback.endFill();
    layer.addChild(fallback);
    void TextureCache.load(imagePath).then(apply).catch(() => {});
  }
  return layer;
}
