import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { UI_BATTLE_IMAGES } from '@/config/Assets';

/**
 * 封印珠叠层：优先用 battle_orb_seal 贴图（金框 +「封」匾）；
 * 贴图未就绪时回退到圆形霜罩绘制，避免空白。
 */
export function drawSealMark(layer: PIXI.Container, cx: number, cy: number, size: number): void {
  const tex = TextureCache.get(UI_BATTLE_IMAGES.orbSeal);
  if (tex) {
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5);
    // 略大于珠径，让金框包住珠体
    const s = (size * 1.12) / Math.max(tex.width, tex.height);
    sp.scale.set(s);
    sp.position.set(cx, cy);
    layer.addChild(sp);
    return;
  }

  // 回退：圆形霜罩 +「封」（无贴图时）
  const mark = new PIXI.Container();
  const half = size / 2;
  const frost = new PIXI.Graphics();
  frost.beginFill(0xa8c4f0, 0.35);
  frost.lineStyle(3, 0xe8a33d, 1);
  frost.drawCircle(0, 0, half * 0.92);
  frost.endFill();
  mark.addChild(frost);

  const plaque = new PIXI.Graphics();
  plaque.beginFill(0xf5e6c8, 0.96);
  plaque.lineStyle(2, 0xe8a33d, 1);
  plaque.drawRoundedRect(-half * 0.28, half * 0.42, half * 0.56, half * 0.36, 8);
  plaque.endFill();
  mark.addChild(plaque);

  const label = new PIXI.Text('封', {
    fontSize: Math.floor(size * 0.28),
    fill: 0x3f2408,
    fontWeight: 'bold',
  });
  label.anchor.set(0.5);
  label.position.set(0, half * 0.6);
  mark.addChild(label);

  mark.position.set(cx, cy);
  layer.addChild(mark);
}
