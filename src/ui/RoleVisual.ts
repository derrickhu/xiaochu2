/**
 * 定位 UI 组件 — 灵宠页 / 编队页 / 详情等统一引用 getPetRole() 配色。
 *
 * 单一真源：balance/petRoles.ts 的 color + ui.badge*；
 * 场景禁止再写 0x... 区分 输出/治疗/坦克/辅助。
 */
import * as PIXI from 'pixi.js';
import type { Element } from '@/balance/combat';
import { getPetRole, type PetRole } from '@/balance/petRoles';
import { getRarity, type Rarity } from '@/balance/rarity';
import { ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import { makePanel } from './Panel';
import { makeText } from './text';
import { FONT_SIZE } from './theme';

export interface RoleBadgeOpts {
  role: PetRole;
  /** xiao_chu 设计缩放 S = logicWidth / 375，默认 2 */
  scale?: number;
  /** 胶囊最大宽度（默认按文字自适应） */
  maxWidth?: number;
}

/** 定位胶囊（输出 / 治疗 / 坦克 / 辅助） */
export function makeRoleBadge(opts: RoleBadgeOpts): PIXI.Container {
  const def = getPetRole(opts.role);
  const S = opts.scale ?? 2;
  const pillH = 14 * S;
  const pillW = Math.min(
    opts.maxWidth ?? Infinity,
    def.name.length * 9 * S + 10 * S,
  );

  const cont = new PIXI.Container();
  cont.addChild(makePanel({
    width: pillW, height: pillH, radius: pillH / 2, centered: false,
    bg: def.ui.badgeBg, bgAlpha: 0.88,
    border: def.ui.badgeBorder, borderWidth: 1,
  }));
  const label = makeText(def.name, {
    size: Math.round(8.5 * S), fill: def.ui.badgeText, bold: true, anchor: 0.5,
    strokeColor: 0x2d180c, strokeWidth: Math.max(1, Math.round(1.5 * S)),
  });
  label.position.set(pillW / 2, pillH / 2);
  cont.addChild(label);
  return cont;
}

/** 一行：「金·输出」— 属性用 orb 色，定位用 role 色 */
export function makeElementRoleLine(
  element: Element,
  role: PetRole,
  opts: { size?: number } = {},
): PIXI.Container {
  const roleDef = getPetRole(role);
  const size = opts.size ?? FONT_SIZE.xxs;
  const cont = new PIXI.Container();
  const prefix = makeText(`${ELEMENT_NAME[element]}·`, {
    size, fill: ORB_COLOR[element], anchor: [0, 0.5],
  });
  cont.addChild(prefix);
  const roleText = makeText(roleDef.name, {
    size, fill: roleDef.color, bold: true, anchor: [0, 0.5],
  });
  roleText.position.set(prefix.width, 0);
  cont.addChild(roleText);
  return cont;
}

/** 行内定位文字（仅文字，无胶囊） */
export function makeRoleLabel(
  role: PetRole,
  opts: { size?: number; bold?: boolean } = {},
): PIXI.Text {
  const def = getPetRole(role);
  return makeText(def.name, {
    size: opts.size,
    fill: def.color,
    bold: opts.bold ?? true,
    anchor: [0, 0.5],
  });
}

/** 一行：「SSR · 金 · 输出」— 稀有度 / 属性 / 定位分色 */
export function makeRarityElementRoleLine(
  tier: Rarity,
  element: Element,
  role: PetRole,
  opts: { size?: number } = {},
): PIXI.Container {
  const rarityDef = getRarity(tier);
  const roleDef = getPetRole(role);
  const size = opts.size ?? FONT_SIZE.sm;
  const cont = new PIXI.Container();
  let x = 0;
  const append = (text: string, fill: number) => {
    const t = makeText(text, { size, fill, bold: true, anchor: [0, 0.5] });
    t.position.set(x, 0);
    cont.addChild(t);
    x += t.width;
  };
  append(`${rarityDef.code} · `, rarityDef.color);
  append(`${ELEMENT_NAME[element]} · `, ORB_COLOR[element]);
  append(roleDef.name, roleDef.color);
  return cont;
}
