/**
 * 首页章节通关奖励卷轴 — 底板/台座/头像圈全部贴图，禁止 Graphics 画板。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { getPetAvatarTexture, loadPetAvatarTexture } from '@/config/petAvatarTexture';
import { ensurePetAvatars } from '@/config/assetPreload';
import { UI_IMAGES } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import type { ChapterGoalInfo } from '@/balance/chapterGoal';
import { chapterRewardContentLayout, chapterRewardScrollRect } from '@/balance/chapterRewardLayout';
import { COLORS, FONT_SIZE, makeText, bindLazySprite } from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { Game } from '@/core/Game';

const ICON = {
  lingyu: UI_IMAGES.iconLingyu,
  coin: UI_IMAGES.iconCoin,
  exp: UI_IMAGES.iconExp,
} as const;

export function buildChapterRewardScroll(opts: {
  goal: ChapterGoalInfo;
  screenW: number;
  plaqueCenterY: number;
  cleared: number;
  total: number;
  onTap?: () => void;
}): PIXI.Container {
  const rect = chapterRewardScrollRect(opts.screenW, opts.plaqueCenterY);
  const inner = chapterRewardContentLayout(rect.width, rect.height);
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);

  const scroll = fillSprite(UI_IMAGES.chapterRewardScroll, rect.width, rect.height);
  root.addChild(scroll);

  const title = makeText('章节通关奖励', {
    size: FONT_SIZE.xs, fill: COLORS.textTitle, bold: true, anchor: [0, 0.5],
  });
  title.position.set(inner.title.x, inner.title.y);
  root.addChild(title);

  const prog = fitSprite(UI_IMAGES.chapterRewardProgress, inner.progress.w, inner.progress.h);
  prog.position.set(inner.progress.x, inner.progress.y);
  root.addChild(prog);
  const progText = makeText(`${opts.cleared}/${opts.total}`, {
    size: FONT_SIZE.xxs, fill: COLORS.textTitle, bold: true, anchor: 0.5,
  });
  progText.position.set(inner.progress.x, inner.progress.y);
  root.addChild(progText);

  const slots = [ICON.lingyu, ICON.coin, ICON.exp];
  slots.forEach((path, i) => {
    const slot = inner.slots[i];
    const ped = fitSprite(UI_IMAGES.chapterRewardPedestal, slot.pedW, slot.pedH);
    ped.position.set(slot.x, slot.y + slot.icon * 0.28);
    root.addChild(ped);
    const icon = fitSprite(path, slot.icon, slot.icon);
    icon.position.set(slot.x, slot.y - slot.icon * 0.22);
    root.addChild(icon);
  });

  const ring = fitSprite(UI_IMAGES.chapterRewardPetRing, inner.pet.ringW, inner.pet.ringH);
  ring.position.set(inner.pet.x, inner.pet.y);
  root.addChild(ring);
  mountPetBust(root, opts.goal.petId, inner.pet.x, inner.pet.y - 2, inner.pet.bust);

  const pill = fitSprite(UI_IMAGES.chapterRewardPill, inner.pet.pillW, inner.pet.pillH);
  pill.position.set(inner.pet.x, inner.pet.labelY);
  root.addChild(pill);
  const owned = PlayerData.isOwned(opts.goal.petId);
  const petLine = owned
    ? `已获得 · ${opts.goal.name}`
    : `${opts.goal.rarityCode} ${opts.goal.name}`;
  const petLabel = makeText(petLine, {
    size: FONT_SIZE.xxs, fill: COLORS.textMain, bold: true, anchor: 0.5,
  });
  petLabel.position.set(inner.pet.x, inner.pet.labelY);
  root.addChild(petLabel);

  if (opts.onTap) {
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.hitArea = new PIXI.Rectangle(-rect.width / 2, -rect.height / 2, rect.width, rect.height);
    root.interactiveChildren = false;
    bindPointerTap(root, opts.onTap);
  }

  return root;
}

function fillSprite(path: string, w: number, h: number): PIXI.Sprite {
  const cached = TextureCache.get(path);
  const sp = new PIXI.Sprite(cached ?? PIXI.Texture.EMPTY);
  sp.anchor.set(0.5);
  const apply = (tex: PIXI.Texture) => {
    if (!tex?.width || sp.destroyed) return;
    sp.texture = tex;
    sp.width = w;
    sp.height = h;
  };
  if (cached) apply(cached);
  bindLazySprite(sp, { path, ensure: true, onApplied: apply });
  return sp;
}

function fitSprite(path: string, w: number, h: number): PIXI.Sprite {
  const cached = TextureCache.get(path);
  const sp = new PIXI.Sprite(cached ?? PIXI.Texture.EMPTY);
  sp.anchor.set(0.5);
  const apply = (tex: PIXI.Texture) => {
    if (!tex?.width || sp.destroyed) return;
    sp.texture = tex;
    const scale = Math.min(w / tex.width, h / tex.height);
    sp.scale.set(scale);
  };
  if (cached) apply(cached);
  bindLazySprite(sp, { path, ensure: true, onApplied: apply });
  return sp;
}

function mountPetBust(
  root: PIXI.Container,
  petId: string,
  x: number,
  y: number,
  size: number,
): void {
  const slot = new PIXI.Container();
  slot.position.set(x, y);
  root.addChild(slot);
  const apply = (tex: PIXI.Texture | null) => {
    slot.removeChildren().forEach((c) => c.destroy());
    if (!tex?.width) return;
    const spr = new PIXI.Sprite(tex);
    spr.anchor.set(0.5);
    spr.scale.set(size / Math.max(tex.width, tex.height));
    slot.addChild(spr);
  };
  apply(getPetAvatarTexture(petId, 1));
  void (async () => {
    try {
      await ensurePetAvatars([{ petId, star: 1 }]);
    } catch (e) {
      console.warn('[chapterRewardScroll] 头像加载失败', petId, e);
    }
    if (slot.destroyed) return;
    apply(getPetAvatarTexture(petId, 1) ?? await loadPetAvatarTexture(petId, 1));
    void Game.warmScenePresent();
  })();
}
