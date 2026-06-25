import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { BOARD_IMAGES } from '@/config/Assets';

export function buildBoardBackground(
  container: PIXI.Container,
  rows: number,
  cols: number,
  cell: number,
): void {
  const pad = 3;
  const w = cols * cell + pad * 2;
  const h = rows * cell + pad * 2;

  const frame = new PIXI.Graphics();
  frame.beginFill(0x080812, 0.85);
  frame.drawRoundedRect(-pad, -pad, w, h, 6);
  frame.endFill();
  frame.lineStyle(1.5, 0x505078, 0.5);
  frame.drawRoundedRect(-pad, -pad, w, h, 6);
  container.addChild(frame);

  const tileDark = TextureCache.get(BOARD_IMAGES.dark);
  const tileLight = TextureCache.get(BOARD_IMAGES.light);
  const tiles = new PIXI.Container();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cell;
      const y = r * cell;
      const isDark = (r + c) % 2 === 0;
      const tex = isDark ? tileDark : tileLight;
      if (tex) {
        const sp = new PIXI.Sprite(tex);
        sp.width = cell;
        sp.height = cell;
        sp.position.set(x, y);
        tiles.addChild(sp);
      } else {
        const fallback = new PIXI.Graphics();
        fallback.beginFill(isDark ? 0x1c1c30 : 0x121223, 0.9);
        fallback.drawRect(x, y, cell, cell);
        fallback.endFill();
        tiles.addChild(fallback);
      }
    }
  }
  container.addChild(tiles);
}
