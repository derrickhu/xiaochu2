/**
 * 选关页「章节收录奖励」横幅 — 视觉对齐 xiao_chu 通天塔周挑战条（暖色笺纸 + 左头像右文案）。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { getPetAvatarTexture, loadPetAvatarTexture } from '@/config/petAvatarTexture';
import { ensurePetAvatars } from '@/config/assetPreload';
import type { ChapterGoalInfo } from '@/balance/chapterGoal';
import { getRarity } from '@/balance/rarity';
import { ORB_COLOR } from '@/balance/ui';
import { petFrameImage } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import { COLORS, FONT_SIZE, makeText } from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { Game } from '@/core/Game';

export const CHAPTER_GOAL_CARD_W = 620;
/** 四行文案 + 头像区；行距按实际文字高度累加，避免名字与属性行重叠 */
export const CHAPTER_GOAL_CARD_H = 132;

export interface ChapterGoalCardOpts {
  width?: number;
  captured?: boolean;
  /** 点击卡片（如跳转养成详情预览） */
  onTap?: () => void;
}

function drawParchmentPanel(g: PIXI.Graphics, w: number, h: number, accent: number): void {
  const rad = 10;
  const x = -w / 2;
  const y = -h / 2;
  g.beginFill(0xfff8f0, 0.96);
  g.drawRoundedRect(x, y, w, h, rad);
  g.endFill();
  g.beginFill(accent, 0.12);
  g.drawRoundedRect(x, y, Math.min(w * 0.36, 132), h, rad);
  g.endFill();
  g.lineStyle(1.5, 0xd2bea0, 0.72);
  g.drawRoundedRect(x, y, w, h, rad);
  g.lineStyle(1, 0xfffaeb, 0.55);
  g.drawRoundedRect(x + 1, y + 1, w - 2, h - 2, rad - 1);
  g.beginFill(accent, 0.9);
  g.drawRoundedRect(x + 2, y + 2, 5, h - 4, 3);
  g.endFill();
}

/** 以容器中心为锚点 */
export function buildChapterGoalCard(goal: ChapterGoalInfo, opts: ChapterGoalCardOpts = {}): PIXI.Container {
  const w = opts.width ?? CHAPTER_GOAL_CARD_W;
  const h = CHAPTER_GOAL_CARD_H;
  const captured = opts.captured ?? PlayerData.isDiscovered(goal.petId);
  const accent = ORB_COLOR[goal.elementKey];
  const rarityDef = getRarity(goal.rarityTier);

  const card = new PIXI.Container();
  const bg = new PIXI.Graphics();
  drawParchmentPanel(bg, w, h, accent);
  card.addChild(bg);

  const padH = 14;
  const padV = 12;
  const avatarSz = 54;
  const frameSz = 62;
  const avatarColW = frameSz + 8;
  const avatarX = -w / 2 + padH;
  const avatarY = -h / 2 + (h - avatarSz) / 2;

  mountChapterGoalAvatar(card, goal.petId, { avatarX, avatarY, avatarSz });

  const frameTex = TextureCache.get(petFrameImage(goal.elementKey));
  if (frameTex) {
    const frame = new PIXI.Sprite(frameTex);
    frame.width = frameSz;
    frame.height = frameSz;
    frame.position.set(avatarX, avatarY - 5);
    card.addChild(frame);
  }

  const badgeW = Math.max(24, goal.rarityCode.length * 8 + 10);
  const badgeH = 14;
  const badge = new PIXI.Graphics();
  badge.beginFill(rarityDef.ui.badgeBg, 0.95);
  badge.drawRoundedRect(avatarX, avatarY - 2, badgeW, badgeH, 3);
  badge.endFill();
  badge.lineStyle(1, rarityDef.ui.badgeBorder, 1);
  badge.drawRoundedRect(avatarX, avatarY - 2, badgeW, badgeH, 3);
  card.addChild(badge);
  const badgeText = makeText(goal.rarityCode, {
    size: FONT_SIZE.xxs, fill: rarityDef.ui.badgeText, bold: true, anchor: 0.5,
  });
  badgeText.position.set(avatarX + badgeW / 2, avatarY - 2 + badgeH / 2);
  card.addChild(badgeText);

  const textX = avatarX + avatarColW + 6;
  const textRight = w / 2 - padH;
  const textW = textRight - textX;

  const GAP_AFTER_HEAD = 6;
  const GAP_AFTER_NAME = 10;
  const GAP_AFTER_META = 6;

  let textY = -h / 2 + padV;

  const headLeft = makeText('章节收录', {
    size: FONT_SIZE.xxs, fill: 0x9a7228, bold: true, anchor: [0, 0],
  });
  headLeft.position.set(textX, textY);
  card.addChild(headLeft);

  const statusLabel = captured ? '已收录' : '章末 Boss';
  const headRight = makeText(statusLabel, {
    size: FONT_SIZE.xxs,
    fill: captured ? COLORS.btnSuccessBg : 0x8b6914,
    bold: true,
    anchor: [1, 0],
  });
  headRight.position.set(textRight, textY);
  card.addChild(headRight);

  textY += Math.max(headLeft.height, headRight.height) + GAP_AFTER_HEAD;

  const name = makeText(goal.name, {
    size: FONT_SIZE.sm, fill: 0x3d2f22, bold: true, anchor: [0, 0],
    wordWrapWidth: textW,
  });
  name.position.set(textX, textY);
  card.addChild(name);

  textY += name.height + GAP_AFTER_NAME;

  const metaLine = `${goal.rarityCode} · ${goal.element} · ${goal.role}${goal.bossChallenge ? ` · ${goal.bossChallenge}` : ''}`;
  const meta = makeText(metaLine, {
    size: FONT_SIZE.xxs, fill: 0x7b5a28, anchor: [0, 0],
    wordWrapWidth: textW,
  });
  meta.position.set(textX, textY);
  card.addChild(meta);

  textY += meta.height + GAP_AFTER_META;

  const rewardLine = captured
    ? '已进召唤池，可用灵玉招募'
    : (goal.bossStageLabel
      ? `通关 ${goal.bossStageLabel} 收录 · 进召唤池`
      : '通关章末 Boss 收录 · 进召唤池');
  const reward = makeText(rewardLine, {
    size: FONT_SIZE.xxs, fill: 0x2d7a48, anchor: [0, 0],
    wordWrapWidth: textW,
  });
  reward.position.set(textX, textY);
  card.addChild(reward);

  if (opts.onTap) {
    card.eventMode = 'static';
    card.cursor = 'pointer';
    card.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
    bindPointerTap(card, opts.onTap);
  }

  return card;
}

const GOAL_AVATAR_NAME = 'chapterGoalAvatar';

/** 章节收录头像（pkg-pet 分包），缓存命中即同步挂载，否则异步加载后刷新 */
function mountChapterGoalAvatar(
  card: PIXI.Container,
  petId: string,
  slot: { avatarX: number; avatarY: number; avatarSz: number },
): void {
  const apply = (tex: PIXI.Texture | null): void => {
    if (!tex || card.destroyed) return;
    let spr = card.getChildByName(GOAL_AVATAR_NAME) as PIXI.Sprite | null;
    if (!spr) {
      spr = new PIXI.Sprite(tex);
      spr.name = GOAL_AVATAR_NAME;
      card.addChildAt(spr, 1);
    } else {
      spr.texture = tex;
    }
    spr.width = slot.avatarSz;
    spr.height = slot.avatarSz;
    spr.position.set(slot.avatarX + 2, slot.avatarY);
  };

  apply(getPetAvatarTexture(petId, 1));

  void (async () => {
    try {
      await ensurePetAvatars([{ petId, star: 1 }]);
    } catch (e) {
      console.warn('[chapterGoalCard] 头像分包加载失败:', petId, e);
    }
    if (card.destroyed) return;
    apply(getPetAvatarTexture(petId, 1) ?? await loadPetAvatarTexture(petId, 1));
    void Game.warmScenePresent();
  })();
}
