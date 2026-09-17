/**
 * 通天塔榜版式：宣纸底板 + 紧凑 2-1-3 + 前 10（名单 4–10）。
 * 不把领奖台拉满剩余高度。
 */
import { RANK_BOARD } from './rankBoard';

export interface RankPodiumSlot {
  place: 1 | 2 | 3;
  x: number;
  y: number;
  r: number;
  nameY: number;
  floorY: number;
  blockX: number;
  blockY: number;
  blockBottom: number;
  blockW: number;
  blockH: number;
}

export interface RankListSlot {
  rank: number;
  y: number;
}

export interface RankBoardLayout {
  width: number;
  height: number;
  contentH: number;
  podium: [RankPodiumSlot, RankPodiumSlot, RankPodiumSlot];
  list: RankListSlot[];
  listX: number;
  listW: number;
  rowH: number;
  listAvatarX: number;
  listAvatarR: number;
  listNameX: number;
  listFloorX: number;
}

const DESIGN_W = 750;

export function layoutRankBoard(width: number, _height = 0): RankBoardLayout {
  const s = width / DESIGN_W;
  const mid = width * 0.5;
  const side = width * 0.248;
  const specs: Array<{ place: 1 | 2 | 3; x: number; r: number; blockH: number; blockW: number }> = [
    { place: 2, x: mid - side, r: 46 * s, blockH: 118 * s, blockW: 120 * s },
    { place: 1, x: mid, r: 58 * s, blockH: 155 * s, blockW: 130 * s },
    { place: 3, x: mid + side, r: 46 * s, blockH: 94 * s, blockW: 120 * s },
  ];
  const baseBottom = 372 * s;
  const nameGap = 54 * s;
  const podium = specs.map((spec) => {
    const y = baseBottom - spec.blockH - spec.r - nameGap;
    return {
      place: spec.place,
      x: spec.x,
      y,
      r: spec.r,
      nameY: y + spec.r + 16 * s,
      floorY: y + spec.r + 40 * s,
      blockX: spec.x,
      blockY: baseBottom - spec.blockH / 2,
      blockBottom: baseBottom,
      blockW: spec.blockW,
      blockH: spec.blockH,
    };
  }) as [RankPodiumSlot, RankPodiumSlot, RankPodiumSlot];

  const listX = 52 * s;
  const listW = width - listX * 2;
  const rowH = 64 * s;
  const listTop = baseBottom + 16 * s;
  const listCount = RANK_BOARD.listSlots;
  const list = Array.from({ length: listCount }, (_, i) => ({
    rank: i + 4,
    y: listTop + i * rowH + rowH / 2,
  }));
  const contentH = listTop + rowH * listCount + 6 * s;

  return {
    width,
    height: contentH,
    contentH,
    podium,
    list,
    listX,
    listW,
    rowH,
    listAvatarX: listX + 72 * s,
    listAvatarR: 20 * s,
    listNameX: listX + 104 * s,
    listFloorX: listX + listW - 24 * s,
  };
}
