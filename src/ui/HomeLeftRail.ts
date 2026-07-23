/**
 * 首页左侧栏（对齐 home_layout_demo_b）
 *
 * 上组 = 副玩法（签到 / 通天塔 / 日常 / 活动）
 * 分隔线
 * 下组 = 平台福利（侧边栏 / 桌面，抖音必接）
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { EventBus } from '@/core/EventBus';
import { Platform } from '@/core/PlatformService';
import { SidebarService } from '@/core/SidebarService';
import { DesktopShortcutService } from '@/core/DesktopShortcutService';
import { PlayerData } from '@/game/PlayerData';
import { UI_IMAGES } from '@/config/Assets';
import { COLORS, FONT_SIZE } from './theme';
import { makePanel } from './Panel';
import { makeText } from './text';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { pressFeedback } from './motion';

export type HomeRailId = 'checkin' | 'tower' | 'daily' | 'event' | 'sidebar' | 'desktop';

export interface HomeRailItem {
  id: HomeRailId;
  label: string;
  /** 图标贴图路径；缺省走 glyph 占位 */
  iconPath?: string;
  /** 无贴图时的简字占位 */
  glyph: string;
  /** 框内图标绘制边长，默认与玩法钮一致 */
  iconSize?: number;
  badge?: boolean;
  /** 未实现时 Toast；实现后传 onTap */
  onTap?: () => void;
}

/** 副玩法入口；加玩法时往这里追加即可 */
export const DEFAULT_HOME_RAIL: readonly HomeRailItem[] = [
  { id: 'checkin', label: '签到', glyph: '签', iconPath: UI_IMAGES.railCheckin, badge: true },
  { id: 'tower', label: '通天塔', glyph: '塔', iconPath: UI_IMAGES.railTower },
  { id: 'daily', label: '日常', glyph: '常', iconPath: UI_IMAGES.railDaily },
  { id: 'event', label: '活动', glyph: '活', iconPath: UI_IMAGES.railEvent },
];

/** Demo B：分隔线下的平台福利入口 */
export function buildHomeWelfareRailItems(): HomeRailItem[] {
  const fromSidebar = SidebarService.isFromSidebar();
  const hasReward = fromSidebar && !PlayerData.sidebarRewardClaimedToday;
  const desktopAdded = !!DesktopShortcutService.status?.exist;
  return [
    {
      id: 'sidebar',
      label: '侧边栏',
      glyph: '侧',
      iconPath: UI_IMAGES.homeSidebar,
      iconSize: ICON_WELFARE,
      badge: hasReward,
      onTap: () => EventBus.emit('sidebar:open'),
    },
    {
      id: 'desktop',
      label: '桌面',
      glyph: '桌',
      iconPath: UI_IMAGES.homeDesktop,
      iconSize: ICON_WELFARE,
      badge: desktopAdded,
      onTap: () => EventBus.emit('desktop-shortcut:open'),
    },
  ];
}

/** 单钮边长（略小于旧 84，保证 6 钮 + 分隔不顶底栏） */
export const HOME_RAIL_BTN = 72;
const GAP = 12;
const LABEL_EXTRA = 16;
const ICON = 52;
/** 福利图标贴图主体偏瘦，略放大与玩法钮视觉对齐 */
const ICON_WELFARE = 60;
const STEP = HOME_RAIL_BTN + GAP + LABEL_EXTRA;
const DIVIDER_PAD = 10;

export function homeLeftRailHeight(playCount: number, welfareCount: number): number {
  const playH = playCount > 0 ? playCount * STEP - GAP : 0;
  if (welfareCount <= 0) return playH;
  const welfareH = welfareCount * STEP - GAP;
  return playH + DIVIDER_PAD * 2 + 2 + welfareH;
}

export function buildHomeLeftRail(
  parent: PIXI.Container,
  opts: {
    x: number;
    y: number;
    items?: readonly HomeRailItem[];
    /** 是否展示分隔线 + 侧边栏/桌面（抖音 / 开发者工具） */
    showWelfare?: boolean;
  },
): PIXI.Container {
  const root = new PIXI.Container();
  root.position.set(opts.x, opts.y);
  parent.addChild(root);

  const playItems = opts.items ?? DEFAULT_HOME_RAIL;
  let y = 0;
  for (const item of playItems) {
    const btn = makeRailButton(item);
    btn.position.set(0, y);
    root.addChild(btn);
    y += STEP;
  }

  const showWelfare = opts.showWelfare ?? false;
  if (showWelfare) {
    y += DIVIDER_PAD - GAP;
    root.addChild(makeRailDivider(y));
    y += DIVIDER_PAD + 2;

    for (const item of buildHomeWelfareRailItems()) {
      const btn = makeRailButton(item);
      btn.position.set(0, y);
      root.addChild(btn);
      y += STEP;
    }
  }

  return root;
}

function makeRailDivider(centerY: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const half = HOME_RAIL_BTN * 0.3;
  g.lineStyle(2, COLORS.panelBorder, 0.85);
  g.moveTo(-half, centerY);
  g.lineTo(half, centerY);
  // 两端小点，略收束
  g.lineStyle(0);
  g.beginFill(COLORS.accent, 0.9);
  g.drawCircle(-half, centerY, 2.5);
  g.drawCircle(half, centerY, 2.5);
  g.endFill();
  return g;
}

function makeRailButton(item: HomeRailItem): PIXI.Container {
  const root = new PIXI.Container();
  const btn = HOME_RAIL_BTN;

  root.addChild(makePanel({
    width: btn, height: btn, radius: 16,
    bg: COLORS.panelBg, bgAlpha: 0.96,
    border: COLORS.panelBorder, borderWidth: 2,
    centered: true,
  }));

  const iconSlot = new PIXI.Container();
  iconSlot.position.set(0, -2);
  root.addChild(iconSlot);
  mountRailIcon(iconSlot, item);

  const label = makeText(item.label, {
    size: FONT_SIZE.xs, fill: COLORS.textMain, bold: true, anchor: 0.5,
  });
  label.position.set(0, btn / 2 + 12);
  root.addChild(label);

  if (item.badge) {
    if (item.id === 'desktop') {
      // 已添加：小绿勾
      const badge = new PIXI.Graphics();
      badge.beginFill(0x3d9a5f, 1);
      badge.drawCircle(0, 0, 8);
      badge.endFill();
      badge.position.set(btn / 2 - 8, -btn / 2 + 8);
      root.addChild(badge);
      const tick = makeText('✓', {
        size: 10, fill: COLORS.textInverse, bold: true, anchor: 0.5,
      });
      tick.position.copyFrom(badge.position);
      root.addChild(tick);
    } else {
      const dot = new PIXI.Graphics();
      dot.beginFill(0xe85a4a, 1);
      dot.drawCircle(0, 0, 8);
      dot.endFill();
      dot.position.set(btn / 2 - 8, -btn / 2 + 8);
      root.addChild(dot);
    }
  }

  const onTap = item.onTap ?? (() => {
    const tip = item.id === 'tower'
      ? '通天塔即将开放（与主线关卡不同的爬塔玩法）'
      : `${item.label}即将开放`;
    Platform.showToast(tip);
  });

  root.eventMode = 'static';
  root.cursor = 'pointer';
  root.hitArea = new PIXI.Rectangle(-btn / 2 - 6, -btn / 2 - 6, btn + 12, btn + 32);
  root.interactiveChildren = false;
  bindPointerTap(root, onTap);
  pressFeedback(root);
  return root;
}

function mountRailIcon(slot: PIXI.Container, item: HomeRailItem): void {
  const drawSize = item.iconSize ?? ICON;
  const apply = (tex: PIXI.Texture) => {
    slot.removeChildren().forEach((c) => c.destroy());
    const icon = new PIXI.Sprite(tex);
    icon.anchor.set(0.5);
    icon.scale.set(drawSize / Math.max(tex.width, tex.height));
    slot.addChild(icon);
  };

  if (item.iconPath) {
    const cached = TextureCache.get(item.iconPath);
    if (cached) {
      apply(cached);
      return;
    }
    const glyph = makeText(item.glyph, {
      size: FONT_SIZE.md, fill: COLORS.textTitle, bold: true, anchor: 0.5,
    });
    slot.addChild(glyph);
    void TextureCache.load(item.iconPath).then((tex) => {
      if (!slot.destroyed) apply(tex);
    }).catch(() => null);
    return;
  }

  const glyph = makeText(item.glyph, {
    size: FONT_SIZE.md, fill: COLORS.textTitle, bold: true, anchor: 0.5,
  });
  slot.addChild(glyph);
}
