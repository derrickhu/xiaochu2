/**
 * 名字 / 标题匾 — 全局统一名板组件。
 *
 * 贴图：
 * - title（默认）：UI_IMAGES.titlePlaque — 页面短匾
 * - banner：UI_IMAGES.textBanner — 与战斗关卡匾同源，大气横匾
 *
 * 用法：
 * - makeNamePlaque({ text: '星辉灵鹿' })
 * - makeNamePlaque({ text: '灵宠召唤', plate: 'banner', width: 520 })
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { UI_IMAGES } from '@/config/Assets';
import { COLORS, FONT_SIZE } from './theme';
import { makeText } from './text';

export type NamePlaqueSize = 'sm' | 'md' | 'lg' | 'xl';
export type NamePlaquePlate = 'title' | 'banner';

export interface NamePlaqueOpts {
  /** 匾上文字 */
  text: string;
  /**
   * 固定显示宽度（逻辑像素）。
   * 显式传入时不再被 defaultMaxW 悄悄夹窄（这是召唤页匾过窄的根因）。
   * 仍会按文字 + 花边留白自动抬到可读下限。
   */
  width?: number;
  /** 自适应时下限，默认 200 */
  minWidth?: number;
  /** 自适应时上限；显式 width 时仅在传入本字段时才封顶 */
  maxWidth?: number;
  /** 显示高度；不传则用底板默认高度 */
  height?: number;
  /** 字号档；默认 md */
  size?: NamePlaqueSize;
  /** 底板样式：title 短匾 / banner 战斗同源横匾 */
  plate?: NamePlaquePlate;
  /** 文字色；title 默认 textTitle，banner 默认 battlePlaqueText */
  fill?: number;
  /** 禁用态（章节未解锁等） */
  disabled?: boolean;
  /** 是否加文字描边；banner 默认 false（深棕墨字） */
  stroke?: boolean;
}

const SIZE_FONT: Record<NamePlaqueSize, number> = {
  sm: FONT_SIZE.sm,
  md: FONT_SIZE.md,
  lg: FONT_SIZE.lg,
  xl: FONT_SIZE.xl,
};

interface PlateStyle {
  path: string;
  height: number;
  /**
   * 九宫左右帽（含尖角花边）。title.png 平坦奶油约从 x=180 起，
   * 须把尖角段留在左右帽里，中段拉伸才是可读区。
   */
  sliceLr: number;
  sliceTb: number;
  defaultFill: number;
  defaultStroke: boolean;
  defaultMaxW: number;
}

const PLATE_STYLE: Record<NamePlaquePlate, PlateStyle> = {
  title: {
    path: UI_IMAGES.titlePlaque,
    // 显示高度须大于上下九宫帽之和，否则中段被挤没 → 看起来像「只有字没有匾」
    height: 100,
    // 贴图 640：平坦奶油约 180~460；左右帽含尖角花边
    sliceLr: 168,
    sliceTb: 22,
    defaultFill: COLORS.textTitle,
    defaultStroke: true,
    defaultMaxW: 720,
  },
  banner: {
    path: UI_IMAGES.textBanner,
    // 对齐战斗关卡匾 stageBannerH
    height: 88,
    // 贴图 768：尖角花边约 100px
    sliceLr: 100,
    sliceTb: 28,
    defaultFill: COLORS.battlePlaqueText,
    defaultStroke: false,
    defaultMaxW: 560,
  },
};

/**
 * 页面主标题匾（灵宠 / 召唤等）：title.png 短匾。
 */
export function makePageTitlePlaque(opts: {
  text: string;
  screenWidth: number;
  disabled?: boolean;
}): NamePlaqueView {
  const maxW = Math.min(640, opts.screenWidth - 90);
  const minW = Math.min(560, maxW);
  return makeNamePlaque({
    text: opts.text,
    plate: 'title',
    size: 'lg',
    height: 104,
    minWidth: minW,
    maxWidth: maxW,
    disabled: opts.disabled,
  }) as NamePlaqueView;
}

/**
 * 主线章节名匾 —— 战斗同源横匾（text_banner），整体略小于战斗关卡匾。
 * 深棕墨字、无描边；两侧预留箭头位，避免甩到签到栏。
 */
export function makeChapterTitlePlaque(opts: {
  text: string;
  screenWidth: number;
  disabled?: boolean;
}): NamePlaqueView {
  // 主页章节导航：框与字整体略收一档（相对战斗 520×88）
  const maxW = Math.min(420, opts.screenWidth - 220);
  const minW = Math.min(320, maxW);
  return makeNamePlaque({
    text: opts.text,
    plate: 'banner',
    size: 'sm',
    height: 72,
    minWidth: minW,
    maxWidth: maxW,
    disabled: opts.disabled,
  }) as NamePlaqueView;
}

function makeFallbackPlaque(w: number, h: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const r = h / 2;
  g.beginFill(0xf7ead0, 0.96);
  g.lineStyle(3, 0x8a5a32, 1);
  g.drawRoundedRect(-w / 2, -h / 2, w, h, r);
  g.endFill();
  const diamond = (dx: number) => {
    g.beginFill(0x6b4423, 0.9);
    g.moveTo(dx, -h * 0.18);
    g.lineTo(dx + h * 0.16, 0);
    g.lineTo(dx, h * 0.18);
    g.lineTo(dx - h * 0.16, 0);
    g.closePath();
    g.endFill();
  };
  diamond(-w / 2 + h * 0.55);
  diamond(w / 2 - h * 0.55);
  return g;
}

/**
 * 构建名字匾（底板 + 居中文字）。锚点在匾中心 (0,0)。
 */
export function makeNamePlaque(opts: NamePlaqueOpts): PIXI.Container {
  const root = new PIXI.Container();
  const plateKey = opts.plate ?? 'title';
  const style = PLATE_STYLE[plateKey];
  const sizeKey = opts.size ?? 'md';
  const fontSize = SIZE_FONT[sizeKey];
  const disabled = !!opts.disabled;
  const fill = opts.fill
    ?? (disabled ? COLORS.textDisabled : style.defaultFill);
  const useStroke = opts.stroke ?? style.defaultStroke;

  const strokeWidth = useStroke ? Math.max(3, Math.round(fontSize * 0.18)) : 0;
  const title = makeText(opts.text, {
    size: fontSize,
    fill,
    bold: true,
    anchor: 0.5,
    ...(useStroke
      ? { strokeColor: 0xfdf3df, strokeWidth }
      : {}),
  });
  try { title.updateText(true); } catch { /* noop */ }

  // 字两侧呼吸；描边外扩须计入「视觉字宽」
  const strokePad = strokeWidth;
  const edgePad = Math.max(16, Math.round(fontSize * 0.55));
  const visualTextW = title.width + strokePad * 2;
  // 中段（去掉左右花边帽）必须盖住视觉字宽 + 呼吸
  const needMiddle = Math.ceil(visualTextW + edgePad * 2);
  const fitForText = needMiddle + style.sliceLr * 2;

  let plaqueW: number;
  if (opts.width != null) {
    plaqueW = Math.max(opts.minWidth ?? 200, opts.width, fitForText);
    if (opts.maxWidth != null) plaqueW = Math.min(plaqueW, Math.max(opts.maxWidth, fitForText));
  } else {
    const maxW = opts.maxWidth ?? style.defaultMaxW;
    const minW = opts.minWidth ?? 200;
    // 宁可略超 maxW，也不把匾夹到字溢出花边（章节名常见）
    plaqueW = Math.max(minW, fitForText);
    if (plaqueW > maxW) {
      // 仅当显式 maxWidth 且仍不够时，才缩字（见下方 scale）
      plaqueW = maxW;
    }
  }

  const minPlaneW = style.sliceLr * 2 + 48;
  plaqueW = Math.max(plaqueW, minPlaneW);

  const plaqueH = opts.height ?? style.height;
  // 真实奶油中段（九宫左右帽之外）——字必须落在这段内
  const middleW = Math.max(48, plaqueW - style.sliceLr * 2);
  const textMax = Math.max(24, middleW - edgePad * 2);
  if (visualTextW > textMax) {
    title.scale.set(textMax / visualTextW);
  }

  const tex = TextureCache.get(style.path);
  if (tex) {
    const plane = new PIXI.NineSlicePlane(
      tex, style.sliceLr, style.sliceTb, style.sliceLr, style.sliceTb,
    );
    plane.width = plaqueW;
    plane.height = plaqueH;
    plane.pivot.set(plaqueW / 2, plaqueH / 2);
    if (disabled) plane.alpha = 0.55;
    root.addChild(plane);
  } else {
    const fb = makeFallbackPlaque(plaqueW, plaqueH);
    if (disabled) fb.alpha = 0.55;
    root.addChild(fb);
  }

  title.position.set(0, 0);
  root.addChild(title);

  const view = root as NamePlaqueView;
  view.plaqueW = plaqueW;
  view.plaqueH = plaqueH;
  // 奶油中段半宽（旧逻辑）；主线箭头改贴整匾外沿 tip
  view.middleHalfW = middleW / 2;
  view.outerHalfW = plaqueW / 2;
  return root;
}

export type NamePlaqueView = PIXI.Container & {
  plaqueW: number;
  plaqueH: number;
  /** 奶油可读中段半宽 */
  middleHalfW: number;
  /** 整匾（含尖角）半宽 —— 箭头贴此外沿（对齐 UI 图） */
  outerHalfW: number;
};

/** 读取 makeNamePlaque 产物的匾宽（无则用 getBounds） */
export function namePlaqueWidth(view: PIXI.Container): number {
  const v = view as NamePlaqueView;
  if (typeof v.plaqueW === 'number') return v.plaqueW;
  return Math.ceil(view.getBounds().width);
}

/** 奶油中段半宽 */
export function namePlaqueMiddleHalf(view: PIXI.Container): number {
  const v = view as NamePlaqueView;
  if (typeof v.middleHalfW === 'number') return v.middleHalfW;
  return namePlaqueWidth(view) * 0.28;
}

/** 整匾外沿半宽：章节箭头应紧贴尖角外侧 */
export function namePlaqueOuterHalf(view: PIXI.Container): number {
  const v = view as NamePlaqueView;
  if (typeof v.outerHalfW === 'number') return v.outerHalfW;
  return namePlaqueWidth(view) / 2;
}
