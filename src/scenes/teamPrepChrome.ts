/**
 * 战前编队 · 队伍摘要行（战力 + 五行覆盖）与分区标题。
 * 对齐 team_prep_ui_prototype_v1。
 */
import * as PIXI from 'pixi.js';
import { ELEMENTS, type Element } from '@/balance/combat';
import {
  teamAtk,
  teamEffectAggregate,
  teamElements,
  teamMaxHp,
  teamRcv,
  type TeamMember,
} from '@/formulas/team';
import {
  COLORS, FONT_SIZE,
  makeElementOrb, makeStatIcon, makeText,
} from '@/ui';

/** 与 teamOverviewPanel 同口径的辅助战力 */
export function computeTeamPower(members: readonly TeamMember[]): number {
  const atk = teamAtk(members);
  const hp = teamMaxHp(members);
  const rcv = teamRcv(members);
  const fx = teamEffectAggregate(members);
  const dmg = fx.teamDamageMult - 1;
  const shield = fx.startShieldPct;
  const regen = fx.regenPct;
  const base = atk * 2 + hp * 0.25 + rcv * 0.8;
  const mult = 1 + dmg + shield * 0.5 + regen * 0.6;
  return Math.round(base * mult);
}

/** 「—— 标题 ——」分区标题 */
export function makeSectionTitle(label: string, width: number): PIXI.Container {
  const root = new PIXI.Container();
  const title = makeText(label, {
    size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: 0.5,
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

/** 槽位下方：战力 + 五行覆盖（含珠图标） */
export function buildTeamPrepSummary(
  members: readonly TeamMember[],
  width: number,
): PIXI.Container {
  const root = new PIXI.Container();
  const power = computeTeamPower(members);
  const covered = teamElements(members);

  const left = new PIXI.Container();
  const sword = makeStatIcon('atk', 22);
  sword.position.set(0, 0);
  left.addChild(sword);
  const powerText = makeText(`战力 ${power}`, {
    size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
  });
  powerText.position.set(16, 0);
  left.addChild(powerText);
  left.position.set(-width / 2 + 8, 0);
  root.addChild(left);

  const right = new PIXI.Container();
  const coverLabel = makeText('五行覆盖:', {
    size: FONT_SIZE.xxs, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
  });
  coverLabel.position.set(0, 0);
  right.addChild(coverLabel);
  let x = coverLabel.width + 8;
  const order: Element[] = [...ELEMENTS];
  for (const el of order) {
    const orb = makeElementOrb(el, 22);
    orb.alpha = covered.has(el) ? 1 : 0.28;
    orb.position.set(x + 11, 0);
    right.addChild(orb);
    x += 26;
  }
  const count = makeText(`${covered.size}/5`, {
    size: FONT_SIZE.xxs, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
  });
  count.position.set(x + 4, 0);
  right.addChild(count);
  right.position.set(width / 2 - (x + 4 + count.width) - 8, 0);
  root.addChild(right);

  return root;
}
