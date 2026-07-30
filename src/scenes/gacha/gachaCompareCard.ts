/**
 * 出货对比卡 —— 严格对齐 docs/prompt/gacha_summon_result_ui_v2.png 文字区：
 * 暖奶油面板、翠绿标题、软玉定位标、图标左排三维、舒朗字距。
 *
 * 新宠：对比/上阵 + 三维 + 技能。
 * 重复：轻量「已拥有 + 碎片条 + 升星进度」（对齐碎片转化原型，无三维格）。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { PET_MAP, PET_ROLE_NAME, type PetDef } from '@/balance/pets';
import { getRarity } from '@/balance/rarity';
import { getSkill } from '@/balance/skills';
import { petAtk, petHp, petRcv } from '@/formulas/growth';
import { PlayerData } from '@/game/PlayerData';
import type { PullOutcome } from '@/game/gacha/Gacha';
import { UI_IMAGES } from '@/config/Assets';
import {
  COLORS, FONT_SIZE,
  makeActionButton, makePanel, makeText, makeSkillIcon, makeProgressBar,
} from '@/ui';

/** V2 采样色 */
const PANEL_BG = 0xfdf3df;
const PANEL_BORDER = 0xd4a84b;
const CHIP_BG = 0xfffbf3;
const CHIP_BORDER = 0xe2c896;
const TITLE_GREEN = 0x5a9a45;
const DELTA_GREEN = 0x5a9a45;
const ROLE_PILL_BG = 0x8bc47a;
const ROLE_PILL_BORDER = 0x6aa84f;

export interface GachaCompareCardHandle {
  root: PIXI.Container;
  height: number;
  width: number;
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

/** 优先最高稀有新宠；全是重复时取最高稀有（保证下半说明框仍出现） */
export function pickFeaturedOutcome(outcomes: readonly PullOutcome[]): PullOutcome | null {
  if (outcomes.length === 0) return null;
  const news = outcomes.filter((o) => !o.duplicate);
  const pool = news.length > 0 ? news : outcomes;
  return pool.reduce((best, o) => (o.rarity > best.rarity ? o : best));
}

/** @deprecated 用 pickFeaturedOutcome；保留给旧调用 */
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

/** V2：软玉绿定位胶囊；字号/描边略加大，避免小白字在绿底发糊 */
function makeV2RolePill(label: string): PIXI.Container {
  const h = 34;
  const w = Math.max(68, label.length * 22 + 28);
  const root = new PIXI.Container();
  root.addChild(makePanel({
    width: w, height: h, radius: h / 2, centered: false,
    bg: ROLE_PILL_BG, bgAlpha: 1, border: ROLE_PILL_BORDER, borderWidth: 2,
  }));
  const t = makeText(label, {
    size: FONT_SIZE.xs, fill: 0xffffff, bold: true, anchor: 0.5,
    strokeColor: 0x3d6a32, strokeWidth: 3,
  });
  t.roundPixels = true;
  t.position.set(Math.round(w / 2), Math.round(h / 2));
  root.addChild(t);
  (root as PIXI.Container & { pillW: number; pillH: number }).pillW = w;
  (root as PIXI.Container & { pillH: number }).pillH = h;
  return root;
}

type RewardBanner = PIXI.Container & { bannerW: number; bannerH: number };

function makeRewardBanner(
  hint: string,
  shards: number,
  maxW: number,
): RewardBanner {
  const h = 58;
  const root = new PIXI.Container() as RewardBanner;
  const hintLbl = makeText(hint, {
    size: FONT_SIZE.xs, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
  });
  const amt = makeText(`+${shards}`, {
    size: FONT_SIZE.lg, fill: TITLE_GREEN, bold: true, anchor: [0, 0.5],
    role: 'title',
  });
  const unit = makeText('碎片', {
    size: FONT_SIZE.md, fill: TITLE_GREEN, bold: true, anchor: [0, 0.5],
    role: 'title',
  });
  const gap1 = 10;
  const gap2 = 6;
  const contentW = hintLbl.width + gap1 + amt.width + gap2 + unit.width;
  const w = Math.min(maxW, Math.max(320, contentW + 48));
  root.addChild(makePanel({
    width: w, height: h, radius: h / 2, centered: false,
    bg: CHIP_BG, bgAlpha: 1, border: ROLE_PILL_BORDER, borderWidth: 2,
  }));
  let x = (w - contentW) / 2;
  const cy = h / 2;
  hintLbl.position.set(x, cy);
  root.addChild(hintLbl);
  x += hintLbl.width + gap1;
  amt.position.set(x, cy);
  root.addChild(amt);
  x += amt.width + gap2;
  unit.position.set(x, cy);
  root.addChild(unit);
  root.bannerW = w;
  root.bannerH = h;
  return root;
}

/** 重复出货：说明框内醒目「获得碎片 +N」 */
function makeShardRewardBanner(shards: number, maxW: number): RewardBanner {
  return makeRewardBanner('获得', shards, maxW);
}

/**
 * V2 三维格：图标靠左垂直居中，右侧「攻 53」；有对比时再显示「(+0)」
 */
function statChip(
  iconPath: string,
  label: string,
  mine: number,
  theirs: number | null,
  chipW: number,
  chipH: number,
): PIXI.Container {
  const root = new PIXI.Container();
  root.addChild(makePanel({
    width: chipW, height: chipH, radius: 14, centered: false,
    bg: CHIP_BG, bgAlpha: 1, border: CHIP_BORDER, borderWidth: 2,
  }));

  const padL = 14;
  const iconSize = 32;
  const tex = TextureCache.get(iconPath);
  if (tex?.valid) {
    const icon = new PIXI.Sprite(tex);
    icon.anchor.set(0.5);
    icon.width = iconSize;
    icon.height = iconSize;
    icon.position.set(padL + iconSize / 2, chipH / 2);
    root.addChild(icon);
  }

  const textLeft = padL + iconSize + 12;
  const showDelta = theirs !== null;
  const main = makeText(`${label} ${mine}`, {
    size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
  });
  main.position.set(textLeft, showDelta ? chipH * 0.36 : chipH / 2);
  root.addChild(main);

  if (showDelta) {
    const diff = mine - theirs;
    const deltaStr = diff >= 0 ? `(+${diff})` : `(${diff})`;
    const delta = makeText(deltaStr, {
      size: FONT_SIZE.xs, bold: true, anchor: [0, 0.5],
      fill: diff >= 0 ? DELTA_GREEN : COLORS.accentDeep,
    });
    delta.position.set(textLeft, chipH * 0.68);
    root.addChild(delta);
  }
  return root;
}

export function buildGachaCompareCard(opts: {
  w: number;
  bottomY: number;
  outcome: PullOutcome;
  onDeployed: () => void;
}): GachaCompareCardHandle | null {
  const newSnap = snapshot(opts.outcome.petId);
  if (!newSnap) return null;

  const isDup = opts.outcome.duplicate;
  const inTeam = PlayerData.isInTeam(opts.outcome.petId);
  const canDeploy = !isDup && !inTeam;
  const target = canDeploy ? pickCompareTarget(newSnap.def) : null;

  // 内容区与标题分边距：标题必须躲开左上祥云角（比九宫格角 72 再多让）
  const panelW = Math.min(700, opts.w - 20);
  const padX = 48;
  const titlePadX = 92;
  const padTop = 54;
  const padBot = 36;
  const btnH = 72;
  const btnW = Math.min(540, panelW - padX * 2);
  const innerW = panelW - padX * 2;
  const rarity = getRarity(newSnap.def.rarity);

  const titlePrefix = makeText(isDup ? '已拥有' : 'NEW', {
    size: FONT_SIZE.md, fill: TITLE_GREEN, bold: true, anchor: [0, 0.5],
    role: 'title',
  });
  const rarityLbl = makeText(rarity.code, {
    size: FONT_SIZE.md, fill: TITLE_GREEN, bold: true, anchor: [0, 0.5],
    role: 'title',
  });
  const dotLbl = makeText(' · ', {
    size: FONT_SIZE.md, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
  });
  const nameLbl = makeText(newSnap.def.name, {
    size: FONT_SIZE.md, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    role: 'title',
  });
  const rolePill = makeV2RolePill(PET_ROLE_NAME[newSnap.def.role]);
  const roleH = (rolePill as PIXI.Container & { pillH: number }).pillH;

  const rewardBanner = isDup
    ? makeShardRewardBanner(opts.outcome.shards, innerW)
    : null;
  const subLineText = target
    ? `对比上阵 · ${target.def.name}`
    : (inTeam ? '已在阵容中' : '可上阵');
  const compareLine = !isDup
    ? makeText(subLineText, {
      size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: [0, 0],
    })
    : null;

  const chipH = 100;
  const chipGap = 14;
  const chipW = (innerW - chipGap * 2) / 3;
  const refAtk = target?.atk ?? null;
  const refHp = target?.hp ?? null;
  const refRcv = target?.rcv ?? null;
  const chips = isDup ? [] : [
    statChip(UI_IMAGES.iconStatAtk, '攻', newSnap.atk, refAtk, chipW, chipH),
    statChip(UI_IMAGES.iconStatHp, '生命', newSnap.hp, refHp, chipW, chipH),
    statChip(UI_IMAGES.iconStatRcv, '回复', newSnap.rcv, refRcv, chipW, chipH),
  ];

  const newSkill = getSkill(newSnap.def.skillId);
  const powerDiff = target ? newSnap.power - target.power : 0;
  const skillIconSize = 42;
  const skillIcon = !isDup ? makeSkillIcon({
    skillId: newSnap.def.skillId,
    size: skillIconSize,
    fallbackGlyph: newSkill.name.slice(0, 1),
  }) : null;
  const skillPower = !isDup ? makeText(
    `技能 ${newSkill.name} · 战力 ${newSnap.power}${
      target && powerDiff !== 0
        ? (powerDiff >= 0 ? `（+${powerDiff}）` : `（${powerDiff}）`)
        : ''
    }`,
    { size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0, 0.5] },
  ) : null;

  const haveShards = PlayerData.petShards(opts.outcome.petId);
  const needShards = PlayerData.starUpCost(opts.outcome.petId);
  const shardProgressLbl = isDup && needShards !== null
    ? makeText(`碎片 ${haveShards} / ${needShards}`, {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0, 0],
    })
    : isDup
      ? makeText(`碎片 ${haveShards}`, {
        size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0, 0],
      })
      : null;
  const barH = 36;
  const barW = Math.min(innerW, 420);
  const showShardBar = isDup && needShards !== null && needShards > 0;

  const titleRowH = 38;
  const skillRowH = 52;
  const gapAfterTitle = 14;
  const rewardH = rewardBanner?.bannerH ?? 0;
  const compareH = compareLine?.height ?? 0;
  const gapAfterReward = rewardBanner ? 12 : 0;
  const gapAfterCompare = compareLine ? 20 : 0;
  const gapAfterChips = chips.length ? 20 : 0;
  const gapAfterSkill = canDeploy ? 20 : 0;
  const progressBlockH = shardProgressLbl
    ? (shardProgressLbl.height + 8 + (showShardBar ? barH + 4 : 0))
    : 0;
  const gapAfterProgress = progressBlockH ? 8 : 0;
  let contentH = padTop;
  contentH += titleRowH + gapAfterTitle;
  if (rewardBanner) contentH += rewardH + gapAfterReward;
  if (compareLine) contentH += compareH + gapAfterCompare;
  if (chips.length) contentH += chipH + gapAfterChips;
  if (skillIcon && skillPower) contentH += skillRowH + gapAfterSkill;
  if (progressBlockH) contentH += progressBlockH + gapAfterProgress;
  if (canDeploy) contentH += btnH + padBot;
  else contentH += padBot;
  const panelH = contentH;

  const root = new PIXI.Container();
  root.position.set(opts.w / 2 - panelW / 2, opts.bottomY - panelH);

  // 祥云框九宫格：角饰不随加高被拉扁；只一层贴图
  const panelTex = TextureCache.get(UI_IMAGES.gachaResultComparePanel);
  if (panelTex?.valid) {
    // 640×369 原图角云约 72px；中段拉伸奶油底
    const slice = 72;
    const panel = new PIXI.NineSlicePlane(panelTex, slice, slice, slice, slice);
    panel.width = panelW;
    panel.height = panelH;
    root.addChild(panel);
  } else {
    root.addChild(makePanel({
      width: panelW, height: panelH, radius: 22, centered: false,
      bg: PANEL_BG, bgAlpha: 0.98, border: PANEL_BORDER, borderWidth: 3,
    }));
  }

  let y = padTop;
  const titleCy = y + titleRowH / 2;
  let x = titlePadX;
  titlePrefix.position.set(x, titleCy);
  root.addChild(titlePrefix);
  x += titlePrefix.width + 8;
  rarityLbl.position.set(x, titleCy);
  root.addChild(rarityLbl);
  x += rarityLbl.width;
  dotLbl.position.set(x, titleCy);
  root.addChild(dotLbl);
  x += dotLbl.width;
  nameLbl.position.set(x, titleCy);
  root.addChild(nameLbl);
  x += nameLbl.width + 12;
  rolePill.position.set(Math.round(x), Math.round(titleCy - roleH / 2));
  root.addChild(rolePill);
  y += titleRowH + gapAfterTitle;

  if (rewardBanner) {
    rewardBanner.position.set((panelW - rewardBanner.bannerW) / 2, y);
    root.addChild(rewardBanner);
    y += rewardBanner.bannerH + gapAfterReward;
  }
  if (compareLine) {
    compareLine.position.set(padX, y);
    root.addChild(compareLine);
    y += compareLine.height + gapAfterCompare;
  }

  if (chips.length) {
    chips.forEach((chip, i) => {
      chip.position.set(padX + i * (chipW + chipGap), y);
      root.addChild(chip);
    });
    y += chipH + gapAfterChips;
  }

  if (skillIcon && skillPower) {
    const skillGap = 12;
    const skillRow = new PIXI.Container();
    skillIcon.position.set(skillIconSize / 2, 0);
    skillPower.position.set(skillIconSize + skillGap, 0);
    skillRow.addChild(skillIcon, skillPower);
    const skillBlockW = skillIconSize + skillGap + skillPower.width;
    skillRow.position.set((panelW - skillBlockW) / 2, y + skillRowH / 2);
    root.addChild(skillRow);
    y += skillRowH + gapAfterSkill;
  }

  if (shardProgressLbl) {
    shardProgressLbl.position.set(padX, y);
    root.addChild(shardProgressLbl);
    y += shardProgressLbl.height + 8;
    if (showShardBar && needShards) {
      const bar = makeProgressBar({
        width: barW,
        height: barH,
        fill: TITLE_GREEN,
        track: 0xe8d4a8,
        frame: true,
        ratio: Math.min(1, haveShards / needShards),
      });
      bar.position.set((panelW - barW) / 2, y);
      root.addChild(bar);
      y += barH + 4;
    }
    y += gapAfterProgress;
  }

  if (canDeploy) {
    const teamFull = PlayerData.team.length >= 5;
    const shortTarget = target
      ? (target.def.name.length > 5 ? `${target.def.name.slice(0, 5)}…` : target.def.name)
      : '';
    const deploy = makeActionButton({
      title: teamFull && target ? `一键替换 · ${shortTarget}` : '一键上阵',
      width: btnW, height: btnH, variant: 'success', fontSize: FONT_SIZE.md,
      onTap: () => {
        if (PlayerData.isInTeam(opts.outcome.petId)) return;
        if (PlayerData.team.length >= 5) {
          if (!target || !PlayerData.removeFromTeam(target.def.id)) return;
        }
        if (PlayerData.addToTeam(opts.outcome.petId)) opts.onDeployed();
      },
    });
    deploy.position.set(panelW / 2, y + btnH / 2);
    root.addChild(deploy);
  }

  return { root, height: panelH, width: panelW };
}
