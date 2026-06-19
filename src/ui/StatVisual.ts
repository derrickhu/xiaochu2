/**
 * 三维 UI 组件 — 攻 / 血 / 复 统一引用 getStatUi() 配色。
 *
 * 单一真源：balance/petRoles.ts 的 STAT_UI；
 * 场景禁止再写 0x... 或裸字符串区分攻击/生命/回复。
 */
import * as PIXI from 'pixi.js';
import { getStatUi, type StatKey } from '@/balance/petRoles';
import { makePanel } from './Panel';
import { makeText } from './text';
import { COLORS, FONT_SIZE } from './theme';

export type StatLabelStyle = 'short' | 'long';

function statLabel(stat: StatKey, style: StatLabelStyle): string {
  const def = getStatUi(stat);
  return style === 'short' ? def.shortLabel : def.longLabel;
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
  labelStyle?: StatLabelStyle;
  valueFill?: number;
  /** 项间分隔（默认单空格） */
  separator?: string;
}

/** 紧凑三维行：「攻53 血290 复11」（不含碎片，碎片用 makeShardBadge 单独展示） */
export function makePetStatsLine(opts: PetStatsLineOpts): PIXI.Container {
  const size = opts.size ?? FONT_SIZE.xxs;
  const labelStyle = opts.labelStyle ?? 'short';
  const valueFill = opts.valueFill ?? COLORS.textMain;
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
