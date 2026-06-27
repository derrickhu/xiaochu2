import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import type { PetDef } from '@/balance/pets';
import { petAtk, petHp, petRcv } from '@/formulas/growth';
import { ORB_IMAGES, petAvatarPath } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import {
  COLORS,
  makeLevelLabel,
  makePanel,
  makePetStatsLine,
  makeRarityBadge,
  makeRoleBadge,
  makeStarRow,
  makeText,
} from '@/ui';

export type CodexLockedState = 'discovered' | 'unknown';

/** 未拥有卡：已收录显示灰度可辨头像，未收录显示剪影。 */
export function buildLockedCodexCard(
  item: PIXI.Container,
  pet: PetDef,
  cardW: number,
  cardH: number,
  S: number,
  state: CodexLockedState,
): void {
  const discovered = state === 'discovered';
  item.addChild(makePanel({
    width: cardW, height: cardH, radius: 8 * S, centered: false,
    bg: COLORS.panelBgAlt, bgAlpha: 0.9,
    border: discovered ? COLORS.accent : COLORS.panelBorderSoft,
  }));

  const orbTex = TextureCache.get(ORB_IMAGES[pet.element]);
  if (orbTex) {
    const orbSz = 18 * S;
    const orb = new PIXI.Sprite(orbTex);
    orb.width = orbSz;
    orb.height = orbSz;
    orb.position.set(10 * S, 10 * S);
    orb.alpha = discovered ? 0.85 : 0.4;
    item.addChild(orb);
  }

  if (discovered) {
    const badge = makeRarityBadge({ tier: pet.rarity, scale: S });
    badge.position.set(2 * S, 2 * S);
    item.addChild(badge);
  }

  const avatarSize = cardW * 0.62;
  const avatarTex = TextureCache.get(petAvatarPath(pet.id, 1));
  if (avatarTex) {
    const avatar = new PIXI.Sprite(avatarTex);
    avatar.width = avatarSize;
    avatar.height = avatarSize;
    avatar.position.set((cardW - avatarSize) / 2, 8 * S);
    avatar.tint = discovered ? 0x9a9a9a : 0x111317;
    avatar.alpha = discovered ? 0.95 : 0.85;
    item.addChild(avatar);
  }

  const lock = makeText(discovered ? '可获取' : '未收录', {
    size: Math.round(11 * S), fill: discovered ? COLORS.accent : COLORS.textSub,
    bold: true, anchor: 0.5,
  });
  lock.position.set(cardW / 2, 8 * S + avatarSize + 14 * S);
  item.addChild(lock);

  if (discovered) {
    const roleBadge = makeRoleBadge({ role: pet.role, scale: S, maxWidth: cardW - 10 * S });
    roleBadge.position.set((cardW - roleBadge.width) / 2, cardH - 21 * S);
    item.addChild(roleBadge);
  } else {
    const tip = makeText('？？？', {
      size: Math.round(11 * S), fill: COLORS.textDisabled, bold: true, anchor: 0.5,
    });
    tip.position.set(cardW / 2, cardH - 16 * S);
    item.addChild(tip);
  }
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

  const badge = makeRarityBadge({ tier: pet.rarity, scale: S });
  badge.position.set(2 * S, 2 * S);
  item.addChild(badge);

  const avatarSize = cardW * 0.62;
  const avatarTex = TextureCache.get(petAvatarPath(pet.id, star));
  if (avatarTex) {
    const avatar = new PIXI.Sprite(avatarTex);
    avatar.width = avatarSize;
    avatar.height = avatarSize;
    avatar.position.set((cardW - avatarSize) / 2, 8 * S);
    item.addChild(avatar);
  }

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
