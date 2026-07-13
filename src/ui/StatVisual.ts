/**
 * 三维 UI 组件 — 攻 / 血 / 复 统一引用 getStatUi() 配色。
 *
 * 单一真源：balance/petRoles.ts 的 STAT_UI；
 * 图标贴图真源：UI_IMAGES.iconStatHp / Atk / Rcv（全局统一）。
 * 场景禁止再写 0x... 或裸字符串区分攻击/生命/回复。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { UI_IMAGES } from '@/config/Assets';
import { getGrowthUi, type GrowthUiVariant } from '@/balance/growth';
import { getStatUi, type StatKey } from '@/balance/petRoles';
import { makePanel } from './Panel';
import { makeText } from './text';
import { COLORS, FONT_SIZE } from './theme';

export type StatLabelStyle = 'short' | 'long';

function statLabel(stat: StatKey, style: StatLabelStyle): string {
  const def = getStatUi(stat);
  return style === 'short' ? def.shortLabel : def.longLabel;
}

const STAT_ICON_PATH: Readonly<Record<StatKey, string>> = {
  hp: UI_IMAGES.iconStatHp,
  atk: UI_IMAGES.iconStatAtk,
  rcv: UI_IMAGES.iconStatRcv,
};

/**
 * 属性小图标（详情 / 编队 / 总览等全局共用）。
 * 优先贴图；未加载时回退程序绘制。
 */
export function makeStatIcon(stat: StatKey, size = 28): PIXI.Container {
  const c = new PIXI.Container();
  const path = STAT_ICON_PATH[stat];
  const tex = TextureCache.get(path);
  if (tex) {
    const s = new PIXI.Sprite(tex);
    s.anchor.set(0.5);
    s.width = size;
    s.height = size;
    c.addChild(s);
  } else {
    const r = size * 0.48;
    if (stat === 'hp') drawFallbackHeart(c, r);
    else if (stat === 'atk') drawFallbackSword(c, r);
    else drawFallbackPlus(c, r);
  }
  c.hitArea = new PIXI.Rectangle(-size / 2, -size / 2, size, size);
  return c;
}

function drawFallbackHeart(parent: PIXI.Container, r: number): void {
  const g = new PIXI.Graphics();
  const lobeR = r * 0.5;
  const lobeX = r * 0.36;
  const lobeY = -r * 0.22;
  const tipY = r * 0.82;
  g.beginFill(0xe85a5a, 1);
  g.drawCircle(-lobeX, lobeY, lobeR);
  g.drawCircle(lobeX, lobeY, lobeR);
  g.moveTo(-lobeX - lobeR * 0.78, lobeY + lobeR * 0.1);
  g.quadraticCurveTo(-lobeX - lobeR * 0.15, lobeY + lobeR * 1.05, 0, tipY);
  g.quadraticCurveTo(lobeX + lobeR * 0.15, lobeY + lobeR * 1.05, lobeX + lobeR * 0.78, lobeY + lobeR * 0.1);
  g.closePath();
  g.endFill();
  parent.addChild(g);
}

function drawFallbackSword(parent: PIXI.Container, r: number): void {
  const blade = new PIXI.Graphics();
  blade.beginFill(0xf08a3a, 1);
  blade.moveTo(0, -r * 0.95);
  blade.lineTo(r * 0.14, -r * 0.2);
  blade.lineTo(r * 0.18, r * 0.28);
  blade.lineTo(-r * 0.18, r * 0.28);
  blade.lineTo(-r * 0.14, -r * 0.2);
  blade.closePath();
  blade.endFill();
  blade.beginFill(0xb85c20, 1);
  blade.drawRoundedRect(-r * 0.4, r * 0.22, r * 0.8, r * 0.14, 2);
  blade.endFill();
  blade.rotation = -Math.PI / 4;
  parent.addChild(blade);
}

function drawFallbackPlus(parent: PIXI.Container, r: number): void {
  const g = new PIXI.Graphics();
  g.beginFill(0x4caf70, 1);
  g.drawCircle(0, 0, r);
  g.endFill();
  g.beginFill(0xffffff, 1);
  const arm = r * 0.22;
  const len = r * 1.05;
  g.drawRoundedRect(-arm / 2, -len / 2, arm, len, arm * 0.4);
  g.drawRoundedRect(-len / 2, -arm / 2, len, arm, arm * 0.4);
  g.endFill();
  parent.addChild(g);
}

function appendStatSegment(
  cont: PIXI.Container,
  x: number,
  stat: StatKey,
  value: number | string,
  opts: {
    size: number;
    labelStyle: StatLabelStyle;
    valueFill: number;
    gapAfterLabel?: boolean;
  },
): number {
  const def = getStatUi(stat);
  const label = statLabel(stat, opts.labelStyle);
  const labelText = makeText(label, {
    size: opts.size, fill: def.color, bold: true, anchor: [0, 0.5],
  });
  labelText.position.set(x, 0);
  cont.addChild(labelText);
  x += labelText.width + (opts.gapAfterLabel ? 4 : 0);

  const valText = makeText(`${value}`, {
    size: opts.size, fill: opts.valueFill, bold: true, anchor: [0, 0.5],
  });
  valText.position.set(x, 0);
  cont.addChild(valText);
  return x + valText.width;
}

export interface PetStatsLineOpts {
  atk: number;
  hp: number;
  rcv: number;
  size?: number;
  /** xiao_chu 设计缩放 S = logicWidth / 375 */
  scale?: number;
  variant?: GrowthUiVariant;
  labelStyle?: StatLabelStyle;
  valueFill?: number;
  /** 项间分隔（默认单空格） */
  separator?: string;
}

function resolveStatSize(opts: { size?: number; scale?: number }): number {
  if (opts.size !== undefined) return opts.size;
  if (opts.scale !== undefined) return Math.round(8 * opts.scale);
  return FONT_SIZE.xxs;
}

/** 紧凑三维行：「攻53 血290 复11」（不含碎片，碎片用 makeShardBadge 单独展示） */
export function makePetStatsLine(opts: PetStatsLineOpts): PIXI.Container {
  const size = resolveStatSize(opts);
  const labelStyle = opts.labelStyle ?? 'short';
  const valueFill = opts.valueFill ?? getGrowthUi(opts.variant ?? 'panel').levelColor;
  const sep = opts.separator ?? ' ';
  const cont = new PIXI.Container();
  let x = 0;

  const stats: StatKey[] = ['atk', 'hp', 'rcv'];
  const values = [opts.atk, opts.hp, opts.rcv];
  for (let i = 0; i < stats.length; i++) {
    if (i > 0) {
      const gap = makeText(sep, { size, fill: valueFill, anchor: [0, 0.5] });
      gap.position.set(x, 0);
      cont.addChild(gap);
      x += gap.width;
    }
    x = appendStatSegment(cont, x, stats[i], values[i], {
      size, labelStyle, valueFill, gapAfterLabel: false,
    });
  }

  return cont;
}

export interface ShardBadgeOpts {
  shards: number;
  size?: number;
}

/** 升星碎片胶囊：置于头像下方，与战斗三维区分 */
export function makeShardBadge(opts: ShardBadgeOpts): PIXI.Container {
  const size = opts.size ?? 13;
  const cont = new PIXI.Container();

  const label = makeText('碎', { size, fill: COLORS.textSub, bold: true, anchor: [0, 0.5] });
  const val = makeText(`${opts.shards}`, {
    size, fill: COLORS.accentDeep, bold: true, anchor: [0, 0.5],
  });
  const innerW = label.width + 3 + val.width;
  const pillW = innerW + 12;
  const pillH = size + 8;

  cont.addChild(makePanel({
    width: pillW, height: pillH, radius: pillH / 2, centered: true,
    bg: COLORS.panelBgAlt, bgAlpha: 0.9,
    border: COLORS.panelBorderSoft, borderWidth: 1,
  }));
  label.position.set(-innerW / 2, 0);
  val.position.set(-innerW / 2 + label.width + 3, 0);
  cont.addChild(label, val);
  return cont;
}

export interface TeamStatsLineOpts {
  hp: number;
  atk: number;
  rcv: number;
  size?: number;
  valueFill?: number;
}

/** 队伍汇总：「生命 2676   攻击 489   回复 201」 */
export function makeTeamStatsLine(opts: TeamStatsLineOpts): PIXI.Container {
  const size = opts.size ?? FONT_SIZE.sm;
  const valueFill = opts.valueFill ?? COLORS.textMain;
  const cont = new PIXI.Container();
  let x = 0;
  const order: StatKey[] = ['hp', 'atk', 'rcv'];

  for (let i = 0; i < order.length; i++) {
    if (i > 0) {
      const gap = makeText('   ', { size, fill: valueFill, anchor: [0, 0.5] });
      gap.position.set(x, 0);
      cont.addChild(gap);
      x += gap.width;
    }
    x = appendStatSegment(cont, x, order[i], opts[order[i]], {
      size, labelStyle: 'long', valueFill, gapAfterLabel: true,
    });
  }

  return cont;
}

/** 单个三维片段（标签 + 数值），供其它组合行复用 */
export function makeStatSegment(
  stat: StatKey,
  value: number | string,
  opts: { size?: number; labelStyle?: StatLabelStyle; valueFill?: number } = {},
): PIXI.Container {
  const size = opts.size ?? FONT_SIZE.xxs;
  const cont = new PIXI.Container();
  appendStatSegment(cont, 0, stat, value, {
    size,
    labelStyle: opts.labelStyle ?? 'short',
    valueFill: opts.valueFill ?? COLORS.textMain,
    gapAfterLabel: false,
  });
  return cont;
}
