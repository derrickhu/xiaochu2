/**
 * 稀有度 UI 组件 — 灵宠页 / 编队页 / 详情等统一引用 getRarity() 配色。
 *
 * 单一真源：balance/rarity.ts 的 color + ui.badge*；
 * 场景禁止再写 0x... 区分 R/SR/SSR。
 */
import * as PIXI from 'pixi.js';
import { getRarity, type Rarity } from '@/balance/rarity';
import { COLORS, RADIUS } from './theme';
import { makePanel } from './Panel';
import { makeText } from './text';

export interface RarityBadgeOpts {
  tier: Rarity;
  /** xiao_chu 设计缩放 S = logicWidth / 375，默认 2 */
  scale?: number;
}

/** 品质印章（R / SR / SSR…） */
export function makeRarityBadge(opts: RarityBadgeOpts): PIXI.Container {
  const def = getRarity(opts.tier);
  const S = opts.scale ?? 2;
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
