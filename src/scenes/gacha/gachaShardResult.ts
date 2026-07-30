/**
 * 碎片转化结算主视觉（对齐 docs/prototypes/gacha_shard_result_ui_v1.png）：
 * 碎晶堆 + 专属圆像框 + 宠名 + 超大「+N 碎片」。pivot=中心。
 * 整宠大金框仅用于非 duplicate。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { bindPetAvatarSprite } from '@/config/petAvatarTexture';
import { UI_IMAGES } from '@/config/Assets';
import { PET_MAP } from '@/balance/pets';
import type { PullOutcome } from '@/game/gacha/Gacha';
import { COLORS, FONT_SIZE, makeText } from '@/ui';

const TITLE_GREEN = 0x5a9a45;

/** 单抽碎片英雄区建议占位（宽×高） */
export function singleShardResultSize(maxH: number, maxW = 520): { w: number; h: number } {
  const w = Math.min(maxW, Math.round(maxH * 0.72));
  const h = Math.min(maxH, Math.round(w * 1.35));
  return { w, h };
}

/** 十连重复格：小碎晶卡 */
export function multiShardChipSize(): { w: number; h: number } {
  return { w: 124, h: 180 };
}

function makeAvatarFrame(size: number): PIXI.Container {
  const root = new PIXI.Container();
  const tex = TextureCache.get(UI_IMAGES.gachaShardAvatarFrame);
  if (tex?.valid) {
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5);
    sp.width = size;
    sp.height = size;
    root.addChild(sp);
    return root;
  }
  // fallback：双线金圈
  const g = new PIXI.Graphics();
  const r = size / 2;
  g.lineStyle(Math.max(5, size * 0.06), 0xe8a33d, 1);
  g.drawCircle(0, 0, r);
  g.lineStyle(Math.max(2, size * 0.028), 0xf0d78c, 0.95);
  g.drawCircle(0, 0, r - size * 0.045);
  root.addChild(g);
  return root;
}

/**
 * 单抽纯碎片：大碎晶 + 圆像 + 超大 +N。
 * 容器本地坐标以中心为 (0,0)。
 */
export function buildGachaShardResult(
  o: PullOutcome,
  areaW: number,
  areaH: number,
): PIXI.Container {
  const pet = PET_MAP.get(o.petId);
  const root = new PIXI.Container();

  // 碎晶略上移，给头像 / 数字留气口
  const crystalMax = Math.min(areaW * 0.88, areaH * 0.42);
  const crystalTex = TextureCache.get(UI_IMAGES.gachaShardCrystal);
  let crystalBottom = -areaH * 0.08;
  if (crystalTex?.valid) {
    const sp = new PIXI.Sprite(crystalTex);
    const scale = Math.min(crystalMax / sp.texture.width, crystalMax / sp.texture.height);
    sp.anchor.set(0.5);
    sp.scale.set(scale);
    sp.position.set(0, -areaH * 0.28);
    crystalBottom = sp.y + sp.height * 0.42;
    root.addChild(sp);
  }

  const avatarSize = Math.min(areaW * 0.34, areaH * 0.24, 196);
  const avatarY = crystalBottom + avatarSize * 0.42;
  // 内圆约占外框 0.70，略内收避免顶穿描金边
  const faceSize = avatarSize * 0.70;

  const faceLayer = new PIXI.Container();
  faceLayer.position.set(0, avatarY);
  const avatar = new PIXI.Sprite(PIXI.Texture.EMPTY);
  avatar.anchor.set(0.5);
  avatar.width = faceSize;
  avatar.height = faceSize;
  faceLayer.addChild(avatar);
  const faceMask = new PIXI.Graphics();
  faceMask.beginFill(0xffffff);
  faceMask.drawCircle(0, 0, faceSize / 2);
  faceMask.endFill();
  faceMask.renderable = false;
  faceLayer.addChild(faceMask);
  faceLayer.mask = faceMask;
  root.addChild(faceLayer);
  bindPetAvatarSprite(avatar, o.petId, 1, (tex) => {
    avatar.texture = tex;
    avatar.width = faceSize;
    avatar.height = faceSize;
  });

  const frame = makeAvatarFrame(avatarSize);
  frame.position.set(0, avatarY);
  root.addChild(frame);

  const name = makeText(pet?.name ?? o.petId, {
    size: FONT_SIZE.md,
    fill: COLORS.textMain,
    bold: true,
    anchor: 0.5,
    role: 'title',
  });
  // 名与框底拉开
  name.position.set(0, avatarY + avatarSize * 0.58);
  root.addChild(name);

  // 「+N 碎片」对齐原型：更大更醒目，与宠名拉开间距
  const amtSize = Math.max(56, Math.round(areaW * 0.18));
  const unitSize = Math.max(40, Math.round(areaW * 0.12));
  const amt = makeText(`+${o.shards}`, {
    size: amtSize,
    fill: 0xffffff,
    bold: true,
    anchor: [1, 0.5],
    strokeColor: TITLE_GREEN,
    strokeWidth: 7,
    role: 'title',
  });
  const unit = makeText('碎片', {
    size: unitSize,
    fill: TITLE_GREEN,
    bold: true,
    anchor: [0, 0.5],
    strokeColor: 0xffffff,
    strokeWidth: 4,
    role: 'title',
  });
  const gap = 12;
  const rewardW = amt.width + gap + unit.width;
  const rewardY = name.y + name.height * 0.5 + Math.max(52, areaH * 0.09);
  amt.position.set(-rewardW / 2 + amt.width, rewardY);
  unit.position.set(amt.x + gap, rewardY);
  root.addChild(amt, unit);

  return root;
}

/**
 * 十连重复格：小碎晶 + 圆像 + +N（无大金框）。
 * pivot=中心。
 */
export function buildGachaShardChip(o: PullOutcome, chipW: number, chipH: number): PIXI.Container {
  const pet = PET_MAP.get(o.petId);
  const root = new PIXI.Container();

  const crystalTex = TextureCache.get(UI_IMAGES.gachaShardCrystal);
  if (crystalTex?.valid) {
    const sp = new PIXI.Sprite(crystalTex);
    const max = chipW * 0.8;
    const scale = Math.min(max / sp.texture.width, (chipH * 0.36) / sp.texture.height);
    sp.anchor.set(0.5);
    sp.scale.set(scale);
    sp.position.set(0, -chipH * 0.32);
    root.addChild(sp);
  }

  const avatarSize = chipW * 0.52;
  const avatarY = chipH * 0.02;
  const faceSize = avatarSize * 0.70;
  const faceLayer = new PIXI.Container();
  faceLayer.position.set(0, avatarY);
  const avatar = new PIXI.Sprite(PIXI.Texture.EMPTY);
  avatar.anchor.set(0.5);
  avatar.width = faceSize;
  avatar.height = faceSize;
  faceLayer.addChild(avatar);
  const faceMask = new PIXI.Graphics();
  faceMask.beginFill(0xffffff);
  faceMask.drawCircle(0, 0, faceSize / 2);
  faceMask.endFill();
  faceMask.renderable = false;
  faceLayer.addChild(faceMask);
  faceLayer.mask = faceMask;
  root.addChild(faceLayer);
  bindPetAvatarSprite(avatar, o.petId, 1, (tex) => {
    avatar.texture = tex;
    avatar.width = faceSize;
    avatar.height = faceSize;
  });
  const frame = makeAvatarFrame(avatarSize);
  frame.position.set(0, avatarY);
  root.addChild(frame);

  const name = makeText((pet?.name ?? o.petId).slice(0, 4), {
    size: FONT_SIZE.xxs,
    fill: COLORS.textMain,
    bold: true,
    anchor: 0.5,
  });
  name.position.set(0, avatarY + avatarSize * 0.58);
  root.addChild(name);

  const amt = makeText(`+${o.shards}`, {
    size: FONT_SIZE.lg,
    fill: TITLE_GREEN,
    bold: true,
    anchor: 0.5,
    strokeColor: 0xffffff,
    strokeWidth: 3,
    role: 'title',
  });
  amt.position.set(0, name.y + 28);
  root.addChild(amt);

  return root;
}
