/**
 * 底部四格导航（灵宠 / 召唤 / 商店 / 编队）— 首页与商店等子页共用。
 *
 * 选中态：图标略放大 + 金色标签，无光晕特效。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { SceneManager } from '@/core/SceneManager';
import { ECONOMY } from '@/balance/economy';
import { PlayerData } from '@/game/PlayerData';
import { UI_IMAGES } from '@/config/Assets';
import { COLORS } from './theme';
import { makeIconButton } from './IconButton';
import { bindPointerTap } from '@/utils/bindPointerTap';

export type BottomNavTab = 'codex' | 'gacha' | 'shop' | 'team';

/** 底栏占位高度（nav_bottom.png 750×275，按屏宽缩放后即为可见高度） */
export const BOTTOM_NAV_RESERVE = 275;

const NAV_ICON_SIZE = 82;
const NAV_ICON_ACTIVE_SIZE = 96;
const NAV_LABEL_SIZE = 26;
const NAV_ACTIVE_LIFT = -6;
/** 图标中心在底栏区域内的纵向位置（0=顶，1=底） */
const NAV_BTN_Y_IN_BAR = 0.54;

function makeBottomNavTab(opts: {
  iconPath: string;
  label: string;
  labelColor: number;
  isActive: boolean;
  onTap: () => void;
}): PIXI.Container {
  const root = new PIXI.Container();
  const iconSize = opts.isActive ? NAV_ICON_ACTIVE_SIZE : NAV_ICON_SIZE;
  const iconLift = opts.isActive ? NAV_ACTIVE_LIFT : 0;

  const btn = makeIconButton({
    iconPath: opts.iconPath,
    iconSize,
    label: opts.label,
    labelSize: NAV_LABEL_SIZE,
    labelColor: opts.labelColor,
    onTap: opts.onTap,
  });
  btn.position.set(0, iconLift);
  root.addChild(btn);

  root.eventMode = 'static';
  root.cursor = 'pointer';
  const hitSz = Math.max(iconSize, NAV_ICON_ACTIVE_SIZE) + 36;
  root.hitArea = new PIXI.Rectangle(-hitSz / 2, -hitSz / 2 + iconLift / 2, hitSz, hitSz);
  root.interactiveChildren = false;
  bindPointerTap(root, opts.onTap);
  return root;
}

export function buildBottomNav(
  parent: PIXI.Container,
  w: number,
  h: number,
  active?: BottomNavTab,
): void {
  const reserve = BOTTOM_NAV_RESERVE;
  const navTop = h - reserve;

  const navTex = TextureCache.get(UI_IMAGES.navBar);
  if (navTex) {
    const navBg = new PIXI.Sprite(navTex);
    navBg.anchor.set(0.5, 1);
    navBg.scale.set(w / navTex.width);
    navBg.position.set(w / 2, h);
    parent.addChild(navBg);
  } else {
    const barBg = new PIXI.Graphics();
    barBg.beginFill(COLORS.navBarFallback, 0.96);
    barBg.drawRect(0, navTop, w, reserve);
    barBg.endFill();
    parent.addChild(barBg);
  }

  const btnY = navTop + reserve * NAV_BTN_Y_IN_BAR;
  const canGacha = PlayerData.lingyu >= ECONOMY.gacha.singleCost;
  const slots: {
    tab: BottomNavTab;
    label: string;
    icon: string;
    x: number;
    highlight?: boolean;
    onTap: () => void;
  }[] = [
    {
      tab: 'codex', label: '灵宠', icon: UI_IMAGES.navPet, x: w * 0.125,
      onTap: () => { if (active !== 'codex') SceneManager.switchTo('codex'); },
    },
    {
      tab: 'gacha', label: '召唤', icon: UI_IMAGES.iconRecruit, x: w * 0.375,
      highlight: canGacha,
      onTap: () => { if (active !== 'gacha') SceneManager.switchTo('gacha'); },
    },
    {
      tab: 'shop', label: '商店', icon: UI_IMAGES.navShop, x: w * 0.625,
      onTap: () => { if (active !== 'shop') SceneManager.switchTo('shop'); },
    },
    {
      tab: 'team', label: '编队', icon: UI_IMAGES.navTeam, x: w * 0.875,
      onTap: () => { if (active !== 'team') SceneManager.switchTo('team'); },
    },
  ];

  for (const s of slots) {
    const isActive = s.tab === active;
    const btn = makeBottomNavTab({
      iconPath: s.icon,
      label: s.label,
      labelColor: isActive || s.highlight ? COLORS.navTextActive : COLORS.navText,
      isActive,
      onTap: s.onTap,
    });
    btn.position.set(s.x, btnY);
    parent.addChild(btn);
  }
}
