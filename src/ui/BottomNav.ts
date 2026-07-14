/**
 * 底部五格导航：灵宠 | 召唤 | 主线 | 商店 | 编队
 *
 * 「主线」= 首页 TitleScene（章节地图），与左侧「通天塔」等副玩法不重叠。
 * 对齐截图/home_hub_v4：生成云形奶油板贴图 + 大号图标 + 选中金环光晕 + 奶油标签胶囊。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { SceneManager } from '@/core/SceneManager';
import { Game } from '@/core/Game';
import { ECONOMY } from '@/balance/economy';
import { PlayerData } from '@/game/PlayerData';
import { UI_IMAGES } from '@/config/Assets';
import { COLORS, FONT_SIZE } from './theme';
import { makeText } from './text';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { pressFeedback } from './motion';

export type BottomNavTab = 'codex' | 'gacha' | 'home' | 'shop' | 'team';

/**
 * 底栏占位高度（逻辑像素）。
 * 对齐云形奶油板贴图（约 750×216）+ 主线图标上浮破框余量。
 */
export const BOTTOM_NAV_RESERVE = 248;

/** 侧栏图标：对齐 v4 大号入口 */
const NAV_ICON_SIZE = 108;
/** 主线选中：更大并上浮破框 */
const NAV_ICON_ACTIVE_SIZE = 136;
const NAV_ACTIVE_LIFT = -18;
/** 图标中心在底栏内的相对位置（偏上，给标签留空） */
const NAV_BTN_Y_IN_BAR = 0.42;

function makeBottomNavTab(opts: {
  iconPath: string;
  label: string;
  isActive: boolean;
  highlight?: boolean;
  onTap: () => void;
}): PIXI.Container {
  const root = new PIXI.Container();
  const iconSize = opts.isActive ? NAV_ICON_ACTIVE_SIZE : NAV_ICON_SIZE;
  const iconLift = opts.isActive ? NAV_ACTIVE_LIFT : 0;

  // 选中：软金环光晕（对齐 v4）
  if (opts.isActive) {
    const halo = new PIXI.Graphics();
    halo.beginFill(0xf5d78a, 0.38);
    halo.drawCircle(0, iconLift - 4, iconSize * 0.74);
    halo.endFill();
    halo.lineStyle(4, 0xe8a33d, 0.95);
    halo.drawCircle(0, iconLift - 4, iconSize * 0.58);
    root.addChild(halo);
  }

  const tex = TextureCache.get(opts.iconPath);
  if (tex) {
    const icon = new PIXI.Sprite(tex);
    icon.anchor.set(0.5);
    icon.scale.set(iconSize / Math.max(tex.width, tex.height));
    icon.position.set(0, iconLift - 4);
    root.addChild(icon);
  }

  // 奶油标签胶囊 + 深棕字（更大，对齐 v4 可读性）
  const labelFill = opts.isActive || opts.highlight ? COLORS.navTextActive : COLORS.navText;
  const label = makeText(opts.label, {
    size: FONT_SIZE.xs, fill: labelFill, bold: true, anchor: 0.5,
  });
  try { label.updateText(true); } catch { /* noop */ }
  const pillW = Math.max(72, Math.ceil(label.width) + 28);
  const pillH = 32;
  const pillY = iconSize * 0.48 + iconLift + 8;
  const pill = new PIXI.Graphics();
  pill.beginFill(opts.isActive ? 0xffe6b0 : 0xfff8ec, 0.98);
  pill.lineStyle(2, opts.isActive ? 0xe8a33d : 0xd4b87a, 0.95);
  pill.drawRoundedRect(-pillW / 2, pillY - pillH / 2, pillW, pillH, pillH / 2);
  pill.endFill();
  root.addChild(pill);
  label.position.set(0, pillY);
  root.addChild(label);

  root.eventMode = 'static';
  root.cursor = 'pointer';
  const hitSz = Math.max(iconSize, NAV_ICON_ACTIVE_SIZE) + 48;
  root.hitArea = new PIXI.Rectangle(-hitSz / 2, -hitSz / 2 + iconLift / 2, hitSz, hitSz + 28);
  root.interactiveChildren = false;
  bindPointerTap(root, opts.onTap);
  pressFeedback(root);
  return root;
}

export function buildBottomNav(
  parent: PIXI.Container,
  w: number,
  h: number,
  active?: BottomNavTab,
): void {
  const reserve = BOTTOM_NAV_RESERVE;
  const lift = Math.min(Game.safeBottom, 28);
  const navTop = h - reserve;
  const btnY = navTop + reserve * NAV_BTN_Y_IN_BAR - lift * 0.25;

  const navTex = TextureCache.get(UI_IMAGES.navBar);
  // 云形奶油板：按宽铺满、保比例、底对齐；勿再拉伸成扁矩形盖住云边
  if (navTex && navTex.width > 0) {
    const plateH = Math.max(160, Math.round(w * (navTex.height / navTex.width)));
    const plateBottom = h - Math.max(0, lift - 4);
    // 仅安全区细缝用奶油托底，保留云形上沿透明剪影
    if (lift > 2) {
      const fill = new PIXI.Graphics();
      fill.beginFill(COLORS.navBarFallback, 0.98);
      fill.drawRect(0, plateBottom - 2, w, lift + 4);
      fill.endFill();
      parent.addChild(fill);
    }
    const navBg = new PIXI.Sprite(navTex);
    navBg.anchor.set(0.5, 1);
    navBg.width = w;
    navBg.height = plateH;
    navBg.position.set(w / 2, plateBottom);
    parent.addChild(navBg);
  } else {
    const fill = new PIXI.Graphics();
    fill.beginFill(COLORS.navBarFallback, 0.98);
    fill.drawRect(0, navTop, w, reserve + lift);
    fill.endFill();
    parent.addChild(fill);
  }

  const canGacha = PlayerData.lingyu >= ECONOMY.gacha.singleCost;
  const xs = [0.1, 0.3, 0.5, 0.7, 0.9].map((r) => w * r);
  const slots: {
    tab: BottomNavTab;
    label: string;
    icon: string;
    x: number;
    highlight?: boolean;
    onTap: () => void;
  }[] = [
    {
      tab: 'codex', label: '灵宠', icon: UI_IMAGES.navPet, x: xs[0],
      onTap: () => { if (active !== 'codex') SceneManager.switchTo('codex'); },
    },
    {
      tab: 'gacha', label: '召唤', icon: UI_IMAGES.iconRecruit, x: xs[1],
      highlight: canGacha,
      onTap: () => { if (active !== 'gacha') SceneManager.switchTo('gacha'); },
    },
    {
      tab: 'home', label: '主线', icon: UI_IMAGES.navHome, x: xs[2],
      onTap: () => { if (active !== 'home') SceneManager.switchTo('title'); },
    },
    {
      tab: 'shop', label: '商店', icon: UI_IMAGES.navShop, x: xs[3],
      onTap: () => { if (active !== 'shop') SceneManager.switchTo('shop'); },
    },
    {
      tab: 'team', label: '编队', icon: UI_IMAGES.navTeam, x: xs[4],
      onTap: () => { if (active !== 'team') SceneManager.switchTo('team'); },
    },
  ];

  for (const s of slots) {
    const isActive = s.tab === active;
    const btn = makeBottomNavTab({
      iconPath: s.icon,
      label: s.label,
      isActive,
      highlight: s.highlight,
      onTap: s.onTap,
    });
    btn.position.set(s.x, btnY);
    parent.addChild(btn);
  }
}
