/**
 * 玩家货币顶栏：灵宠币 + 经验 + 灵玉，图标与数值同一行左对齐。
 *
 * 货币种类、图标路径、数值样式在此统一抽象，场景只传 amount，避免各页重复样式。
 */
import * as PIXI from 'pixi.js';
import { UI_IMAGES } from '@/config/Assets';
import { COLORS, FONT_SIZE } from './theme';
import { makeIconLabel, type IconLabelHandle } from './IconLabel';

/** 顶栏货币图标默认尺寸 */
export const CURRENCY_ICON_SIZE = 38;

/** 顶栏货币数值统一样式（三种货币一致） */
export const CURRENCY_VALUE_STYLE = {
  size: FONT_SIZE.md,
  fill: COLORS.textMain,
  bold: true,
} as const;

export type CurrencyKind = 'coin' | 'exp' | 'lingyu';

const CURRENCY_ICON: Readonly<Record<CurrencyKind, string>> = {
  coin: UI_IMAGES.iconCoin,
  exp: UI_IMAGES.iconExp,
  lingyu: UI_IMAGES.iconLingyu,
};

/** 单个货币：图标 + 数值 */
export function makeCurrencyLabel(
  kind: CurrencyKind,
  amount: number,
  iconSize: number = CURRENCY_ICON_SIZE,
): IconLabelHandle {
  return makeIconLabel({
    iconPath: CURRENCY_ICON[kind],
    iconSize,
    text: `${amount}`,
    ...CURRENCY_VALUE_STYLE,
  });
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
