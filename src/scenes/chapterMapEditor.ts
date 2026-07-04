/**
 * GM 模式 — 主界面关卡节点位置编辑
 *
 * 拖拽链对齐 BoardView / 踩坑记录：
 * - down：Pixi pointerdown（EventSystem patch 坐标）
 * - move/up：挂 Game.app.view 的 pointer 链（勿用 Pixi pointermove / 勿单挂 touchmove）
 * - 坐标：Game.pointerEventToStageLocal → designLayer.toLocal（含 world scale）
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';
import { CHAPTER_MAP_DESIGN, type MapPoint } from '@/balance/chapterMap';
import { ChapterMapLayoutStore } from '@/game/chapterMapLayoutStore';
import { COLORS, FONT_SIZE, makeText } from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';

const NODE_EDIT_RING_R = 56;
const NODE_HIT_R = 52;

export interface ChapterMapEditorOpts {
  screenW: number;
  chapter: number;
  /** 设计稿层 world（750×1334，含 scale/offset） */
  designLayer: PIXI.Container;
  nodes: PIXI.Container[];
  marker: PIXI.Container | null;
  activeIndex: number;
  stageCount: number;
  onEditingChange: (editing: boolean) => void;
  onRefresh: () => void;
}

export interface ChapterMapEditorHandle {
  toolbar: PIXI.Container;
  teardown: () => void;
}

function normalizedFromDesign(pos: MapPoint): MapPoint {
  return {
    x: pos.x / CHAPTER_MAP_DESIGN.width,
    y: pos.y / CHAPTER_MAP_DESIGN.height,
  };
}

function collectNormalized(nodes: readonly PIXI.Container[]): MapPoint[] {
  return nodes.map((n) => normalizedFromDesign({ x: n.x, y: n.y }));
}

function layerLocalFromClient(
  e: unknown,
  layer: PIXI.Container,
): { x: number; y: number } {
  const stageLocal = Game.pointerEventToStageLocal(e);
  const local = layer.toLocal(stageLocal, Game.stage);
  return { x: local.x, y: local.y };
}

function hitNodeAtLayer(node: PIXI.Container, lx: number, ly: number): boolean {
  const ha = node.hitArea;
  if (!(ha instanceof PIXI.Circle)) return false;
  const dx = lx - node.x - ha.x;
  const dy = ly - node.y - ha.y;
  return dx * dx + dy * dy <= ha.radius * ha.radius;
}

function pickNodeAtLayer(
  nodes: readonly PIXI.Container[],
  lx: number,
  ly: number,
): PIXI.Container | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (hitNodeAtLayer(nodes[i], lx, ly)) return nodes[i];
  }
  return null;
}

/** 对齐 BoardView._setupInteraction */
function attachNodeDrag(opts: {
  designLayer: PIXI.Container;
  nodes: PIXI.Container[];
  marker: PIXI.Container | null;
  activeIndex: number;
}): () => void {
  let dragging: PIXI.Container | null = null;
  let dragIndex = -1;

  const syncMarker = (): void => {
    if (!opts.marker || dragIndex !== opts.activeIndex || !dragging) return;
    opts.marker.position.set(dragging.x + 44, dragging.y - 22);
  };

  const applyLayerLocal = (lx: number, ly: number): void => {
    if (!dragging) return;
    dragging.position.set(lx, ly);
    syncMarker();
    Game.syncFrameToScreen();
  };

  const onPixiDown = (e: PIXI.FederatedPointerEvent): void => {
    if (dragging) return;
    const local = opts.designLayer.toLocal(e.global);
    const node = pickNodeAtLayer(opts.nodes, local.x, local.y);
    if (!node) return;
    dragging = node;
    dragIndex = opts.nodes.indexOf(node);
    applyLayerLocal(local.x, local.y);
    e.stopPropagation();
  };

  opts.designLayer.eventMode = 'static';
  opts.designLayer.interactiveChildren = false;
  opts.designLayer.hitArea = new PIXI.Rectangle(
    0, 0, CHAPTER_MAP_DESIGN.width, CHAPTER_MAP_DESIGN.height,
  );
  opts.designLayer.on('pointerdown', onPixiDown);

  const canvas = Game.app.view as unknown as {
    addEventListener: (type: string, fn: EventListener) => void;
    removeEventListener: (type: string, fn: EventListener) => void;
  };

  const onMove = (e: Event): void => {
    if (!dragging) return;
    (e as { preventDefault?: () => void }).preventDefault?.();
    const local = layerLocalFromClient(e, opts.designLayer);
    applyLayerLocal(local.x, local.y);
  };

  const onUp = (): void => {
    dragging = null;
    dragIndex = -1;
  };

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  return () => {
    if (opts.designLayer && !opts.designLayer.destroyed) {
      opts.designLayer.off('pointerdown', onPixiDown);
    }
    if (canvas?.removeEventListener) {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    }
  };
}

function makeToolbarBtn(label: string, onTap: () => void): PIXI.Container {
  const wrap = new PIXI.Container();
  const bg = new PIXI.Graphics();
  bg.beginFill(0x2a314f, 0.92);
  bg.lineStyle(1, 0x5eb8d4, 0.9);
  bg.drawRoundedRect(0, 0, 120, 36, 8);
  bg.endFill();
  wrap.addChild(bg);
  const txt = makeText(label, {
    size: FONT_SIZE.xxs, fill: COLORS.textInverse, bold: true, anchor: 0.5,
  });
  txt.position.set(60, 18);
  wrap.addChild(txt);
  wrap.eventMode = 'static';
  wrap.cursor = 'pointer';
  bindPointerTap(wrap, onTap);
  return wrap;
}

export function attachChapterMapEditor(opts: ChapterMapEditorOpts): ChapterMapEditorHandle {
  const toolbar = new PIXI.Container();
  toolbar.zIndex = 500;
  toolbar.position.set(0, Game.safeTop + 168);

  const hint = makeText(
    `编辑中 · 第${opts.chapter}章 · ${opts.stageCount}关（同关数共用）`,
    {
      size: FONT_SIZE.xxs,
      fill: 0xffe566,
      strokeColor: 0x2a1f14,
      strokeWidth: 2,
      anchor: 0,
    },
  );
  hint.position.set(16, 4);
  toolbar.addChild(hint);

  for (const node of opts.nodes) {
    node.eventMode = 'static';
    node.cursor = 'move';
    node.hitArea = new PIXI.Circle(0, -4, NODE_HIT_R);
    const ring = new PIXI.Graphics();
    ring.lineStyle(2, 0xffe566, 0.85);
    ring.drawCircle(0, -4, NODE_EDIT_RING_R);
    node.addChildAt(ring, 0);
  }
  const dragTeardown = attachNodeDrag({
    designLayer: opts.designLayer,
    nodes: opts.nodes,
    marker: opts.marker,
    activeIndex: opts.activeIndex,
  });

  const btnY = 28;
  let x = 16;
  const addBtn = (label: string, fn: () => void): void => {
    const btn = makeToolbarBtn(label, fn);
    btn.position.set(x, btnY);
    toolbar.addChild(btn);
    x += 128;
  };

  addBtn('保存布局', () => {
    const norm = collectNormalized(opts.nodes);
    const result = ChapterMapLayoutStore.saveByCount(opts.stageCount, norm);
    Platform.showToast(result.message, result.ok ? 'success' : 'error');
    if (result.ok) console.log(result.bundledSnippet);
    opts.onEditingChange(false);
    opts.onRefresh();
  });
  addBtn('重置默认', () => {
    ChapterMapLayoutStore.clearByCount(opts.stageCount);
    Platform.showToast(`${opts.stageCount}关布局已恢复默认`, 'success');
    opts.onEditingChange(false);
    opts.onRefresh();
  });
  addBtn('退出编辑', () => {
    opts.onEditingChange(false);
    opts.onRefresh();
  });

  return {
    toolbar,
    teardown: () => {
      dragTeardown();
    },
  };
}
