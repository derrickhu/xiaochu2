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
import { UI, ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import { ELEMENTS } from '@/balance/combat';
import {
  PET_MAP, TEAM_SIZE,
  type PetDef,
} from '@/balance/pets';
import { formatEnemyAbility, resolveEncounter } from '@/balance/enemies';
import { STAGE_MAP, type StageDef } from '@/balance/stages';
import { getRarity } from '@/balance/rarity';
import { teamMaxHp, teamAtk, teamRcv, teamElements, type TeamMember } from '@/formulas/team';
import { petAtk, petHp, petRcv } from '@/formulas/growth';
import {
  BACKGROUND_IMAGES, TEAM_PRELOAD_IMAGES, petFrameImage, petAvatarPath, UI_IMAGES, enemyImage,
} from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import type { BattleEnterData } from './BattleScene';
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

/** 战前编队：传入 stageId 时展示本关敌人，确认后进入战斗；缺省为自由编队 */
export interface TeamEnterData {
  stageId?: string;
}

export class TeamScene implements Scene {
  readonly name = 'team';
  readonly container = new PIXI.Container();

  private _slotArea = new PIXI.Container();
  private _listChecks = new Map<string, PIXI.Container>();
  private _statsRow = new PIXI.Container();
  private _coverageText!: PIXI.Text;
  private _slotY = 0;
  private _slotSize = 96;
  /** 战前编队目标关卡；无则为底部导航进入的自由编队 */
  private _prepStage?: StageDef;
  /** 战前模式：宠物池滚动 + 点击（canvas 通道，对齐 CodexScene） */
  private _listContent: PIXI.Container | null = null;
  private _listItems = new Map<string, PIXI.Container>();
  private _scrollMin = 0;
  private _listTop = 0;
  private _listViewportTop = 0;
  private _listViewportH = 0;
  private _listDrag = false;
  private _listMoved = false;
  private _lastTouchY = 0;
  private _rawDown: ((e: unknown) => void) | null = null;
  private _rawMove: ((e: unknown) => void) | null = null;
  private _rawUp: ((e: unknown) => void) | null = null;

  onEnter(data?: unknown): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    const enter = data as TeamEnterData | undefined;
    this._prepStage = enter?.stageId ? STAGE_MAP.get(enter.stageId) : undefined;
    void this._enter();
  }

  private async _enter(): Promise<void> {
    const images = [...TEAM_PRELOAD_IMAGES];
    if (this._prepStage) {
      for (const ref of this._prepStage.encounters) {
        const { def } = resolveEncounter(ref);
        images.push(def.image ?? enemyImage(def.id));
      }
    }
    await TextureCache.preload(images);
    this._build();
  }

  onExit(): void {
    this._listChecks.clear();
    this._listItems.clear();
    this._prepStage = undefined;
    this._detachListScroll();
    this._listContent = null;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._slotArea = new PIXI.Container();
    this._statsRow = new PIXI.Container();
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const prep = !!this._prepStage;

    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.petPool, w, h));

    const back = makeButton({
      label: '返回', width: 120, height: 54, variant: 'ghost',
      onTap: () => SceneManager.switchTo('title'),
    });
    back.position.set(80, Game.safeTop + 36);
    this.container.addChild(back);

    this._buildTitlePlaque(w, Game.safeTop + 36);

    const hint = makeText(
      prep && this._prepStage
        ? `${this._prepStage.chapter}-${this._prepStage.index} ${this._prepStage.name}`
        : '点击卡片或空槽调整上阵',
      { size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: 0.5 },
    );
    hint.position.set(w / 2, Game.safeTop + 82);
    this.container.addChild(hint);

    this._slotArea = new PIXI.Container();
    this.container.addChild(this._slotArea);

    const slotSize = 96;
    this._slotSize = slotSize;

    // 战前：敌人 → 编队 → 宠物池 → 底部开始；自由编队：沿用原布局
    let y = Game.safeTop + 100;
    if (prep && this._prepStage) {
      y = this._buildEnemyPreview(this._prepStage, y);
      y += 14;
    } else {
      y = Game.safeTop + 118;
    }

    this._slotY = y;
    const statsY = y + slotSize + 22;
    const coverageY = statsY + 28;
    const listStartY = coverageY + 20;

    this._statsRow = new PIXI.Container();
    this._statsRow.position.set(w / 2, statsY);
    this.container.addChild(this._statsRow);

    this._coverageText = makeText('', { size: FONT_SIZE.xs, anchor: 0.5 });
    this._coverageText.position.set(w / 2, coverageY);
    this.container.addChild(this._coverageText);

    const bottomBtnH = 72;
    const bottomPad = 20;
    if (prep) {
      const listBottom = h - bottomPad - bottomBtnH - 12;
      const startBtn = makeButton({
        label: '开始战斗', width: 320, height: bottomBtnH, variant: 'danger',
        onTap: () => this._startBattle(),
      });
      startBtn.position.set(w / 2, h - bottomPad - bottomBtnH / 2);
      this.container.addChild(startBtn);
      // 列表后添加，保证卡片在按钮之上可点击（按钮仅露出底栏区域）
      this._buildPetList(listStartY, listBottom);
    } else {
      this._buildPetList(listStartY);
    }

    this._refreshTeamUi();
  }

  /** 战前模式：本关敌人头像行 + 能力摘要（复用编队页布局，仅多此区块） */
  private _buildEnemyPreview(stage: StageDef, topY: number): number {
    const w = Game.logicWidth;
    const encounters = stage.encounters.map(resolveEncounter);
    const waveCount = encounters.length;

    const header = makeText(`本关敌人 · ${waveCount}波`, {
      size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: 0.5,
    });
    header.position.set(w / 2, topY);
    this.container.addChild(header);

    const cardSize = 72;
    const gap = 10;
    const totalW = waveCount * cardSize + (waveCount - 1) * gap;
    const startX = (w - totalW) / 2 + cardSize / 2;
    const cardCenterY = topY + 22 + cardSize / 2;

    encounters.forEach((enc, i) => {
      const { def } = enc;
      const card = new PIXI.Container();
      card.position.set(startX + i * (cardSize + gap), cardCenterY);

      card.addChild(makePanel({
        width: cardSize, height: cardSize, radius: RADIUS.chip,
        bg: COLORS.panelBg, bgAlpha: 0.9,
        border: ORB_COLOR[def.element], borderWidth: 2,
        centered: true,
      }));

      const tex = TextureCache.get(def.image ?? enemyImage(def.id));
      if (tex) {
        const spr = new PIXI.Sprite(tex);
        spr.anchor.set(0.5);
        spr.scale.set((cardSize - 18) / Math.max(tex.width, tex.height));
        card.addChild(spr);
      }

      if (waveCount > 1) {
        const badge = makeText(`${i + 1}`, {
          size: FONT_SIZE.xxs, fill: COLORS.btnText, bold: true, anchor: 0.5,
        });
        const badgeBg = makePanel({
          width: 22, height: 22, radius: 11,
          bg: COLORS.accentDeep, border: COLORS.accent, borderWidth: 1,
          centered: true,
        });
        badgeBg.position.set(-cardSize / 2 + 14, -cardSize / 2 + 14);
        badge.position.set(-cardSize / 2 + 14, -cardSize / 2 + 14);
        card.addChild(badgeBg, badge);
      }

      const name = makeText(def.name, {
        size: FONT_SIZE.xxs, fill: COLORS.textMain, anchor: 0.5,
      });
      name.position.set(0, cardSize / 2 + 14);
      card.addChild(name);

      this.container.addChild(card);
    });

    const seen = new Set<string>();
    const lines: string[] = [];
    for (const { def } of encounters) {
      if (seen.has(def.id)) continue;
      seen.add(def.id);
      lines.push(`${def.name}：${formatEnemyAbility(def)}`);
    }

    const panelW = 620;
    const lineH = 22;
    const panelH = Math.max(48, 16 + lines.length * lineH);
    const panelY = cardCenterY + cardSize / 2 + 36 + panelH / 2;
    const panel = new PIXI.Container();
    panel.position.set(w / 2, panelY);
    panel.addChild(makePanel({
      width: panelW, height: panelH, radius: RADIUS.card,
      bg: COLORS.panelBgAlt, bgAlpha: 0.92,
      border: COLORS.panelBorderSoft, borderWidth: 1,
      centered: true,
    }));
    lines.forEach((line, i) => {
      const t = makeText(line, {
        size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: [0, 0.5],
        wordWrapWidth: panelW - 32,
      });
      t.position.set(-panelW / 2 + 16, -panelH / 2 + 16 + i * lineH);
      panel.addChild(t);
    });
    this.container.addChild(panel);

    return panelY + panelH / 2 + 12;
  }

  private _startBattle(): void {
    if (!this._prepStage) return;
    if (PlayerData.team.length === 0) {
      Platform.showToast('至少上阵 1 只灵宠');
      return;
    }
    Platform.vibrateShort('medium');
    SceneManager.switchTo('battle', { stageId: this._prepStage.id } satisfies BattleEnterData);
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

  private _buildPetList(startY: number, listBottom?: number): void {
    const w = Game.logicWidth;
    const cols = 2;
    const gapX = 24;
    const gapY = 14;
    const gridW = cols * LIST_CARD_W + (cols - 1) * gapX;
    const startX = (w - gridW) / 2 + LIST_CARD_W / 2;
    const scrollTex = TextureCache.get(UI_IMAGES.petCardTeamRow);
    const scrollable = listBottom !== undefined;
    const parent = scrollable ? new PIXI.Container() : this.container;
    if (scrollable) {
      this._listContent = parent;
      parent.position.set(0, startY);
      this.container.addChild(parent);
    }

    let maxBottom = 0;

    PlayerData.ownedPets.forEach((petId, i) => {
      const pet = PET_MAP.get(petId);
      if (!pet) return;
      const lv = PlayerData.petLevel(petId);
      const star = PlayerData.petStar(petId);

      const col = i % cols;
      const row = Math.floor(i / cols);
      const itemY = row * (LIST_CARD_H + gapY) + LIST_CARD_H / 2;
      maxBottom = Math.max(maxBottom, itemY + LIST_CARD_H / 2);

      const item = new PIXI.Container();
      item.position.set(
        startX + col * (LIST_CARD_W + gapX),
        scrollable ? itemY : startY + itemY,
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
      this._listItems.set(pet.id, item);
      item.hitArea = new PIXI.Rectangle(
        -LIST_CARD_W / 2, -LIST_CARD_H / 2, LIST_CARD_W, LIST_CARD_H,
      );

      item.eventMode = 'static';
      item.cursor = 'pointer';
      item.interactiveChildren = false;
      item.on('pointertap', () => {
        if (scrollable && this._listMoved) return;
        this._togglePet(pet.id);
      });
      parent.addChild(item);
    });

    if (scrollable && listBottom !== undefined) {
      this._listTop = startY;
      const viewportH = listBottom - startY;
      const contentH = maxBottom + LIST_CARD_H / 2;
      this._scrollMin = Math.min(startY, startY - (contentH - viewportH));
      if (contentH > viewportH) {
        const mask = new PIXI.Graphics();
        mask.beginFill(0xffffff);
        mask.drawRect(0, startY, w, viewportH);
        mask.endFill();
        this.container.addChild(mask);
        parent.mask = mask;
      }
      // 战前列表：canvas 仅负责滚动，点击走 pointertap（与 CodexScene 一致）
      this._attachListScroll(startY, viewportH);
    }
  }

  private _rawClientY(e: unknown): number {
    return Game.pointerEventToStageLocal(e).y;
  }

  private _rawClientX(e: unknown): number {
    return Game.pointerEventToStageLocal(e).x;
  }

  private _inListViewport(y: number): boolean {
    return y >= this._listViewportTop && y <= this._listViewportTop + this._listViewportH;
  }

  private _attachListScroll(viewportTop: number, viewportH: number): void {
    this._detachListScroll();
    this._listViewportTop = viewportTop;
    this._listViewportH = viewportH;
    const canvas = Game.app.view as HTMLCanvasElement;

    this._rawDown = (e: unknown) => {
      if (!this._listContent) return;
      const y = this._rawClientY(e);
      if (!this._inListViewport(y)) return;
      this._listDrag = true;
      this._listMoved = false;
      this._lastTouchY = y;
    };
    this._rawMove = (e: unknown) => {
      if (!this._listDrag || !this._listContent) return;
      (e as { preventDefault?: () => void }).preventDefault?.();
      const y = this._rawClientY(e);
      const dy = this._lastTouchY - y;
      if (Math.abs(dy) > 8) this._listMoved = true;
      if (dy === 0) return;
      this._listContent.y = Math.max(this._scrollMin, Math.min(this._listTop, this._listContent.y - dy));
      this._lastTouchY = y;
    };
    this._rawUp = () => {
      this._listDrag = false;
    };

    if (Platform.isMinigame) {
      canvas.addEventListener('touchstart', this._rawDown, { passive: true });
      canvas.addEventListener('touchmove', this._rawMove, { passive: false });
      canvas.addEventListener('touchend', this._rawUp);
      canvas.addEventListener('touchcancel', this._rawUp);
    } else {
      canvas.addEventListener('pointerdown', this._rawDown);
      canvas.addEventListener('pointermove', this._rawMove);
      canvas.addEventListener('pointerup', this._rawUp);
      canvas.addEventListener('pointercancel', this._rawUp);
    }
  }

  private _detachListScroll(): void {
    const canvas = Game.app.view as HTMLCanvasElement;
    if (this._rawDown) {
      if (Platform.isMinigame) {
        canvas.removeEventListener('touchstart', this._rawDown);
        canvas.removeEventListener('touchmove', this._rawMove!);
        canvas.removeEventListener('touchend', this._rawUp!);
        canvas.removeEventListener('touchcancel', this._rawUp!);
      } else {
        canvas.removeEventListener('pointerdown', this._rawDown);
        canvas.removeEventListener('pointermove', this._rawMove!);
        canvas.removeEventListener('pointerup', this._rawUp!);
        canvas.removeEventListener('pointercancel', this._rawUp!);
      }
    }
    this._rawDown = null;
    this._rawMove = null;
    this._rawUp = null;
    this._listDrag = false;
    this._listMoved = false;
  }

  /** 头像 + 五行相框（编队槽与列表共用） */
  private _addPetAvatar(
    parent: PIXI.Container, pet: PetDef, x: number, y: number, size: number,
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
          centered: false,
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
