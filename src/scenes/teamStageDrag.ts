/**
 * 战前站台拖动换位：只拎立绘，石座 / 队长牌不动。
 *
 * 落点反馈对齐编队页常见做法（阴阳师 / AFK / 原神编队）：
 * 不画圈不描边，目标位灵宠变淡并略抬起，表示「即将对调」。
 * 跟手交给 ticker；touchmove 只记账。ticker 被挤掉时才限频补一帧，
 * 禁止每下 move 都整屏 render。
 */
import * as PIXI from 'pixi.js';
import { UPDATE_PRIORITY } from '@pixi/ticker';
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';
import { UI } from '@/balance/ui';
import { bindCanvasPointerMove } from '@/minigame/canvasInteraction';
import { clientEventToDesign } from '@/utils/clientEventToDesign';
import { pickTopmostHit } from '@/utils/hitTestDesign';
import { deferAfterPointerEvent, deferNextFrame } from '@/utils/deferAfterPointer';
import {
  pickTeamStageDrop,
  TEAM_STAGE_DRAG_SLOP,
  teamStageDragNeedsPresent,
  type TeamStageDropHome,
} from './teamStageDrop';

/** 目标位幽灵态：让出座位，不新画控件 */
const TARGET_GHOST_ALPHA = 0.38;
const TARGET_LIFT_Y = -14;

export interface TeamStageDragSlot {
  visual: number;
  teamIndex: number;
  petId?: string;
  slot: PIXI.Container;
  body?: PIXI.Sprite;
  chrome?: PIXI.Container;
  homeX: number;
  homeY: number;
}

export function bindTeamStageReorder(opts: {
  slotArea: PIXI.Container;
  slots: readonly TeamStageDragSlot[];
  isBusy: () => boolean;
  setBusy: (busy: boolean) => void;
  onSwap: (fromTeamIndex: number, toTeamIndex: number) => void;
}): () => void {
  const homes: TeamStageDropHome[] = opts.slots.map((s) => ({
    visual: s.visual,
    teamIndex: s.teamIndex,
    occupied: !!s.petId,
    x: s.homeX,
    y: s.homeY,
  }));

  const lift = new PIXI.Container();
  lift.eventMode = 'none';
  opts.slotArea.addChild(lift);

  let armed: {
    slot: TeamStageDragSlot;
    startX: number;
    startY: number;
    liftX: number;
    liftY: number;
    dx: number;
    dy: number;
  } | null = null;
  let dragging = false;
  let marked: TeamStageDragSlot | null = null;
  let markedY = 0;
  let bodyHomeX = 0;
  let bodyHomeY = 0;
  let bodyIndex = 1;
  let lastTickWallMs = 0;
  let lastPresentMs = 0;
  let fpsBoosted = false;

  const boostFps = (): void => {
    if (fpsBoosted) return;
    fpsBoosted = true;
    Game.setMaxFPS(UI.fps.battle);
  };

  const restoreFps = (): void => {
    if (!fpsBoosted) return;
    fpsBoosted = false;
    Game.setMaxFPS(UI.fps.idle);
  };

  const clearMark = (): void => {
    const body = marked?.body;
    if (body && !body.destroyed) {
      body.alpha = 1;
      body.y = markedY;
    }
    marked = null;
  };

  const markTarget = (visual: number): void => {
    const next = visual < 0
      ? null
      : opts.slots.find((s) => s.visual === visual) ?? null;
    if (next === marked) return;
    clearMark();
    marked = next;
    const body = next?.body;
    if (!body || body.destroyed) return;
    markedY = body.y;
    body.alpha = TARGET_GHOST_ALPHA;
    body.y = markedY + TARGET_LIFT_Y;
  };

  const applyHeld = (): void => {
    if (!armed || !dragging) return;
    const body = armed.slot.body;
    if (!body || body.destroyed) return;
    body.position.set(armed.liftX + armed.dx, armed.liftY + armed.dy);
    const drop = pickTeamStageDrop(
      armed.slot.homeX + armed.dx,
      armed.slot.homeY + armed.dy,
      armed.slot.visual,
      homes,
    );
    markTarget(drop?.visual ?? -1);
  };

  const presentIfStarved = (): void => {
    if (!Platform.isMinigame || Platform.isDevtools) return;
    const now = Date.now();
    if (!teamStageDragNeedsPresent(now, lastTickWallMs, lastPresentMs)) return;
    lastPresentMs = now;
    Game.syncFrameToScreen();
  };

  const followTick = (): void => {
    lastTickWallMs = Date.now();
    applyHeld();
  };

  const pickStart = (dx: number, dy: number): TeamStageDragSlot | null => {
    const filled = opts.slots.filter((s) => s.petId && s.body && s.slot.parent);
    const top = pickTopmostHit(filled.map((s) => s.slot), dx, dy);
    if (!top) return null;
    return filled.find((s) => s.slot === top) ?? null;
  };

  const parkBody = (slot: TeamStageDragSlot): void => {
    const body = slot.body;
    if (!body || body.destroyed || slot.slot.destroyed) return;
    if (body.parent !== slot.slot) {
      const at = Math.min(bodyIndex, slot.slot.children.length);
      slot.slot.addChildAt(body, at);
    }
    body.position.set(bodyHomeX, bodyHomeY);
    body.alpha = 1;
    if (slot.chrome && !slot.chrome.destroyed) slot.chrome.visible = true;
  };

  const finish = (commit: { from: number; to: number } | null): void => {
    const held = armed;
    armed = null;
    dragging = false;
    restoreFps();
    clearMark();
    if (held && !commit) parkBody(held.slot);
    deferAfterPointerEvent(() => {
      if (commit) opts.onSwap(commit.from, commit.to);
      deferNextFrame(() => opts.setBusy(false));
    });
  };

  Game.ticker.add(followTick, undefined, UPDATE_PRIORITY.HIGH);

  const handle = bindCanvasPointerMove({
    onDown: (e) => {
      if (armed || opts.isBusy()) return;
      const p = clientEventToDesign(e);
      const hit = pickStart(p.x, p.y);
      if (!hit?.body) return;
      armed = {
        slot: hit, startX: p.x, startY: p.y, liftX: 0, liftY: 0, dx: 0, dy: 0,
      };
    },
    onMove: (e) => {
      if (!armed) return;
      const body = armed.slot.body;
      if (!body || body.destroyed) return;
      const p = clientEventToDesign(e);
      const dx = p.x - armed.startX;
      const dy = p.y - armed.startY;
      armed.dx = dx;
      armed.dy = dy;
      if (!dragging) {
        if (dx * dx + dy * dy < TEAM_STAGE_DRAG_SLOP * TEAM_STAGE_DRAG_SLOP) return;
        dragging = true;
        boostFps();
        opts.setBusy(true);
        bodyHomeX = body.x;
        bodyHomeY = body.y;
        bodyIndex = Math.max(0, armed.slot.slot.getChildIndex(body));
        const world = body.getGlobalPosition();
        lift.addChild(body);
        const local = lift.toLocal(world);
        armed.liftX = local.x;
        armed.liftY = local.y;
        body.alpha = 0.92;
        if (armed.slot.chrome && !armed.slot.chrome.destroyed) {
          armed.slot.chrome.visible = false;
        }
      }
      applyHeld();
      presentIfStarved();
    },
    onUp: () => {
      if (!armed) return;
      if (!dragging) {
        armed = null;
        return;
      }
      const drop = pickTeamStageDrop(
        armed.slot.homeX + armed.dx,
        armed.slot.homeY + armed.dy,
        armed.slot.visual,
        homes,
      );
      if (!drop || drop.teamIndex === armed.slot.teamIndex) {
        finish(null);
        return;
      }
      finish({ from: armed.slot.teamIndex, to: drop.teamIndex });
    },
  });

  return () => {
    clearMark();
    if (armed?.slot) parkBody(armed.slot);
    armed = null;
    dragging = false;
    restoreFps();
    try { Game.ticker.remove(followTick); } catch { /* ticker 已拆 */ }
    if (!lift.destroyed) {
      for (const child of [...lift.children]) lift.removeChild(child);
      lift.destroy({ children: false });
    }
    handle.destroy();
  };
}
