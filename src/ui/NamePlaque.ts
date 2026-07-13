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
   * 不传则按文字宽度 + 左右留白自适应，并夹在 minWidth~maxWidth。
   */
  width?: number;
  /** 自适应时下限，默认 200 */
  minWidth?: number;
  /** 自适应时上限，默认 520；banner 默认 560 */
  maxWidth?: number;
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
  innerRatio: number;
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
    height: 68,
    innerRatio: 0.68,
    sliceLr: 140,
    sliceTb: 18,
    defaultFill: COLORS.textTitle,
    defaultStroke: true,
    defaultMaxW: 520,
  },
  banner: {
    path: UI_IMAGES.textBanner,
    height: 88,
    innerRatio: 0.66,
    sliceLr: 120,
    sliceTb: 24,
    defaultFill: COLORS.battlePlaqueText,
    defaultStroke: false,
    defaultMaxW: 560,
  },
};

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

  const title = makeText(opts.text, {
    size: fontSize,
    fill,
    bold: true,
    anchor: 0.5,
    ...(useStroke
      ? { strokeColor: 0xfdf3df, strokeWidth: Math.max(3, Math.round(fontSize * 0.18)) }
      : {}),
  });
  try { title.updateText(true); } catch { /* noop */ }

  const padX = Math.max(48, Math.round(fontSize * 2.2));
  const minW = opts.minWidth ?? 200;
  const maxW = opts.maxWidth ?? style.defaultMaxW;
  let plaqueW = opts.width
    ?? Math.ceil(title.width + padX * 2);
  plaqueW = Math.max(minW, Math.min(maxW, plaqueW));

  const plaqueH = style.height;
  const innerMax = plaqueW * style.innerRatio;
  if (title.width > innerMax) {
    title.scale.set(innerMax / title.width);
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

  (root as PIXI.Container & { plaqueW: number; plaqueH: number }).plaqueW = plaqueW;
  (root as PIXI.Container & { plaqueW: number; plaqueH: number }).plaqueH = plaqueH;
  return root;
}

export type NamePlaqueView = PIXI.Container & { plaqueW: number; plaqueH: number };

/** 读取 makeNamePlaque 产物的匾宽（无则用 getBounds） */
export function namePlaqueWidth(view: PIXI.Container): number {
  const v = view as NamePlaqueView;
  if (typeof v.plaqueW === 'number') return v.plaqueW;
  return Math.ceil(view.getBounds().width);
}
