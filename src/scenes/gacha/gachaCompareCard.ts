/**
 * 出货战力对比卡：NEW 出货 vs 同定位上阵宠的三维 + 技能对比，附「一键上阵」。
 *
 * makeButton 以容器中心为锚点绘制（ui/Button.ts），position 必须传按钮中心坐标。
 */
import * as PIXI from 'pixi.js';
import { PET_MAP, PET_ROLE_NAME, type PetDef } from '@/balance/pets';
import { getRarity } from '@/balance/rarity';
import { getSkill } from '@/balance/skills';
import { petAtk, petHp, petRcv } from '@/formulas/growth';
import { PlayerData } from '@/game/PlayerData';
import type { PullOutcome } from '@/game/gacha/Gacha';
import { COLORS, FONT_SIZE, RADIUS, makeButton, makePanel, makeText } from '@/ui';

export interface GachaCompareCardHandle {
  root: PIXI.Container;
  height: number;
}

interface PetSnapshot {
  def: PetDef;
  atk: number;
  hp: number;
  rcv: number;
  power: number;
}

function petPower(atk: number, hp: number, rcv: number): number {
  return Math.round(atk * 2 + hp * 0.25 + rcv * 0.8);
}

function snapshot(petId: string): PetSnapshot | null {
  const def = PET_MAP.get(petId);
  if (!def) return null;
  const level = PlayerData.petLevel(petId);
  const star = PlayerData.petStar(petId);
  const atk = petAtk(def, level, star);
  const hp = petHp(def, level, star);
  const rcv = petRcv(def, level, star);
  return { def, atk, hp, rcv, power: petPower(atk, hp, rcv) };
}

export function pickBestNewOutcome(outcomes: readonly PullOutcome[]): PullOutcome | null {
  const news = outcomes.filter((o) => !o.duplicate);
  if (news.length === 0) return null;
  return news.reduce((best, o) => (o.rarity > best.rarity ? o : best));
}

function pickCompareTarget(newPet: PetDef): PetSnapshot | null {
  const teamIds = PlayerData.team.filter((id) => id !== newPet.id);
  if (teamIds.length === 0) return null;
  const snaps = teamIds.map(snapshot).filter((s): s is PetSnapshot => !!s);
  if (snaps.length === 0) return null;
  const sameRole = snaps.filter((s) => s.def.role === newPet.role);
  if (sameRole.length > 0) {
    return sameRole.reduce((min, s) => (s.power < min.power ? s : min));
  }
  return snaps.reduce((min, s) => (s.power < min.power ? s : min));
}

function statCell(label: string, mine: number, theirs: number, centerX: number, centerY: number): PIXI.Container {
  const row = new PIXI.Container();
  row.position.set(centerX, centerY);
  const diff = mine - theirs;
  const main = makeText(`${label} ${mine}`, {
    size: FONT_SIZE.xs, fill: COLORS.textMain, bold: true, anchor: 0.5,
  });
  row.addChild(main);
  const delta = makeText(diff >= 0 ? `+${diff}` : `${diff}`, {
    size: FONT_SIZE.xxs, bold: true, anchor: 0.5,
    fill: diff >= 0 ? COLORS.btnSuccessBorder : COLORS.accentDeep,
  });
  delta.position.set(0, main.height * 0.5 + 4);
  row.addChild(delta);
  return row;
}

export function buildGachaCompareCard(opts: {
  w: number;
  bottomY: number;
  outcome: PullOutcome;
  onDeployed: () => void;
}): GachaCompareCardHandle | null {
  const newSnap = snapshot(opts.outcome.petId);
  if (!newSnap) return null;
  if (PlayerData.isInTeam(opts.outcome.petId)) return null;
  const target = pickCompareTarget(newSnap.def);
  if (!target) return null;

  const panelW = Math.min(640, opts.w - 32);
  const pad = 16;
  const btnH = 48;
  const btnW = Math.min(360, panelW - pad * 2);
  const innerW = panelW - pad * 2;
  const rarity = getRarity(newSnap.def.rarity);

  // ── 先量高，再一次性铺面板，避免固定高度导致叠字 ──
  let y = pad;

  const title1 = makeText(
    `NEW ${rarity.code} · ${newSnap.def.name}（${PET_ROLE_NAME[newSnap.def.role]}）`,
    { size: FONT_SIZE.xs, fill: rarity.color, bold: true, anchor: [0, 0] },
  );
  y += title1.height + 4;

  const title2 = makeText(`对比上阵 · ${target.def.name}`, {
    size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: [0, 0],
  });
  y += title2.height + 12;

  const statsRowH = 36;
  y += statsRowH + 10;

  const newSkill = getSkill(newSnap.def.skillId);
  const oldSkill = getSkill(target.def.skillId);
  const powerDiff = newSnap.power - target.power;
  const skillText = makeText(
    `技能 ${newSkill.name} ⇄ ${oldSkill.name} · 战力 ${newSnap.power}（${
      powerDiff >= 0 ? '+' : ''}${powerDiff}）`,
    { size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: [0, 0], wordWrapWidth: innerW },
  );
  y += skillText.height + 14;

  const btnCenterY = y + btnH / 2;
  y += btnH + pad;
  const panelH = y;

  const root = new PIXI.Container();
  root.position.set(opts.w / 2 - panelW / 2, opts.bottomY - panelH);

  root.addChild(makePanel({
    width: panelW, height: panelH, radius: RADIUS.card, centered: false,
    bg: COLORS.panelBg, bgAlpha: 0.96, border: rarity.color, borderWidth: 2,
  }));

  y = pad;
  title1.position.set(pad, y);
  root.addChild(title1);
  y += title1.height + 4;

  title2.position.set(pad, y);
  root.addChild(title2);
  y += title2.height + 12;

  const colCenters = [pad + innerW * 0.17, pad + innerW * 0.5, pad + innerW * 0.83];
  root.addChild(statCell('攻', newSnap.atk, target.atk, colCenters[0], y + statsRowH * 0.45));
  root.addChild(statCell('生命', newSnap.hp, target.hp, colCenters[1], y + statsRowH * 0.45));
  root.addChild(statCell('回复', newSnap.rcv, target.rcv, colCenters[2], y + statsRowH * 0.45));
  y += statsRowH + 10;

  skillText.position.set(pad, y);
  root.addChild(skillText);

  const teamFull = PlayerData.team.length >= 5;
  const shortTarget = target.def.name.length > 4
    ? `${target.def.name.slice(0, 4)}…`
    : target.def.name;
  const deploy = makeButton({
    label: teamFull ? `一键替换 · ${shortTarget}` : '一键上阵',
    width: btnW, height: btnH, variant: 'success', fontSize: FONT_SIZE.xs,
    onTap: () => {
      if (PlayerData.isInTeam(opts.outcome.petId)) return;
      if (PlayerData.team.length >= 5 && !PlayerData.removeFromTeam(target.def.id)) return;
      if (PlayerData.addToTeam(opts.outcome.petId)) opts.onDeployed();
    },
  });
  deploy.position.set(panelW / 2, btnCenterY);
  root.addChild(deploy);

  return { root, height: panelH };
}
