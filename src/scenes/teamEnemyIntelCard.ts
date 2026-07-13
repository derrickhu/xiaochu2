/**
 * 战前编队 · 敌情 Intel（对齐 team_prep UI 原型）
 *
 * 奶油外板；左侧生图金框立绘全图铺满；右侧名/三维/技能圆标/克制/本关提示分层，互不重叠。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { ENEMY_PORTRAIT_FRAME, enemyImage } from '@/config/Assets';
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
/** 立绘框：略竖，贴近 UI 左栏 */
const PORTRAIT_W = 248;
const PORTRAIT_H = 268;
/** 金框内窗 inset（立绘 cover 区域） */
const FRAME_INSET = 18;
const OUTER_PAD = 14;
const GAP = 16;
const TAB_H = 28;
const TAB_GAP = 6;
/** 克制行与本关提示之间的最小间距（避免重叠） */
const TIP_GAP = 14;

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
  const leftColW = PORTRAIT_W;
  const rightX = OUTER_PAD + leftColW + GAP;
  const infoInnerW = width - rightX - OUTER_PAD;

  // 先按各波内容估高，避免右侧顶穿后把「本关」夹进克制行
  let cardH = Math.max(
    leftInnerH + OUTER_PAD * 2,
    ...encounters.map((enc) => estimateInfoHeight(enc.def, stage) + OUTER_PAD * 2),
    300,
  );

  const plate = makePanel({
    width, height: cardH, radius: 18,
    bg: PLATE_BG, bgAlpha: 0.97,
    border: PLATE_BORDER, borderWidth: 2.5,
    centered: false,
  });
  root.addChild(plate);

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

    // 内底（金框贴图未就绪时的兜底）
    portraitHost.addChild(makePanel({
      width: PORTRAIT_W - 8, height: PORTRAIT_H - 8, radius: 12,
      bg: 0xf0e2c4, bgAlpha: 1,
      border: 0xc9a063, borderWidth: 2,
      centered: true,
    }));

    const path = def.image ?? enemyImage(def.id);
    const tex = TextureCache.get(path);
    const iw = PORTRAIT_W - FRAME_INSET * 2;
    const ih = PORTRAIT_H - FRAME_INSET * 2;
    if (tex) {
      const art = new PIXI.Container();
      const spr = new PIXI.Sprite(tex);
      spr.anchor.set(0.5);
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

    // 生图奶油金框叠在立绘之上
    const frameTex = TextureCache.get(ENEMY_PORTRAIT_FRAME);
    if (frameTex) {
      const frame = new PIXI.Sprite(frameTex);
      frame.anchor.set(0.5);
      frame.width = PORTRAIT_W;
      frame.height = PORTRAIT_H;
      portraitHost.addChild(frame);
    } else {
      const rim = new PIXI.Graphics();
      rim.lineStyle(3, 0xc9a063, 1);
      rim.drawRoundedRect(-PORTRAIT_W / 2, -PORTRAIT_H / 2, PORTRAIT_W, PORTRAIT_H, 14);
      portraitHost.addChild(rim);
    }
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
      y += skillBox.boxH + 10;
    }

    const weak = counterElementOf(def.element);
    const resist = resistedElementOf(def.element);
    const counterRow = buildCounterRow(weak, resist, infoInnerW);
    counterRow.position.set(0, y);
    infoHost.addChild(counterRow);
    y += counterRow.rowH + TIP_GAP;

    const tip = stage.hintText
      ?? (stage.hintTags?.length ? `本关：${stage.hintTags.join(' · ')}` : null);
    if (tip) {
      const tipBlock = buildStageTip(tip.startsWith('本关') ? tip : `本关：${tip}`, infoInnerW);
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

/** 右侧内容高度估算（与 paintInfo 节奏一致） */
function estimateInfoHeight(def: EnemyDef, stage: StageDef): number {
  let y = 2 + 32 + 52;
  const skillIds = (def.skillIds ?? []).slice(0, 2);
  if (skillIds.length > 0) {
    y += skillBoxHeight(skillIds.length) + 10;
  }
  y += 34 + TIP_GAP;
  const tip = stage.hintText
    ?? (stage.hintTags?.length ? `本关：${stage.hintTags.join(' · ')}` : null);
  if (tip) y += 36;
  return Math.max(y, 120);
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
  row.rowH = boxH;

  // 原型：一整条浅奶油横条，克制/抵抗并排
  row.addChild(makePanel({
    width, height: boxH, radius: 10,
    bg: 0xf3e6c8, bgAlpha: 0.95,
    border: PLATE_BORDER, borderWidth: 1,
    centered: false,
  }));

  const half = width / 2;
  const place = (label: string, el: Element, x0: number): void => {
    const t = makeText(label, {
      size: FONT_SIZE.xxs, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
    });
    t.position.set(x0 + 10, boxH / 2);
    row.addChild(t);
    const o = makeElementOrb(el, 22);
    o.position.set(x0 + 10 + t.width + 16, boxH / 2);
    row.addChild(o);
    const name = makeText(ELEMENT_NAME[el], {
      size: FONT_SIZE.xxs, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    });
    name.position.set(o.x + 16, boxH / 2);
    row.addChild(name);
  };
  place('克制', weak, 0);
  place('抵抗', resist, half);
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
  // 浅凹槽技能区（对齐原型奶油内板）
  box.addChild(makePanel({
    width, height: boxH, radius: 12,
    bg: 0xfffdf8, bgAlpha: 0.96,
    border: PLATE_BORDER, borderWidth: 1,
    centered: false,
  }));

  skillIds.forEach((id, i) => {
    const skill = skillForEnemy(id);
    const y = pad + i * (rowH + 6) + rowH / 2;

    // 棕色圆底托，技能正圆图标叠上（扣底后无方块）
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

/** 本关提示：分割线 + 小松标 + 文案（独立于克制行） */
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
  // 副行：完整 desc，若与短效重复则给温和补语
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

/** 本关提示左侧小松标 */
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
