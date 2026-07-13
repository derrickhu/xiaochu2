/**
 * 战前编队 · 敌情 Intel Card（对齐 team_prep_ui_prototype_v1）
 *
 * 左：大立绘 + 波次 Tab；右：名/三维/技能/克制抵抗/本关提示。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { enemyImage } from '@/config/Assets';
import { counterElementOf, resistedElementOf } from '@/balance/combat';
import { resolveEncounter, type EnemyDef } from '@/balance/enemies';
import {
  enemyDisplayTierOf,
  enemySpriteScale,
  formatEnemyBattleName,
} from '@/balance/enemyDisplay';
import { skillForEnemy } from '@/game/battle/SkillEngine';
import { enemyStats } from '@/formulas/growth';
import type { StageDef } from '@/balance/stages';
import {
  COLORS, FONT_SIZE, RADIUS,
  makeElementOrb, makePanel, makeSkillIcon, makeStatIcon, makeText,
} from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';

export interface TeamEnemyIntelHandle {
  root: PIXI.Container;
  /** 卡片总高度 */
  height: number;
  setWave(index: number): void;
}

const PORTRAIT = 200;
const CARD_PAD = 16;
const TAB_H = 32;
const TAB_GAP = 8;

export function buildTeamEnemyIntelCard(opts: {
  stage: StageDef;
  width: number;
}): TeamEnemyIntelHandle {
  const { stage, width } = opts;
  const encounters = stage.encounters.map(resolveEncounter);
  const waveCount = Math.max(1, encounters.length);

  const root = new PIXI.Container();
  const contentH = CARD_PAD + PORTRAIT + 12 + (waveCount > 1 ? TAB_H : 0) + CARD_PAD;
  // 右栏内容通常更高：名+chip+技能+克制+tip ≈ 280+；与左栏取 max
  const cardH = Math.max(contentH, 300);

  root.addChild(makePanel({
    width, height: cardH, radius: RADIUS.card,
    bg: COLORS.panelBgAlt, bgAlpha: 0.94,
    border: COLORS.panelBorderSoft, borderWidth: 2,
    centered: false,
  }));

  const leftX = CARD_PAD;
  const rightX = CARD_PAD + PORTRAIT + 16;
  const rightW = width - rightX - CARD_PAD;

  const portraitHost = new PIXI.Container();
  portraitHost.position.set(leftX + PORTRAIT / 2, CARD_PAD + PORTRAIT / 2);
  root.addChild(portraitHost);

  const tabRow = new PIXI.Container();
  tabRow.position.set(leftX, CARD_PAD + PORTRAIT + 10);
  root.addChild(tabRow);

  const infoHost = new PIXI.Container();
  infoHost.position.set(rightX, CARD_PAD);
  root.addChild(infoHost);

  let selected = 0;

  const paintPortrait = (def: EnemyDef): void => {
    portraitHost.removeChildren().forEach((c) => c.destroy({ children: true }));
    portraitHost.addChild(makePanel({
      width: PORTRAIT, height: PORTRAIT, radius: 18,
      bg: COLORS.panelBg, bgAlpha: 0.96,
      border: 0xc9a45a, borderWidth: 3,
      centered: true,
    }));
    const path = def.image ?? enemyImage(def.id);
    const tex = TextureCache.get(path);
    if (tex) {
      const tier = enemyDisplayTierOf(def);
      const spr = new PIXI.Sprite(tex);
      spr.anchor.set(0.5);
      const maxInner = PORTRAIT - 24;
      spr.scale.set(enemySpriteScale(tex.width, tex.height, tier, maxInner));
      const bw = spr.width;
      const bh = spr.height;
      if (bw > maxInner || bh > maxInner) {
        const s = Math.min(maxInner / bw, maxInner / bh);
        spr.scale.set(spr.scale.x * s);
      }
      portraitHost.addChild(spr);
    }
  };

  const paintInfo = (def: EnemyDef): void => {
    infoHost.removeChildren().forEach((c) => c.destroy({ children: true }));
    let y = 0;

    const nameRow = new PIXI.Container();
    const name = makeText(formatEnemyBattleName(def), {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
      wordWrapWidth: rightW - 40,
    });
    name.position.set(0, 0);
    nameRow.addChild(name);
    const orb = makeElementOrb(def.element, 28);
    orb.position.set(Math.min(name.width + 18, rightW - 14), 0);
    nameRow.addChild(orb);
    nameRow.position.set(0, y + 10);
    infoHost.addChild(nameRow);
    y += 28;

    const stats = enemyStats(def, stage.chapter, stage.difficulty);
    const chipRow = buildStatChips(stats.hp, stats.atk, def.attackInterval, rightW);
    chipRow.position.set(0, y);
    infoHost.addChild(chipRow);
    y += 52;

    const skillIds = (def.skillIds ?? []).slice(0, 2);
    if (skillIds.length > 0) {
      const skillBox = buildSkillBox(skillIds, rightW);
      skillBox.position.set(0, y);
      infoHost.addChild(skillBox);
      y += skillBox.boxH + 8;
    }

    const weak = counterElementOf(def.element);
    const resist = resistedElementOf(def.element);
    const counterRow = new PIXI.Container();
    let cx = 0;
    const addCounter = (label: string, el: typeof weak): void => {
      const t = makeText(label, {
        size: FONT_SIZE.xxs, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
      });
      t.position.set(cx, 0);
      counterRow.addChild(t);
      cx += t.width + 4;
      const o = makeElementOrb(el, 22);
      o.position.set(cx + 11, 0);
      counterRow.addChild(o);
      cx += 28 + 16;
    };
    addCounter('克制', weak);
    addCounter('抵抗', resist);
    counterRow.position.set(0, y + 8);
    infoHost.addChild(counterRow);
    y += 28;

    const tip = stage.hintText
      ?? (stage.hintTags?.length ? `本关：${stage.hintTags.join(' · ')}` : null);
    if (tip) {
      const tipBg = makePanel({
        width: rightW, height: 36, radius: 10,
        bg: 0xe8d9b8, bgAlpha: 0.92,
        border: 0xc4a574, borderWidth: 1,
        centered: false,
      });
      tipBg.position.set(0, y);
      infoHost.addChild(tipBg);
      const tipText = makeText(tip.startsWith('本关') ? tip : `本关：${tip}`, {
        size: FONT_SIZE.xxs, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
        wordWrapWidth: rightW - 20,
      });
      tipText.position.set(10, 18);
      tipBg.addChild(tipText);
    }
  };

  const paintTabs = (): void => {
    tabRow.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (waveCount <= 1) return;
    const tabW = Math.floor((PORTRAIT - (waveCount - 1) * TAB_GAP) / waveCount);
    for (let i = 0; i < waveCount; i++) {
      const active = i === selected;
      const tab = new PIXI.Container();
      tab.position.set(i * (tabW + TAB_GAP) + tabW / 2, TAB_H / 2);
      tab.addChild(makePanel({
        width: tabW, height: TAB_H, radius: TAB_H / 2,
        bg: active ? COLORS.btnSuccessBg : COLORS.panelBg,
        bgAlpha: 0.95,
        border: active ? COLORS.btnSuccessBorder : COLORS.panelBorderSoft,
        borderWidth: 2,
        centered: true,
      }));
      const label = makeText(`${i + 1}/${waveCount}`, {
        size: FONT_SIZE.xxs,
        fill: active ? COLORS.btnText : COLORS.textMain,
        bold: true,
        anchor: 0.5,
      });
      tab.addChild(label);
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
  const gap = 8;
  const chipW = Math.floor((maxW - gap * 2) / 3);
  const chipH = 46;
  const items: { kind: 'hp' | 'atk' | 'turn'; label: string }[] = [
    { kind: 'hp', label: '生命' },
    { kind: 'atk', label: '攻击' },
    { kind: 'turn', label: `每${interval}回合` },
  ];
  const values = [`${hp}`, `${atk}`, '行动一次'];
  items.forEach((it, i) => {
    const chip = new PIXI.Container();
    chip.position.set(i * (chipW + gap), 0);
    chip.addChild(makePanel({
      width: chipW, height: chipH, radius: 10,
      bg: COLORS.panelBg, bgAlpha: 0.95,
      border: COLORS.panelBorderSoft, borderWidth: 1,
      centered: false,
    }));
    if (it.kind === 'turn') {
      const hg = drawHourglass(12);
      hg.position.set(14, chipH / 2);
      chip.addChild(hg);
      const lab = makeText(it.label, {
        size: 14, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
      });
      lab.position.set(28, chipH / 2);
      chip.addChild(lab);
    } else {
      const icon = makeStatIcon(it.kind, 20);
      icon.position.set(14, chipH / 2);
      chip.addChild(icon);
      const lab = makeText(it.label, {
        size: 14, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
      });
      lab.position.set(28, chipH / 2 - 9);
      const val = makeText(values[i], {
        size: 15, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
      });
      val.position.set(28, chipH / 2 + 9);
      chip.addChild(lab, val);
    }
    row.addChild(chip);
  });
  return row;
}

interface SkillBox extends PIXI.Container {
  boxH: number;
}

function buildSkillBox(skillIds: readonly string[], width: number): SkillBox {
  const rowH = 44;
  const pad = 10;
  const boxH = pad * 2 + skillIds.length * rowH + Math.max(0, skillIds.length - 1) * 4;
  const box = new PIXI.Container() as SkillBox;
  box.boxH = boxH;
  box.addChild(makePanel({
    width, height: boxH, radius: 12,
    bg: COLORS.panelBg, bgAlpha: 0.9,
    border: COLORS.panelBorderSoft, borderWidth: 1,
    centered: false,
  }));

  skillIds.forEach((id, i) => {
    const skill = skillForEnemy(id);
    const y = pad + i * (rowH + 4) + rowH / 2;
    const icon = makeSkillIcon({
      skillId: id,
      size: 36,
      fallbackFill: 0xb8843c,
      fallbackGlyph: skill.name.charAt(0),
    });
    icon.position.set(22, y);
    box.addChild(icon);

    const short = shortSkillLine(skill.desc);
    const title = makeText(`${skill.name}：${short}`, {
      size: FONT_SIZE.xxs, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
      wordWrapWidth: width - 56,
    });
    const showSub = skill.desc !== short && skill.desc.length > short.length;
    title.position.set(46, showSub ? y - 8 : y);
    box.addChild(title);

    if (showSub) {
      const sub = makeText(
        skill.desc.length > 22 ? `${skill.desc.slice(0, 22)}…` : skill.desc,
        {
          size: 14, fill: COLORS.textSub, anchor: [0, 0.5],
          wordWrapWidth: width - 56,
        },
      );
      sub.position.set(46, y + 10);
      box.addChild(sub);
    }

    if (i < skillIds.length - 1) {
      const line = new PIXI.Graphics();
      line.lineStyle(1, COLORS.panelBorderSoft, 0.7);
      line.moveTo(12, pad + (i + 1) * (rowH + 4) - 2);
      line.lineTo(width - 12, pad + (i + 1) * (rowH + 4) - 2);
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
  g.beginFill(0xf0d9a0, 0.85);
  g.drawEllipse(0, -r * 0.45, r * 0.35, r * 0.22);
  g.drawEllipse(0, r * 0.45, r * 0.35, r * 0.22);
  g.endFill();
  return g;
}
