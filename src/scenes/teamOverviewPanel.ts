import * as PIXI from 'pixi.js';
import { ELEMENTS } from '@/balance/combat';
import { ATTRIB_UI, STAT_UI } from '@/balance/petRoles';
import { ELEMENT_NAME } from '@/balance/ui';
import { Ease, TweenManager } from '@/core/TweenManager';
import {
  teamAtk,
  teamEffectAggregate,
  teamElements,
  teamMaxHp,
  teamRcv,
  type TeamMember,
} from '@/formulas/team';
import { COLORS, FONT_SIZE, makeTeamStatsLine, makeText } from '@/ui';

export interface TeamOverviewSnapshot {
  atk: number;
  hp: number;
  rcv: number;
  /** 全队增伤（被动 + 辅助招牌「全队增伤」属性，同乘区合并展示） */
  dmg: number;
  shield: number;
  regen: number;
  power: number;
  /** 全队受击减伤（坦克招牌，队伍级战斗属性；暴击是个体属性，不在总览展示） */
  damageReduction: number;
  /** 全队治疗强化（治疗招牌，队伍级战斗属性） */
  healBonus: number;
}

/** 重建「队伍总览」面板内容：三维 + 聚合被动 + 五行覆盖 + 辅助战力。 */
export function refreshTeamOverviewPanel(
  root: PIXI.Container,
  panelW: number,
  panelH: number,
  members: readonly TeamMember[],
  prev: TeamOverviewSnapshot | null,
): TeamOverviewSnapshot {
  root.removeChildren().forEach((c) => c.destroy({ children: true }));

  const top = -panelH / 2;
  const left = -panelW / 2;
  const atk = teamAtk(members);
  const hp = teamMaxHp(members);
  const rcv = teamRcv(members);
  const fx = teamEffectAggregate(members);
  const dmg = Math.round((fx.teamDamageMult - 1) * 1000) / 1000;
  const shield = Math.round(fx.startShieldPct * 1000) / 1000;
  const regen = Math.round(fx.regenPct * 1000) / 1000;
  const damageReduction = Math.round(fx.damageReduction * 1000) / 1000;
  const healBonus = Math.round(fx.healBonus * 1000) / 1000;
  const power = teamPower(atk, hp, rcv, dmg, shield, regen);

  const title = makeText('队伍总览', {
    size: FONT_SIZE.xs, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
  });
  title.position.set(left + 22, top + 22);
  root.addChild(title);

  const powerRow = new PIXI.Container();
  powerRow.position.set(panelW / 2 - 22, top + 22);
  const powerLabel = makeText('战力 ', { size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: [1, 0.5] });
  const powerVal = makeText(`${power}`, {
    size: FONT_SIZE.sm, fill: COLORS.accent, bold: true, anchor: [1, 0.5],
  });
  powerLabel.position.set(-powerVal.width, 0);
  powerRow.addChild(powerVal, powerLabel);
  root.addChild(powerRow);

  const statsRow = new PIXI.Container();
  statsRow.position.set(0, top + 56);
  const statsLine = makeTeamStatsLine({ hp, atk, rcv, size: FONT_SIZE.sm });
  statsLine.position.set(-statsLine.width / 2, 0);
  statsRow.addChild(statsLine);
  root.addChild(statsRow);

  // 全队属性行：增伤/减伤/治疗强化/护盾/回血（均为队伍级；个体暴击不在此展示）
  const passiveRow = buildTeamEffectsRow(dmg, shield, regen, damageReduction, healBonus);
  passiveRow.position.set(0, top + 100);
  root.addChild(passiveRow);

  const covered = teamElements(members);
  const missing = ELEMENTS.filter((e) => !covered.has(e));
  const coverText = makeText(
    missing.length === 0
      ? '五行全覆盖 · 所有属性珠均有效'
      : `未覆盖：${missing.map((e) => ELEMENT_NAME[e]).join('、')}（对应珠无伤害）`,
    {
      size: FONT_SIZE.xs, anchor: 0.5,
      fill: missing.length === 0 ? COLORS.btnSuccessBorder : COLORS.accentDeep,
    },
  );
  coverText.position.set(0, top + 140);
  root.addChild(coverText);

  if (prev) {
    if (prev.atk !== atk || prev.hp !== hp || prev.rcv !== rcv) pulse(statsRow);
    if (prev.dmg !== dmg || prev.shield !== shield || prev.regen !== regen
      || prev.damageReduction !== damageReduction || prev.healBonus !== healBonus) pulse(passiveRow);
    if (prev.power !== power) pulse(powerRow);
  }
  return { atk, hp, rcv, dmg, shield, regen, power, damageReduction, healBonus };
}

/** 全队效果行：增伤 / 全队减伤 / 治疗强化 / 开局护盾 / 每回合回血（仅展示非零项） */
function buildTeamEffectsRow(
  dmg: number, shield: number, regen: number, reduction: number, healBonus: number,
): PIXI.Container {
  const row = new PIXI.Container();
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  const segs: { label: string; value: string; color: number }[] = [];
  if (dmg > 0) segs.push({ label: '全队增伤 ', value: `+${pct(dmg)}`, color: STAT_UI.atk.color });
  if (reduction > 0) segs.push({ label: '全队减伤 ', value: pct(reduction), color: ATTRIB_UI.damageReduction.color });
  if (healBonus > 0) segs.push({ label: '治疗强化 ', value: `+${pct(healBonus)}`, color: ATTRIB_UI.healBonus.color });
  if (shield > 0) segs.push({ label: '开局护盾 ', value: pct(shield), color: STAT_UI.hp.color });
  if (regen > 0) segs.push({ label: '每回合回血 ', value: pct(regen), color: STAT_UI.rcv.color });

  if (segs.length === 0) {
    row.addChild(makeText('暂无队伍被动加成', {
      size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: 0.5,
    }));
    return row;
  }

  let x = 0;
  segs.forEach((s, i) => {
    if (i > 0) {
      const gap = makeText('    ', { size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: [0, 0.5] });
      gap.position.set(x, 0);
      row.addChild(gap);
      x += gap.width;
    }
    const label = makeText(s.label, { size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: [0, 0.5] });
    label.position.set(x, 0);
    row.addChild(label);
    x += label.width;
    const val = makeText(s.value, { size: FONT_SIZE.xs, fill: s.color, bold: true, anchor: [0, 0.5] });
    val.position.set(x, 0);
    row.addChild(val);
    x += val.width;
  });
  for (const child of row.children) child.x -= x / 2;
  return row;
}

/** 辅助综合战力分（仅展示参考，非核心规则）：三维 + 聚合被动加权。 */
function teamPower(
  atk: number, hp: number, rcv: number, dmg: number, shield: number, regen: number,
): number {
  const base = atk * 2 + hp * 0.25 + rcv * 0.8;
  const mult = 1 + dmg + shield * 0.5 + regen * 0.6;
  return Math.round(base * mult);
}

function pulse(target: PIXI.Container): void {
  TweenManager.cancelTarget(target.scale);
  target.scale.set(1.16);
  TweenManager.to({
    target: target.scale,
    props: { x: 1, y: 1 },
    duration: 0.34,
    ease: Ease.easeOutBack,
  });
}
