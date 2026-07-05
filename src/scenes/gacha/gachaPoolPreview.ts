/**
 * 召唤页：当前召唤池可视化（横向滚动，全花名册）。
 */
import * as PIXI from 'pixi.js';
import { PET_MAP } from '@/balance/pets';
import { ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import type { Element } from '@/balance/combat';
import { Platform } from '@/core/PlatformService';
import { clientEventToDesign, designPointToLocal } from '@/utils/clientEventToDesign';
import { getPetAvatarTexture } from '@/config/petAvatarTexture';
import { PlayerData } from '@/game/PlayerData';
import { bindCanvasPointerMove, type CanvasPointerMoveHandle } from '@/minigame/canvasInteraction';
import { COLORS, FONT_SIZE, makePanel, makeText } from '@/ui';

const ICON = 48;
const GAP = 8;
const ROW_H = 72;
const HEADER_H = 54;
const PANEL_PAD = 12;

export const GACHA_POOL_PANEL_H = HEADER_H + ROW_H + PANEL_PAD * 2;

export interface GachaPoolPreviewHandle {
  root: PIXI.Container;
  teardown: () => void;
}

function attachHorizontalScroll(
  viewport: PIXI.Container,
  content: PIXI.Container,
  viewportW: number,
  contentW: number,
): () => void {
  const minX = Math.min(0, viewportW - contentW);
  let dragging = false;
  let lastX = 0;

  const clamp = (): void => {
    content.x = Math.max(minX, Math.min(0, content.x));
  };

  const inViewport = (dx: number, dy: number): boolean => {
    const local = designPointToLocal(viewport, dx, dy);
    return local.x >= 0 && local.x <= viewportW && local.y >= 0 && local.y <= ROW_H;
  };

  const onDown = (e: unknown): void => {
    if (contentW <= viewportW) return;
    const stage = clientEventToDesign(e);
    if (!inViewport(stage.x, stage.y)) return;
    dragging = true;
    lastX = stage.x;
  };

  const onMove = (e: unknown): void => {
    if (!dragging) return;
    const stage = clientEventToDesign(e);
    content.x += stage.x - lastX;
    lastX = stage.x;
    clamp();
  };

  const onUp = (): void => {
    dragging = false;
  };

  viewport.eventMode = 'static';
  viewport.cursor = contentW > viewportW ? 'grab' : 'default';

  let bridge: CanvasPointerMoveHandle | null = null;

  if (Platform.isMinigame && !Platform.isDevtools) {
    bridge = bindCanvasPointerMove({ onDown, onMove, onUp });
    return () => bridge?.destroy();
  }

  const onPixiDown = (e: PIXI.FederatedPointerEvent): void => {
    if (contentW <= viewportW) return;
    dragging = true;
    lastX = e.global.x;
  };
  const onPixiMove = (e: PIXI.FederatedPointerEvent): void => {
    if (!dragging) return;
    content.x += e.global.x - lastX;
    lastX = e.global.x;
    clamp();
  };

  viewport.on('pointerdown', onPixiDown);
  viewport.on('pointermove', onPixiMove);
  viewport.on('pointerup', onUp);
  viewport.on('pointerupoutside', onUp);
  viewport.on('pointercancel', onUp);

  return () => {
    viewport.off('pointerdown', onPixiDown);
    viewport.off('pointermove', onPixiMove);
    viewport.off('pointerup', onUp);
    viewport.off('pointerupoutside', onUp);
    viewport.off('pointercancel', onUp);
  };
}

/** bottomY = 面板底边设计坐标；element 省略时为全局池（全花名册） */
export function buildGachaPoolPreview(
  w: number,
  bottomY: number,
  element?: Element,
): GachaPoolPreviewHandle {
  const root = new PIXI.Container();
  const poolIds = [...PlayerData.gachaPoolIds(element)];
  const ownedCount = poolIds.filter((id) => PlayerData.isOwned(id)).length;
  const panelW = Math.min(620, w - 32);
  const panelH = poolIds.length > 0 ? GACHA_POOL_PANEL_H : 88;
  const panelLeft = w / 2 - panelW / 2;
  root.position.set(0, bottomY - panelH);

  const borderColor = element ? ORB_COLOR[element] : COLORS.accent;
  const panel = makePanel({
    width: panelW, height: panelH, radius: 14, centered: false,
    bg: COLORS.panelBg, bgAlpha: 0.92, border: borderColor, borderWidth: 2,
  });
  panel.position.set(panelLeft, 0);
  root.addChild(panel);

  const title = makeText(
    element
      ? `${ELEMENT_NAME[element]}系 · ${poolIds.length} 种可出`
      : `全局召唤池 · ${poolIds.length} 种可出`,
    { size: FONT_SIZE.xs, fill: COLORS.textMain, bold: true, anchor: [0, 0] },
  );
  title.position.set(panelLeft + PANEL_PAD, PANEL_PAD);
  root.addChild(title);

  const scrollHint = poolIds.length > 6 ? ' · 左右滑动' : '';
  const sub = makeText(
    `已拥有 ${ownedCount}/${poolIds.length} · UR 仅召唤获取${scrollHint}`,
    { size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: [0, 0] },
  );
  sub.position.set(panelLeft + PANEL_PAD, PANEL_PAD + 22);
  root.addChild(sub);

  let teardown = (): void => {};

  if (poolIds.length > 0) {
    const viewportW = panelW - PANEL_PAD * 2;
    const rowY = PANEL_PAD + HEADER_H;
    const viewport = new PIXI.Container();
    viewport.position.set(panelLeft + PANEL_PAD, rowY);

    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawRect(0, 0, viewportW, ROW_H);
    mask.endFill();
    viewport.addChild(mask);
    viewport.mask = mask;

    const content = new PIXI.Container();
    let cx = 0;
    for (const id of poolIds) {
      const pet = PET_MAP.get(id);
      if (!pet) continue;

      const cell = new PIXI.Container();
      cell.position.set(cx + ICON / 2, ICON / 2);

      const owned = PlayerData.isOwned(id);
      cell.addChild(makePanel({
        width: ICON, height: ICON, radius: 8, centered: true,
        bg: COLORS.panelBgAlt,
        border: owned ? COLORS.accent : COLORS.panelBorderSoft,
        borderWidth: owned ? 2 : 1,
      }));

      const tex = getPetAvatarTexture(id, Math.max(1, PlayerData.petStar(id)));
      if (tex) {
        const sp = new PIXI.Sprite(tex);
        sp.anchor.set(0.5, 1);
        const dw = ICON - 6;
        sp.width = dw;
        sp.height = dw * (tex.height / tex.width);
        sp.position.set(0, ICON / 2 - 2);
        if (!owned) sp.alpha = 0.82;
        cell.addChild(sp);
      }

      const nm = makeText(pet.name.length > 3 ? `${pet.name.slice(0, 3)}…` : pet.name, {
        size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: [0.5, 0],
      });
      nm.position.set(0, ICON / 2 + 2);
      cell.addChild(nm);

      content.addChild(cell);
      cx += ICON + GAP;
    }
    viewport.addChild(content);
    root.addChild(viewport);

    const contentW = Math.max(ICON, cx - GAP);
    teardown = attachHorizontalScroll(viewport, content, viewportW, contentW);
  }

  return { root, teardown };
}
