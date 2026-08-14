/**
 * 战前编队 · 队伍摘要行（三维 + 五行）与分区标题。
 * 对齐 team_prep_ui_prototype_v3b；战力合成分不进战前条，避免抹平搭配决策。
 */
import * as PIXI from 'pixi.js';
import { ELEMENTS } from '@/balance/combat';
import { getStatUi, type StatKey } from '@/balance/petRoles';
import {
  teamAtk,
  teamElements,
  teamMaxHp,
  teamRcv,
  type TeamMember,
} from '@/formulas/team';
import { UI_IMAGES } from '@/config/Assets';
import {
  COLORS, FONT_SIZE,
  bindLazySprite, makeElementOrb, makeStatIcon, makeText, makeTitleText,
} from '@/ui';

/** 整图拉伸胶囊底板（奶油/金/绿），对齐 ActionButton，不自绘圆角条。 */
export function addStretchedPlate(
  parent: PIXI.Container,
  path: string,
  width: number,
  height: number,
  opts?: {
    x?: number;
    y?: number;
    anchor?: number | [number, number];
    alpha?: number;
    tint?: number;
  },
): PIXI.Sprite {
  const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
  const a = opts?.anchor ?? 0.5;
  if (typeof a === 'number') spr.anchor.set(a);
  else spr.anchor.set(a[0], a[1]);
  spr.position.set(opts?.x ?? 0, opts?.y ?? 0);
  if (opts?.alpha !== undefined) spr.alpha = opts.alpha;
  parent.addChild(spr);
  bindLazySprite(spr, {
    path,
    ensure: true,
    onApplied: () => {
      spr.width = width;
      spr.height = height;
      if (opts?.tint !== undefined) spr.tint = opts.tint;
    },
  });
  return spr;
}

/** 浅色细条：敌情 / 三维摘要 / 队长令共用，半透明米底，不压风景。 */
export const TEAM_CHROME_STRIP_H = 64;

export function addSoftCapsule(
  parent: PIXI.Container,
  width: number,
  height: number,
  opts?: { x?: number; y?: number },
): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const r = height / 2;
  g.beginFill(COLORS.panelBg, 0.48);
  g.drawRoundedRect(-width / 2, -height / 2, width, height, r);
  g.endFill();
  g.lineStyle(1.5, COLORS.panelBorderSoft, 0.4);
  g.drawRoundedRect(-width / 2, -height / 2, width, height, r);
  g.position.set(opts?.x ?? 0, opts?.y ?? 0);
  parent.addChild(g);
  return g;
}

/** 队长冠符号：换队长钮与摘要行队长令共用同一图形，玩家一眼建立「冠 = 队长」联想。 */
export function makeLeaderMark(size: number): PIXI.Container {
  const root = new PIXI.Container();
  root.addChild(drawCrown(COLORS.accentDeep, size / 20));
  return root;
}

/**
 * 换队长钮（非队长槽位）：奶油胶囊 + 金冠 + 投影。
 *
 * 石座上是灰调，奶油底比原来的半透明深色圆点显眼得多；金冠与队长金匾同色系，
 * 点它即换队长（原神/AFK 卡角冠、阴阳师队长金牌同一套语言）。
 */
export function makeLeaderPickChip(): PIXI.Container {
  const root = new PIXI.Container();
  const w = 48;
  const h = 30;

  const shadow = new PIXI.Graphics();
  shadow.beginFill(COLORS.scrim, 0.24);
  shadow.drawRoundedRect(-w / 2 + 1, -h / 2 + 4, w, h, h / 2);
  shadow.endFill();
  root.addChild(shadow);

  addStretchedPlate(root, UI_IMAGES.btnPlateCream, w, h);

  const ring = new PIXI.Graphics();
  ring.lineStyle(2, COLORS.accentDeep, 0.9);
  ring.drawRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  root.addChild(ring);

  root.addChild(drawCrown(COLORS.accentDeep, 0.92));

  root.hitArea = new PIXI.Rectangle(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
  root.eventMode = 'static';
  root.cursor = 'pointer';
  root.interactiveChildren = false;
  return root;
}

function drawCrown(color: number, scale: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const pts = [-8, 5, -8, -1, -4, 3, 0, -6, 4, 3, 8, -1, 8, 5].map((v) => v * scale);
  g.beginFill(color, 1);
  g.drawPolygon(pts);
  g.endFill();
  g.beginFill(color, 1);
  g.drawCircle(-8 * scale, -2.4 * scale, 1.8 * scale);
  g.drawCircle(0, -7.4 * scale, 2 * scale);
  g.drawCircle(8 * scale, -2.4 * scale, 1.8 * scale);
  g.endFill();
  return g;
}

/** 「—— 标题 ——」分区标题 */
export function makeSectionTitle(label: string, width: number): PIXI.Container {
  const root = new PIXI.Container();
  const title = makeTitleText(label, {
    size: FONT_SIZE.md, fill: COLORS.textMain, anchor: 0.5,
  });
  root.addChild(title);

  const lineW = Math.max(40, (width - title.width - 48) / 2);
  const drawLine = (dir: -1 | 1): PIXI.Graphics => {
    const g = new PIXI.Graphics();
    const x0 = dir < 0 ? -title.width / 2 - 12 - lineW : title.width / 2 + 12;
    g.lineStyle(2, 0xc4a574, 0.85);
    g.moveTo(x0, 0);
    g.lineTo(x0 + lineW, 0);
    // 菱形端点
    const tipX = dir < 0 ? x0 : x0 + lineW;
    g.beginFill(0xc4a574, 0.95);
    g.moveTo(tipX, -4);
    g.lineTo(tipX + 4, 0);
    g.lineTo(tipX, 4);
    g.lineTo(tipX - 4, 0);
    g.closePath();
    g.endFill();
    return g;
  };
  root.addChild(drawLine(-1), drawLine(1));
  return root;
}

/** 摘要条与敌情条同高，同一套淡胶囊 */
export const TEAM_SUMMARY_BAR_H = TEAM_CHROME_STRIP_H;
export const TEAM_SUMMARY_TOTAL_H = TEAM_SUMMARY_BAR_H;
/** 队长令气泡：两行高度 + 下指尖角长度，站台排版按此留空 */
export const LEADER_SKILL_PLAQUE_H = 58;
export const LEADER_SKILL_PLAQUE_POINTER = 9;

export interface LeaderSkillPlaqueInfo {
  name: string;
  /** 「令名：效果」整句，内部剥出效果部分 */
  text: string;
}

/**
 * 队长技气泡：钉在「队长」飘带上方。
 *
 * 业界（PAD / 召唤师战争）把队长技贴在队长本体上，换人 = 气泡换文案。
 * 底板与敌情条同一套 addSoftCapsule（淡米胶囊），不下金边实心框。
 * 分两行是因为整句挤一行必然要缩字或截断（效果里的数值恰恰最不能截）：
 * 上行令名认身份，下行效果读数值，换队长时两行同时变，变化最醒目。
 */
export function makeLeaderSkillPlaque(
  skill: LeaderSkillPlaqueInfo,
  maxWidth: number,
): PIXI.Container {
  const root = new PIXI.Container();
  const h = LEADER_SKILL_PLAQUE_H;
  const pointer = LEADER_SKILL_PLAQUE_POINTER;
  const padX = 18;
  const head = `${skill.name}：`;
  const desc = skill.text.startsWith(head) ? skill.text.slice(head.length) : skill.text;

  const crown = makeLeaderMark(18);
  const nameText = makeText(skill.name, {
    size: FONT_SIZE.xs, fill: COLORS.textSeal, bold: true, anchor: [0, 0.5],
  });
  const descText = makeText(desc, {
    size: FONT_SIZE.xs, fill: COLORS.textPositive, bold: true, anchor: 0.5,
  });
  const innerMax = maxWidth - padX * 2;
  fitTextWidth(descText, innerMax);

  const nameRowW = 16 + nameText.width;
  const bw = Math.min(maxWidth, Math.max(180, Math.max(nameRowW, descText.width) + padX * 2));

  addSoftCapsule(root, bw, h);
  const tip = new PIXI.Graphics();
  tip.beginFill(COLORS.panelBg, 0.48);
  tip.moveTo(-8, h / 2);
  tip.lineTo(8, h / 2);
  tip.lineTo(0, h / 2 + pointer);
  tip.closePath();
  tip.endFill();
  tip.lineStyle(1.5, COLORS.panelBorderSoft, 0.4);
  tip.moveTo(-8, h / 2);
  tip.lineTo(0, h / 2 + pointer);
  tip.lineTo(8, h / 2);
  root.addChild(tip);

  const nameRow = new PIXI.Container();
  nameRow.addChild(crown);
  nameText.position.set(13, 0);
  nameRow.addChild(nameText);
  nameRow.position.set(-nameRowW / 2 + 3, -h / 2 + 16);
  root.addChild(nameRow);

  descText.position.set(0, h / 2 - 17);
  root.addChild(descText);
  return root;
}

/**
 * 站台下方摘要：三维等权 + 五行覆盖。
 *
 * 细条 HUD 跟 PAD 编队条、上方敌情条同一套：一个维 = 图标+数字，单行读完。
 * 两行（数在上、名在下）是详情卡写法，64px 胶囊里会把「攻击317」拆成两次扫视。
 * 维名交给图标和 STAT_UI 色，不再重复写「攻击/生命/回复」。
 */
export function buildTeamPrepSummary(
  members: readonly TeamMember[],
  width: number,
): PIXI.Container {
  const root = new PIXI.Container();
  const inset = 56;
  addSoftCapsule(root, width, TEAM_SUMMARY_BAR_H);

  const covered = teamElements(members);
  const values: Record<StatKey, number> = {
    atk: teamAtk(members),
    hp: teamMaxHp(members),
    rcv: teamRcv(members),
  };

  const right = new PIXI.Container();
  const coverLabel = makeText('五行', {
    size: FONT_SIZE.xs, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
  });
  right.addChild(coverLabel);
  let ox = coverLabel.width + 10;
  for (const el of ELEMENTS) {
    const orb = makeElementOrb(el, 24);
    orb.alpha = covered.has(el) ? 1 : 0.26;
    orb.position.set(ox + 12, 0);
    right.addChild(orb);
    ox += 28;
  }
  right.position.set(width / 2 - inset - ox, 0);
  root.addChild(right);

  let x = -width / 2 + inset;
  const order: StatKey[] = ['atk', 'hp', 'rcv'];
  order.forEach((stat, i) => {
    if (i > 0) x += 28;
    const token = makeTeamStatToken(stat, values[stat]);
    token.position.set(x, 0);
    root.addChild(token);
    x += token.width;
  });

  return root;
}

/** 图标 + 维色数字，与敌情条「❤ 1896」同一语法，字号略大（本队是决策面）。 */
function makeTeamStatToken(stat: StatKey, value: number): PIXI.Container {
  const def = getStatUi(stat);
  const root = new PIXI.Container();
  const icon = makeStatIcon(stat, 22);
  icon.position.set(11, 0);
  root.addChild(icon);
  const num = makeText(`${value}`, {
    size: FONT_SIZE.sm, fill: def.color, bold: true, anchor: [0, 0.5],
  });
  num.position.set(26, 0);
  root.addChild(num);
  return root;
}

/** 超宽先缩字，缩到下限仍超宽再截断，保证队长令永远单行读得完。 */
function fitTextWidth(t: PIXI.Text, maxW: number, minScale = 0.84): void {
  if (t.width <= maxW) return;
  t.scale.set(Math.max(minScale, maxW / t.width));
  if (t.width <= maxW) return;
  const raw = t.text;
  for (let cut = raw.length - 1; cut > 4; cut--) {
    t.text = `${raw.slice(0, cut)}…`;
    if (t.width <= maxW) return;
  }
}
