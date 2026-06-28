/**
 * 能力卡（展示层共享组件）：灵宠的稀有度/属性/定位 + 技能名/CD/描述 + 被动 traits。
 * 图鉴的「锁定预览」与抽卡/商店的详情复用同一函数，保证「看能力再抽/买」口径一致。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { getPetAvatarTexture } from '@/config/petAvatarTexture';
import type { PetDef } from '@/balance/pets';
import { ELEMENT_NAME } from '@/balance/ui';
import { INITIAL_PET_LEVEL, INITIAL_PET_STAR } from '@/balance/pets';
import { petAtk, petHp, petRcv } from '@/formulas/growth';
import { skillForPet } from '@/game/battle/SkillEngine';
import { ORB_IMAGES } from '@/config/Assets';
import {
  COLORS, FONT_SIZE, RADIUS,
  makePanel, makeText, makeRarityBadge, makeRoleBadge,
} from '@/ui';
import { passiveDisplayLines } from './abilityInfo';

export interface AbilityCardOpts {
  width: number;
  /** 是否已拥有（决定锁定提示文案） */
  owned: boolean;
  /** 养成星级（★4+ 展示觉醒灵相） */
  star?: number;
}

/** 构建能力卡内容（以 (0,0) 为左上角的容器，调用方负责定位） */
export function buildAbilityPanel(pet: PetDef, opts: AbilityCardOpts): PIXI.Container {
  const w = opts.width;
  const star = opts.star ?? INITIAL_PET_STAR;
  const lines = passiveDisplayLines(pet, star);
  const skill = skillForPet(pet, star);
  const padX = 28;

  // 估算高度：头部 + 三维 + 技能(2~3行) + 被动行
  const headerH = 150;
  const skillH = 120;
  const traitH = 28 + lines.length * 26;
  const h = headerH + skillH + traitH + 36;

  const cont = new PIXI.Container();
  cont.addChild(makePanel({
    width: w, height: h, radius: RADIUS.card, centered: false,
    bg: COLORS.panelBg, border: COLORS.panelBorder,
  }));

  // 头像
  const avatarTex = getPetAvatarTexture(pet.id, opts.star ?? 1);
  const avatarSize = 110;
  if (avatarTex) {
    const avatar = new PIXI.Sprite(avatarTex);
    avatar.width = avatarSize;
    avatar.height = avatarSize;
    avatar.position.set(padX, 24);
    if (!opts.owned) avatar.tint = 0x8a8a8a;
    cont.addChild(avatar);
  }

  // 属性珠
  const orbTex = TextureCache.get(ORB_IMAGES[pet.element]);
  if (orbTex) {
    const orb = new PIXI.Sprite(orbTex);
    orb.width = 28;
    orb.height = 28;
    orb.position.set(padX, 24);
    cont.addChild(orb);
  }

  const infoX = padX + avatarSize + 20;
  const name = makeText(pet.name, {
    size: FONT_SIZE.lg, fill: COLORS.textMain, bold: true, anchor: [0, 0],
  });
  name.position.set(infoX, 28);
  cont.addChild(name);

  const badge = makeRarityBadge({ tier: pet.rarity, scale: 1.6 });
  badge.position.set(infoX, 70);
  cont.addChild(badge);

  const role = makeRoleBadge({ role: pet.role, scale: 1.6, maxWidth: 160 });
  role.position.set(infoX + badge.width + 12, 70);
  cont.addChild(role);

  const elemLine = makeText(`${ELEMENT_NAME[pet.element]}属性`, {
    size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: [0, 0],
  });
  elemLine.position.set(infoX, 104);
  cont.addChild(elemLine);

  // 初始三维（Lv1 / 1★，作为可见基线）
  const lv = INITIAL_PET_LEVEL;
  const stats = makeText(
    `攻 ${petAtk(pet, lv, INITIAL_PET_STAR)}   血 ${petHp(pet, lv, INITIAL_PET_STAR)}   复 ${petRcv(pet, lv, INITIAL_PET_STAR)}`,
    { size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: [0, 0] },
  );
  stats.position.set(infoX, 128);
  cont.addChild(stats);

  // 技能区
  let y = headerH + 8;
  const skillTitle = makeText(`技能：${skill.name}  · CD ${skill.cd}`, {
    size: FONT_SIZE.sm, fill: COLORS.accentDeep, bold: true, anchor: [0, 0],
  });
  skillTitle.position.set(padX, y);
  cont.addChild(skillTitle);
  y += 34;

  const desc = makeText(skill.desc, {
    size: FONT_SIZE.xs, fill: COLORS.textMain, anchor: [0, 0],
    wordWrapWidth: w - padX * 2,
  });
  desc.position.set(padX, y);
  cont.addChild(desc);
  y = headerH + skillH;

  // 被动
  const passiveTitle = makeText('被动', {
    size: FONT_SIZE.xs, fill: COLORS.textTitle, bold: true, anchor: [0, 0],
  });
  passiveTitle.position.set(padX, y);
  cont.addChild(passiveTitle);
  y += 26;
  if (lines.length === 0) {
    const none = makeText('无', { size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: [0, 0] });
    none.position.set(padX, y);
    cont.addChild(none);
  } else {
    for (const line of lines) {
      const unlocked = line.unlocked !== false;
      const t = makeText(`· ${line.text}`, {
        size: FONT_SIZE.xs,
        fill: unlocked ? (line.color ?? COLORS.textSub) : COLORS.textSub,
        anchor: [0, 0],
      });
      t.alpha = unlocked ? 1 : 0.45;
      t.position.set(padX, y);
      cont.addChild(t);
      y += 26;
    }
  }

  return cont;
}
