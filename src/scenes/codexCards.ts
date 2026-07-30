/**
 * 图鉴竖卡：对齐 codex_panel_proto_v3_ring_entry
 * 已拥有：立绘 + 稀有度 + 属性珠 + 名 + 星
 * 未获得：剪影 + 未获得 + 空星（招募下一只保留价格条）
 */
import * as PIXI from 'pixi.js';
import { bindPetAvatarSprite } from '@/config/petAvatarTexture';
import type { PetDef } from '@/balance/pets';
import { PlayerData } from '@/game/PlayerData';
import {
  COLORS,
  makePanel,
  attachRarityBadge,
  makeStarRow,
  makeText,
  makeElementOrb,
} from '@/ui';

function addCodexAvatar(
  item: PIXI.Container,
  petId: string,
  star: number,
  avatarLeft: number,
  avatarTop: number,
  avatarSize: number,
  opts?: { tint?: number; alpha?: number },
): void {
  const avatar = new PIXI.Sprite(PIXI.Texture.EMPTY);
  avatar.width = avatarSize;
  avatar.height = avatarSize;
  avatar.position.set(avatarLeft, avatarTop);
  if (opts?.tint != null) avatar.tint = opts.tint;
  if (opts?.alpha != null) avatar.alpha = opts.alpha;
  item.addChild(avatar);
  bindPetAvatarSprite(avatar, petId, star, (tex) => {
    avatar.texture = tex;
    avatar.width = avatarSize;
    avatar.height = avatarSize;
  });
}

export interface CodexRecruitInfo {
  price: number;
  affordable: boolean;
}

function addCardShell(
  item: PIXI.Container,
  cardW: number,
  cardH: number,
  S: number,
  cardBgTex: PIXI.Texture | null,
  locked: boolean,
): void {
  if (cardBgTex) {
    const bg = new PIXI.Sprite(cardBgTex);
    bg.width = cardW;
    bg.height = cardH;
    if (locked) {
      bg.tint = 0xb0b0b0;
      bg.alpha = 0.92;
    }
    item.addChild(bg);
  } else {
    item.addChild(makePanel({
      width: cardW, height: cardH, radius: 8 * S, centered: false,
      bg: locked ? COLORS.panelBgAlt : COLORS.panelBg,
      bgAlpha: locked ? 0.9 : 1,
      border: COLORS.panelBorderSoft,
    }));
  }
}

/** 未拥有卡 */
export function buildLockedCodexCard(
  item: PIXI.Container,
  pet: PetDef,
  cardW: number,
  cardH: number,
  S: number,
  cardBgTex: PIXI.Texture | null = null,
  recruit?: CodexRecruitInfo,
): void {
  addCardShell(item, cardW, cardH, S, cardBgTex, true);

  const orb = makeElementOrb(pet.element, 18 * S);
  orb.anchor.set(0);
  orb.alpha = 0.45;
  orb.position.set(cardW - 28 * S, 10 * S);
  item.addChild(orb);

  const avatarSize = cardW * 0.68;
  const avatarLeft = (cardW - avatarSize) / 2;
  const avatarTop = 14 * S;

  addCodexAvatar(item, pet.id, 1, avatarLeft, avatarTop, avatarSize, {
    tint: 0x111317,
    alpha: 0.85,
  });
  attachRarityBadge(item, pet.rarity, 0, 0, avatarSize, { variant: 'codex' });

  if (recruit) {
    const name = makeText(pet.name, {
      size: Math.round(12 * S), fill: COLORS.textMain, bold: true, anchor: 0.5,
    });
    name.position.set(cardW / 2, avatarTop + avatarSize + 16 * S);
    item.addChild(name);

    const barW = cardW - 12 * S;
    const barH = 22 * S;
    const barY = cardH - barH - 8 * S;
    const bar = makePanel({
      width: barW, height: barH, radius: barH / 2, centered: false,
      bg: recruit.affordable ? COLORS.btnRecruitBg : COLORS.panelBgAlt,
      border: recruit.affordable ? COLORS.btnRecruitBorder : COLORS.panelBorderSoft,
    });
    bar.position.set(6 * S, barY);
    item.addChild(bar);
    const label = makeText(`招募 ${recruit.price}`, {
      size: Math.round(11 * S),
      fill: recruit.affordable ? COLORS.btnText : COLORS.textDisabled,
      bold: true, anchor: 0.5,
    });
    label.position.set(cardW / 2, barY + barH / 2);
    item.addChild(label);
    return;
  }

  const lock = makeText('未获得', {
    size: Math.round(13 * S), fill: COLORS.textSub, bold: true, anchor: 0.5,
  });
  lock.position.set(cardW / 2, avatarTop + avatarSize + 16 * S);
  item.addChild(lock);

  const stars = makeStarRow({ star: 0, scale: S, variant: 'card', anchor: 'center', style: 'sprite' });
  stars.position.set(cardW / 2, cardH - 18 * S);
  item.addChild(stars);
}

/** 已拥有卡：立绘为主，去掉攻血复/等级/定位以贴合原型 */
export function buildOwnedCodexCard(
  item: PIXI.Container,
  pet: PetDef,
  cardW: number,
  cardH: number,
  S: number,
  cardBgTex: PIXI.Texture | null,
): void {
  const star = PlayerData.petStar(pet.id);
  addCardShell(item, cardW, cardH, S, cardBgTex, false);

  const orb = makeElementOrb(pet.element, 18 * S);
  orb.anchor.set(0);
  orb.position.set(cardW - 28 * S, 10 * S);
  item.addChild(orb);

  const avatarSize = cardW * 0.68;
  const avatarLeft = (cardW - avatarSize) / 2;
  const avatarTop = 14 * S;

  addCodexAvatar(item, pet.id, star, avatarLeft, avatarTop, avatarSize);
  attachRarityBadge(item, pet.rarity, 0, 0, avatarSize, { variant: 'codex' });

  const displayName = pet.name.length > 5 ? `${pet.name.slice(0, 5)}…` : pet.name;
  const nameY = avatarTop + avatarSize + 14 * S;
  const nameText = makeText(displayName, {
    size: Math.round(13 * S), fill: COLORS.cardNameText, bold: true, anchor: 0.5,
    strokeColor: COLORS.cardNameStroke, strokeWidth: Math.max(2, Math.round(2 * S)),
  });
  nameText.position.set(cardW / 2, nameY);
  item.addChild(nameText);

  const stars = makeStarRow({ star, scale: S, variant: 'card', anchor: 'center', style: 'sprite' });
  stars.position.set(cardW / 2, cardH - 18 * S);
  item.addChild(stars);
}
