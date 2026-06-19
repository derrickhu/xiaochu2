/**
 * 灵宠场景（原图鉴入口）：已拥有灵宠列表 + 点击进入养成详情
 *
 * 卡片布局对齐 xiao_chu petPoolView：3 列竖卡、cardW×1.35；背景与编队页共用 scene_pet_pool。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { TextureCache } from '@/core/TextureCache';
import { UI } from '@/balance/ui';
import { PET_MAP, type PetDef } from '@/balance/pets';
import { petAtk, petHp, petRcv } from '@/formulas/growth';
import {
  BACKGROUND_IMAGES, CODEX_PRELOAD_IMAGES, ORB_IMAGES, petImage, UI_IMAGES,
} from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import {
  COLORS, FONT_SIZE,
  makeButton, makeCoverBackground, makeIconLabel, makePanel, makeText,
  makeRarityBadge, makeRoleBadge, makeStarRow, makeLevelLabel, makePetStatsLine,
} from '@/ui';
import type { PetDetailEnterData } from './PetDetailScene';

/** xiao_chu 设计缩放：S = logicWidth / 375 */
function designScale(w: number): number {
  return w / 375;
}

/** xiao_chu petPoolView 网格规格 */
function petPoolGrid(w: number) {
  const S = designScale(w);
  const cols = 3;
  const cardGap = 8 * S;
  const cardW = (w - 24 * S - cardGap * (cols - 1)) / cols;
  const cardH = cardW * 1.35;
  const marginX = 12 * S;
  return { S, cols, cardGap, cardW, cardH, marginX };
}

export class CodexScene implements Scene {
  readonly name = 'codex';
  readonly container = new PIXI.Container();

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    void this._enter();
  }

  private async _enter(): Promise<void> {
    await TextureCache.preload([...CODEX_PRELOAD_IMAGES]);
    this._build();
  }

  onExit(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));

    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.petPool, w, h));

    const back = makeButton({
      label: '返回', width: 120, height: 54, variant: 'ghost',
      onTap: () => SceneManager.switchTo('title'),
    });
    back.position.set(80, Game.safeTop + 36);
    this.container.addChild(back);

    this._buildTitlePlaque(w, Game.safeTop + 36);

    const expRow = makeIconLabel({
      iconPath: UI_IMAGES.iconExp, iconSize: 32,
      text: `经验池 ${PlayerData.exp} · 点击灵宠进入养成`,
      size: FONT_SIZE.xs, fill: COLORS.textSub,
    });
    expRow.position.set(w / 2 - expRow.width / 2, Game.safeTop + 82);
    this.container.addChild(expRow);

    const countText = makeText(`已拥有 ${PlayerData.ownedPets.length} 只`, {
      size: FONT_SIZE.xs, fill: COLORS.accent, bold: true, anchor: 0.5,
    });
    countText.position.set(w / 2, Game.safeTop + 118);
    this.container.addChild(countText);

    this._buildPetList(Game.safeTop + 136);
  }

  private _buildTitlePlaque(w: number, centerY: number): void {
    const tex = TextureCache.get(UI_IMAGES.titlePlaque);
    if (tex) {
      const plaque = new PIXI.Sprite(tex);
      plaque.anchor.set(0.5);
      plaque.scale.set(480 / tex.width);
      plaque.position.set(w / 2, centerY);
      this.container.addChild(plaque);
    }
    const title = makeText('灵宠', {
      size: FONT_SIZE.lg, fill: COLORS.textTitle, bold: true, anchor: 0.5,
    });
    title.position.set(w / 2, centerY);
    this.container.addChild(title);
  }

  private _buildPetList(startY: number): void {
    const w = Game.logicWidth;
    const { S, cols, cardGap, cardW, cardH, marginX } = petPoolGrid(w);
    const cardBgTex = TextureCache.get(UI_IMAGES.petCardPortrait);

    if (PlayerData.ownedPets.length === 0) {
      const empty = makeText('暂无灵宠，在主界面招募获取', {
        size: FONT_SIZE.sm, fill: COLORS.textSub, anchor: 0.5,
      });
      empty.position.set(w / 2, startY + 120);
      this.container.addChild(empty);
      return;
    }

    PlayerData.ownedPets.forEach((petId, i) => {
      const pet = PET_MAP.get(petId);
      if (!pet) return;

      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = marginX + col * (cardW + cardGap);
      const y = startY + cardGap + row * (cardH + cardGap);

      const item = new PIXI.Container();
      item.position.set(x, y);
      this._buildPetCard(item, pet, cardW, cardH, S, cardBgTex);

      item.eventMode = 'static';
      item.cursor = 'pointer';
      item.hitArea = new PIXI.Rectangle(0, 0, cardW, cardH);
      item.on('pointertap', () => {
        SceneManager.switchTo('petDetail', { petId } satisfies PetDetailEnterData);
      });
      this.container.addChild(item);
    });
  }

  /** 单卡布局对齐 xiao_chu _drawPetCard */
  private _buildPetCard(
    item: PIXI.Container, pet: PetDef, cardW: number, cardH: number, S: number,
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
    const avatarX = (cardW - avatarSize) / 2;
    const avatarY = 8 * S;
    const avatarTex = TextureCache.get(petImage(pet.id));
    if (avatarTex) {
      const avatar = new PIXI.Sprite(avatarTex);
      avatar.width = avatarSize;
      avatar.height = avatarSize;
      avatar.position.set(avatarX, avatarY);
      item.addChild(avatar);
    }

    const displayName = pet.name.length > 4 ? `${pet.name.slice(0, 4)}…` : pet.name;
    const nameY = avatarY + avatarSize + 6 * S;
    const nameText = makeText(displayName, {
      size: Math.round(10 * S), fill: 0x3b2414, bold: true, anchor: 0.5,
      strokeColor: 0xfff0cd, strokeWidth: Math.max(2, Math.round(2 * S)),
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
}
