/**
 * 图鉴竖卡：对齐 codex_panel_proto_v3_ring_entry
 * 已拥有：立绘 + 稀有度 + 属性珠 + Lv + 名 + 定位胶囊 + 星
 * 未获得：剪影 + 未获得 + 定位胶囊 + 空星（招募下一只保留价格条）
 *
 * 信息带在立绘下方：名 → 定位 → 星，定位不压在宠身上。
 * 等级叠在立绘左下（与编队槽位同口径），三列窄卡放不下「Lv + 五星」同行。
 */
import * as PIXI from 'pixi.js';
import { bindPetAvatarSprite } from '@/config/petAvatarTexture';
import type { PetDef } from '@/balance/pets';
import type { PetRole } from '@/balance/petRoles';
import { PlayerData } from '@/game/PlayerData';
import {
  COLORS,
  makePanel,
  attachRarityBadge,
  makeRoleBadge,
  makeStarRow,
  makeLevelLabel,
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

/**
 * 竖卡：名/定位/星紧凑叠放并整体上移，立绘放大占满上方空间
 * @param bottomInset 底部预留给招募条等的高度
 * @param withStars 无星级时（招募卡）定位直接贴底栏上方
 */
function codexCardGeom(
  cardW: number,
  cardH: number,
  S: number,
  bottomInset = 0,
  withStars = true,
) {
  const roleScale = Math.max(1.15, S * 0.78);
  const badgeH = 14 * roleScale;
  /** 信息带整体上移，给立绘腾高度，底部留一点呼吸 */
  const infoLift = 10 * S;
  const starsY = cardH - 10 * S - bottomInset - infoLift;
  const roleY = withStars
    ? starsY - 4 * S - badgeH
    : cardH - bottomInset - infoLift - 3 * S - badgeH;
  const nameY = roleY - 9 * S;
  const avatarTop = 8 * S;
  const avatarSize = Math.min(
    cardW * 0.72,
    Math.max(cardW * 0.60, nameY - 4 * S - avatarTop),
  );
  const avatarLeft = (cardW - avatarSize) / 2;
  return { avatarSize, avatarLeft, avatarTop, nameY, roleY, starsY, roleScale };
}

/** 立绘下方居中挂定位胶囊（输出 / 治疗 / 坦克 / 辅助） */
function addCodexRoleBadge(
  item: PIXI.Container,
  role: PetRole,
  cardW: number,
  roleY: number,
  roleScale: number,
  S: number,
  alpha = 1,
): void {
  const badge = makeRoleBadge({
    role,
    scale: roleScale,
    maxWidth: cardW - 16 * S,
    textFill: 0xffffff,
  });
  badge.position.set((cardW - badge.width) / 2, roleY);
  badge.alpha = alpha;
  item.addChild(badge);
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

  const recruitBarH = 22 * S;
  const recruitBarPad = 8 * S;
  const g = recruit
    ? codexCardGeom(cardW, cardH, S, recruitBarH + recruitBarPad, false)
    : codexCardGeom(cardW, cardH, S);

  addCodexAvatar(item, pet.id, 1, g.avatarLeft, g.avatarTop, g.avatarSize, {
    tint: 0x111317,
    alpha: 0.85,
  });
  attachRarityBadge(item, pet.rarity, 0, 0, g.avatarSize, { variant: 'codex' });

  if (recruit) {
    const name = makeText(pet.name, {
      size: Math.round(12 * S), fill: COLORS.textMain, bold: true, anchor: 0.5,
    });
    name.position.set(cardW / 2, g.nameY);
    item.addChild(name);
    addCodexRoleBadge(item, pet.role, cardW, g.roleY, g.roleScale, S, 0.78);

    const barW = cardW - 12 * S;
    const barY = cardH - recruitBarH - recruitBarPad;
    const bar = makePanel({
      width: barW, height: recruitBarH, radius: recruitBarH / 2, centered: false,
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
    label.position.set(cardW / 2, barY + recruitBarH / 2);
    item.addChild(label);
    return;
  }

  const lock = makeText('未获得', {
    size: Math.round(13 * S), fill: COLORS.textSub, bold: true, anchor: 0.5,
  });
  lock.position.set(cardW / 2, g.nameY);
  item.addChild(lock);
  addCodexRoleBadge(item, pet.role, cardW, g.roleY, g.roleScale, S, 0.78);

  const stars = makeStarRow({ star: 0, scale: S, variant: 'card', anchor: 'center', style: 'sprite' });
  stars.position.set(cardW / 2, g.starsY);
  item.addChild(stars);
}

/** 已拥有卡：立绘为主，定位在名字与星级之间便于扫一眼辨认职能 */
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

  const g = codexCardGeom(cardW, cardH, S);

  addCodexAvatar(item, pet.id, star, g.avatarLeft, g.avatarTop, g.avatarSize);
  attachRarityBadge(item, pet.rarity, 0, 0, g.avatarSize, { variant: 'codex' });

  const lv = PlayerData.petLevel(pet.id);
  const lvLabel = makeLevelLabel({
    level: lv,
    size: Math.round(12 * S),
    variant: 'card',
    anchor: [0, 1],
  });
  lvLabel.position.set(g.avatarLeft + 2 * S, g.avatarTop + g.avatarSize - 1 * S);
  item.addChild(lvLabel);

  const displayName = pet.name.length > 5 ? `${pet.name.slice(0, 5)}…` : pet.name;
  const nameText = makeText(displayName, {
    size: Math.round(12 * S), fill: COLORS.cardNameText, bold: true, anchor: 0.5,
    strokeColor: COLORS.cardNameStroke, strokeWidth: Math.max(2, Math.round(2 * S)),
  });
  nameText.position.set(cardW / 2, g.nameY);
  item.addChild(nameText);

  addCodexRoleBadge(item, pet.role, cardW, g.roleY, g.roleScale, S);

  const stars = makeStarRow({ star, scale: S, variant: 'card', anchor: 'center', style: 'sprite' });
  stars.position.set(cardW / 2, g.starsY);
  item.addChild(stars);
}
