/**
 * 战前编队 · 敌情 Intel
 *
 * 左：金框立绘（固定宽高、顶底贴齐外卡；contain 整只入框）；
 * 右：说明奶油板同高；波次 tab 在立绘下方。
 * 立绘区尺寸不随贴图变化——怪物图须统一 Q 版规格（见 docs/prompt/enemy_portrait_q_spec）。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { enemyImage } from '@/config/Assets';
import { counterElementOf, resistedElementOf, type Element } from '@/balance/combat';
import { resolveEncounter, type EnemyDef } from '@/balance/enemies';
import { formatEnemyBattleName } from '@/balance/enemyDisplay';
import { skillForEnemy } from '@/game/battle/SkillEngine';
import { enemyStats } from '@/formulas/growth';
import type { StageDef } from '@/balance/stages';
import { ELEMENT_NAME } from '@/balance/ui';
import type { SkillDef } from '@/balance/skills';
import {
  COLORS, FONT_SIZE,
  makeElementOrb, makePanel, makeSkillIcon, makeStatIcon, makeText,
} from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';

export interface TeamEnemyIntelHandle {
  root: PIXI.Container;
  height: number;
  setWave(index: number): void;
}

const PLATE_BG = 0xfff8ec;
const PLATE_BORDER = 0xd4b87a;
const FRAME_GOLD = 0xc9a063;
/** 立绘框固定宽（与说明区同高，不随贴图改尺寸） */
const PORTRAIT_W = 220;
/** 金线贴边 */
const FRAME_INSET = 2;
const FRAME_LINE = 2.2;
/** 外卡左右内边：左栏贴边，右侧说明略留缝 */
const OUTER_PAD_RIGHT = 10;
const COL_GAP = 12;
const TAB_H = 28;
const TAB_GAP = 6;
const TIP_GAP = 12;
const INFO_PAD = 12;

export function buildTeamEnemyIntelCard(opts: {
  stage: StageDef;
  width: number;
}): TeamEnemyIntelHandle {
  const { stage, width } = opts;
  const encounters = stage.encounters.map(resolveEncounter);
  const waveCount = Math.max(1, encounters.length);

  const root = new PIXI.Container();
  const tabsH = waveCount > 1 ? TAB_H + 8 : 0;
  const leftColW = PORTRAIT_W;
  const rightX = leftColW + COL_GAP;
  const infoInnerW = width - rightX - OUTER_PAD_RIGHT;

  const maxInfoH = Math.max(
    ...encounters.map((enc) => estimateInfoHeight(enc.def, stage, infoInnerW)),
    160,
  );
  /** 立绘框高度固定 = 外卡内容区高度（顶底贴齐说明区） */
  const bodyH = Math.max(PORTRAIT_W + 20, maxInfoH);
  const cardH = bodyH + tabsH;

  root.addChild(makePanel({
    width, height: cardH, radius: 16,
    bg: PLATE_BG, bgAlpha: 0.92,
    border: PLATE_BORDER, borderWidth: 1.5,
    centered: false,
  }));

  const portraitHost = new PIXI.Container();
  portraitHost.position.set(PORTRAIT_W / 2, bodyH / 2);
  root.addChild(portraitHost);

  const tabRow = new PIXI.Container();
  tabRow.position.set(8, bodyH + 4);
  root.addChild(tabRow);

  const infoPlate = makePanel({
    width: infoInnerW, height: bodyH - 4, radius: 14,
    bg: 0xfffdf8, bgAlpha: 0.98,
    border: PLATE_BORDER, borderWidth: 1.5,
    centered: false,
  });
  infoPlate.position.set(rightX, 2);
  root.addChild(infoPlate);

  const infoHost = new PIXI.Container();
  infoHost.position.set(rightX + INFO_PAD, 2 + INFO_PAD);
  root.addChild(infoHost);
  const infoContentW = infoInnerW - INFO_PAD * 2;

  let selected = 0;

  const paintPortrait = (def: EnemyDef): void => {
    portraitHost.removeChildren().forEach((c) => c.destroy({ children: true }));

    const iw = PORTRAIT_W - FRAME_INSET * 2;
    const ih = bodyH - FRAME_INSET * 2;
    portraitHost.addChild(makePanel({
      width: iw, height: ih, radius: 14,
      bg: 0xf5e8d0, bgAlpha: 1,
      border: FRAME_GOLD, borderWidth: 0,
      centered: true,
    }));

    const path = def.image ?? enemyImage(def.id);
    const tex = TextureCache.get(path);
    if (tex && tex.width > 0 && tex.height > 0) {
      const art = new PIXI.Container();
      const spr = new PIXI.Sprite(tex);
      // contain：整只入框；统一规格贴图时应铺满框面
      const fit = Math.min(iw / tex.width, ih / tex.height);
      spr.anchor.set(0.5);
      spr.scale.set(fit);
      spr.position.set(0, 0);
      art.addChild(spr);

      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      mask.drawRoundedRect(-iw / 2, -ih / 2, iw, ih, 14);
      mask.endFill();
      art.addChild(mask);
      art.mask = mask;
      portraitHost.addChild(art);
    }

    portraitHost.addChild(drawThinGoldFrame(PORTRAIT_W, bodyH));
  };

  const paintInfo = (def: EnemyDef): void => {
    infoHost.removeChildren().forEach((c) => c.destroy({ children: true }));
    let y = 0;

    const nameRow = new PIXI.Container();
    const name = makeText(formatEnemyBattleName(def), {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
      wordWrapWidth: infoContentW - 40,
    });
    name.position.set(0, 0);
    nameRow.addChild(name);
    const orb = makeElementOrb(def.element, 28);
    orb.position.set(Math.min(name.width + 14, infoContentW - 14), 0);
    nameRow.addChild(orb);
    nameRow.position.set(0, y + 10);
    infoHost.addChild(nameRow);
    y += 32;

    const stats = enemyStats(def, stage.chapter, stage.difficulty);
    const chipRow = buildStatChips(stats.hp, stats.atk, def.attackInterval, infoContentW);
    chipRow.position.set(0, y);
    infoHost.addChild(chipRow);
    y += 52;

    const skillIds = (def.skillIds ?? []).slice(0, 2);
    if (skillIds.length > 0) {
      const skillBox = buildSkillBox(skillIds, infoContentW);
      skillBox.position.set(0, y);
      infoHost.addChild(skillBox);
      y += skillBox.boxH + 10;
    }

    const weak = counterElementOf(def.element);
    const resist = resistedElementOf(def.element);
    const counterRow = buildCounterRow(weak, resist, infoContentW);
    counterRow.position.set(0, y);
    infoHost.addChild(counterRow);
    y += counterRow.rowH + TIP_GAP;

    const tip = stage.hintText
      ?? (stage.hintTags?.length ? `本关：${stage.hintTags.join(' · ')}` : null);
    if (tip) {
      const tipBlock = buildStageTip(tip.startsWith('本关') ? tip : `本关：${tip}`, infoContentW);
      tipBlock.position.set(0, y);
      infoHost.addChild(tipBlock);
    }
  };

  const paintTabs = (): void => {
    tabRow.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (waveCount <= 1) return;
    const tabW = Math.floor((PORTRAIT_W - (waveCount - 1) * TAB_GAP) / waveCount);
    for (let i = 0; i < waveCount; i++) {
      const active = i === selected;
      const tab = new PIXI.Container();
      tab.position.set(i * (tabW + TAB_GAP) + tabW / 2, TAB_H / 2);
      tab.addChild(makePanel({
        width: tabW, height: TAB_H, radius: TAB_H / 2,
        bg: active ? COLORS.btnSuccessBg : 0xfffdf8,
        bgAlpha: 0.98,
        border: active ? COLORS.btnSuccessBorder : PLATE_BORDER,
        borderWidth: 2,
        centered: true,
      }));
      tab.addChild(makeText(`${i + 1}/${waveCount}`, {
        size: FONT_SIZE.xxs,
        fill: active ? COLORS.btnText : COLORS.textMain,
        bold: true,
        anchor: 0.5,
      }));
      tab.eventMode = 'static';
      tab.cursor = 'pointer';
      tab.hitArea = new PIXI.Rectangle(-tabW / 2, -TAB_H / 2, tabW, TAB_H);
      tab.interactiveChildren = false;
      const idx = i;
      bindPointerTap(tab, () => handle.setWave(idx));
      tabRow.addChild(tab);
    }
  };

  const refresh = (): void => {
    const enc = encounters[selected] ?? encounters[0];
    paintPortrait(enc.def);
    paintInfo(enc.def);
    paintTabs();
  };

  const handle: TeamEnemyIntelHandle = {
    root,
    height: cardH,
    setWave(index: number) {
      if (index < 0 || index >= waveCount) return;
      selected = index;
      refresh();
    },
  };

  refresh();
  return handle;
}

/** 极薄金框：单层描边 + 轻角饰；高度与外卡同齐 */
function drawThinGoldFrame(w: number, h: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const hw = w / 2;
  const hh = h / 2;
  const r = 14;
  g.lineStyle(FRAME_LINE, FRAME_GOLD, 1);
  g.drawRoundedRect(-hw, -hh, w, h, r);
  const tick = 10;
  g.lineStyle(1.6, FRAME_GOLD, 0.9);
  const corners: [number, number, number, number][] = [
    [-hw + 5, -hh + 5, 1, 1],
    [hw - 5, -hh + 5, -1, 1],
    [-hw + 5, hh - 5, 1, -1],
    [hw - 5, hh - 5, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    g.moveTo(x, y + sy * tick);
    g.lineTo(x, y);
    g.lineTo(x + sx * tick, y);
  }
  return g;
}

function estimateInfoHeight(def: EnemyDef, stage: StageDef, contentW: number): number {
  void contentW;
  let y = INFO_PAD * 2 + 32 + 52;
  const skillIds = (def.skillIds ?? []).slice(0, 2);
  if (skillIds.length > 0) {
    y += skillBoxHeight(skillIds.length) + 10;
  }
  y += 34 + TIP_GAP;
  const tip = stage.hintText
    ?? (stage.hintTags?.length ? `本关：${stage.hintTags.join(' · ')}` : null);
  if (tip) y += 36;
  return Math.max(y, 160);
}

function skillBoxHeight(count: number): number {
  const iconSize = 44;
  const rowH = Math.max(52, iconSize + 8);
  const pad = 10;
  return pad * 2 + count * rowH + Math.max(0, count - 1) * 6;
}

function buildStatChips(hp: number, atk: number, interval: number, maxW: number): PIXI.Container {
  const row = new PIXI.Container();
  const gap = 6;
  const chipW = Math.floor((maxW - gap * 2) / 3);
  const chipH = 46;
  const items: { kind: 'hp' | 'atk' | 'turn'; label: string; value: string }[] = [
    { kind: 'hp', label: '生命', value: `${hp}` },
    { kind: 'atk', label: '攻击', value: `${atk}` },
    { kind: 'turn', label: `每${interval}回合`, value: '行动一次' },
  ];
  items.forEach((it, i) => {
    const chip = new PIXI.Container();
    chip.position.set(i * (chipW + gap), 0);
    chip.addChild(makePanel({
      width: chipW, height: chipH, radius: 10,
      bg: 0xfffdf8, bgAlpha: 0.98,
      border: PLATE_BORDER, borderWidth: 1,
      centered: false,
    }));
    if (it.kind === 'turn') {
      const hg = drawHourglass(11);
      hg.position.set(12, chipH / 2);
      chip.addChild(hg);
      const lab = makeText(it.label, {
        size: 12, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
      });
      lab.position.set(26, chipH / 2 - 8);
      const val = makeText(it.value, {
        size: 12, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
      });
      val.position.set(26, chipH / 2 + 9);
      chip.addChild(lab, val);
    } else {
      const icon = makeStatIcon(it.kind, 18);
      icon.position.set(12, chipH / 2);
      chip.addChild(icon);
      const lab = makeText(it.label, {
        size: 12, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
      });
      lab.position.set(26, chipH / 2 - 8);
      const val = makeText(it.value, {
        size: 14, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
      });
      val.position.set(26, chipH / 2 + 9);
      chip.addChild(lab, val);
    }
    row.addChild(chip);
  });
  return row;
}

interface CounterRow extends PIXI.Container {
  rowH: number;
}

function buildCounterRow(
  weak: Element,
  resist: Element,
  width: number,
): CounterRow {
  const row = new PIXI.Container() as CounterRow;
  const boxH = 34;
  const gap = 8;
  const chipW = Math.floor((width - gap) / 2);
  row.rowH = boxH;

  const place = (label: string, el: Element, x0: number): void => {
    const chip = new PIXI.Container();
    chip.position.set(x0, 0);
    chip.addChild(makePanel({
      width: chipW, height: boxH, radius: 10,
      bg: 0xf3e6c8, bgAlpha: 0.95,
      border: PLATE_BORDER, borderWidth: 1,
      centered: false,
    }));
    const t = makeText(label, {
      size: FONT_SIZE.xxs, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
    });
    t.position.set(10, boxH / 2);
    chip.addChild(t);
    const o = makeElementOrb(el, 22);
    o.position.set(10 + t.width + 14, boxH / 2);
    chip.addChild(o);
    const name = makeText(ELEMENT_NAME[el], {
      size: FONT_SIZE.xxs, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    });
    name.position.set(o.x + 16, boxH / 2);
    chip.addChild(name);
    row.addChild(chip);
  };
  place('克制', weak, 0);
  place('抵抗', resist, chipW + gap);
  return row;
}

interface SkillBox extends PIXI.Container {
  boxH: number;
}

function buildSkillBox(skillIds: readonly string[], width: number): SkillBox {
  const iconSize = 44;
  const rowH = Math.max(52, iconSize + 8);
  const pad = 10;
  const boxH = skillBoxHeight(skillIds.length);
  const box = new PIXI.Container() as SkillBox;
  box.boxH = boxH;
  box.addChild(makePanel({
    width, height: boxH, radius: 12,
    bg: 0xfff8ec, bgAlpha: 0.96,
    border: PLATE_BORDER, borderWidth: 1,
    centered: false,
  }));

  skillIds.forEach((id, i) => {
    const skill = skillForEnemy(id);
    const y = pad + i * (rowH + 6) + rowH / 2;

    const disc = new PIXI.Graphics();
    disc.beginFill(0x8b6914, 0.22);
    disc.drawCircle(0, 0, iconSize / 2 + 2);
    disc.endFill();
    disc.position.set(12 + iconSize / 2, y);
    box.addChild(disc);

    const icon = makeSkillIcon({
      skillId: id,
      size: iconSize,
      fallbackFill: 0xb8843c,
      fallbackGlyph: skill.name.charAt(0),
    });
    icon.position.set(12 + iconSize / 2, y);
    box.addChild(icon);

    const textX = 12 + iconSize + 12;
    const { title: titleStr, sub: subStr } = skillDisplayLines(skill);
    const title = makeText(titleStr, {
      size: FONT_SIZE.xxs, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
      wordWrapWidth: width - textX - 10,
    });
    title.position.set(textX, y - 10);
    box.addChild(title);
    const sub = makeText(subStr, {
      size: 12, fill: COLORS.textSub, anchor: [0, 0.5],
      wordWrapWidth: width - textX - 10,
    });
    sub.position.set(textX, y + 11);
    box.addChild(sub);

    if (i < skillIds.length - 1) {
      const line = new PIXI.Graphics();
      line.lineStyle(1, PLATE_BORDER, 0.55);
      const ly = pad + (i + 1) * (rowH + 6) - 3;
      line.moveTo(12, ly);
      line.lineTo(width - 12, ly);
      box.addChild(line);
    }
  });
  return box;
}

function buildStageTip(text: string, width: number): PIXI.Container {
  const c = new PIXI.Container();
  const line = new PIXI.Graphics();
  line.lineStyle(1.5, PLATE_BORDER, 0.75);
  line.moveTo(0, 0);
  line.lineTo(width, 0);
  c.addChild(line);

  const pine = drawPineMark(9);
  pine.position.set(10, 20);
  c.addChild(pine);

  const tipText = makeText(text, {
    size: FONT_SIZE.xxs, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    wordWrapWidth: width - 28,
  });
  tipText.position.set(22, 20);
  c.addChild(tipText);
  return c;
}

function skillDisplayLines(skill: SkillDef): { title: string; sub: string } {
  const effect = compactEnemySkillEffect(skill);
  const title = `${skill.name}：${effect}`;
  let sub = skill.desc;
  if (sub.includes(effect) || sub.length <= effect.length + 2) {
    const tag = skill.tags?.[0];
    sub = tag ? `${tag}类技能` : sub;
  }
  if (sub.length > 22) sub = `${sub.slice(0, 22)}…`;
  return { title, sub };
}

function compactEnemySkillEffect(skill: SkillDef): string {
  const e = skill.effects[0];
  if (e) {
    if (e.kind === 'status' && e.status === 'enemyDamageReduction'
      && typeof e.reduction === 'number' && typeof e.turns === 'number') {
      return `${e.turns}回合减伤${Math.round(e.reduction * 100)}%`;
    }
    if (e.kind === 'heal' && 'pct' in e && typeof e.pct === 'number') {
      return `回血${Math.round(e.pct * 100)}%`;
    }
    if (e.kind === 'charge' && 'multiplier' in e) {
      return `蓄力重击×${e.multiplier}`;
    }
    if (e.kind === 'sealOrbs' && 'count' in e) {
      return `封印${e.count}珠`;
    }
    if (e.kind === 'timeSqueeze' && 'seconds' in e && 'turns' in e) {
      return `${e.turns}回合限时-${e.seconds}秒`;
    }
    if (e.kind === 'healBlock' && 'mult' in e && 'turns' in e) {
      return `${e.turns}回合禁疗`;
    }
    if (e.kind === 'enrage' && 'atkMult' in e) {
      return `狂暴攻×${e.atkMult}`;
    }
    if (e.kind === 'skillSeal' && 'turns' in e) {
      return `封技${e.turns}回合`;
    }
    if (e.kind === 'dot' && 'turns' in e) {
      return `${e.turns}回合中毒`;
    }
  }
  return shortSkillLine(skill.desc);
}

function shortSkillLine(desc: string): string {
  const cut = desc.split(/[，,。；;]/)[0]?.trim() ?? desc;
  return cut.length > 14 ? `${cut.slice(0, 14)}…` : cut;
}

function drawHourglass(r: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.beginFill(0xb8843c, 1);
  g.moveTo(-r * 0.7, -r);
  g.lineTo(r * 0.7, -r);
  g.lineTo(r * 0.15, -r * 0.15);
  g.lineTo(r * 0.7, r);
  g.lineTo(-r * 0.7, r);
  g.lineTo(-r * 0.15, r * 0.15);
  g.closePath();
  g.endFill();
  return g;
}

function drawPineMark(r: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.beginFill(0x3d7a4a, 1);
  g.moveTo(0, -r);
  g.lineTo(r * 0.75, r * 0.15);
  g.lineTo(r * 0.28, r * 0.15);
  g.lineTo(r * 0.55, r * 0.85);
  g.lineTo(-r * 0.55, r * 0.85);
  g.lineTo(-r * 0.28, r * 0.15);
  g.lineTo(-r * 0.75, r * 0.15);
  g.closePath();
  g.endFill();
  g.beginFill(0x6b4a2a, 1);
  g.drawRect(-r * 0.12, r * 0.55, r * 0.24, r * 0.45);
  g.endFill();
  return g;
}
