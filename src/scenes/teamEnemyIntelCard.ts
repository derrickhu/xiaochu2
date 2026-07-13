/**
 * 战前编队 · 敌情 Intel（对齐 team_prep UI 截图）
 *
 * 一块淡奶油外板；左侧金框立绘「全图铺满」；右侧名/三维/技能图标/克制/提示。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { enemyImage } from '@/config/Assets';
import { counterElementOf, resistedElementOf } from '@/balance/combat';
import { resolveEncounter, type EnemyDef } from '@/balance/enemies';
import { formatEnemyBattleName } from '@/balance/enemyDisplay';
import { skillForEnemy } from '@/game/battle/SkillEngine';
import { enemyStats } from '@/formulas/growth';
import type { StageDef } from '@/balance/stages';
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
const FRAME_BORDER = 0xc9a063;
/** 立绘框：略竖，贴近 UI 左栏 */
const PORTRAIT_W = 248;
const PORTRAIT_H = 268;
const OUTER_PAD = 14;
const GAP = 16;
const TAB_H = 28;
const TAB_GAP = 6;

export function buildTeamEnemyIntelCard(opts: {
  stage: StageDef;
  width: number;
}): TeamEnemyIntelHandle {
  const { stage, width } = opts;
  const encounters = stage.encounters.map(resolveEncounter);
  const waveCount = Math.max(1, encounters.length);

  const root = new PIXI.Container();
  const tabsH = waveCount > 1 ? TAB_H + 8 : 0;
  const leftInnerH = PORTRAIT_H + tabsH;
  const cardH = Math.max(leftInnerH + OUTER_PAD * 2, 300);
  const leftColW = PORTRAIT_W;
  const rightX = OUTER_PAD + leftColW + GAP;
  const infoInnerW = width - rightX - OUTER_PAD;

  // 统一外板（对齐截图：一块奶油金边）
  root.addChild(makePanel({
    width, height: cardH, radius: 18,
    bg: PLATE_BG, bgAlpha: 0.97,
    border: PLATE_BORDER, borderWidth: 2.5,
    centered: false,
  }));

  const portraitHost = new PIXI.Container();
  portraitHost.position.set(OUTER_PAD + PORTRAIT_W / 2, OUTER_PAD + PORTRAIT_H / 2);
  root.addChild(portraitHost);

  const tabRow = new PIXI.Container();
  tabRow.position.set(OUTER_PAD, OUTER_PAD + PORTRAIT_H + 6);
  root.addChild(tabRow);

  const infoHost = new PIXI.Container();
  infoHost.position.set(rightX, OUTER_PAD);
  root.addChild(infoHost);

  let selected = 0;

  const paintPortrait = (def: EnemyDef): void => {
    portraitHost.removeChildren().forEach((c) => c.destroy({ children: true }));

    // 内底
    portraitHost.addChild(makePanel({
      width: PORTRAIT_W, height: PORTRAIT_H, radius: 14,
      bg: 0xf0e2c4, bgAlpha: 1,
      border: FRAME_BORDER, borderWidth: 3,
      centered: true,
    }));

    const path = def.image ?? enemyImage(def.id);
    const tex = TextureCache.get(path);
    if (tex) {
      const art = new PIXI.Container();
      const spr = new PIXI.Sprite(tex);
      spr.anchor.set(0.5);
      // 全图铺满边框（cover），不再缩小成战斗头像比例
      const inset = 6;
      const iw = PORTRAIT_W - inset * 2;
      const ih = PORTRAIT_H - inset * 2;
      const cover = Math.max(iw / tex.width, ih / tex.height);
      spr.scale.set(cover);
      art.addChild(spr);

      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      mask.drawRoundedRect(-iw / 2, -ih / 2, iw, ih, 10);
      mask.endFill();
      art.addChild(mask);
      art.mask = mask;
      portraitHost.addChild(art);
    }

    // 金边压在立绘之上，保证框线清晰
    const rim = new PIXI.Graphics();
    rim.lineStyle(3, FRAME_BORDER, 1);
    rim.drawRoundedRect(-PORTRAIT_W / 2, -PORTRAIT_H / 2, PORTRAIT_W, PORTRAIT_H, 14);
    portraitHost.addChild(rim);
  };

  const paintInfo = (def: EnemyDef): void => {
    infoHost.removeChildren().forEach((c) => c.destroy({ children: true }));
    let y = 2;

    const nameRow = new PIXI.Container();
    const name = makeText(formatEnemyBattleName(def), {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
      wordWrapWidth: infoInnerW - 40,
    });
    name.position.set(0, 0);
    nameRow.addChild(name);
    const orb = makeElementOrb(def.element, 28);
    orb.position.set(Math.min(name.width + 14, infoInnerW - 14), 0);
    nameRow.addChild(orb);
    nameRow.position.set(0, y + 10);
    infoHost.addChild(nameRow);
    y += 32;

    const stats = enemyStats(def, stage.chapter, stage.difficulty);
    const chipRow = buildStatChips(stats.hp, stats.atk, def.attackInterval, infoInnerW);
    chipRow.position.set(0, y);
    infoHost.addChild(chipRow);
    y += 52;

    const skillIds = (def.skillIds ?? []).slice(0, 2);
    if (skillIds.length > 0) {
      const skillBox = buildSkillBox(skillIds, infoInnerW);
      skillBox.position.set(0, y);
      infoHost.addChild(skillBox);
      y += skillBox.boxH + 8;
    }

    const weak = counterElementOf(def.element);
    const resist = resistedElementOf(def.element);
    const counterRow = buildCounterRow(weak, resist, infoInnerW);
    counterRow.position.set(0, y);
    infoHost.addChild(counterRow);
    y += 36;

    const tip = stage.hintText
      ?? (stage.hintTags?.length ? `本关：${stage.hintTags.join(' · ')}` : null);
    if (tip) {
      const tipBg = makePanel({
        width: infoInnerW, height: 34, radius: 10,
        bg: 0xf3e6c8, bgAlpha: 0.98,
        border: PLATE_BORDER, borderWidth: 1,
        centered: false,
      });
      tipBg.position.set(0, Math.min(y, cardH - OUTER_PAD - 36 - OUTER_PAD));
      infoHost.addChild(tipBg);
      const tipText = makeText(tip.startsWith('本关') ? tip : `本关：${tip}`, {
        size: FONT_SIZE.xxs, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
        wordWrapWidth: infoInnerW - 16,
      });
      tipText.position.set(10, 17);
      tipBg.addChild(tipText);
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

function buildCounterRow(
  weak: ReturnType<typeof counterElementOf>,
  resist: ReturnType<typeof resistedElementOf>,
  width: number,
): PIXI.Container {
  const row = new PIXI.Container();
  const gap = 8;
  const boxW = Math.floor((width - gap) / 2);
  const boxH = 32;

  const makeBox = (label: string, el: typeof weak, x: number): void => {
    const box = new PIXI.Container();
    box.position.set(x, 0);
    box.addChild(makePanel({
      width: boxW, height: boxH, radius: 10,
      bg: 0xfffdf8, bgAlpha: 0.98,
      border: PLATE_BORDER, borderWidth: 1,
      centered: false,
    }));
    const t = makeText(label, {
      size: FONT_SIZE.xxs, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
    });
    t.position.set(10, boxH / 2);
    box.addChild(t);
    const o = makeElementOrb(el, 22);
    o.position.set(boxW - 18, boxH / 2);
    box.addChild(o);
    row.addChild(box);
  };
  makeBox('克制', weak, 0);
  makeBox('抵抗', resist, boxW + gap);
  return row;
}

interface SkillBox extends PIXI.Container {
  boxH: number;
}

function buildSkillBox(skillIds: readonly string[], width: number): SkillBox {
  const iconSize = 40;
  const rowH = 48;
  const pad = 8;
  const boxH = pad * 2 + skillIds.length * rowH + Math.max(0, skillIds.length - 1) * 4;
  const box = new PIXI.Container() as SkillBox;
  box.boxH = boxH;
  box.addChild(makePanel({
    width, height: boxH, radius: 12,
    bg: 0xfffdf8, bgAlpha: 0.96,
    border: PLATE_BORDER, borderWidth: 1,
    centered: false,
  }));

  skillIds.forEach((id, i) => {
    const skill = skillForEnemy(id);
    const y = pad + i * (rowH + 4) + rowH / 2;
    const icon = makeSkillIcon({
      skillId: id,
      size: iconSize,
      fallbackFill: 0xb8843c,
      fallbackGlyph: skill.name.charAt(0),
    });
    icon.position.set(10 + iconSize / 2, y);
    box.addChild(icon);

    const textX = 10 + iconSize + 10;
    const short = shortSkillLine(skill.desc);
    const title = makeText(`${skill.name}：${short}`, {
      size: FONT_SIZE.xxs, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
      wordWrapWidth: width - textX - 8,
    });
    title.position.set(textX, y - 9);
    box.addChild(title);
    const sub = makeText(
      skill.desc.length > 22 ? `${skill.desc.slice(0, 22)}…` : skill.desc,
      { size: 12, fill: COLORS.textSub, anchor: [0, 0.5], wordWrapWidth: width - textX - 8 },
    );
    sub.position.set(textX, y + 10);
    box.addChild(sub);

    if (i < skillIds.length - 1) {
      const line = new PIXI.Graphics();
      line.lineStyle(1, PLATE_BORDER, 0.65);
      const ly = pad + (i + 1) * (rowH + 4) - 2;
      line.moveTo(10, ly);
      line.lineTo(width - 10, ly);
      box.addChild(line);
    }
  });
  return box;
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
