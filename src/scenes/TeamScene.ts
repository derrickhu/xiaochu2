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
import { teamPreloadImages, teamPetAvatarEntries, ensurePetAvatars } from '@/config/assetPreload';
import { ensureAssets } from '@/config/Subpackages';
import { Platform } from '@/core/PlatformService';
import { UI, ORB_COLOR } from '@/balance/ui';
import {
  PET_MAP, TEAM_SIZE,
  type PetDef,
} from '@/balance/pets';
import { formatEnemyAbility, resolveEncounter } from '@/balance/enemies';
import { ENEMY_TIER_COLOR, enemyDisplayTierOf, formatEnemyShortName } from '@/balance/enemyDisplay';
import { STAGE_MAP, formatStageShortLabel, type StageDef } from '@/balance/stages';
import type { TeamMember } from '@/formulas/team';
import {
  BACKGROUND_IMAGES, UI_IMAGES, enemyImage,
} from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import type { BattleEnterData } from './BattleScene';
import {
  COLORS, FONT_SIZE, RADIUS,
  makeBackButton, makeButton, makeCoverBackground, makePanel, makeText, makeNamePlaque,
  staggerIn, popIn, fadeIn, attachRarityBadge,
} from '@/ui';
import { ScrollListController } from '@/ui/ScrollList';
import {
  refreshTeamOverviewPanel,
  type TeamOverviewSnapshot,
} from './teamOverviewPanel';
import { addTeamPetAvatar, buildTeamPetList } from './teamPetList';
import { SceneEnterSeq, deferSceneBuild } from '@/utils/sceneEnterSeq';
import { bindPointerTap } from '@/utils/bindPointerTap';
/** 战前编队：传入 stageId 时展示本关敌人，确认后进入战斗；缺省为自由编队 */
export interface TeamEnterData {
  stageId?: string;
}

export class TeamScene implements Scene {
  readonly name = 'team';
  readonly container = new PIXI.Container();

  private _slotArea = new PIXI.Container();
  private _listChecks = new Map<string, PIXI.Container>();
  /** 队伍总览面板内容层（每次换宠重建） */
  private _overview = new PIXI.Container();
  private _overviewW = 0;
  private _overviewH = 0;
  /** 上次总览数值，用于换宠时高亮变化项 */
  private _prevAgg: TeamOverviewSnapshot | null = null;
  /** 上次上阵阵容，用于只对变化槽位/勾选做入场动效 */
  private _prevTeam: string[] = [];
  private _prevChecked = new Set<string>();
  private _slotY = 0;
  private _slotSize = 96;
  /** 战前编队目标关卡；无则为底部导航进入的自由编队 */
  private _prepStage?: StageDef;
  /** 战前模式：宠物池滚动 + 点击（canvas 通道，对齐 CodexScene） */
  private _listContent: PIXI.Container | null = null;
  private _listItems = new Map<string, PIXI.Container>();
  private _listScroll = new ScrollListController();
  private readonly _enterSeq = new SceneEnterSeq();

  onEnter(data?: unknown): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    const enter = data as TeamEnterData | undefined;
    this._prepStage = enter?.stageId ? STAGE_MAP.get(enter.stageId) : undefined;
    void this._enter(this._enterSeq.next());
  }

  private async _enter(token: number): Promise<void> {
    await ensureAssets(teamPreloadImages(this._prepStage?.id));
    await ensurePetAvatars(teamPetAvatarEntries());
    if (!this._enterSeq.stillValid(token)) return;
    deferSceneBuild(token, this._enterSeq, 'team', () => this._build());
  }

  onExit(): void {
    this._enterSeq.cancel();
    this._listChecks.clear();
    this._listItems.clear();
    this._prepStage = undefined;
    this._prevAgg = null;
    this._prevTeam = [];
    this._prevChecked.clear();
    this._listScroll.detach();
    this._listContent = null;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._slotArea = new PIXI.Container();
    this._overview = new PIXI.Container();
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const prep = !!this._prepStage;

    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.petPool, w, h));

    const back = makeBackButton({
      onTap: () => SceneManager.switchTo('title'),
    });
    back.position.set(80, Game.safeTop + 36);
    this.container.addChild(back);

    this._buildTitlePlaque(w, Game.safeTop + 36);

    const hint = makeText(
      prep && this._prepStage
        ? formatStageShortLabel(this._prepStage)
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
    const panelTop = y + slotSize + 16;
    const panelW = 690;
    const panelH = 166;
    const panelCenterY = panelTop + panelH / 2;
    const listStartY = panelTop + panelH + 16;

    this._overviewW = panelW;
    this._overviewH = panelH;
    const panelRoot = new PIXI.Container();
    panelRoot.position.set(w / 2, panelCenterY);
    panelRoot.addChild(makePanel({
      width: panelW, height: panelH, radius: RADIUS.card,
      bg: COLORS.panelBgAlt, bgAlpha: 0.92,
      border: COLORS.panelBorderSoft, borderWidth: 1,
      centered: true,
    }));
    this._overview = new PIXI.Container();
    panelRoot.addChild(this._overview);
    this.container.addChild(panelRoot);

    const bottomBtnH = 72;
    const bottomPad = 20;
    const listBtnGap = 16;
    if (prep) {
      const listBottom = h - bottomPad - bottomBtnH - listBtnGap;
      // 先建列表（带 mask 裁剪），再叠底栏遮罩与按钮，避免列表抢点「开始战斗」
      this._listContent = buildTeamPetList({
        container: this.container,
        startY: listStartY,
        listBottom,
        checks: this._listChecks,
        items: this._listItems,
        scroll: this._listScroll,
        onToggle: (petId) => this._togglePet(petId),
      });

      const footTop = listBottom;
      const footH = h - footTop;
      const footShield = new PIXI.Container();
      footShield.position.set(w / 2, footTop + footH / 2);
      footShield.hitArea = new PIXI.Rectangle(-w / 2, -footH / 2, w, footH);
      footShield.eventMode = 'static';
      footShield.interactiveChildren = false;
      footShield.addChild(makePanel({
        width: w, height: footH, radius: 0,
        bg: COLORS.panelBgAlt, bgAlpha: 0.96,
        centered: true,
      }));
      bindPointerTap(footShield, () => { /* 吸收底栏区点击，防止穿透到列表 */ });
      this.container.addChild(footShield);

      const startBtn = makeButton({
        label: '开始战斗', width: 320, height: bottomBtnH, variant: 'danger',
        onTap: () => this._startBattle(),
      });
      startBtn.position.set(w / 2, h - bottomPad - bottomBtnH / 2);
      this.container.addChild(startBtn);
    } else {
      this._listContent = buildTeamPetList({
        container: this.container,
        startY: listStartY,
        checks: this._listChecks,
        items: this._listItems,
        scroll: this._listScroll,
        onToggle: (petId) => this._togglePet(petId),
      });
    }

    // 宠物池卡片逐项入场
    staggerIn([...this._listItems.values()], { stepDelay: 0.03, offsetY: 16, duration: 0.3 });

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
      const tier = enemyDisplayTierOf(def);
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
        const scaleMul = tier === 'mob' ? 0.78 : tier === 'boss' ? 1.05 : 1;
        spr.scale.set((cardSize - 18) / Math.max(tex.width, tex.height) * scaleMul);
        if (tier === 'mob') spr.tint = 0xd8dde3;
        card.addChild(spr);
      }

      if (tier !== 'mob') {
        const tierBadge = makeText(
          tier === 'boss' ? 'BOSS' : tier === 'miniBoss' ? '守关' : '精英',
          { size: FONT_SIZE.xxs, fill: ENEMY_TIER_COLOR[tier], bold: true, anchor: 0.5,
            strokeColor: 0x1a1126, strokeWidth: 3 },
        );
        tierBadge.position.set(cardSize / 2 - 10, -cardSize / 2 + 10);
        card.addChild(tierBadge);
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

      const name = makeText(formatEnemyShortName(def), {
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
    const plaque = makeNamePlaque({
      text: '编队',
      width: Math.min(480, w - 80),
      size: 'lg',
    });
    plaque.position.set(w / 2, centerY);
    this.container.addChild(plaque);
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
    if (Platform.isMinigame) Game.syncFrameToScreen();
  }

  private _refreshTeamUi(): void {
    const w = Game.logicWidth;
    const slotSize = this._slotSize;
    const slotY = this._slotY;
    this._slotArea.removeChildren().forEach((c) => c.destroy({ children: true }));

    const gap = 10;
    const totalW = TEAM_SIZE * slotSize + (TEAM_SIZE - 1) * gap;
    const leftX = (w - totalW) / 2;
    const y = slotY;

    const team = PlayerData.team;
    for (let i = 0; i < TEAM_SIZE; i++) {
      const slot = new PIXI.Container();
      // 与 makeButton 一致：position 在槽位中心 + 居中 hitArea
      const cx = leftX + i * (slotSize + gap) + slotSize / 2;
      const cy = y + slotSize / 2;
      slot.position.set(cx, cy);
      const petId = team[i];
      const pet = petId ? PET_MAP.get(petId) : undefined;

      if (pet) {
        addTeamPetAvatar(slot, pet, 0, 0, slotSize);
        attachRarityBadge(slot, pet.rarity, -slotSize / 2, -slotSize / 2, slotSize, { variant: 'codex' });
        slot.hitArea = new PIXI.Rectangle(-slotSize / 2, -slotSize / 2, slotSize, slotSize);
        slot.interactiveChildren = false;
        slot.eventMode = 'static';
        slot.cursor = 'pointer';
        bindPointerTap(slot, () => this._togglePet(pet.id));
        if (this._prevTeam[i] !== petId) fadeIn(slot, { duration: 0.24 });
      } else {
        slot.addChild(makePanel({
          width: slotSize, height: slotSize, radius: RADIUS.chip,
          bg: COLORS.panelBg, bgAlpha: 0.85,
          border: COLORS.panelBorderSoft, borderWidth: 2,
          centered: true,
        }));
        const plus = makeText('+', { size: FONT_SIZE.lg, fill: COLORS.textSub, anchor: 0.5 });
        plus.position.set(0, 0);
        slot.addChild(plus);
        slot.hitArea = new PIXI.Rectangle(-slotSize / 2, -slotSize / 2, slotSize, slotSize);
        slot.interactiveChildren = false;
        slot.eventMode = 'static';
        slot.cursor = 'pointer';
        bindPointerTap(slot, () => Platform.showToast('请从下方列表选择灵宠上阵'));
      }
      this._slotArea.addChild(slot);
    }

    const members: TeamMember[] = team
      .map((id) => PET_MAP.get(id))
      .filter((def): def is PetDef => !!def)
      .map((def) => ({ def, level: PlayerData.petLevel(def.id), star: PlayerData.petStar(def.id) }));
    this._prevAgg = refreshTeamOverviewPanel(
      this._overview,
      this._overviewW,
      this._overviewH,
      members,
      this._prevAgg,
    );

    for (const [petId, check] of this._listChecks) {
      const checked = PlayerData.isInTeam(petId);
      check.visible = checked;
      // 勾选 badge 从无到有时回弹入场
      if (checked && !this._prevChecked.has(petId)) popIn(check, { duration: 0.26 });
    }

    this._prevTeam = [...team];
    this._prevChecked = new Set(team);
  }
}
