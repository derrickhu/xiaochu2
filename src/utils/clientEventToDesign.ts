/**
 * 微信 touch / pointer → 设计坐标（750 宽）。
 * 统一规则见 @/minigame/index.ts；对齐 game2D_huahua BoardView._rawToLocal。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { designPointToContainerLocal } from './hitTestDesign';
import { clientToDesignByRect, readHostCanvasRect } from './hostCanvasRect';

/** 宿主事件里的原始坐标（未换算），诊断与换算共用 */
export function rawClientPoint(e: unknown): { x: number; y: number } {
  const ev = e as {
    clientX?: number;
    clientY?: number;
    x?: number;
    y?: number;
    pageX?: number;
    pageY?: number;
    touches?: Array<{ clientX?: number; clientY?: number }>;
    changedTouches?: Array<{ clientX?: number; clientY?: number }>;
  };
  const t0 = ev.changedTouches?.[0] ?? ev.touches?.[0];
  return {
    x: ev.clientX ?? t0?.clientX ?? ev.pageX ?? ev.x ?? 0,
    y: ev.clientY ?? t0?.clientY ?? ev.pageY ?? ev.y ?? 0,
  };
}

export function clientEventToDesign(e: unknown): { x: number; y: number } {
  const { x: cx, y: cy } = rawClientPoint(e);
  // 华为快游戏：事件来自宿主 DOM，只有画布真实 rect 与它同坐标系
  const rect = readHostCanvasRect();
  if (rect) return clientToDesignByRect(cx, cy, rect, Game.designWidth);

  // 对齐 game2D_huahua：clientX(逻辑像素) → 设计坐标，单一比例 designWidth/screenWidth。
  // 不经 EventSystem patch / toLocal，避免依赖 worldTransform 是否最新。
  const ratio = Game.designWidth / Game.screenWidth;
  return { x: cx * ratio, y: cy * ratio };
}

export function designPointToLocal(target: PIXI.Container, dx: number, dy: number): PIXI.Point {
  return designPointToContainerLocal(target, dx, dy);
}

/** touch/pointer 事件 → 某容器本地设计坐标（棋盘拖拽 / hitTest 共用） */
export function designEventToLocal(target: PIXI.Container, e: unknown): { x: number; y: number } {
  const design = clientEventToDesign(e);
  const local = designPointToLocal(target, design.x, design.y);
  return { x: local.x, y: local.y };
}
