/**
 * 名字 / 标题匾 — 全局统一名板组件。
 *
 * 贴图真源：UI_IMAGES.titlePlaque（images/ui/plaque/title.png）
 * 与宠物详情原型、灵宠池「灵宠」匾、章节名同一视觉语言。
 *
 * 用法：
 * - makeNamePlaque({ text: '星辉灵鹿' })           // 随文字自适应宽度
 * - makeNamePlaque({ text: '灵宠', width: 480 })  // 页面级固定宽匾
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { UI_IMAGES } from '@/config/Assets';
import { COLORS, FONT_SIZE } from './theme';
import { makeText } from './text';

export type NamePlaqueSize = 'sm' | 'md' | 'lg';

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
  /** 自适应时上限，默认 520 */
  maxWidth?: number;
  /** 字号档；默认 md */
  size?: NamePlaqueSize;
  /** 文字色，默认 textTitle */
  fill?: number;
  /** 禁用态（章节未解锁等） */
  disabled?: boolean;
  /** 是否加文字描边（浅底上更清晰），默认 true */
  stroke?: boolean;
}

const SIZE_FONT: Record<NamePlaqueSize, number> = {
  sm: FONT_SIZE.sm,
  md: FONT_SIZE.md,
  lg: FONT_SIZE.lg,
};

/** 匾面设计高度（逻辑像素）；贴图按此高度等比/九宫缩放 */
const PLAQUE_H = 56;
/** 文字相对匾宽的左右安全区比例（避开两端菱形装饰） */
const INNER_RATIO = 0.62;
/** 九宫左右帽（含透明边 + 菱形装饰），避免拉宽时菱形被扯扁 */
const SLICE_LR = 200;
const SLICE_TB = 44;

function makeFallbackPlaque(w: number, h: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const r = h / 2;
  g.beginFill(0xf7ead0, 0.96);
  g.lineStyle(3, 0x8a5a32, 1);
  g.drawRoundedRect(-w / 2, -h / 2, w, h, r);
  g.endFill();
  // 两端菱形装饰
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
  const sizeKey = opts.size ?? 'md';
  const fontSize = SIZE_FONT[sizeKey];
  const disabled = !!opts.disabled;
  const fill = opts.fill
    ?? (disabled ? COLORS.textDisabled : COLORS.textTitle);
  const useStroke = opts.stroke !== false;

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
  const maxW = opts.maxWidth ?? 520;
  let plaqueW = opts.width
    ?? Math.ceil(title.width + padX * 2);
  plaqueW = Math.max(minW, Math.min(maxW, plaqueW));

  // 文字不得超过匾面内侧（避开菱形装饰）
  const innerMax = plaqueW * INNER_RATIO;
  if (title.width > innerMax) {
    title.scale.set(innerMax / title.width);
  }

  const tex = TextureCache.get(UI_IMAGES.titlePlaque);
  if (tex) {
    // 九宫：两端装饰不变形，中间奶油区横向拉伸
    const plane = new PIXI.NineSlicePlane(tex, SLICE_LR, SLICE_TB, SLICE_LR, SLICE_TB);
    plane.width = plaqueW;
    plane.height = PLAQUE_H;
    plane.pivot.set(plaqueW / 2, PLAQUE_H / 2);
    if (disabled) plane.alpha = 0.55;
    root.addChild(plane);
  } else {
    const fb = makeFallbackPlaque(plaqueW, PLAQUE_H);
    if (disabled) fb.alpha = 0.55;
    root.addChild(fb);
  }

  title.position.set(0, 0);
  root.addChild(title);

  // 对外暴露方便布局（如章节箭头贴匾左右）
  (root as PIXI.Container & { plaqueW: number; plaqueH: number }).plaqueW = plaqueW;
  (root as PIXI.Container & { plaqueW: number; plaqueH: number }).plaqueH = PLAQUE_H;
  return root;
}

export type NamePlaqueView = PIXI.Container & { plaqueW: number; plaqueH: number };

/** 读取 makeNamePlaque 产物的匾宽（无则用 getBounds） */
export function namePlaqueWidth(view: PIXI.Container): number {
  const v = view as NamePlaqueView;
  if (typeof v.plaqueW === 'number') return v.plaqueW;
  return Math.ceil(view.getBounds().width);
}
