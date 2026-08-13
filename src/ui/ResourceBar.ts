/**
 * 玩家货币顶栏：灵宠币 + 经验 + 灵玉，图标与数值同一行左对齐。
 *
 * 货币种类、图标路径、数值样式在此统一抽象，场景只传 amount，避免各页重复样式。
 */
import * as PIXI from 'pixi.js';
import { UI_IMAGES } from '@/config/Assets';
import { COLORS, FONT_SIZE } from './theme';
import { makeIconLabel, type IconLabelHandle } from './IconLabel';
import { pressFeedback } from './motion';
import { bindPointerTap } from '@/utils/bindPointerTap';

/** 顶栏货币图标默认尺寸 */
export const CURRENCY_ICON_SIZE = 38;

/** 顶栏货币数值统一样式（三种货币一致） */
export const CURRENCY_VALUE_STYLE = {
  size: FONT_SIZE.md,
  fill: COLORS.textMain,
  bold: true,
} as const;

export type CurrencyKind = 'coin' | 'exp' | 'lingyu' | 'stamina';

const CURRENCY_ICON: Readonly<Record<CurrencyKind, string>> = {
  coin: UI_IMAGES.iconCoin,
  exp: UI_IMAGES.iconExp,
  lingyu: UI_IMAGES.iconLingyu,
  stamina: UI_IMAGES.iconStamina,
};

/**
 * 单个货币：图标 + 数值。
 * @param text 覆盖数值文案（体力要显示 `当前/上限`，不是单个数）
 */
export function makeCurrencyLabel(
  kind: CurrencyKind,
  amount: number,
  iconSize: number = CURRENCY_ICON_SIZE,
  text?: string,
): IconLabelHandle {
  return makeIconLabel({
    iconPath: CURRENCY_ICON[kind],
    iconSize,
    text: text ?? `${amount}`,
    ...CURRENCY_VALUE_STYLE,
  });
}

/** 主页货币胶囊（方案 A）：双线金边 + 右沿金玉「+」 */
export const CURRENCY_CHIP_H = 38;
export const CURRENCY_PLUS_R = 11;

function drawCurrencyChipFrame(w: number, h: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const r = h / 2;
  // 奶油半透底
  g.beginFill(COLORS.panelBg, 0.94);
  g.drawRoundedRect(0, -h / 2, w, h, r);
  g.endFill();
  // 外金边
  g.lineStyle(2.4, COLORS.panelBorder, 1);
  g.drawRoundedRect(0.5, -h / 2 + 0.5, w - 1, h - 1, r - 0.5);
  // 内浅金边（双线，对齐原型）
  g.lineStyle(1.2, COLORS.panelBorderSoft, 0.95);
  g.drawRoundedRect(3.5, -h / 2 + 3.5, w - 7, h - 7, Math.max(4, r - 3.5));
  // 上下中点内凹小阶，对齐原型边框细节
  const cx = w / 2;
  const notch = (y: number, dir: number) => {
    g.lineStyle(1.8, COLORS.panelBorder, 1);
    g.moveTo(cx - 7, y);
    g.lineTo(cx - 3, y + 3.2 * dir);
    g.lineTo(cx + 3, y + 3.2 * dir);
    g.lineTo(cx + 7, y);
  };
  notch(-h / 2 + 1.2, 1);
  notch(h / 2 - 1.2, -1);
  return g;
}

export function makeCurrencyPlusBadge(r: number = CURRENCY_PLUS_R): PIXI.Container {
  const badge = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.beginFill(COLORS.accent, 1);
  g.lineStyle(1.6, 0xf6e0a8, 1);
  g.drawCircle(0, 0, r);
  g.endFill();
  g.lineStyle(1, COLORS.accentDeep, 0.55);
  g.drawCircle(0, 0, r - 2.2);
  g.lineStyle(2.3, 0xffffff, 1);
  const arm = Math.max(4, r - 5);
  g.moveTo(-arm, 0);
  g.lineTo(arm, 0);
  g.moveTo(0, -arm);
  g.lineTo(0, arm);
  badge.addChild(g);
  return badge;
}

/**
 * 主页货币胶囊：图标 + 数值 + 右沿金玉加号（整块可点，打开获取途径）。
 * 原点在左缘垂直中心，便于顶栏横排。
 */
export function makeCurrencySourceChip(opts: {
  kind: CurrencyKind;
  amount: number;
  text?: string;
  onTap: () => void;
}): PIXI.Container {
  const h = CURRENCY_CHIP_H;
  const iconSize = 30;
  const padL = 8;
  const padR = 6;
  const gap = 6;
  const plusR = CURRENCY_PLUS_R;

  const label = makeCurrencyLabel(opts.kind, opts.amount, iconSize, opts.text);

  const plus = makeCurrencyPlusBadge(plusR);
  const contentW = Math.ceil(label.width);
  const w = Math.max(108, padL + contentW + gap + plusR * 2 + padR);

  const root = new PIXI.Container();
  root.addChild(drawCurrencyChipFrame(w, h));
  label.position.set(padL, 0);
  root.addChild(label);
  // 「+」嵌在右端圆帽内，不悬空
  plus.position.set(w - padR - plusR, 0);
  root.addChild(plus);

  root.eventMode = 'static';
  root.cursor = 'pointer';
  root.hitArea = new PIXI.Rectangle(0, -h / 2, w, h);
  pressFeedback(root);
  bindPointerTap(root, opts.onTap);
  return root;
}

/**
 * @deprecated 主页请用 makeCurrencySourceChip；保留以免旧调用崩。
 */
export function withCurrencyPlus(
  label: PIXI.Container,
  onTap: () => void,
): PIXI.Container {
  const root = new PIXI.Container();
  root.addChild(label);
  const r = CURRENCY_PLUS_R;
  const gap = 4;
  const plus = makeCurrencyPlusBadge(r);
  plus.position.set(label.width + gap + r, 0);
  root.addChild(plus);
  const w = label.width + gap + r * 2;
  const h = Math.max(36, r * 2 + 8);
  root.eventMode = 'static';
  root.cursor = 'pointer';
  root.hitArea = new PIXI.Rectangle(0, -h / 2, w, h);
  pressFeedback(root);
  bindPointerTap(root, onTap);
  return root;
}

export interface CurrencyRowOpts {
  x: number;
  y: number;
  coins: number;
  exp: number;
  lingyu: number;
  iconSize?: number;
  gap?: number;
}

/** 主页/通用顶栏：三种货币并排展示 */
export function makeCurrencyRow(opts: CurrencyRowOpts): PIXI.Container {
  const iconSize = opts.iconSize ?? CURRENCY_ICON_SIZE;
  const gap = opts.gap ?? 28;
  const row = new PIXI.Container();
  row.position.set(opts.x, opts.y);

  const items: IconLabelHandle[] = [
    makeCurrencyLabel('coin', opts.coins, iconSize),
    makeCurrencyLabel('exp', opts.exp, iconSize),
    makeCurrencyLabel('lingyu', opts.lingyu, iconSize),
  ];

  let x = 0;
  for (const item of items) {
    item.position.set(x, 0);
    row.addChild(item);
    x += item.width + gap;
  }
  return row;
}
