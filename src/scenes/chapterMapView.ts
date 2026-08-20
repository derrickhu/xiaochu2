/**
 * 章节路径地图 — 全屏 Q 版路径背景 + 圆柱关卡点（nodes_sheet 三态）
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TextureCache } from '@/core/TextureCache';
import {
  CHAPTER_MAP_DESIGN,
  chapterMapActiveIndex,
  chapterMapChromeInset,
  chapterMapDesignFit,
  chapterMapNodePositions,
  chapterMapProgressIndex,
  playerProgressChapter,
  type MapPoint,
} from '@/balance/chapterMap';
import { ChapterMapLayoutStore } from '@/game/chapterMapLayoutStore';
import { getStageType } from '@/balance/stageTypes';
import { ELITE_MODE, eliteStageIdOf, hasEliteVariant } from '@/balance/eliteMode';
import type { StageDef } from '@/balance/stages';
import { CHAPTER_REWARD_PET } from '@/balance/stages';
import { PET_MAP } from '@/balance/pets';
import { PlayerData } from '@/game/PlayerData';
import { BACKGROUND_IMAGES, chapterMapBg, MAP_UI_IMAGES } from '@/config/Assets';
import { getPetAvatarTexture, loadPetAvatarTexture } from '@/config/petAvatarTexture';
import { COLORS, FONT_SIZE, makeText, makeStarRow } from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { pressFeedback } from '@/ui/motion';
import { ScrollListController } from '@/ui/ScrollList';

/** 圆柱关卡点显示尺寸（略小，给星星/Boss 让视觉重心） */
const NODE_W = 56;
const NODE_H = 48;
const NODE_HIT_R = 40;
/** Boss 守关灵宠立绘边长（关卡点左侧，避开章匾） */
const BOSS_PET_SIZE = 136;
/** 相对 Boss 关节点：偏左、脚落在石礅附近 */
const BOSS_PET_OFFSET_X = -124;
const BOSS_PET_OFFSET_Y = 8;
/** 通关星：主界面要明显大于石礅（主星 = 普通难度） */
const NODE_STAR_SIZE = 22;
const NODE_STAR_GAP = 3;
/** 精英星：次要徽标，略小于普通主星 */
const NODE_ELITE_STAR_SIZE = 14;
const NODE_ELITE_STAR_GAP = 2;
const ELITE_STAR_TINT = 0x4aa3ff;
/** 关卡路径节点略下移（屏幕像素），背景仍满屏；勿加在 world 上否则顶栏下露底色 */
const TITLE_MAP_NODE_TOP_INSET = 32;

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
  /** 章匾下沿（逻辑像素）；节点/Boss 立绘需落在此线以下 */
  chromeBottom?: number;
  scroll: ScrollListController;
  onStageTap: (stageId: string) => void;
  /** 指定高亮关；缺省为章内第一未通关 */
  focusStageId?: string | null;
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

/** 锁定关卡台面锁标：体量对齐关卡序号，不依赖额外贴图 */
function makeNodeLockIcon(): PIXI.Container {
  const c = new PIXI.Container();
  // 先画浅底，保证灰石柱上轮廓清楚
  const back = new PIXI.Graphics();
  back.beginFill(0xfff6e8, 0.92);
  back.drawRoundedRect(-9, -12, 18, 20, 4);
  back.endFill();
  c.addChild(back);

  const g = new PIXI.Graphics();
  // 锁梁
  g.lineStyle(2.4, 0x4a4038, 1);
  g.drawRoundedRect(-5, -10, 10, 8, 3.5);
  // 锁身
  g.lineStyle(0);
  g.beginFill(0x4a4038, 1);
  g.drawRoundedRect(-6.5, -3.5, 13, 10, 2.5);
  g.endFill();
  // 锁孔
  g.beginFill(0xfff6e8, 1);
  g.drawCircle(0, 0.2, 1.5);
  g.drawRect(-1, 0.2, 2, 3.2);
  g.endFill();
  c.addChild(g);
  return c;
}

function buildStageNode(
  stage: StageDef,
  pos: MapPoint,
  opts: {
    unlocked: boolean;
    /** 普通难度星（主进度） */
    stars: number;
    /** 精英难度星（次要徽标；未解锁精英时为 0） */
    eliteStars: number;
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

  // 台面：已解锁显示关卡序号；未解锁放锁标（业界地图锁定态主信号）
  if (opts.unlocked) {
    const num = makeText(String(stage.index), {
      size: 18,
      fill: kind === 'active' ? 0xb5701f : 0x2f7a6b,
      bold: true,
      anchor: 0.5,
      strokeColor: 0xfff8ec,
      strokeWidth: 3,
    });
    num.position.set(0, -NODE_H * 0.42);
    wrap.addChild(num);
  } else {
    const lock = makeNodeLockIcon();
    lock.position.set(0, -NODE_H * 0.42);
    wrap.addChild(lock);
  }

  // 主星 = 普通难度（解锁链只认这套）
  const normalStarY = -NODE_H * 0.95 - NODE_STAR_SIZE * 0.15;
  if (opts.stars > 0) {
    const starLine = makeStarRow({
      star: opts.stars,
      maxStar: 3,
      style: 'sprite',
      starSize: NODE_STAR_SIZE,
      gap: NODE_STAR_GAP,
      anchor: 'center',
    });
    starLine.position.set(0, normalStarY);
    wrap.addChild(starLine);
  }

  // 文案层级：解锁 = 亮白主信息；锁定 = 深墨次信息（浅描边保可读，绝不同色同描边）
  const nameText = makeText(
    opts.unlocked ? `${stage.index}. ${stage.name}` : '未解锁',
    {
      size: FONT_SIZE.xxs,
      fill: opts.unlocked ? 0xffffff : 0x3a3228,
      strokeColor: opts.unlocked ? 0x2a3444 : 0xfff6e8,
      strokeWidth: opts.unlocked ? 3 : 2,
      bold: true,
      anchor: 0.5,
    },
  );
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
  } else if (
    opts.unlocked
    && opts.stars >= ELITE_MODE.unlockStars
    && hasEliteVariant(stage)
  ) {
    // 次要：精英角标 + 蓝星（进度独立，不替代普通主星）
    attachEliteProgress(wrap, opts.eliteStars, normalStarY);
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
    // 关卡节点不走 makeButton，原先只有 tap 无点击音
    pressFeedback(wrap);
  } else {
    wrap.eventMode = 'none';
  }

  return wrap;
}

/** 普通满 3 星后：节点上方叠「精英」短牌 + 蓝系小星 */
function attachEliteProgress(
  wrap: PIXI.Container,
  eliteStars: number,
  normalStarY: number,
): void {
  const row = new PIXI.Container();
  const badge = makeText('精英', {
    size: FONT_SIZE.xxs,
    fill: getStageType('elite').color,
    bold: true,
    anchor: [0, 0.5],
    strokeColor: 0x2a3444,
    strokeWidth: 2,
  });
  row.addChild(badge);

  const stars = makeStarRow({
    star: eliteStars,
    maxStar: 3,
    style: 'sprite',
    starSize: NODE_ELITE_STAR_SIZE,
    gap: NODE_ELITE_STAR_GAP,
    anchor: 'left',
  });
  // 点亮星改蓝，暗星保持灰
  for (const child of stars.children) {
    if (child instanceof PIXI.Sprite && child.alpha >= 0.9) {
      child.tint = ELITE_STAR_TINT;
    }
  }
  stars.position.set(badge.width + 4, 0);
  row.addChild(stars);

  const bounds = row.getLocalBounds();
  row.position.set(
    -bounds.width / 2 - bounds.x,
    normalStarY - NODE_STAR_SIZE * 0.55 - NODE_ELITE_STAR_SIZE * 0.5,
  );
  wrap.addChild(row);
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
    const tag = makeText('首领', {
      size: FONT_SIZE.xs, fill: 0xfff4c8, bold: true, anchor: 0.5,
      strokeColor: 0x8a5a18, strokeWidth: 4,
    });
    // 标在立绘右上，避免挡住宠脸
    tag.position.set(BOSS_PET_SIZE * 0.42, -BOSS_PET_SIZE * 0.78);
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
  const progressIdx = chapterMapActiveIndex(
    opts.stages,
    (id) => PlayerData.starsOf(id),
    (s) => PlayerData.isUnlocked(s),
  );
  const focusIdx = opts.focusStageId
    ? opts.stages.findIndex((s) => s.id === opts.focusStageId)
    : -1;
  const activeIdx = focusIdx >= 0 ? focusIdx : progressIdx;
  const progressChapter = playerProgressChapter(
    (id) => PlayerData.starsOf(id),
    (s) => PlayerData.isUnlocked(s),
  );
  const showProgressMarker = !editMode
    && activeIdx >= 0
    && (focusIdx >= 0 || progressChapter === opts.chapter)
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
  // 背景 cover 铺满逻辑屏；不要再叠 TOP_INSET，否则顶部露出 fallback 留白
  world.position.set(fit.offsetX, fit.offsetY);
  root.addChild(world);

  // 全章共用一张主包底图；未命中时回落 home，不留白
  const bgTex = TextureCache.get(chapterMapBg(opts.chapter))
    ?? TextureCache.get(BACKGROUND_IMAGES.home);
  if (bgTex) {
    layoutDesignBackground(world, bgTex, designW, designH);
  }

  // 节点/标记下移：至少留呼吸，并保证终点 Boss 头不钻进章匾
  const topNodeY = positions.reduce((min, p) => Math.min(min, p.y), designH);
  const nodeInset = chapterMapChromeInset({
    topNodeY,
    scale: fit.scale,
    offsetY: fit.offsetY,
    chromeBottom: opts.chromeBottom ?? 0,
    artRise: BOSS_PET_SIZE - BOSS_PET_OFFSET_Y,
    minInset: TITLE_MAP_NODE_TOP_INSET,
  });
  const designLayer = new PIXI.Container();
  designLayer.position.set(0, nodeInset / fit.scale);
  world.addChild(designLayer);

  const nodes: PIXI.Container[] = [];
  opts.stages.forEach((stage, i) => {
    const node = buildStageNode(stage, positions[i], {
      unlocked: PlayerData.isUnlocked(stage),
      stars: PlayerData.starsOf(stage.id),
      eliteStars: PlayerData.starsOf(eliteStageIdOf(stage.id)),
      active: i === activeIdx,
      onTap: () => opts.onStageTap(stage.id),
      scroll: opts.scroll,
      editMode,
    });
    nodes.push(node);
    designLayer.addChild(node);
  });

  let marker: PIXI.Container | null = null;
  const activePos = activeIdx >= 0 ? positions[activeIdx] : null;
  if (activePos && showProgressMarker) {
    marker = buildPlayerMarker(PlayerData.team[0]);
    marker.position.set(activePos.x + 44, activePos.y - 22);
    designLayer.addChild(marker);
  }

  return { world: root, designLayer, nodes, marker, activeIndex: activeIdx };
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
