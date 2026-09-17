/**
 * 通天塔榜：流水线零件拼接，标题/按钮用游戏组件，再叠头像文字。
 */
import * as PIXI from 'pixi.js';
import { UI_IMAGES } from '@/config/Assets';
import type { RankBoardLayout } from '@/game/rankPageLayout';
import { rankAvatarPath, type RankEntry } from '@/game/rankBoard';
import { rankFloorLabel } from '@/game/rankCopy';
import { COLORS, FONT_SIZE, bindLazySprite, makePanel, makeText } from '@/ui';

function place(
  parent: PIXI.Container,
  path: string,
  x: number,
  y: number,
  w: number,
  h: number,
): () => void {
  const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
  spr.anchor.set(0.5);
  spr.position.set(x, y);
  spr.width = w;
  spr.height = h;
  parent.addChild(spr);
  return bindLazySprite(spr, {
    path,
    ensure: true,
    onApplied: (tex) => {
      spr.texture = tex;
      spr.width = w;
      spr.height = h;
    },
  });
}

function placePodium(
  parent: PIXI.Container,
  path: string,
  x: number,
  bottom: number,
  w: number,
  fallbackH: number,
): () => void {
  const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
  spr.anchor.set(0.5, 1);
  spr.position.set(x, bottom);
  spr.width = w;
  spr.height = fallbackH;
  parent.addChild(spr);
  return bindLazySprite(spr, {
    path,
    ensure: true,
    onApplied: (tex) => {
      spr.texture = tex;
      spr.width = w;
      spr.height = w * (tex.height / Math.max(tex.width, 1));
    },
  });
}

export function mountRankPageChrome(
  parent: PIXI.Container,
  originY: number,
  layout: RankBoardLayout,
): () => void {
  const layer = new PIXI.Container();
  layer.position.set(0, originY);
  parent.addChild(layer);
  const unbinds: Array<() => void> = [];

  const frames = [UI_IMAGES.rankFrameSilver, UI_IMAGES.rankFrameGold, UI_IMAGES.rankFrameBronze];
  const blocks = [UI_IMAGES.rankPodiumSilver, UI_IMAGES.rankPodiumGold, UI_IMAGES.rankPodiumBronze];
  const crowns = [UI_IMAGES.rankCrownSilver, UI_IMAGES.rankCrownGold, UI_IMAGES.rankCrownBronze];

  layout.podium.forEach((slot, i) => {
    unbinds.push(place(layer, crowns[i], slot.x, slot.y - slot.r - 22, 36, 28));
    unbinds.push(place(layer, frames[i], slot.x, slot.y, slot.r * 2, slot.r * 2));
    unbinds.push(placePodium(layer, blocks[i], slot.blockX, slot.blockBottom, slot.blockW, slot.blockH));
    const num = makeText(String(slot.place), {
      size: slot.place === 1 ? FONT_SIZE.xl : FONT_SIZE.lg,
      fill: slot.place === 2 ? COLORS.textMain : COLORS.textInverse,
      strokeColor: slot.place === 2 ? undefined : COLORS.textMain,
      strokeWidth: slot.place === 2 ? undefined : 3,
      bold: true,
      anchor: 0.5,
      role: 'title',
    });
    num.position.set(slot.blockX, slot.blockY);
    layer.addChild(num);
  });

  layout.list.forEach((row) => {
    const card = makePanel({
      width: layout.listW,
      height: layout.rowH - 8,
      radius: Math.min(28, (layout.rowH - 8) / 2),
      bg: COLORS.rankRowBg,
      border: COLORS.rankPanelBorder,
      borderWidth: 2,
      centered: true,
    });
    card.position.set(layout.listX + layout.listW / 2, row.y);
    layer.addChild(card);
    unbinds.push(place(
      layer,
      UI_IMAGES.rankFrameList,
      layout.listAvatarX,
      row.y,
      layout.listAvatarR * 2,
      layout.listAvatarR * 2,
    ));
    const rank = makeText(String(row.rank), {
      size: FONT_SIZE.sm,
      fill: COLORS.textSub,
      bold: true,
      anchor: 0.5,
      role: 'body',
    });
    rank.position.set(layout.listX + 28, row.y);
    layer.addChild(rank);
  });

  return () => {
    for (const u of unbinds) u();
    if (layer.parent) layer.parent.removeChild(layer);
    if (!layer.destroyed) layer.destroy({ children: true });
  };
}

export function paintRankPageOverlays(
  parent: PIXI.Container,
  originY: number,
  layout: RankBoardLayout,
  opts: {
    podium: [RankEntry | null, RankEntry | null, RankEntry | null];
    list: Array<RankEntry | null>;
    /** 通天塔是否已解锁；未开时自己那行不写爬塔 */
    towerOpen?: boolean;
  },
): () => void {
  const unbinds: Array<() => void> = [];
  const layer = new PIXI.Container();
  layer.position.set(0, originY);
  parent.addChild(layer);

  layout.podium.forEach((slot, i) => {
    const entry = opts.podium[i];
    if (!entry) return;
    const { root, unbind } = makeAvatar(entry, slot.r * 2 - 12);
    root.position.set(slot.x, slot.y);
    layer.addChild(root);
    unbinds.push(unbind);
    const name = makeText(entry.name, {
      size: FONT_SIZE.xs, fill: COLORS.textMain, bold: true, anchor: 0.5, role: 'body',
    });
    name.position.set(slot.x, slot.nameY);
    layer.addChild(name);
    const floor = makeText(rankFloorLabel(entry, opts.towerOpen ?? true), {
      size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: 0.5, role: 'body',
    });
    floor.position.set(slot.x, slot.floorY);
    layer.addChild(floor);
  });

  layout.list.forEach((row, i) => {
    const entry = opts.list[i];
    if (!entry) return;
    if (entry.isSelf) {
      const card = makePanel({
        width: layout.listW,
        height: layout.rowH - 8,
        radius: Math.min(28, (layout.rowH - 8) / 2),
        bg: COLORS.rankRowSelfBg,
        border: COLORS.accent,
        borderWidth: 2,
        centered: true,
      });
      card.position.set(layout.listX + layout.listW / 2, row.y);
      layer.addChild(card);
    }
    const { root, unbind } = makeAvatar(entry, layout.listAvatarR * 2 - 4);
    root.position.set(layout.listAvatarX, row.y);
    layer.addChild(root);
    unbinds.push(unbind);
    const name = makeText(entry.name, {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0, 0.5], role: 'body',
    });
    name.position.set(layout.listNameX, row.y);
    layer.addChild(name);
    const floor = makeText(rankFloorLabel(entry, opts.towerOpen ?? true), {
      size: FONT_SIZE.sm,
      fill: entry.isSelf && entry.floor <= 0 ? COLORS.accent : COLORS.textMain,
      bold: true,
      anchor: [1, 0.5],
      role: 'body',
    });
    floor.position.set(layout.listFloorX, row.y);
    layer.addChild(floor);
    // 自己那行会盖一层高亮底，必须把名次再画一遍，不然第 10 会被挡住
    const rankNo = entry.rank > 0 ? entry.rank : row.rank;
    const rank = makeText(String(rankNo), {
      size: FONT_SIZE.sm,
      fill: entry.isSelf ? COLORS.accent : COLORS.textSub,
      bold: true,
      anchor: 0.5,
      role: 'body',
    });
    rank.position.set(layout.listX + 28, row.y);
    layer.addChild(rank);
  });

  return () => {
    for (const u of unbinds) u();
    if (layer.parent) layer.parent.removeChild(layer);
    if (!layer.destroyed) layer.destroy({ children: true });
  };
}

function makeAvatar(
  entry: RankEntry,
  size: number,
): { root: PIXI.Container; unbind: () => void } {
  const root = new PIXI.Container();
  const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
  spr.anchor.set(0.5);
  const mask = new PIXI.Graphics();
  mask.beginFill(0xffffff);
  mask.drawCircle(0, 0, size / 2);
  mask.endFill();
  spr.mask = mask;
  root.addChild(spr);
  root.addChild(mask);

  const fit = (tex: PIXI.Texture) => {
    spr.scale.set(size / Math.max(tex.width, tex.height, 1));
  };

  const path = rankAvatarPath(entry, UI_IMAGES.playerAvatarDefault);
  const remote = !!entry.avatarUrl?.trim();
  const unbind = bindLazySprite(spr, {
    path,
    ensure: !remote,
    onApplied: fit,
  });
  return { root, unbind };
}
