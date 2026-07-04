/**
 * 设计坐标 hitTest（750 布局），供 canvasTapRouter / ScrollList / 编队列表共用。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';

/** 设计坐标 → 容器本地（含父级 scale/pivot，地图 cover 缩放后点击才准） */
export function designPointToContainerLocal(target: PIXI.Container, dx: number, dy: number): PIXI.Point {
  return target.toLocal(new PIXI.Point(dx, dy), Game.stage);
}

export function containsDesignPoint(target: PIXI.Container, dx: number, dy: number): boolean {
  if (!target.parent || !target.visible || target.worldVisible === false) return false;
  if (target.eventMode === 'none') return false;

  const local = designPointToContainerLocal(target, dx, dy);
  const ha = target.hitArea;

  if (ha instanceof PIXI.Rectangle) {
    return local.x >= ha.x && local.x <= ha.x + ha.width
      && local.y >= ha.y && local.y <= ha.y + ha.height;
  }
  if (ha instanceof PIXI.Circle) {
    const dxl = local.x - ha.x;
    const dyl = local.y - ha.y;
    return dxl * dxl + dyl * dyl <= ha.radius * ha.radius;
  }
  if (ha instanceof PIXI.RoundedRectangle) {
    return ha.contains(local.x, local.y);
  }

  const b = target.getLocalBounds();
  return local.x >= b.x && local.x <= b.x + b.width
    && local.y >= b.y && local.y <= b.y + b.height;
}

/** 从候选容器里取最上层命中项（后添加 / 子树更深者优先） */
export function pickTopmostHit(
  candidates: PIXI.Container[],
  dx: number,
  dy: number,
): PIXI.Container | null {
  let best: PIXI.Container | null = null;
  let bestOrder = -1;
  for (const target of candidates) {
    if (!containsDesignPoint(target, dx, dy)) continue;
    const order = worldOrder(target);
    if (order >= bestOrder) {
      best = target;
      bestOrder = order;
    }
  }
  return best;
}

function worldOrder(target: PIXI.Container): number {
  let order = 0;
  let cur: PIXI.Container | null = target;
  while (cur?.parent) {
    order = order * 1000 + cur.parent.getChildIndex(cur);
    cur = cur.parent;
  }
  return order;
}
