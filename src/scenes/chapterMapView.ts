/**
 * 章节路径地图 — 全屏修仙背景 + 归一化节点（彩珠式贴图）
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TextureCache } from '@/core/TextureCache';
import {
  CHAPTER_MAP_DESIGN,
  chapterMapActiveIndex,
  chapterMapDesignFit,
  chapterMapNodePositions,
  chapterMapProgressIndex,
  playerProgressChapter,
  type MapPoint,
} from '@/balance/chapterMap';
import { ChapterMapLayoutStore } from '@/game/chapterMapLayoutStore';
import { getStageType } from '@/balance/stageTypes';
import type { StageDef } from '@/balance/stages';
import { PET_MAP } from '@/balance/pets';
import { PlayerData } from '@/game/PlayerData';
import { BACKGROUND_IMAGES, MAP_UI_IMAGES } from '@/config/Assets';
import { getPetAvatarTexture, loadPetAvatarTexture } from '@/config/petAvatarTexture';
import { COLORS, FONT_SIZE, makeText } from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { ScrollListController } from '@/ui/ScrollList';

const SHIELD_H = 88;
const SHIELD_W = 64;
const NODE_HIT_R = 52;

type NodeKind = 'cleared' | 'active' | 'locked';

const nodeFrameCache = new Map<NodeKind, PIXI.Texture>();

export interface TitleScreenWorldResult {
  /** 已缩放居中的根容器（背景 + 节点） */
  world: PIXI.Container;
  /** 750×1334 设计稿层（节点坐标系） */
  designLayer: PIXI.Container;
  nodes: PIXI.Container[];
  marker: PIXI.Container | null;
  activeIndex: number;
}

export interface TitleScreenWorldOpts {
  chapter: number;
  stages: readonly StageDef[];
  screenW: number;
  screenH: number;
  scroll: ScrollListController;
  onStageTap: (stageId: string) => void;
  /** GM 编辑模式：节点可拖拽，禁用进关 */
  mapEditMode?: boolean;
}

/** @deprecated 保留类型兼容 */
export interface ChapterMapViewResult {
  content: PIXI.Container;
  mapHeight: number;
  scrollMin: number;
  listTop: number;
  scrollToActive(): void;
}

/** @deprecated 由 buildTitleScreenWorld 替代 */
export interface ChapterMapViewOpts {
  chapter: number;
  stages: readonly StageDef[];
  viewportTop: number;
  viewportBottom: number;
  scroll: ScrollListController;
  onStageTap: (stageId: string) => void;
  usePixiMask: boolean;
}

function layoutDesignBackground(parent: PIXI.Container, tex: PIXI.Texture, w: number, h: number): void {
  const fallback = new PIXI.Graphics();
  fallback.beginFill(COLORS.bgFallback);
  fallback.drawRect(0, 0, w, h);
  fallback.endFill();
  parent.addChild(fallback);

  const sprite = new PIXI.Sprite(tex);
  sprite.width = w;
  sprite.height = h;
  parent.addChild(sprite);
}

function nodeShieldTexture(kind: NodeKind): PIXI.Texture | null {
  const cached = nodeFrameCache.get(kind);
  if (cached) return cached;
  const sheet = TextureCache.get(MAP_UI_IMAGES.nodesSheet);
  if (!sheet) return null;
  const fw = Math.floor(sheet.width / 3);
  const col = kind === 'cleared' ? 0 : kind === 'active' ? 1 : 2;
  const frame = new PIXI.Texture(sheet.baseTexture, new PIXI.Rectangle(col * fw, 0, fw, sheet.height));
  nodeFrameCache.set(kind, frame);
  return frame;
}

function resolveNodeKind(unlocked: boolean, stars: number, active: boolean): NodeKind {
  if (!unlocked) return 'locked';
  if (stars > 0) return 'cleared';
  if (active) return 'active';
  return 'cleared';
}

function buildStageNode(
  stage: StageDef,
  pos: MapPoint,
  opts: {
    unlocked: boolean;
    stars: number;
    active: boolean;
    onTap: () => void;
    scroll: ScrollListController;
    editMode: boolean;
  },
): PIXI.Container {
  const wrap = new PIXI.Container();
  wrap.position.set(pos.x, pos.y);
  wrap.interactiveChildren = false;
  wrap.hitArea = new PIXI.Circle(0, -4, NODE_HIT_R);

  const kind = resolveNodeKind(opts.unlocked, opts.stars, opts.active);
  const shieldTex = nodeShieldTexture(kind);
  if (shieldTex) {
    const shield = new PIXI.Sprite(shieldTex);
    shield.anchor.set(0.5, 0.72);
    shield.width = SHIELD_W;
    shield.height = SHIELD_H;
    wrap.addChild(shield);
  } else {
    const fallback = new PIXI.Graphics();
    const fill = kind === 'locked' ? 0x9aa0a8 : kind === 'active' ? 0x9b6bff : 0x5db9ff;
    fallback.beginFill(fill, 1);
    fallback.drawCircle(0, -4, 26);
    fallback.endFill();
    wrap.addChild(fallback);
  }

  if (opts.stars > 0) {
    const starLine = makeText('★'.repeat(opts.stars), {
      size: FONT_SIZE.xs, fill: 0xffe566, bold: true, anchor: 0.5,
      strokeColor: 0x6b4a00, strokeWidth: 2,
    });
    starLine.position.set(0, -SHIELD_H * 0.82);
    wrap.addChild(starLine);
  }

  const label = opts.unlocked ? `${stage.index}. ${stage.name}` : '未解锁';
  const nameText = makeText(label, {
    size: FONT_SIZE.xxs,
    fill: opts.unlocked ? 0xffffff : COLORS.textDisabled,
    strokeColor: opts.unlocked ? 0x2a3444 : undefined,
    strokeWidth: 3,
    bold: true,
    anchor: 0.5,
  });
  nameText.position.set(0, 26);
  wrap.addChild(nameText);

  if (stage.isBoss) {
    const cap = makeText('收录', {
      size: FONT_SIZE.xxs, fill: COLORS.accent, bold: true, anchor: 0.5,
      strokeColor: 0x2a3444, strokeWidth: 2,
    });
    cap.position.set(SHIELD_W * 0.28, -SHIELD_H * 0.62);
    wrap.addChild(cap);
  } else if (opts.unlocked && stage.type !== 'normal') {
    const badge = makeText(getStageType(stage.type).name, {
      size: FONT_SIZE.xxs, fill: getStageType(stage.type).color, bold: true, anchor: 0.5,
      strokeColor: 0x2a3444, strokeWidth: 2,
    });
    badge.position.set(-SHIELD_W * 0.28, -SHIELD_H * 0.62);
    wrap.addChild(badge);
  }

  if (opts.active && opts.unlocked && opts.stars === 0) {
    const bg = new PIXI.Graphics();
    bg.beginFill(0xe8554d, 1);
    bg.drawRoundedRect(SHIELD_W * 0.06, -SHIELD_H * 0.78, 32, 16, 6);
    bg.endFill();
    wrap.addChild(bg);
    const nw = makeText('New', {
      size: FONT_SIZE.xxs, fill: 0xffffff, bold: true, anchor: 0.5,
    });
    nw.position.set(SHIELD_W * 0.06 + 16, -SHIELD_H * 0.78 + 8);
    wrap.addChild(nw);
  }

  if (opts.editMode) {
    wrap.eventMode = 'static';
    wrap.cursor = 'move';
  } else if (opts.unlocked) {
    wrap.eventMode = 'static';
    wrap.cursor = 'pointer';
    bindPointerTap(wrap, opts.onTap, { guard: () => !opts.scroll.moved });
  } else {
    wrap.eventMode = 'none';
  }

  return wrap;
}

function buildPlayerMarker(teamPetId: string | undefined): PIXI.Container {
  const marker = new PIXI.Container();
  marker.eventMode = 'none';

  const AVATAR_R = 26;
  const avatarY = 10;

  const bubble = new PIXI.Graphics();
  bubble.beginFill(0xffffff, 0.96);
  bubble.lineStyle(2, 0xd2bea0, 0.85);
  bubble.drawRoundedRect(-56, -58, 112, 28, 10);
  bubble.endFill();
  marker.addChild(bubble);

  const tip = makeText('从这里出发!', {
    size: FONT_SIZE.xxs, fill: COLORS.textTitle, bold: true, anchor: 0.5,
  });
  tip.position.set(0, -44);
  marker.addChild(tip);

  const pointer = new PIXI.Graphics();
  pointer.beginFill(0xffffff, 0.96);
  pointer.lineStyle(2, 0xd2bea0, 0.85);
  pointer.moveTo(-7, -30);
  pointer.lineTo(7, -30);
  pointer.lineTo(0, -22);
  pointer.closePath();
  pointer.endFill();
  marker.addChild(pointer);

  const avatarSlot = new PIXI.Container();
  avatarSlot.position.set(0, avatarY);
  marker.addChild(avatarSlot);

  const pet = teamPetId ? PET_MAP.get(teamPetId) : undefined;
  const star = teamPetId ? PlayerData.petStar(teamPetId) : 1;

  const setAvatar = (tex: PIXI.Texture | null): void => {
    avatarSlot.removeChildren();
    if (tex?.valid) {
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      const size = AVATAR_R * 1.55;
      sp.width = size;
      sp.height = size;
      avatarSlot.addChild(sp);
      return;
    }
    const label = pet?.name?.slice(0, 1) ?? '灵';
    const fb = makeText(label, {
      size: FONT_SIZE.sm,
      fill: COLORS.accentDeep,
      bold: true,
      anchor: 0.5,
      strokeColor: 0xfff8ec,
      strokeWidth: 3,
    });
    avatarSlot.addChild(fb);
  };

  setAvatar(teamPetId ? getPetAvatarTexture(teamPetId, star) : null);
  if (teamPetId) {
    void loadPetAvatarTexture(teamPetId, star).then((tex) => {
      if (marker.destroyed) return;
      setAvatar(tex);
      Game.syncFrameToScreen();
    });
  }

  return marker;
}

function resolveNodePositions(
  stageCount: number,
  designW: number,
  designH: number,
): MapPoint[] {
  const saved = ChapterMapLayoutStore.getNormalized(stageCount);
  if (saved) {
    return saved.map((p) => ({ x: p.x * designW, y: p.y * designH }));
  }
  return chapterMapNodePositions(stageCount, designW, designH);
}

/** 全屏 9:16 世界层：修仙背景铺满 + 关卡节点 */
export function buildTitleScreenWorld(opts: TitleScreenWorldOpts): TitleScreenWorldResult {
  nodeFrameCache.clear();

  const { width: designW, height: designH } = CHAPTER_MAP_DESIGN;
  const fit = chapterMapDesignFit(opts.screenW, opts.screenH);
  const positions = resolveNodePositions(opts.stages.length, designW, designH);
  const editMode = !!opts.mapEditMode;
  const activeIdx = chapterMapActiveIndex(
    opts.stages,
    (id) => PlayerData.starsOf(id),
    (s) => PlayerData.isUnlocked(s),
  );
  const progressChapter = playerProgressChapter(
    (id) => PlayerData.starsOf(id),
    (s) => PlayerData.isUnlocked(s),
  );
  const showProgressMarker = !editMode
    && progressChapter === opts.chapter
    && chapterMapProgressIndex(
      opts.stages,
      (id) => PlayerData.starsOf(id),
      (s) => PlayerData.isUnlocked(s),
    ) !== null;

  const root = new PIXI.Container();
  const rootFill = new PIXI.Graphics();
  rootFill.beginFill(COLORS.bgFallback);
  rootFill.drawRect(0, 0, opts.screenW, opts.screenH);
  rootFill.endFill();
  root.addChild(rootFill);

  const world = new PIXI.Container();
  world.scale.set(fit.scale);
  world.position.set(fit.offsetX, fit.offsetY);
  root.addChild(world);

  const bgTex = TextureCache.get(BACKGROUND_IMAGES.titleScreen)
    ?? TextureCache.get(BACKGROUND_IMAGES.chapterMap)
    ?? TextureCache.get(BACKGROUND_IMAGES.home);
  if (bgTex) {
    layoutDesignBackground(world, bgTex, designW, designH);
  }

  const nodes: PIXI.Container[] = [];
  opts.stages.forEach((stage, i) => {
    const node = buildStageNode(stage, positions[i], {
      unlocked: PlayerData.isUnlocked(stage),
      stars: PlayerData.starsOf(stage.id),
      active: i === activeIdx,
      onTap: () => opts.onStageTap(stage.id),
      scroll: opts.scroll,
      editMode,
    });
    nodes.push(node);
    world.addChild(node);
  });

  let marker: PIXI.Container | null = null;
  const activePos = activeIdx >= 0 ? positions[activeIdx] : null;
  if (activePos && showProgressMarker) {
    marker = buildPlayerMarker(PlayerData.team[0]);
    marker.position.set(activePos.x + 44, activePos.y - 22);
    world.addChild(marker);
  }

  return { world: root, designLayer: world, nodes, marker, activeIndex: activeIdx };
}

/** @deprecated 兼容旧调用，内部转 buildTitleScreenWorld */
export function buildChapterMapView(opts: ChapterMapViewOpts): ChapterMapViewResult {
  const w = Game.logicWidth;
  const h = Game.logicHeight;
  const { world } = buildTitleScreenWorld({
    chapter: opts.chapter,
    stages: opts.stages,
    screenW: w,
    screenH: h,
    scroll: opts.scroll,
    onStageTap: opts.onStageTap,
  });
  return {
    content: world,
    mapHeight: h,
    scrollMin: 0,
    listTop: 0,
    scrollToActive: () => {},
  };
}
