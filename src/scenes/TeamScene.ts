/**
 * 编队场景：上阵 5 槽 + 已拥有宠物列表 + 队伍三维预览 + 属性覆盖提示
 *
 * 阶段七：复用 xiao_chu 灵宠池 UI（petpool_bg / 标题匾 / 卷轴卡片 / 五行相框），
 * 控件走 @/ui theme + 组件库。仅负责上下阵：点击列表或空槽切换编队；养成见灵宠页。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { TextureCache } from '@/core/TextureCache';
import { Platform } from '@/core/PlatformService';
import { UI, ELEMENT_NAME } from '@/balance/ui';
import { ELEMENTS } from '@/balance/combat';
import {
  PET_MAP, TEAM_SIZE,
  type PetDef,
} from '@/balance/pets';
import { getRarity } from '@/balance/rarity';
import { teamMaxHp, teamAtk, teamRcv, teamElements, type TeamMember } from '@/formulas/team';
import { petAtk, petHp, petRcv } from '@/formulas/growth';
import {
  BACKGROUND_IMAGES, TEAM_PRELOAD_IMAGES, petFrameImage, petImage, UI_IMAGES,
} from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import {
  COLORS, FONT_SIZE, RADIUS,
  makeButton, makeCoverBackground, makePanel, makeText,
  makeRarityBadge, makeRarityCardBorder, makeRarityNameLine, makeElementRoleLine,
  makeLevelStarLine,
  makePetStatsLine, makeTeamStatsLine, makeShardBadge,
} from '@/ui';

/** 列表卷轴卡：360×486 原图 → 展示宽 330 */
const LIST_CARD_W = 330;
const LIST_CARD_H = 148;
const SCROLL_SCALE_X = LIST_CARD_W / 360;
const SCROLL_SCALE_Y = LIST_CARD_H / 486;
/** 列表卡内：头像区与右侧文案区分离，避免 Lv 与相框重叠 */
const LIST_AVATAR_SIZE = 74;
const LIST_LEFT_PAD = 14;
const LIST_TEXT_GAP = 14;

export class TeamScene implements Scene {
  readonly name = 'team';
  readonly container = new PIXI.Container();

  private _slotArea = new PIXI.Container();
  private _listChecks = new Map<string, PIXI.Container>();
  private _statsRow = new PIXI.Container();
  private _coverageText!: PIXI.Text;
  private _slotY = 0;
  private _slotSize = 96;

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    void this._enter();
  }

  private async _enter(): Promise<void> {
    await TextureCache.preload([...TEAM_PRELOAD_IMAGES]);
    this._build();
  }

  onExit(): void {
    this._listChecks.clear();
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._slotArea = new PIXI.Container();
    this._statsRow = new PIXI.Container();
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.petPool, w, h));

    const back = makeButton({
      label: '返回', width: 120, height: 54, variant: 'ghost',
      onTap: () => SceneManager.switchTo('title'),
    });
    back.position.set(80, Game.safeTop + 36);
    this.container.addChild(back);

    this._buildTitlePlaque(w, Game.safeTop + 36);

    const hint = makeText('点击卡片或空槽调整上阵', {
      size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: 0.5,
    });
    hint.position.set(w / 2, Game.safeTop + 82);
    this.container.addChild(hint);

    this._slotArea = new PIXI.Container();
    this.container.addChild(this._slotArea);

    const slotY = Game.safeTop + 118;
    const slotSize = 96;
    this._slotY = slotY;
    this._slotSize = slotSize;
    const statsY = slotY + slotSize + 26;
    const coverageY = statsY + 30;
    const listStartY = coverageY + 24;

    this._statsRow = new PIXI.Container();
    this._statsRow.position.set(w / 2, statsY);
    this.container.addChild(this._statsRow);

    this._coverageText = makeText('', { size: FONT_SIZE.xs, anchor: 0.5 });
    this._coverageText.position.set(w / 2, coverageY);
    this.container.addChild(this._coverageText);

    this._buildPetList(listStartY);
    this._refreshTeamUi();
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
    const title = makeText('编队', {
      size: FONT_SIZE.lg, fill: COLORS.textTitle, bold: true, anchor: 0.5,
    });
    title.position.set(w / 2, centerY);
    this.container.addChild(title);
  }

  private _buildPetList(startY: number): void {
    const w = Game.logicWidth;
    const cols = 2;
    const gapX = 24;
    const gapY = 14;
    const gridW = cols * LIST_CARD_W + (cols - 1) * gapX;
    const startX = (w - gridW) / 2 + LIST_CARD_W / 2;
    const scrollTex = TextureCache.get(UI_IMAGES.petCardTeamRow);

    PlayerData.ownedPets.forEach((petId, i) => {
      const pet = PET_MAP.get(petId);
      if (!pet) return;
      const lv = PlayerData.petLevel(petId);
      const star = PlayerData.petStar(petId);

      const col = i % cols;
      const row = Math.floor(i / cols);
      const item = new PIXI.Container();
      item.position.set(
        startX + col * (LIST_CARD_W + gapX),
        startY + row * (LIST_CARD_H + gapY) + LIST_CARD_H / 2,
      );

      if (scrollTex) {
        const scroll = new PIXI.Sprite(scrollTex);
        scroll.anchor.set(0.5);
        scroll.scale.set(SCROLL_SCALE_X, SCROLL_SCALE_Y);
        item.addChild(scroll);
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
      this._addPetAvatar(item, pet, avatarX, 4, LIST_AVATAR_SIZE);

      const shardBadge = makeShardBadge({ shards: PlayerData.petShards(petId) });
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

      const line3 = makeLevelStarLine({
        level: lv, star, size: FONT_SIZE.xxs, variant: 'panel', filledOnly: true,
      });
      line3.position.set(textX, 18);
      item.addChild(line3);

      const line4 = makePetStatsLine({
        atk: petAtk(pet, lv, star),
        hp: petHp(pet, lv, star),
        rcv: petRcv(pet, lv, star),
        size: FONT_SIZE.xxs,
        variant: 'panel',
      });
      line4.position.set(textX, 40);
      item.addChild(line4);

      const check = new PIXI.Container();
      check.addChild(makePanel({
        width: 36, height: 36, radius: 18,
        bg: COLORS.btnSuccessBg, border: COLORS.btnSuccessBorder, borderWidth: 2,
      }));
      const checkMark = makeText('上', {
        size: FONT_SIZE.xxs, fill: COLORS.btnText, bold: true, anchor: 0.5,
      });
      check.addChild(checkMark);
      check.position.set(LIST_CARD_W / 2 - 22, -LIST_CARD_H / 2 + 22);
      item.addChild(check);
      this._listChecks.set(pet.id, check);

      item.eventMode = 'static';
      item.cursor = 'pointer';
      item.on('pointertap', () => this._togglePet(pet.id));
      this.container.addChild(item);
    });
  }

  /** 头像 + 五行相框（编队槽与列表共用） */
  private _addPetAvatar(
    parent: PIXI.Container, pet: PetDef, x: number, y: number, size: number,
  ): void {
    const tex = TextureCache.get(petImage(pet.id));
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

  private _togglePet(petId: string): void {
    if (PlayerData.isInTeam(petId)) {
      if (!PlayerData.removeFromTeam(petId)) {
        Platform.showToast('至少保留 1 只灵宠');
        return;
      }
    } else if (!PlayerData.addToTeam(petId)) {
      Platform.showToast(`最多上阵 ${TEAM_SIZE} 只`);
      return;
    }
    Platform.vibrateShort('light');
    this._refreshTeamUi();
  }

  private _refreshTeamUi(): void {
    const w = Game.logicWidth;
    const slotSize = this._slotSize;
    const slotY = this._slotY;
    this._slotArea.removeChildren().forEach((c) => c.destroy({ children: true }));

    const gap = 10;
    const totalW = TEAM_SIZE * slotSize + (TEAM_SIZE - 1) * gap;
    const startX = (w - totalW) / 2 + slotSize / 2;
    const y = slotY;

    const team = PlayerData.team;
    for (let i = 0; i < TEAM_SIZE; i++) {
      const slot = new PIXI.Container();
      slot.position.set(startX + i * (slotSize + gap), y);
      const petId = team[i];
      const pet = petId ? PET_MAP.get(petId) : undefined;

      if (pet) {
        this._addPetAvatar(slot, pet, slotSize / 2, slotSize / 2, slotSize);
        slot.eventMode = 'static';
        slot.cursor = 'pointer';
        slot.on('pointertap', () => this._togglePet(pet.id));
      } else {
        slot.addChild(makePanel({
          width: slotSize, height: slotSize, radius: RADIUS.chip,
          bg: COLORS.panelBg, bgAlpha: 0.85,
          border: COLORS.panelBorderSoft, borderWidth: 2,
        }));
        const plus = makeText('+', { size: FONT_SIZE.lg, fill: COLORS.textSub, anchor: 0.5 });
        plus.position.set(slotSize / 2, slotSize / 2);
        slot.addChild(plus);
        slot.eventMode = 'static';
        slot.cursor = 'pointer';
        slot.on('pointertap', () => Platform.showToast('请从下方列表选择灵宠上阵'));
      }
      this._slotArea.addChild(slot);
    }

    const members: TeamMember[] = team
      .map((id) => PET_MAP.get(id))
      .filter((def): def is PetDef => !!def)
      .map((def) => ({ def, level: PlayerData.petLevel(def.id), star: PlayerData.petStar(def.id) }));
    this._statsRow.removeChildren().forEach((c) => c.destroy({ children: true }));
    const statsLine = makeTeamStatsLine({
      hp: teamMaxHp(members),
      atk: teamAtk(members),
      rcv: teamRcv(members),
      size: FONT_SIZE.sm,
    });
    statsLine.position.set(-statsLine.width / 2, 0);
    this._statsRow.addChild(statsLine);

    const covered = teamElements(members);
    const missing = ELEMENTS.filter((e) => !covered.has(e));
    this._coverageText.text = missing.length === 0
      ? '五行全覆盖，所有属性珠均有效'
      : `未覆盖：${missing.map((e) => ELEMENT_NAME[e]).join('、')}（对应珠子无伤害）`;
    this._coverageText.style.fill = missing.length === 0 ? COLORS.btnSuccessBorder : COLORS.accentDeep;

    for (const [petId, check] of this._listChecks) {
      check.visible = PlayerData.isInTeam(petId);
    }
  }
}
