/**
 * 战斗队伍栏：点击宠物头像弹出的主动技说明气泡。
 * 框比例严格对齐仅含框的截图（706×504 ≈ 1.40:1），程序绘制双层描边。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager } from '@/core/TweenManager';
import { TextureCache } from '@/core/TextureCache';
import { computePetBarPetSize } from './BattleLayout';
import { UI, ORB_COLOR } from '@/balance/ui';
import { ORB_IMAGES } from '@/config/Assets';
import type { Element } from '@/balance/combat';
import type { TeamPet } from '@/game/battle/battleTypes';
import { makeText } from '@/ui/text';
import { COLORS } from '@/ui/theme';

const AUTO_DISMISS_SEC = 4;
const TAP_SLOP = 14;

/**
 * 截图仅含框：706×504 ≈ 1.40:1（偏方的短卡，不是细长条）。
 * 设计坐标取宽 320 → 高约 228。
 */
const PANEL_W = 320;
const PANEL_MIN_H = 228;
const PAD_X = 18;
const PAD_TOP = 16;
const CARET_H = 12;
const RADIUS = 16;

/** 截图采样色（仅框裁切图） */
const SKILL_UI = {
  bg: 0xfcf5e0,
  gold: 0xc5a059,
  blue: 0xa8e6f2,
  title: 0x1a5f7a,
  cdFill: 0xd4a056,
  cdBorder: 0xb8883a,
  /** 冷却条：浅青灰底 + 深棕字 */
  pillFill: 0xb5c4be,
  pillText: 0x463225,
  body: 0x3e260b,
  highlight: 0x2b8eb5,
  ornament: 0x5090ae,
} as const;

const TITLE_COLOR: Readonly<Record<Element, number>> = {
  metal: 0xb5701f,
  wood: 0x2d7a3a,
  water: SKILL_UI.title,
  fire: 0xb03a2e,
  earth: 0x6b4a28,
};

const HIGHLIGHT_COLOR: Readonly<Record<Element, number>> = {
  metal: 0xf0c040,
  wood: 0x45c45a,
  water: SKILL_UI.highlight,
  fire: 0xd6453a,
  earth: 0x8f5a36,
};

export { TAP_SLOP };

export interface PetSkillPreviewHandle {
  dismiss: () => void;
}

/** 在 layer 上显示技能气泡；再次调用前须 dismiss 旧实例 */
export function showPetSkillPreview(
  layer: PIXI.Container,
  pet: TeamPet,
  slotX: number,
  slotY: number,
): PetSkillPreviewHandle {
  const el = pet.def.element;
  const accent = ORB_COLOR[el];
  const titleColor = TITLE_COLOR[el];
  const highlight = HIGHLIGHT_COLOR[el];
  const skill = pet.skill;

  const panelW = Math.min(PANEL_W, Game.logicWidth - 56);
  const innerW = panelW - PAD_X * 2;

  const root = new PIXI.Container();
  const content = new PIXI.Container();
  let y = PAD_TOP;

  // 顶栏：属性圆标 + 技能名 + CD，整组水平居中
  const header = new PIXI.Container();
  const icon = buildElementIcon(el, accent);
  header.addChild(icon);

  const nameText = makeText(skill.name, {
    size: 28,
    fill: titleColor,
    bold: true,
    anchor: [0, 0.5],
  });
  nameText.position.set(40, 0);
  header.addChild(nameText);

  const cdBadge = buildCdBadge(skill.cd);
  cdBadge.position.set(40 + nameText.width + 8, 0);
  header.addChild(cdBadge);

  const headerBounds = header.getLocalBounds();
  header.position.set(
    (panelW - headerBounds.width) / 2 - headerBounds.x,
    y + 16,
  );
  content.addChild(header);
  y += 42;

  // 冷却胶囊（居中，浅底深字）
  if (pet.skillCdLeft > 0) {
    const status = buildStatusPill(`冷却中 · 剩 ${pet.skillCdLeft} 回合`);
    status.position.set(panelW / 2, y + 14);
    content.addChild(status);
    y += 34;
  } else {
    y += 4;
  }

  // 菱形分割线
  const divider = buildDiamondDivider(innerW);
  divider.position.set(panelW / 2, y + 4);
  content.addChild(divider);
  y += 16;

  // 描述（数字高亮）
  const descBlock = buildRichDesc(skill.desc, innerW, highlight);
  descBlock.position.set(PAD_X, y);
  content.addChild(descBlock);
  y += descBlock.height + 18;

  // 固定接近截图 1.4:1；内容过高时才加高
  const panelH = Math.max(y, Math.round(panelW / 1.4), PANEL_MIN_H);

  const panel = buildSkillPanel(panelW, panelH);
  panel.position.set(-panelW / 2, -panelH - CARET_H);
  root.addChild(panel);

  const ornaments = buildCornerOrnaments(panelW, panelH);
  ornaments.position.set(-panelW / 2, -panelH - CARET_H);
  root.addChild(ornaments);

  const caret = buildCaret();
  caret.position.set(0, -CARET_H);
  root.addChild(caret);

  content.position.set(-panelW / 2, -panelH - CARET_H);
  root.addChild(content);

  const margin = UI.board.marginX;
  let cx = slotX;
  cx = Math.max(margin + panelW / 2, Math.min(Game.logicWidth - margin - panelW / 2, cx));
  const petSize = computePetBarPetSize(Game.logicWidth, 5);
  root.position.set(cx, slotY - petSize / 2 - 4);

  root.alpha = 0;
  root.scale.set(0.94);
  layer.addChild(root);

  TweenManager.to({ target: root, props: { alpha: 1 }, duration: 0.12 });
  TweenManager.to({ target: root.scale, props: { x: 1, y: 1 }, duration: 0.14 });

  const autoTimer = { t: 0 };
  const dismiss = (): void => {
    if (!root.parent) return;
    TweenManager.cancelTarget(autoTimer);
    TweenManager.cancelTarget(root);
    TweenManager.cancelTarget(root.scale);
    root.destroy({ children: true });
  };

  TweenManager.to({
    target: autoTimer,
    props: { t: 1 },
    duration: AUTO_DISMISS_SEC,
    onComplete: dismiss,
  });

  return { dismiss };
}

/** 外金边 + 内天蓝粗边 + 奶油底（截图双层框） */
function buildSkillPanel(w: number, h: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  // 外金
  g.beginFill(SKILL_UI.bg, 1);
  g.lineStyle(3.5, SKILL_UI.gold, 1);
  g.drawRoundedRect(0, 0, w, h, RADIUS);
  g.endFill();
  // 内天蓝（更粗，对齐截图）
  g.lineStyle(4, SKILL_UI.blue, 1);
  g.drawRoundedRect(4, 4, w - 8, h - 8, RADIUS - 3);
  // 底角淡卷饰
  g.lineStyle(1.5, SKILL_UI.gold, 0.35);
  g.arc(20, h - 20, 12, Math.PI * 0.1, Math.PI * 0.9);
  g.arc(w - 20, h - 20, 12, Math.PI * 1.1, Math.PI * 1.9);
  return g;
}

function buildCaret(): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const hw = 12;
  g.beginFill(SKILL_UI.bg, 1);
  g.lineStyle(2.5, SKILL_UI.gold, 1);
  g.moveTo(-hw, 0);
  g.lineTo(0, CARET_H);
  g.lineTo(hw, 0);
  g.closePath();
  g.endFill();
  g.lineStyle(2, SKILL_UI.blue, 0.9);
  g.moveTo(-hw + 3, 1);
  g.lineTo(0, CARET_H - 3);
  g.lineTo(hw - 3, 1);
  return g;
}

function buildElementIcon(el: Element, accent: number): PIXI.Container {
  const c = new PIXI.Container();
  const size = 34;
  const tex = TextureCache.get(ORB_IMAGES[el]);
  if (tex) {
    const orb = new PIXI.Sprite(tex);
    orb.anchor.set(0.5);
    orb.width = size;
    orb.height = size;
    c.addChild(orb);
  } else {
    const g = new PIXI.Graphics();
    g.beginFill(accent, 1);
    g.lineStyle(2.5, SKILL_UI.gold, 1);
    g.drawCircle(0, 0, size / 2);
    g.endFill();
    c.addChild(g);
  }
  return c;
}

function buildCdBadge(cd: number): PIXI.Container {
  const c = new PIXI.Container();
  const label = makeText(`CD ${cd}`, {
    size: 16,
    fill: COLORS.white,
    bold: true,
    anchor: 0.5,
  });
  const bw = Math.max(52, label.width + 16);
  const bh = 24;
  const g = new PIXI.Graphics();
  g.beginFill(SKILL_UI.cdFill, 1);
  g.lineStyle(1.5, SKILL_UI.cdBorder, 1);
  g.drawRoundedRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
  g.endFill();
  c.addChild(g);
  c.addChild(label);
  c.pivot.set(-bw / 2, 0);
  return c;
}

function buildStatusPill(text: string): PIXI.Container {
  const c = new PIXI.Container();
  const label = makeText(text, {
    size: 18,
    fill: SKILL_UI.pillText,
    bold: true,
    anchor: 0.5,
  });
  const bw = Math.max(190, label.width + 30);
  const bh = 30;
  const g = new PIXI.Graphics();
  g.beginFill(SKILL_UI.pillFill, 0.95);
  g.drawRoundedRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
  g.endFill();
  c.addChild(g);
  c.addChild(label);
  return c;
}

function buildDiamondDivider(width: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const half = width / 2 - 6;
  g.lineStyle(1.5, SKILL_UI.gold, 0.75);
  g.moveTo(-half, 0);
  g.lineTo(-8, 0);
  g.moveTo(8, 0);
  g.lineTo(half, 0);
  g.lineStyle(0);
  g.beginFill(SKILL_UI.gold, 1);
  g.moveTo(0, -4);
  g.lineTo(4, 0);
  g.lineTo(0, 4);
  g.lineTo(-4, 0);
  g.closePath();
  g.endFill();
  return g;
}

function buildRichDesc(desc: string, wrapW: number, highlight: number): PIXI.Container {
  const root = new PIXI.Container();
  const chunks = desc.split(/(\d+%?)/g).filter((s) => s.length > 0);
  const tokens: { text: string; hi: boolean }[] = [];
  for (const part of chunks) {
    if (/^\d+%?$/.test(part)) tokens.push({ text: part, hi: true });
    else for (const ch of part) tokens.push({ text: ch, hi: false });
  }

  const fontSize = 19;
  const lineH = fontSize + 7;
  let line = new PIXI.Container();
  let x = 0;
  let lineY = 0;

  const flushLine = () => {
    if (line.children.length === 0) return;
    line.y = lineY;
    root.addChild(line);
    line = new PIXI.Container();
    x = 0;
    lineY += lineH;
  };

  for (const tok of tokens) {
    const t = makeText(tok.text, {
      size: tok.hi ? fontSize + 3 : fontSize,
      fill: tok.hi ? highlight : SKILL_UI.body,
      bold: true,
      anchor: [0, 0],
    });
    if (x + t.width > wrapW && x > 0) flushLine();
    t.position.set(x, 0);
    line.addChild(t);
    x += t.width;
  }
  flushLine();
  return root;
}

function buildCornerOrnaments(w: number, _h: number): PIXI.Container {
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  const col = SKILL_UI.ornament;
  // 左上雪花
  g.lineStyle(2.2, col, 0.9);
  g.moveTo(16, 8);
  g.lineTo(16, 24);
  g.moveTo(8, 16);
  g.lineTo(24, 16);
  g.moveTo(10, 10);
  g.lineTo(22, 22);
  g.moveTo(22, 10);
  g.lineTo(10, 22);
  g.lineStyle(0);
  g.beginFill(col, 0.95);
  g.drawEllipse(30, 10, 4, 5);
  g.drawEllipse(10, 30, 3.5, 4.5);
  g.drawEllipse(w - 18, 12, 4, 5);
  g.drawEllipse(w - 32, 16, 3.5, 4.5);
  g.drawEllipse(w - 22, 28, 3, 4);
  g.endFill();
  c.addChild(g);
  return c;
}
