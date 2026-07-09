import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { UI } from '@/balance/ui';
import { UI_BATTLE_IMAGES } from '@/config/Assets';
import { COLORS, RADIUS } from '@/ui/theme';

/** 亮色 Q 版棋盘格（对齐 battle_ui_mockup_v2：厚 cream 外框 + 浅色棋盘格） */
const TILE_A = 0xf5ecd8;
const TILE_B = 0xe8d5b0;

export function boardFramePad(): number {
  return UI.battle.boardFramePad;
}

export function buildBoardBackground(
  container: PIXI.Container,
  rows: number,
  cols: number,
  cell: number,
): void {
  const pad = boardFramePad();
  const w = cols * cell + pad * 2;
  const h = rows * cell + pad * 2;

  const panelTex = TextureCache.get(UI_BATTLE_IMAGES.boardPanel);
  if (panelTex) {
    const panel = new PIXI.Sprite(panelTex);
    panel.anchor.set(0.5);
    panel.width = w;
    panel.height = h;
    panel.position.set(cols * cell / 2, rows * cell / 2);
    container.addChild(panel);
  } else {
    // 回退：程序绘制厚 cream 框（对齐 mockup 采样色）
    const frame = new PIXI.Graphics();
    frame.beginFill(COLORS.panelBg, 0.98);
    frame.lineStyle(4, COLORS.panelBorder, 1);
    frame.drawRoundedRect(-pad, -pad, w, h, 28);
    frame.endFill();
    frame.lineStyle(2, COLORS.panelBorderSoft, 0.9);
    frame.drawRoundedRect(-pad + 6, -pad + 6, w - 12, h - 12, 24);
    frame.beginFill(0xfbe8bc, 1);
    frame.lineStyle(0);
    frame.drawRoundedRect(0, 0, cols * cell, rows * cell, RADIUS.small);
    frame.endFill();
    container.addChild(frame);
  }

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
      cellG.lineStyle(1, COLORS.panelBorderSoft, 0.35);
      cellG.drawRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      tiles.addChild(cellG);
    }
  }
  container.addChild(tiles);
}
