import * as PIXI from 'pixi.js';
import { COLORS, RADIUS } from '@/ui/theme';

/** 亮色 Q 版棋盘格（对齐 battle_ui_mockup：cream 外框 + 浅色棋盘格） */
const TILE_A = 0xf5ecd8;
const TILE_B = 0xe8d5b0;
const FRAME_PAD = 10;
const FRAME_RADIUS = 22;

export function buildBoardBackground(
  container: PIXI.Container,
  rows: number,
  cols: number,
  cell: number,
): void {
  const pad = FRAME_PAD;
  const w = cols * cell + pad * 2;
  const h = rows * cell + pad * 2;

  // 外层 cream 底板 + 金棕描边
  const frame = new PIXI.Graphics();
  frame.beginFill(COLORS.panelBg, 0.96);
  frame.lineStyle(4, COLORS.panelBorder, 1);
  frame.drawRoundedRect(-pad, -pad, w, h, FRAME_RADIUS);
  frame.endFill();
  // 内描边（层次感）
  frame.lineStyle(1.5, COLORS.panelBorderSoft, 0.85);
  frame.drawRoundedRect(-pad + 5, -pad + 5, w - 10, h - 10, FRAME_RADIUS - 4);
  container.addChild(frame);

  // 棋盘格裁剪到圆角内区
  const tiles = new PIXI.Container();
  const mask = new PIXI.Graphics();
  mask.beginFill(0xffffff);
  mask.drawRoundedRect(0, 0, cols * cell, rows * cell, RADIUS.small);
  mask.endFill();
  tiles.mask = mask;
  tiles.addChild(mask);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cell;
      const y = r * cell;
      const isA = (r + c) % 2 === 0;
      const cellG = new PIXI.Graphics();
      cellG.beginFill(isA ? TILE_A : TILE_B, 1);
      cellG.drawRect(x, y, cell, cell);
      cellG.endFill();
      // 极淡格线
      cellG.lineStyle(1, COLORS.panelBorderSoft, 0.35);
      cellG.drawRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      tiles.addChild(cellG);
    }
  }
  container.addChild(tiles);
}
