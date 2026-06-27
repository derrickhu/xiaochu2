import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TextureCache } from '@/core/TextureCache';
import { getRarity } from '@/balance/rarity';
import { PET_MAP, type PetDef } from '@/balance/pets';
import { petAtk, petHp, petRcv } from '@/formulas/growth';
import {
  petAvatarPath,
  petFrameImage,
  UI_IMAGES,
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
  makeRarityBadge,
  makeRarityCardBorder,
  makeRarityNameLine,
  makeShardBadge,
  makeText,
} from '@/ui';
import type { ScrollListController } from '@/ui/ScrollList';

const LIST_CARD_W = 330;
const LIST_CARD_H = 148;
/** 卡片底图设计尺寸（与 LIST_CARD 同宽高比，避免压扁卷轴纹理） */
const CARD_TEX_W = 660;
const CARD_TEX_H = 296;
const SCROLL_SCALE_X = LIST_CARD_W / CARD_TEX_W;
const SCROLL_SCALE_Y = LIST_CARD_H / CARD_TEX_H;
const LIST_AVATAR_SIZE = 74;
const LIST_LEFT_PAD = 14;
const LIST_TEXT_GAP = 14;

export interface TeamPetListOpts {
  container: PIXI.Container;
  startY: number;
  listBottom?: number;
  checks: Map<string, PIXI.Container>;
  items: Map<string, PIXI.Container>;
  scroll: ScrollListController;
  onToggle: (petId: string) => void;
}

export function buildTeamPetList(opts: TeamPetListOpts): PIXI.Container | null {
  const { container, startY, listBottom, checks, items, scroll, onToggle } = opts;
  const w = Game.logicWidth;
  const cols = 2;
  const gapX = 24;
  const gapY = 14;
  const gridW = cols * LIST_CARD_W + (cols - 1) * gapX;
  const startX = (w - gridW) / 2 + LIST_CARD_W / 2;
  const scrollTex = TextureCache.get(UI_IMAGES.petCardTeamRow);
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
    const item = buildListItem(pet, lv, star, scrollTex, scrollable, onToggle, scroll);

    const col = i % cols;
    const row = Math.floor(i / cols);
    const itemY = row * (LIST_CARD_H + gapY) + LIST_CARD_H / 2;
    maxBottom = Math.max(maxBottom, itemY + LIST_CARD_H / 2);
    item.position.set(startX + col * (LIST_CARD_W + gapX), scrollable ? itemY : startY + itemY);
    checks.set(pet.id, item.getChildByName('check') as PIXI.Container);
    items.set(pet.id, item);
    parent.addChild(item);
  });

  if (scrollable && listBottom !== undefined) {
    const viewportH = listBottom - startY;
    const contentH = maxBottom + LIST_CARD_H / 2;
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
  const tex = TextureCache.get(petAvatarPath(pet.id, PlayerData.petStar(pet.id)));
  if (tex) {
    const avatar = new PIXI.Sprite(tex);
    avatar.anchor.set(0.5);
    avatar.scale.set((size - 8) / Math.max(tex.width, tex.height));
    avatar.position.set(x, y);
    parent.addChild(avatar);
  }
  const frameTex = TextureCache.get(petFrameImage(pet.element));
  if (frameTex) {
    const frame = new PIXI.Sprite(frameTex);
    frame.anchor.set(0.5);
    frame.scale.set(size / Math.max(frameTex.width, frameTex.height));
    frame.position.set(x, y);
    parent.addChild(frame);
  }
}

function buildListItem(
  pet: PetDef,
  lv: number,
  star: number,
  scrollTex: PIXI.Texture | null,
  scrollable: boolean,
  onToggle: (petId: string) => void,
  scroll: ScrollListController,
): PIXI.Container {
  const item = new PIXI.Container();
  if (scrollTex) {
    const scrollBg = new PIXI.Sprite(scrollTex);
    scrollBg.anchor.set(0.5);
    scrollBg.scale.set(SCROLL_SCALE_X, SCROLL_SCALE_Y);
    item.addChild(scrollBg);
    item.addChild(makeRarityCardBorder({
      width: LIST_CARD_W, height: LIST_CARD_H, tier: pet.rarity,
      radius: RADIUS.card, centered: true, borderWidth: 3,
    }));
  } else {
    item.addChild(makePanel({
      width: LIST_CARD_W, height: LIST_CARD_H, radius: RADIUS.card,
      bg: COLORS.panelBg, border: getRarity(pet.rarity).color,
    }));
  }

  const badge = makeRarityBadge({ tier: pet.rarity, scale: Game.logicWidth / 375 });
  badge.position.set(-LIST_CARD_W / 2 + LIST_LEFT_PAD, -LIST_CARD_H / 2 + 6);
  item.addChild(badge);

  const avatarX = -LIST_CARD_W / 2 + LIST_LEFT_PAD + LIST_AVATAR_SIZE / 2;
  addTeamPetAvatar(item, pet, avatarX, 4, LIST_AVATAR_SIZE);
  const shardBadge = makeShardBadge({ shards: PlayerData.petShards(pet.id) });
  shardBadge.position.set(avatarX, 4 + LIST_AVATAR_SIZE / 2 + 14);
  item.addChild(shardBadge);

  const textX = -LIST_CARD_W / 2 + LIST_LEFT_PAD + LIST_AVATAR_SIZE + LIST_TEXT_GAP;
  const nameLine = makeRarityNameLine(pet.rarity, pet.name, {
    size: FONT_SIZE.xs, nameFill: COLORS.textMain,
  });
  nameLine.position.set(textX, -30);
  item.addChild(nameLine);

  const line2 = makeElementRoleLine(pet.element, pet.role, { size: FONT_SIZE.xxs });
  line2.position.set(textX, -6);
  item.addChild(line2);

  const line3 = makeLevelStarLine({ level: lv, star, size: FONT_SIZE.xxs, variant: 'panel', filledOnly: true });
  line3.position.set(textX, 18);
  item.addChild(line3);

  const line4 = makePetStatsLine({
    atk: petAtk(pet, lv, star), hp: petHp(pet, lv, star), rcv: petRcv(pet, lv, star),
    size: FONT_SIZE.xxs, variant: 'panel',
  });
  line4.position.set(textX, 40);
  item.addChild(line4);

  const check = buildCheckMark();
  check.name = 'check';
  check.position.set(LIST_CARD_W / 2 - 22, -LIST_CARD_H / 2 + 22);
  item.addChild(check);

  item.hitArea = new PIXI.Rectangle(-LIST_CARD_W / 2, -LIST_CARD_H / 2, LIST_CARD_W, LIST_CARD_H);
  item.eventMode = 'static';
  item.cursor = 'pointer';
  item.interactiveChildren = false;
  item.on('pointertap', () => {
    if (scrollable && scroll.moved) return;
    onToggle(pet.id);
  });
  return item;
}

function buildCheckMark(): PIXI.Container {
  const check = new PIXI.Container();
  check.addChild(makePanel({
    width: 36, height: 36, radius: 18,
    bg: COLORS.btnSuccessBg, border: COLORS.btnSuccessBorder, borderWidth: 2,
  }));
  check.addChild(makeText('上', {
    size: FONT_SIZE.xxs, fill: COLORS.btnText, bold: true, anchor: 0.5,
  }));
  return check;
}
