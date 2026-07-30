/**
 * 召唤结果卡（严格对齐 gacha_summon_result_ui_v2）：
 * 大卡 + 暖米底 + 亮描金框 + 名匾 + NEW；容器 pivot=中心。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { bindPetAvatarSprite } from '@/config/petAvatarTexture';
import { UI_IMAGES } from '@/config/Assets';
import { PET_MAP } from '@/balance/pets';
import type { PullOutcome } from '@/game/gacha/Gacha';
import {
  COLORS, FONT_SIZE, RADIUS,
  makePanel, makeText, attachRarityBadge,
} from '@/ui';

/** 与亮丽卡框窗口比例对齐 */
const FRAME_ASPECT = 420 / 648;
/**
 * 米底铺满描金内窗（上窗+名窗+中缝+底饰内沿）。
 * 名窗底≈0.887；须盖住 0.89~0.91 底金两侧镂空。
 * 框底两侧实边≈0.938、中尖≈0.957，直角米底取 bot≤两侧实边，避免尖角旁漏白。
 */
const FACE = {
  top: 0.060,
  bot: 0.935,
  padL: 0.078,
  padR: 0.078,
  radius: 0,
} as const;
const PORTRAIT = { top: 0.08, bot: 0.675, padX: 0.10 } as const;
const NAME_ZONE = { top: 0.79, bot: 0.878 } as const;
/** V2 暖亮米底（比 panelBg 更亮） */
const CARD_CREAM = 0xfff8ec;

/** 单抽卡底统一预留：NEW 徽章 / 碎片绿条同高，避免整宠与碎片卡尺寸跳动 */
export const RESULT_CARD_UNDER_HANG = 72;

export interface GachaResultCardSize {
  cardW: number;
  cardH: number;
  newBadgeExtra: number;
}

/**
 * 单抽：优先撑满可用高度（贴紧标题与对比区），再按最大宽夹紧。
 * @param reserveBelow 卡底下方预留（默认与 NEW/碎片条同高）
 */
export function singleResultCardSize(
  maxH: number,
  maxW = 520,
  reserveBelow = RESULT_CARD_UNDER_HANG,
): GachaResultCardSize {
  const usableH = Math.max(320, maxH - reserveBelow);
  // 先按高度撑满，再受 maxW 约束
  let cardH = usableH;
  let cardW = Math.round(cardH * FRAME_ASPECT);
  if (cardW > maxW) {
    cardW = maxW;
    cardH = Math.round(cardW / FRAME_ASPECT);
  }
  return { cardW, cardH, newBadgeExtra: reserveBelow };
}

export function multiResultCardSize(): GachaResultCardSize {
  const cardW = 124;
  return { cardW, cardH: Math.round(cardW / FRAME_ASPECT), newBadgeExtra: 22 };
}

function makeNewBadge(width: number): PIXI.Container {
  const root = new PIXI.Container();
  const tex = TextureCache.get(UI_IMAGES.gachaResultNewBadge);
  const h = Math.max(32, Math.round(width * 0.36));
  if (tex?.valid) {
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5);
    sp.width = width;
    sp.height = h;
    root.addChild(sp);
  } else {
    root.addChild(makePanel({
      width, height: h, radius: h / 2, centered: true,
      bg: 0x5cbf4a, border: COLORS.accent, borderWidth: 3,
    }));
  }
  const label = makeText('NEW', {
    size: Math.max(16, Math.round(h * 0.52)),
    fill: 0xffffff, bold: true, anchor: 0.5,
    strokeColor: 0x2d4a20, strokeWidth: 3,
  });
  root.addChild(label);
  return root;
}

/**
 * 获得碎片绿条：贴宠卡下沿，高度对齐 RESULT_CARD_UNDER_HANG。
 * 挂点在条带中心。
 */
function makeShardCardBanner(shards: number, hero: boolean): PIXI.Container & { hangH: number } {
  const h = hero ? 64 : 36;
  const root = new PIXI.Container() as PIXI.Container & { hangH: number };
  const tag = makeText('获得', {
    size: hero ? FONT_SIZE.sm : FONT_SIZE.xxs,
    fill: 0xffffff, bold: true, anchor: [0, 0.5],
    strokeColor: 0x2d4a20, strokeWidth: 3,
    role: 'title',
  });
  const amt = makeText(`+${shards}`, {
    size: hero ? FONT_SIZE.lg : FONT_SIZE.md,
    fill: 0xffffff, bold: true, anchor: [0, 0.5],
    strokeColor: 0x2d4a20, strokeWidth: 4,
    role: 'title',
  });
  const unit = makeText('碎片', {
    size: hero ? FONT_SIZE.md : FONT_SIZE.xs,
    fill: 0xffffff, bold: true, anchor: [0, 0.5],
    strokeColor: 0x2d4a20, strokeWidth: 3,
    role: 'title',
  });
  const gap1 = hero ? 12 : 8;
  const gap2 = hero ? 8 : 4;
  const contentW = tag.width + gap1 + amt.width + gap2 + unit.width;
  const w = Math.max(hero ? 320 : 150, contentW + (hero ? 48 : 24));
  root.addChild(makePanel({
    width: w, height: h, radius: h / 2, centered: true,
    bg: 0x5cbf4a, bgAlpha: 1, border: 0xf0d78c, borderWidth: hero ? 4 : 2,
  }));
  let x = -contentW / 2;
  tag.position.set(x, 0);
  root.addChild(tag);
  x += tag.width + gap1;
  amt.position.set(x, 0);
  root.addChild(amt);
  x += amt.width + gap2;
  unit.position.set(x, 0);
  root.addChild(unit);
  root.hangH = h;
  return root;
}

export function buildGachaResultCard(
  o: PullOutcome,
  cardW: number,
  cardH: number,
): PIXI.Container {
  const pet = PET_MAP.get(o.petId);
  const card = new PIXI.Container();
  const hero = cardW >= 200;

  const faceTop = cardH * FACE.top;
  const faceBot = cardH * FACE.bot;
  const facePadL = cardW * FACE.padL;
  const facePadR = cardW * FACE.padR;
  const faceW = cardW - facePadL - facePadR;
  const faceH = faceBot - faceTop;
  const faceRadius = Math.min(faceW, faceH) * FACE.radius;

  // 米底+立绘：圆角裁进内窗，躲开半透明左边框
  const face = new PIXI.Container();
  face.addChild(makePanel({
    width: faceW, height: faceH, radius: 0, centered: false,
    bg: CARD_CREAM, borderWidth: 0,
  })).position.set(facePadL, faceTop);

  const portTop = cardH * PORTRAIT.top;
  const portBot = cardH * PORTRAIT.bot;
  const portH = portBot - portTop;
  const portPadX = cardW * PORTRAIT.padX;
  const portW = cardW - portPadX * 2;

  const nameTop = cardH * NAME_ZONE.top;
  const nameBot = cardH * NAME_ZONE.bot;
  const nameH = nameBot - nameTop;

  const avatarSize = Math.min(portW * 0.94, portH * 0.9);
  const avatarLeft = (cardW - avatarSize) / 2;
  const avatarTop = portTop + (portH - avatarSize) * 0.38;
  const avatar = new PIXI.Sprite(PIXI.Texture.EMPTY);
  avatar.width = avatarSize;
  avatar.height = avatarSize;
  avatar.position.set(avatarLeft, avatarTop);
  face.addChild(avatar);
  bindPetAvatarSprite(avatar, o.petId, 1, (tex) => {
    avatar.texture = tex;
    avatar.width = avatarSize;
    avatar.height = avatarSize;
  });

  const faceMask = new PIXI.Graphics();
  faceMask.beginFill(0xffffff);
  faceMask.drawRoundedRect(facePadL, faceTop, faceW, faceH, faceRadius);
  faceMask.endFill();
  faceMask.renderable = false;
  face.addChild(faceMask);
  face.mask = faceMask;
  card.addChild(face);

  // 亮描金框压在裁切面之上，描金边盖住米底边缘
  const frameTex = TextureCache.get(UI_IMAGES.gachaResultCard);
  if (frameTex?.valid) {
    const frame = new PIXI.Sprite(frameTex);
    frame.width = cardW;
    frame.height = cardH;
    card.addChild(frame);
  } else {
    card.addChild(makePanel({
      width: cardW, height: cardH, radius: RADIUS.small, centered: false,
      bg: 0x000000, bgAlpha: 0, border: COLORS.accent, borderWidth: 5,
    }));
  }

  attachRarityBadge(card, o.rarity, portPadX, portTop, avatarSize, {
    variant: hero ? 'codex' : 'list',
    height: hero ? Math.max(56, Math.round(cardW * 0.17)) : Math.max(28, Math.round(cardW * 0.22)),
    cornerOverlap: 0.32,
    padX: -2,
    padY: -2,
  });

  // V2 金名匾
  const name = pet?.name ?? o.petId;
  const bandTex = TextureCache.get(UI_IMAGES.gachaResultNameBand);
  const bandW = cardW * 0.78;
  const bandH = Math.max(34, nameH * 0.85);
  const bandY = (nameTop + nameBot) / 2;
  if (bandTex?.valid) {
    const band = new PIXI.Sprite(bandTex);
    band.anchor.set(0.5);
    band.width = bandW;
    band.height = bandH;
    band.position.set(cardW / 2, bandY);
    card.addChild(band);
  }
  const nameText = makeText(name.length > 6 ? `${name.slice(0, 6)}…` : name, {
    size: hero ? FONT_SIZE.md : FONT_SIZE.xxs,
    fill: COLORS.cardNameText,
    bold: true,
    anchor: 0.5,
    role: 'title',
  });
  nameText.position.set(cardW / 2, bandY);
  card.addChild(nameText);

  if (!o.duplicate) {
    const badgeW = hero ? 128 : 68;
    const badge = makeNewBadge(badgeW);
    // 与碎片绿条同占位，卡框高度不因 NEW/碎片切换而跳
    badge.position.set(cardW / 2, cardH + RESULT_CARD_UNDER_HANG / 2);
    card.addChild(badge);
  } else {
    const banner = makeShardCardBanner(o.shards, hero);
    banner.position.set(cardW / 2, cardH + RESULT_CARD_UNDER_HANG / 2);
    card.addChild(banner);
  }

  card.pivot.set(cardW / 2, cardH / 2);
  return card;
}
