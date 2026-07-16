import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TextureCache } from '@/core/TextureCache';
import { bindPetAvatarSprite } from '@/config/petAvatarTexture';
import { getRarity } from '@/balance/rarity';
import { PET_MAP, type PetDef } from '@/balance/pets';
import { petAtk, petHp, petRcv } from '@/formulas/growth';
import {
  petFrameImage,
  UI_SCENE_IMAGES,
} from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import {
  COLORS,
  FONT_SIZE,
  RADIUS,
  makeElementRoleLine,
  makeLevelStarLine,
  makePanel,
  makePetStatsLine,
  makeRoleBadge,
  attachRarityBadge,
  makeRarityCardBorder,
  makeShardBadge,
  makeText,
  attachPetFrameOrb,
  makeElementOrb,
  makeStarRow,
} from '@/ui';
import type { ScrollListController } from '@/ui/ScrollList';
import { bindPointerTap } from '@/utils/bindPointerTap';

/** 自由编队：较宽横卡 */
const FREE_CARD_W = 330;
const FREE_CARD_H = 148;
const FREE_AVATAR = 74;

/** 战前可选区：双列横卡；左侧立绘高度与卡板同高 */
const PREP_CARD_W = 300;
const PREP_CARD_H = 108;
const PREP_CARD_BG = 0xfffdf8;
const PREP_CARD_BORDER = 0xd4b87a;

const CARD_TEX_W = 660;
const CARD_TEX_H = 296;
const LIST_LEFT_PAD = 12;
const LIST_TEXT_GAP = 12;

export interface TeamPetListOpts {
  container: PIXI.Container;
  startY: number;
  listBottom?: number;
  /** 紧凑卡（战前原型）：名+定位胶囊+等级星，无三维行 */
  compact?: boolean;
  checks: Map<string, PIXI.Container>;
  items: Map<string, PIXI.Container>;
  scroll: ScrollListController;
  onToggle: (petId: string) => void;
}

export function buildTeamPetList(opts: TeamPetListOpts): PIXI.Container | null {
  const { container, startY, listBottom, compact, checks, items, scroll, onToggle } = opts;
  const w = Game.logicWidth;
  const cols = 2;
  const cardW = compact ? PREP_CARD_W : FREE_CARD_W;
  const cardH = compact ? PREP_CARD_H : FREE_CARD_H;
  const gapX = compact ? 16 : 24;
  const gapY = compact ? 10 : 14;
  const gridW = cols * cardW + (cols - 1) * gapX;
  const startX = (w - gridW) / 2 + cardW / 2;
  const scrollTex = compact ? null : TextureCache.get(UI_SCENE_IMAGES.petCardTeamRow);
  const scrollable = listBottom !== undefined;
  const parent = scrollable ? new PIXI.Container() : container;
  if (scrollable) {
    parent.position.set(0, startY);
    container.addChild(parent);
  }

  let maxBottom = 0;
  PlayerData.ownedPets.forEach((petId, i) => {
    const pet = PET_MAP.get(petId);
    if (!pet) return;
    const lv = PlayerData.petLevel(petId);
    const star = PlayerData.petStar(petId);
    const item = buildListItem(pet, lv, star, scrollTex, scroll, onToggle, !!compact, cardW, cardH, scrollable ? {
      viewportTop: startY,
      viewportBottom: listBottom!,
    } : undefined);

    const col = i % cols;
    const row = Math.floor(i / cols);
    const itemY = row * (cardH + gapY) + cardH / 2;
    maxBottom = Math.max(maxBottom, itemY + cardH / 2);
    item.position.set(startX + col * (cardW + gapX), scrollable ? itemY : startY + itemY);
    checks.set(pet.id, item.getChildByName('check') as PIXI.Container);
    items.set(pet.id, item);
    parent.addChild(item);
  });

  if (scrollable && listBottom !== undefined) {
    const viewportH = listBottom - startY;
    const contentH = maxBottom + cardH / 2;
    const scrollMin = Math.min(startY, startY - (contentH - viewportH));
    if (contentH > viewportH) {
      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      mask.drawRect(0, startY, w, viewportH);
      mask.endFill();
      container.addChild(mask);
      parent.mask = mask;
      scroll.attach({
        content: () => parent,
        viewportTop: startY,
        viewportH,
        scrollMin,
        listTop: startY,
        moveThreshold: 8,
      });
    }
  }
  return scrollable ? parent : null;
}

export function addTeamPetAvatar(
  parent: PIXI.Container,
  pet: PetDef,
  x: number,
  y: number,
  size: number,
): void {
  const holder = new PIXI.Container();
  holder.position.set(x, y);
  parent.addChild(holder);

  const avatar = new PIXI.Sprite(PIXI.Texture.EMPTY);
  avatar.anchor.set(0.5);
  holder.addChild(avatar);
  bindPetAvatarSprite(avatar, pet.id, PlayerData.petStar(pet.id), (tex) => {
    avatar.scale.set((size - 8) / Math.max(tex.width, tex.height));
  });
  const frameTex = TextureCache.get(petFrameImage(pet.element));
  if (frameTex) {
    const frame = new PIXI.Sprite(frameTex);
    frame.anchor.set(0.5);
    frame.scale.set(size / Math.max(frameTex.width, frameTex.height));
    holder.addChild(frame);
  }
  attachPetFrameOrb(holder, pet.element, size);
}

/**
 * 战前上阵竖卡：立绘高度与背景板一致（铺满卡高），左上棋盘珠属性标，Lv+星叠底。
 * 对齐 team_prep 原型。
 */
export function addTeamPrepSlotPet(
  parent: PIXI.Container,
  pet: PetDef,
  slotW: number,
  slotH: number,
  level: number,
  star: number,
): void {
  const border = 0xe0c896;
  const radius = 12;
  // 底仅作缺图兜底；立绘铺满整卡，高度与背景板一致
  parent.addChild(makePanel({
    width: slotW, height: slotH, radius,
    bg: 0xfff8ec, bgAlpha: 1,
    border, borderWidth: 0,
    centered: true,
  }));

  const art = new PIXI.Container();
  const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
  spr.anchor.set(0.5);
  art.addChild(spr);
  bindPetAvatarSprite(spr, pet.id, star, (tex) => {
    const cover = Math.max(slotW / tex.width, slotH / tex.height) * 1.12;
    spr.scale.set(cover);
  });
  const mask = new PIXI.Graphics();
  mask.beginFill(0xffffff);
  mask.drawRoundedRect(-slotW / 2, -slotH / 2, slotW, slotH, radius);
  mask.endFill();
  art.addChild(mask);
  art.mask = mask;
  parent.addChild(art);

  // 棋盘珠贴卡框左上角（锚点中心 → 圆心落在角内侧半珠处）
  const orbSize = 32;
  const orbPad = 2;
  const orb = makeElementOrb(pet.element, orbSize);
  orb.position.set(-slotW / 2 + orbSize / 2 + orbPad, -slotH / 2 + orbSize / 2 + orbPad);
  parent.addChild(orb);

  const lvText = makeText(`Lv.${level}`, {
    size: 15, fill: COLORS.btnText, bold: true, anchor: [0, 1],
    strokeColor: 0x2a1a0c, strokeWidth: 3,
  });
  lvText.position.set(-slotW / 2 + 8, slotH / 2 - 18);
  parent.addChild(lvText);

  const stars = makeStarRow({ star, size: 12, anchor: 'center', style: 'sprite' });
  stars.position.set(0, slotH / 2 - 10);
  parent.addChild(stars);

  const rim = new PIXI.Graphics();
  rim.lineStyle(2.5, border, 1);
  rim.drawRoundedRect(-slotW / 2, -slotH / 2, slotW, slotH, radius);
  parent.addChild(rim);
}

function buildListItem(
  pet: PetDef,
  lv: number,
  star: number,
  scrollTex: PIXI.Texture | null,
  scroll: ScrollListController,
  onToggle: (petId: string) => void,
  compact: boolean,
  cardW: number,
  cardH: number,
  viewport?: { viewportTop: number; viewportBottom: number },
): PIXI.Container {
  const item = new PIXI.Container();
  const avatarSize = FREE_AVATAR;
  /** 紧凑卡：立绘宽=卡高，顶底与卡板齐平 */
  const portraitW = compact ? cardH : avatarSize;

  if (compact) {
    item.addChild(makePanel({
      width: cardW, height: cardH, radius: 14,
      bg: PREP_CARD_BG, bgAlpha: 0.98,
      border: PREP_CARD_BORDER, borderWidth: 2,
      centered: true,
    }));
    // 左侧立绘：高度与背景板一致（铺满卡高）
    addPrepListPortrait(item, pet, -cardW / 2, cardH, PlayerData.petStar(pet.id));
  } else if (scrollTex) {
    const sx = cardW / CARD_TEX_W;
    const sy = cardH / CARD_TEX_H;
    const scrollBg = new PIXI.Sprite(scrollTex);
    scrollBg.anchor.set(0.5);
    scrollBg.scale.set(sx, sy);
    item.addChild(scrollBg);
    item.addChild(makeRarityCardBorder({
      width: cardW, height: cardH, tier: pet.rarity,
      radius: RADIUS.card, centered: true, borderWidth: 3,
    }));
  } else {
    item.addChild(makePanel({
      width: cardW, height: cardH, radius: RADIUS.card,
      bg: COLORS.panelBg, border: getRarity(pet.rarity).color,
      centered: true,
    }));
  }

  const frameLeft = -cardW / 2;
  const frameTop = -cardH / 2;
  if (!compact) {
    const avatarX = -cardW / 2 + LIST_LEFT_PAD + avatarSize / 2;
    addTeamPetAvatar(item, pet, avatarX, 0, avatarSize);
    attachRarityBadge(item, pet.rarity, frameLeft, frameTop, avatarSize, { variant: 'codex' });
    const shardBadge = makeShardBadge({ shards: PlayerData.petShards(pet.id) });
    shardBadge.position.set(avatarX, 4 + avatarSize / 2 + 14);
    item.addChild(shardBadge);
  }

  const textX = compact
    ? -cardW / 2 + portraitW + LIST_TEXT_GAP
    : -cardW / 2 + LIST_LEFT_PAD + avatarSize + LIST_TEXT_GAP;
  const nameText = makeText(pet.name, {
    size: compact ? FONT_SIZE.xs : FONT_SIZE.xs,
    fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
  });
  nameText.position.set(textX, compact ? -22 : -30);
  item.addChild(nameText);

  if (compact) {
    const badge = makeRoleBadge({ role: pet.role, scale: 1.85, textFill: 0xffffff });
    badge.position.set(cardW / 2 - 72, -24);
    item.addChild(badge);
    const line3 = makeLevelStarLine({ level: lv, star, size: FONT_SIZE.xxs, variant: 'panel' });
    line3.position.set(textX, 14);
    item.addChild(line3);
  } else {
    const line2 = makeElementRoleLine(pet.element, pet.role, { size: FONT_SIZE.xxs });
    line2.position.set(textX, -6);
    item.addChild(line2);

    const line3 = makeLevelStarLine({ level: lv, star, size: FONT_SIZE.xxs, variant: 'panel' });
    line3.position.set(textX, 18);
    item.addChild(line3);

    const line4 = makePetStatsLine({
      atk: petAtk(pet, lv, star), hp: petHp(pet, lv, star), rcv: petRcv(pet, lv, star),
      size: FONT_SIZE.xxs, variant: 'panel',
    });
    line4.position.set(textX, 40);
    item.addChild(line4);
  }

  const check = buildCheckMark();
  check.name = 'check';
  check.position.set(cardW / 2 - 18, -cardH / 2 + 18);
  item.addChild(check);

  item.hitArea = new PIXI.Rectangle(-cardW / 2, -cardH / 2, cardW, cardH);
  item.eventMode = 'static';
  item.cursor = 'pointer';
  item.interactiveChildren = false;

  bindPointerTap(item, () => onToggle(pet.id), {
    blockTap: () => scroll.moved,
    pointGuard: viewport
      ? (dx, dy) => dy >= viewport.viewportTop && dy <= viewport.viewportBottom
      : undefined,
  });

  return item;
}

/**
 * 可选卡左侧立绘：高度 = 卡板高度，顶底贴齐，不再上下留白。
 * @param leftX 卡左缘（centered 卡坐标系）
 */
function addPrepListPortrait(
  parent: PIXI.Container,
  pet: PetDef,
  leftX: number,
  cardH: number,
  star: number,
): void {
  const radius = 12;
  const border = PREP_CARD_BORDER;
  const pw = cardH;
  const ph = cardH;
  const host = new PIXI.Container();
  host.position.set(leftX + pw / 2, 0);
  parent.addChild(host);

  host.addChild(makePanel({
    width: pw, height: ph, radius,
    bg: 0xf5e8d0, bgAlpha: 1,
    border: PREP_CARD_BORDER, borderWidth: 0,
    centered: true,
  }));

  const art = new PIXI.Container();
  const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
  spr.anchor.set(0.5);
  art.addChild(spr);
  bindPetAvatarSprite(spr, pet.id, star, (tex) => {
    spr.scale.set(Math.max(pw / tex.width, ph / tex.height) * 1.06);
  });
  const mask = new PIXI.Graphics();
  mask.beginFill(0xffffff);
  mask.drawRoundedRect(-pw / 2, -ph / 2, pw, ph, radius);
  mask.endFill();
  art.addChild(mask);
  art.mask = mask;
  host.addChild(art);

  const orbSize = 26;
  const orbPad = 2;
  const orb = makeElementOrb(pet.element, orbSize);
  orb.position.set(-pw / 2 + orbSize / 2 + orbPad, -ph / 2 + orbSize / 2 + orbPad);
  host.addChild(orb);

  const rim = new PIXI.Graphics();
  rim.lineStyle(2, border, 1);
  rim.drawRoundedRect(-pw / 2, -ph / 2, pw, ph, radius);
  host.addChild(rim);
}

function buildCheckMark(): PIXI.Container {
  const check = new PIXI.Container();
  check.visible = false;
  check.addChild(makePanel({
    width: 32, height: 32, radius: 16,
    bg: COLORS.btnSuccessBg, border: COLORS.btnSuccessBorder, borderWidth: 2,
  }));
  check.addChild(makeText('上', {
    size: FONT_SIZE.xxs, fill: COLORS.btnText, bold: true, anchor: 0.5,
  }));
  return check;
}
