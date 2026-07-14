/**
 * 章节路径地图 — 全屏 Q 版路径背景 + 圆柱关卡点（nodes_sheet 三态）
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
import { CHAPTER_REWARD_PET } from '@/balance/stages';
import { PET_MAP } from '@/balance/pets';
import { PlayerData } from '@/game/PlayerData';
import { BACKGROUND_IMAGES, MAP_UI_IMAGES } from '@/config/Assets';
import { getPetAvatarTexture, loadPetAvatarTexture } from '@/config/petAvatarTexture';
import { COLORS, FONT_SIZE, makeText, makeStarRow } from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { ScrollListController } from '@/ui/ScrollList';

/** 圆柱关卡点显示尺寸（对齐 home_hub_v4 圆台比例） */
const NODE_W = 78;
const NODE_H = 68;
const NODE_HIT_R = 48;
/** Boss 守关灵宠立绘边长（放大，放在关卡点左侧） */
const BOSS_PET_SIZE = 160;
/** 相对 Boss 关节点：偏左、略上 */
const BOSS_PET_OFFSET_X = -118;
const BOSS_PET_OFFSET_Y = -NODE_H * 0.4;
/** 关卡路径整体下移（屏幕像素），与顶栏资源图标留出呼吸间距 */
const TITLE_MAP_TOP_INSET = 32;

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
  const nodeTex = nodeShieldTexture(kind);
  if (nodeTex) {
    const node = new PIXI.Sprite(nodeTex);
    // 锚点偏下：圆柱底贴路径
    node.anchor.set(0.5, 0.88);
    node.width = NODE_W;
    node.height = NODE_H;
    wrap.addChild(node);
  } else {
    const fallback = new PIXI.Graphics();
    const fill = kind === 'locked' ? 0x9aa0a8 : kind === 'active' ? 0xe8a33d : 0xf5e6c8;
    fallback.beginFill(fill, 1);
    fallback.drawEllipse(0, -8, 28, 18);
    fallback.endFill();
    wrap.addChild(fallback);
  }

  // 台面关卡序号（对齐 home_hub_v4 圆台上数字）
  if (opts.unlocked) {
    const num = makeText(String(stage.index), {
      size: 22,
      fill: kind === 'active' ? 0xb5701f : 0x2f7a6b,
      bold: true,
      anchor: 0.5,
      strokeColor: 0xfff8ec,
      strokeWidth: 3,
    });
    num.position.set(0, -NODE_H * 0.42);
    wrap.addChild(num);
  }

  if (opts.stars > 0) {
    const starLine = makeStarRow({
      star: opts.stars,
      maxStar: 3,
      style: 'sprite',
      starSize: 14,
      gap: 2,
      anchor: 'center',
    });
    starLine.position.set(0, -NODE_H * 0.95);
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
  nameText.position.set(0, 14);
  wrap.addChild(nameText);

  if (stage.isBoss) {
    attachBossGuardianPet(wrap, stage.chapter, opts.unlocked);
  } else if (opts.unlocked && stage.type !== 'normal') {
    const badge = makeText(getStageType(stage.type).name, {
      size: FONT_SIZE.xxs, fill: getStageType(stage.type).color, bold: true, anchor: 0.5,
      strokeColor: 0x2a3444, strokeWidth: 2,
    });
    badge.position.set(-NODE_W * 0.28, -NODE_H * 0.72);
    wrap.addChild(badge);
  }

  if (opts.active && opts.unlocked && opts.stars === 0) {
    const bg = new PIXI.Graphics();
    bg.beginFill(0xe8554d, 1);
    bg.drawRoundedRect(NODE_W * 0.12, -NODE_H * 0.88, 32, 16, 6);
    bg.endFill();
    wrap.addChild(bg);
    const nw = makeText('New', {
      size: FONT_SIZE.xxs, fill: 0xffffff, bold: true, anchor: 0.5,
    });
    nw.position.set(NODE_W * 0.12 + 16, -NODE_H * 0.88 + 8);
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

/**
 * Boss 关节点：放大守关灵宠立绘，放在关卡圆柱左侧（对齐 home_hub_v4）。
 * 立绘取 CHAPTER_REWARD_PET，与编队敌情「守关」同源。
 */
function attachBossGuardianPet(
  wrap: PIXI.Container,
  chapter: number,
  unlocked: boolean,
): void {
  const petId = CHAPTER_REWARD_PET[chapter];

  const host = new PIXI.Container();
  host.position.set(BOSS_PET_OFFSET_X, BOSS_PET_OFFSET_Y);
  // 未解锁也保持清晰可见，仅略压暗（勿半透明发虚）
  if (!unlocked) host.alpha = 0.92;
  // 先加立绘，再叠关卡圆柱/文字之上更抢眼
  wrap.addChildAt(host, 0);

  const applyTex = (tex: PIXI.Texture | null): void => {
    host.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (tex) {
      const spr = new PIXI.Sprite(tex);
      spr.anchor.set(0.5, 1);
      const scale = BOSS_PET_SIZE / Math.max(tex.width, tex.height);
      spr.scale.set(scale);
      host.addChild(spr);
    } else {
      const ph = new PIXI.Graphics();
      ph.beginFill(0xc9a063, 0.85);
      ph.drawCircle(0, -BOSS_PET_SIZE * 0.35, BOSS_PET_SIZE * 0.35);
      ph.endFill();
      host.addChild(ph);
    }
    const tag = makeText('BOSS', {
      size: FONT_SIZE.xs, fill: 0xfff4c8, bold: true, anchor: 0.5,
      strokeColor: 0x8a5a18, strokeWidth: 4,
    });
    // 标在立绘右上，避免挡住宠脸
    tag.position.set(BOSS_PET_SIZE * 0.38, -BOSS_PET_SIZE * 0.88);
    host.addChild(tag);
  };

  applyTex(petId ? getPetAvatarTexture(petId, 1) : null);
  if (petId) {
    void loadPetAvatarTexture(petId, 1).then((tex) => {
      if (!host.destroyed) applyTex(tex);
    });
  }
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
  world.position.set(fit.offsetX, fit.offsetY + TITLE_MAP_TOP_INSET);
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
