/**
 * 稀有度 UI 组件 — 灵宠页 / 编队页 / 商店等统一引用贴图角标。
 *
 * 优先读 rarity_r/sr/ssr/ur.png；缺图时回退雪碧图；再缺则程序绘制印章。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { UI_IMAGES, RARITY_BADGE_IMAGES } from '@/config/Assets';
import { getRarity, type Rarity } from '@/balance/rarity';
import { COLORS, RADIUS } from './theme';
import { makePanel } from './Panel';
import { makeText } from './text';

export interface RarityBadgeOpts {
  tier: Rarity;
  /** xiao_chu 设计缩放 S = logicWidth / 375，默认 2 */
  scale?: number;
  /** 直接指定角标显示高度（屏幕像素） */
  height?: number;
}

/** 角标高度 = 头像边长 × 此比例（商店/编队等横条） */
export const RARITY_BADGE_AVATAR_RATIO = 0.34;

/** 灵宠图鉴竖卡：角标略小于头像，中心对齐卡框左上角 */
export const RARITY_BADGE_CODEX_RATIO = 0.42;

/** 相对头像左上角的统一偏移（负值 = 略微伸出角外，列表/商店等） */
export const RARITY_BADGE_PAD = { x: -2, y: -2 } as const;

/** 灵宠卡角标：中心落在框角，右下半与框左上角重叠 */
export const RARITY_BADGE_CODEX_CORNER = 0.5;

/** 灵宠卡角标：在框角锚点基础上再右下移（屏幕像素） */
export const RARITY_BADGE_CODEX_OFFSET = { x: 6, y: 6 } as const;

const BADGE_TARGET_H = 28;

export type RarityBadgeVariant = 'default' | 'codex' | 'list';

export interface AttachRarityBadgeOpts {
  variant?: RarityBadgeVariant;
  /** 相对头像边长的比例 */
  ratio?: number;
  /** 直接指定高度（屏幕像素），优先于 ratio / variant */
  height?: number;
  minHeight?: number;
  padX?: number;
  padY?: number;
  /** 灵宠卡：角标中心对齐框角的重叠比例，默认 0.5 */
  cornerOverlap?: number;
}

/** 雪碧图各档 frame（与 rarity_sheet.png 拼接结果一致） */
const SHEET_FRAMES: Readonly<Record<Rarity, { x: number; w: number }>> = {
  1: { x: 0, w: 339 },
  2: { x: 339, w: 338 },
  3: { x: 677, w: 339 },
  4: { x: 1016, w: 337 },
};

function rarityBadgeTexture(tier: Rarity): PIXI.Texture | null {
  const single = TextureCache.get(RARITY_BADGE_IMAGES[tier]);
  if (single?.valid) return single;

  const sheet = TextureCache.get(UI_IMAGES.rarityBadgeSheet);
  if (!sheet?.valid) return null;
  const frame = SHEET_FRAMES[tier];
  return new PIXI.Texture(
    sheet.baseTexture,
    new PIXI.Rectangle(frame.x, 0, frame.w, sheet.height),
  );
}

function badgeDisplaySize(tier: Rarity, height: number): { w: number; h: number } {
  const tex = rarityBadgeTexture(tier);
  if (tex?.valid) {
    const scale = height / tex.height;
    return { w: tex.width * scale, h: height };
  }
  const def = getRarity(tier);
  const badgeH = height;
  const badgeW = Math.max(36, def.code.length * 10 + 6);
  return { w: badgeW, h: badgeH };
}

/** 品质角标（R / SR / SSR / UR） */
export function makeRarityBadge(opts: RarityBadgeOpts): PIXI.Container {
  const S = opts.scale ?? 2;
  const tex = rarityBadgeTexture(opts.tier);
  if (tex) {
    const cont = new PIXI.Container();
    const sp = new PIXI.Sprite(tex);
    const targetH = opts.height ?? BADGE_TARGET_H * (S / 2);
    sp.scale.set(targetH / tex.height);
    cont.addChild(sp);
    return cont;
  }

  const def = getRarity(opts.tier);
  const badgeH = 14 * S;
  const badgeW = Math.max(36, def.code.length * 10 * S + 6 * S);

  const cont = new PIXI.Container();
  cont.addChild(makePanel({
    width: badgeW, height: badgeH, radius: 3 * S, centered: false,
    bg: def.ui.badgeBg, bgAlpha: 0.92,
    border: def.ui.badgeBorder, borderWidth: 1,
  }));
  const label = makeText(def.code, {
    size: Math.round(10 * S), fill: def.ui.badgeText, bold: true, anchor: 0.5,
  });
  label.position.set(badgeW / 2, badgeH / 2);
  cont.addChild(label);
  return cont;
}

/** 按场景计算角标高度 */
export function rarityBadgeHeight(
  avatarSize: number,
  variant: RarityBadgeVariant = 'default',
): number {
  switch (variant) {
    case 'codex':
      return Math.max(38, Math.round(avatarSize * RARITY_BADGE_CODEX_RATIO));
    case 'list':
      return Math.max(24, Math.round(avatarSize * RARITY_BADGE_AVATAR_RATIO));
    default:
      return Math.max(18, Math.round(avatarSize * RARITY_BADGE_AVATAR_RATIO));
  }
}

/**
 * 在头像左上角挂载角标（全局统一位置与比例）。
 * @param avatarLeft 头像区域左边缘 x
 * @param avatarTop 头像区域上边缘 y
 */
export function attachRarityBadge(
  parent: PIXI.Container,
  tier: Rarity,
  avatarLeft: number,
  avatarTop: number,
  avatarSize: number,
  opts?: AttachRarityBadgeOpts,
): PIXI.Container {
  const variant = opts?.variant ?? 'default';
  const ratio = opts?.ratio ?? (variant === 'codex' ? RARITY_BADGE_CODEX_RATIO : RARITY_BADGE_AVATAR_RATIO);
  const minH = opts?.minHeight ?? 18;
  const h = opts?.height ?? Math.max(minH, Math.round(avatarSize * ratio));
  const padX = opts?.padX ?? RARITY_BADGE_PAD.x;
  const padY = opts?.padY ?? RARITY_BADGE_PAD.y;
  const badge = makeRarityBadge({ tier, height: h });
  if (variant === 'codex') {
    const { w: bw, h: bh } = badgeDisplaySize(tier, h);
    const corner = opts?.cornerOverlap ?? RARITY_BADGE_CODEX_CORNER;
    const off = RARITY_BADGE_CODEX_OFFSET;
    badge.position.set(
      avatarLeft - bw * corner + off.x + (opts?.padX ?? 0),
      avatarTop - bh * corner + off.y + (opts?.padY ?? 0),
    );
  } else {
    badge.position.set(avatarLeft + padX, avatarTop + padY);
  }
  parent.addChild(badge);
  return badge;
}

export interface RarityCardBorderOpts {
  width: number;
  height: number;
  tier: Rarity;
  radius?: number;
  /** true = 以 (0,0) 为中心；false = 左上为 (0,0) */
  centered?: boolean;
  borderWidth?: number;
}

/** 卡外描边（颜色 = 稀有度 accent） */
export function makeRarityCardBorder(opts: RarityCardBorderOpts): PIXI.Graphics {
  const {
    width, height, tier,
    radius = RADIUS.card,
    centered = true,
    borderWidth = 3,
  } = opts;
  const def = getRarity(tier);
  const g = new PIXI.Graphics();
  g.lineStyle(borderWidth, def.color, 1);
  const x = centered ? -width / 2 : 0;
  const y = centered ? -height / 2 : 0;
  g.drawRoundedRect(x, y, width, height, radius);
  return g;
}

/** 一行标题：「SR 灵宠名」— 码用稀有色，名用正文色 */
export function makeRarityNameLine(
  tier: Rarity,
  name: string,
  opts: { size?: number; nameFill?: number } = {},
): PIXI.Container {
  const def = getRarity(tier);
  const cont = new PIXI.Container();
  const code = makeText(`${def.code} `, {
    size: opts.size, fill: def.color, bold: true, anchor: [0, 0.5],
  });
  cont.addChild(code);
  const nameText = makeText(name, {
    size: opts.size, fill: opts.nameFill ?? COLORS.textMain, bold: true, anchor: [0, 0.5],
  });
  nameText.position.set(code.width, 0);
  cont.addChild(nameText);
  return cont;
}
