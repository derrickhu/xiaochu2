/**
 * 首页左侧可扩展玩法栏（对齐 home_hub_ui_prototype_v3）
 *
 * 与底栏「主线」分工：
 * - 主线 = 章节关卡地图（本页中心）
 * - 本栏 = 副玩法入口（签到 / 通天塔 / 日常 / 活动…），后续可继续往下加
 */
import * as PIXI from 'pixi.js';
import { Platform } from '@/core/PlatformService';
import { COLORS, FONT_SIZE, RADIUS } from './theme';
import { makePanel } from './Panel';
import { makeText } from './text';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { pressFeedback } from './motion';

export type HomeRailId = 'checkin' | 'tower' | 'daily' | 'event';

export interface HomeRailItem {
  id: HomeRailId;
  label: string;
  /** 简字占位（正式图标后续替换） */
  glyph: string;
  badge?: boolean;
  /** 未实现时 Toast；实现后传 onTap */
  onTap?: () => void;
}

/** 默认可扩展列表；加玩法时往这里追加即可 */
export const DEFAULT_HOME_RAIL: readonly HomeRailItem[] = [
  { id: 'checkin', label: '签到', glyph: '签', badge: true },
  { id: 'tower', label: '通天塔', glyph: '塔' },
  { id: 'daily', label: '日常', glyph: '常' },
  { id: 'event', label: '活动', glyph: '活' },
];

const BTN = 64;
const GAP = 14;
const LABEL_GAP = 4;

export function buildHomeLeftRail(
  parent: PIXI.Container,
  opts: {
    x: number;
    y: number;
    items?: readonly HomeRailItem[];
  },
): PIXI.Container {
  const root = new PIXI.Container();
  root.position.set(opts.x, opts.y);
  parent.addChild(root);

  const items = opts.items ?? DEFAULT_HOME_RAIL;
  items.forEach((item, i) => {
    const btn = makeRailButton(item);
    btn.position.set(0, i * (BTN + GAP + 18));
    root.addChild(btn);
  });

  return root;
}

function makeRailButton(item: HomeRailItem): PIXI.Container {
  const root = new PIXI.Container();

  const disc = makePanel({
    width: BTN, height: BTN, radius: RADIUS.button,
    bg: COLORS.panelBg, bgAlpha: 0.94,
    border: COLORS.panelBorder, borderWidth: 2,
    centered: true,
  });
  root.addChild(disc);

  const glyph = makeText(item.glyph, {
    size: FONT_SIZE.lg, fill: COLORS.textTitle, bold: true, anchor: 0.5,
  });
  glyph.position.set(0, -2);
  root.addChild(glyph);

  const label = makeText(item.label, {
    size: FONT_SIZE.xxs, fill: COLORS.textMain, bold: true, anchor: 0.5,
  });
  label.position.set(0, BTN / 2 + LABEL_GAP + 8);
  root.addChild(label);

  if (item.badge) {
    const dot = new PIXI.Graphics();
    dot.beginFill(0xe85a4a, 1);
    dot.drawCircle(0, 0, 7);
    dot.endFill();
    dot.position.set(BTN / 2 - 8, -BTN / 2 + 8);
    root.addChild(dot);
  }

  const onTap = item.onTap ?? (() => {
    const tip = item.id === 'tower'
      ? '通天塔即将开放（与主线关卡不同的爬塔玩法）'
      : `${item.label}即将开放`;
    Platform.showToast(tip);
  });

  root.eventMode = 'static';
  root.cursor = 'pointer';
  root.hitArea = new PIXI.Rectangle(-BTN / 2 - 4, -BTN / 2 - 4, BTN + 8, BTN + 28);
  root.interactiveChildren = false;
  bindPointerTap(root, onTap);
  pressFeedback(root);
  return root;
}
