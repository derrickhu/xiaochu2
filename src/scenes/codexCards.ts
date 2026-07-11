import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { getPetAvatarTexture } from '@/config/petAvatarTexture';
import type { PetDef } from '@/balance/pets';
import { petAtk, petHp, petRcv } from '@/formulas/growth';
import { ORB_IMAGES } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import {
  COLORS,
  makeLevelLabel,
  makePanel,
  makePetStatsLine,
  attachRarityBadge,
  makeRoleBadge,
  makeStarRow,
  makeText,
} from '@/ui';

/** 未拥有卡：稀有度底板 + 剪影 + 获取提示。 */
export function buildLockedCodexCard(
  item: PIXI.Container,
  pet: PetDef,
  cardW: number,
  cardH: number,
  S: number,
  cardBgTex: PIXI.Texture | null = null,
): void {
  if (cardBgTex) {
    const bg = new PIXI.Sprite(cardBgTex);
    bg.width = cardW;
    bg.height = cardH;
    bg.tint = 0xb0b0b0;
    bg.alpha = 0.92;
    item.addChild(bg);
  } else {
    item.addChild(makePanel({
      width: cardW, height: cardH, radius: 8 * S, centered: false,
      bg: COLORS.panelBgAlt, bgAlpha: 0.9,
      border: COLORS.panelBorderSoft,
    }));
  }

  const orbTex = TextureCache.get(ORB_IMAGES[pet.element]);
  if (orbTex) {
    const orbSz = 18 * S;
    const orb = new PIXI.Sprite(orbTex);
    orb.width = orbSz;
    orb.height = orbSz;
    orb.position.set(10 * S, 10 * S);
    orb.alpha = 0.4;
    item.addChild(orb);
  }

  const avatarSize = cardW * 0.62;
  const avatarLeft = (cardW - avatarSize) / 2;
  const avatarTop = 8 * S;

  const avatarTex = getPetAvatarTexture(pet.id, 1);
  if (avatarTex) {
    const avatar = new PIXI.Sprite(avatarTex);
    avatar.width = avatarSize;
    avatar.height = avatarSize;
    avatar.position.set(avatarLeft, avatarTop);
    avatar.tint = 0x111317;
    avatar.alpha = 0.85;
    item.addChild(avatar);
  }
  attachRarityBadge(item, pet.rarity, 0, 0, avatarSize, { variant: 'codex' });

  const lock = makeText('未获得', {
    size: Math.round(11 * S), fill: COLORS.textSub,
    bold: true, anchor: 0.5,
  });
  lock.position.set(cardW / 2, 8 * S + avatarSize + 14 * S);
  item.addChild(lock);

  const tip = makeText('？？？', {
    size: Math.round(11 * S), fill: COLORS.textDisabled, bold: true, anchor: 0.5,
  });
  tip.position.set(cardW / 2, cardH - 16 * S);
  item.addChild(tip);
}

/** 已拥有单卡布局，对齐 xiao_chu _drawPetCard。 */
export function buildOwnedCodexCard(
  item: PIXI.Container,
  pet: PetDef,
  cardW: number,
  cardH: number,
  S: number,
  cardBgTex: PIXI.Texture | null,
): void {
  const petId = pet.id;
  const lv = PlayerData.petLevel(petId);
  const star = PlayerData.petStar(petId);

  if (cardBgTex) {
    const bg = new PIXI.Sprite(cardBgTex);
    bg.width = cardW;
    bg.height = cardH;
    item.addChild(bg);
  } else {
    item.addChild(makePanel({
      width: cardW, height: cardH, radius: 8 * S, centered: false,
      bg: COLORS.panelBg, border: COLORS.panelBorderSoft,
    }));
  }

  const orbTex = TextureCache.get(ORB_IMAGES[pet.element]);
  if (orbTex) {
    const orbSz = 18 * S;
    const orb = new PIXI.Sprite(orbTex);
    orb.width = orbSz;
    orb.height = orbSz;
    orb.position.set(10 * S, 10 * S);
    item.addChild(orb);
  }

  const avatarSize = cardW * 0.62;
  const avatarLeft = (cardW - avatarSize) / 2;
  const avatarTop = 8 * S;

  const avatarTex = getPetAvatarTexture(pet.id, star);
  if (avatarTex) {
    const avatar = new PIXI.Sprite(avatarTex);
    avatar.width = avatarSize;
    avatar.height = avatarSize;
    avatar.position.set(avatarLeft, avatarTop);
    item.addChild(avatar);
  }
  attachRarityBadge(item, pet.rarity, 0, 0, avatarSize, { variant: 'codex' });

  const displayName = pet.name.length > 4 ? `${pet.name.slice(0, 4)}…` : pet.name;
  const nameY = 8 * S + avatarSize + 6 * S;
  const nameText = makeText(displayName, {
    size: Math.round(10 * S), fill: COLORS.cardNameText, bold: true, anchor: 0.5,
    strokeColor: COLORS.cardNameStroke, strokeWidth: Math.max(2, Math.round(2 * S)),
  });
  nameText.position.set(cardW / 2, nameY);
  item.addChild(nameText);

  const starY = nameY + 14 * S;
  const stars = makeStarRow({ star, scale: S, variant: 'card', anchor: 'center' });
  stars.position.set(cardW / 2, starY);
  item.addChild(stars);

  const lvY = starY + 12 * S;
  const lvLine = makeLevelLabel({ level: lv, scale: S, variant: 'card' });
  lvLine.position.set(cardW / 2 - lvLine.width / 2, lvY);
  item.addChild(lvLine);

  const statsY = lvY + 12 * S;
  const statsLine = makePetStatsLine({
    atk: petAtk(pet, lv, star),
    hp: petHp(pet, lv, star),
    rcv: petRcv(pet, lv, star),
    scale: S,
    variant: 'card',
  });
  statsLine.position.set(cardW / 2 - statsLine.width / 2, statsY);
  item.addChild(statsLine);

  const roleBadge = makeRoleBadge({ role: pet.role, scale: S, maxWidth: cardW - 10 * S });
  roleBadge.position.set((cardW - roleBadge.width) / 2, cardH - 21 * S);
  item.addChild(roleBadge);
}
