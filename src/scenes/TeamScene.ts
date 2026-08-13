/**
 * 编队场景：战前按 team_prep_ui_prototype_v3b 布局。
 * 仅接受带 stageId 的战前入口；自由编队底栏入口已拆除。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { teamPreloadImages, teamPetAvatarEntries, ensurePetAvatars } from '@/config/assetPreload';
import { ensureAssets } from '@/config/Subpackages';
import { Platform } from '@/core/PlatformService';
import { UI } from '@/balance/ui';
import type { Element } from '@/balance/combat';
import {
  PET_MAP, TEAM_SIZE,
  type PetDef,
} from '@/balance/pets';
import { STAGE_MAP, formatStageShortLabel, type StageDef } from '@/balance/stages';
import { resolveLeaderSkill } from '@/balance/leaderSkill';
import {
  baseStageIdOf, hasEliteVariant, isEliteStageId,
} from '@/balance/eliteMode';
import type { TeamMember } from '@/formulas/team';
import { BACKGROUND_IMAGES, UI_IMAGES } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import type { BattleContext } from '@/game/battleContext';
import { checkStaminaFor } from '@/game/staminaGate';
import { stageStaminaCost } from '@/game/staminaService';
import type { BattleEnterData } from './BattleScene';
import { titleBackData } from './TitleScene';
import {
  COLORS, FONT_SIZE, RADIUS,
  makeActionButton, makeBackButton, makeCoverBackground, makePanel, makeText,
  makeElementOrb, makePageTitlePlaque,
  staggerIn, popIn, fadeIn, attachRarityBadge,
} from '@/ui';
import { ScrollListController } from '@/ui/ScrollList';
import {
  refreshTeamOverviewPanel,
  type TeamOverviewSnapshot,
} from './teamOverviewPanel';
import { addTeamPetAvatar, buildTeamPetList } from './teamPetList';
import { buildTeamEnemyIntelCard, type TeamEnemyIntelHandle } from './teamEnemyIntelCard';
import {
  buildTeamPrepSummary,
  makeSectionTitle,
  addStretchedPlate,
  makeLeaderPickChip,
  TEAM_SUMMARY_BAR_H,
  TEAM_SUMMARY_TOTAL_H,
} from './teamPrepChrome';
import {
  addTeamStageEmpty, addTeamStagePet, stageSlotLayout,
  STAGE_PAINT_ORDER, STAGE_ORB_LOCAL_Y, STAGE_ORB_SIZE,
} from './teamStage';
import { SceneEnterSeq } from '@/utils/sceneEnterSeq';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { skillForPet } from '@/game/battle/SkillEngine';
import {
  showSkillPreviewBubble,
  type PetSkillPreviewHandle,
} from './battle/PetSkillPreviewBubble';

/** 战前编队：传入 stageId 时展示本关敌人，确认后进入战斗；缺省为自由编队 */
export interface TeamEnterData {
  stageId?: string;
  /** 副玩法上下文，原样透传给战斗与结算 */
  context?: BattleContext;
  /** 返回目标场景，缺省回主页（秘境/通天塔进来时回各自玩法页） */
  backScene?: string;
}

export class TeamScene implements Scene {
  readonly name = 'team';
  readonly container = new PIXI.Container();

  private _slotArea = new PIXI.Container();
  private _listChecks = new Map<string, PIXI.Container>();
  private _overview = new PIXI.Container();
  private _overviewW = 0;
  private _overviewH = 0;
  private _prevAgg: TeamOverviewSnapshot | null = null;
  private _prevTeam: string[] = [];
  private _prevChecked = new Set<string>();
  private _slotY = 0;
  private _slotW = 108;
  private _slotH = 108;
  private _prepStage?: StageDef;
  /** 原关（精英变体进战时仍指向普通关，供只读标签） */
  private _baseStage?: StageDef;
  private _context?: BattleContext;
  private _backScene = 'title';
  private _listContent: PIXI.Container | null = null;
  private _listItems = new Map<string, PIXI.Container>();
  private _listScroll = new ScrollListController();
  private readonly _enterSeq = new SceneEnterSeq();
  private _summaryHost: PIXI.Container | null = null;
  private _summaryW = 0;
  /** 战前编队页的敌情卡；换宠后要重算「必带对策」勾选 */
  private _intel: TeamEnemyIntelHandle | null = null;
  /** 技能说明气泡置顶层（长按宠卡/槽位） */
  private _previewLayer = new PIXI.Container();
  private _skillPreview: PetSkillPreviewHandle | null = null;
  private _filterElement: Element | 'all' = 'all';
  private _slotUnbinds: Array<() => void> = [];

  onEnter(data?: unknown): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    const enter = data as TeamEnterData | undefined;
    const entered = enter?.stageId ? STAGE_MAP.get(enter.stageId) : undefined;
    // 难度已在地图弹层选定：精英 id 进战时 prep=变体，base=原关
    if (entered && isEliteStageId(entered.id)) {
      this._prepStage = entered;
      this._baseStage = STAGE_MAP.get(baseStageIdOf(entered.id)) ?? entered;
    } else {
      this._prepStage = entered;
      this._baseStage = entered;
    }
    this._context = enter?.context;
    this._backScene = enter?.backScene ?? 'title';
    // 自由编队入口已拆除：无关卡上下文时退回来源页
    if (!this._prepStage) {
      Platform.showToast('请从关卡进入编队');
      this._goBack();
      return;
    }
    const token = this._enterSeq.next();
    this._build({ animate: true });
    void Game.warmScenePresent();
    void this._hydrateShell(token);
  }

  /** 壳图/头像后台补齐后静默重建一次 */
  private async _hydrateShell(token: number): Promise<void> {
    await ensureAssets(teamPreloadImages(this._prepStage?.id)).catch((e) => {
      console.warn('[Team] 壳层资源加载失败', e);
    });
    await ensurePetAvatars(teamPetAvatarEntries()).catch((e) => {
      console.warn('[Team] 头像预热失败', e);
    });
    if (!this._enterSeq.stillValid(token)) return;
    if (SceneManager.current?.name !== 'team') return;
    this._build({ animate: false });
  }

  /** 回主页时带上刚才那一章，避免 TitleScene 落到进度章 */
  private _goBack(): void {
    if (this._backScene === 'title') {
      SceneManager.switchTo('title', titleBackData());
      return;
    }
    SceneManager.switchTo(this._backScene);
  }

  onExit(): void {
    this._enterSeq.cancel();
    this._dismissSkillPreview();
    this._listChecks.clear();
    this._listItems.clear();
    this._prepStage = undefined;
    this._baseStage = undefined;
    this._context = undefined;
    this._backScene = 'title';
    this._prevAgg = null;
    this._prevTeam = [];
    this._prevChecked.clear();
    this._summaryHost = null;
    this._listScroll.detach();
    this._listContent = null;
    this._slotUnbinds.forEach((u) => u());
    this._slotUnbinds = [];
    this.container.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });
    this._slotArea = new PIXI.Container();
    this._overview = new PIXI.Container();
    this._previewLayer = new PIXI.Container();
  }

  private _build(opts?: { animate?: boolean }): void {
    const animate = opts?.animate !== false;
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const prep = !!this._prepStage;

    this._dismissSkillPreview();
    this._listScroll.detach();
    this._listChecks.clear();
    this._listItems.clear();
    this._summaryHost = null;
    this._listContent = null;
    this._intel = null;
    this._slotUnbinds.forEach((u) => u());
    this._slotUnbinds = [];
    this.container.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });
    this._previewLayer = new PIXI.Container();

    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.petPool, w, h));

    const back = makeBackButton({
      onTap: () => this._goBack(),
    });
    back.position.set(80, Game.safeHeaderCenterY);
    this.container.addChild(back);

    this._buildTitlePlaque(w, Game.safeHeaderCenterY);

    if (prep && this._prepStage) {
      this._buildPrepLayout(w, h, this._prepStage);
    } else {
      this._buildFreeLayout(w);
    }

    // 技能气泡必须在所有 UI 之上
    this.container.addChild(this._previewLayer);

    if (animate) {
      staggerIn([...this._listItems.values()], { stepDelay: 0.03, offsetY: 16, duration: 0.3 });
    }
    this._refreshTeamUi();
  }

  private _buildPrepLayout(w: number, h: number, stage: StageDef): void {
    const panelW = 690;
    let y = Game.safeHeaderCenterY + 52;

    const labelStage = this._baseStage ?? stage;
    const modeSuffix = this._readOnlyModeSuffix();
    const stageLabel = makeText(`${formatStageShortLabel(labelStage)}${modeSuffix}`, {
      size: FONT_SIZE.xs, fill: COLORS.textSub, bold: true, anchor: 0.5,
    });
    stageLabel.position.set(w / 2, Game.safeHeaderCenterY + 36);
    this.container.addChild(stageLabel);

    const intel = buildTeamEnemyIntelCard({ stage, width: panelW, team: this._teamDefs() });
    this._intel = intel;
    intel.root.position.set((w - panelW) / 2, y);
    this.container.addChild(intel.root);
    y += intel.height + 12;

    const stageH = Math.max(396, Math.min(430, Math.round(h * 0.26)));
    this._slotArea = new PIXI.Container();
    this.container.addChild(this._slotArea);
    this._slotY = y + stageH * 0.78;
    y += stageH + 6;

    this._summaryW = panelW;
    this._summaryHost = new PIXI.Container();
    this._summaryHost.position.set(w / 2, y + TEAM_SUMMARY_BAR_H / 2);
    this.container.addChild(this._summaryHost);
    y += TEAM_SUMMARY_TOTAL_H;

    const bottomBtnH = 88;
    const bottomPad = 16;
    const listBtnGap = 8;
    const listBottom = h - bottomPad - bottomBtnH - listBtnGap;

    const pickTitle = makeSectionTitle('可选灵宠', panelW - 80);
    pickTitle.position.set(w / 2, y + 14);
    this.container.addChild(pickTitle);
    y += 32;

    y += this._buildFilterRow(w, y) + 10;

    this._listContent = buildTeamPetList({
      container: this.container,
      startY: y,
      listBottom,
      layout: 'grid5',
      filterElement: this._filterElement,
      checks: this._listChecks,
      items: this._listItems,
      scroll: this._listScroll,
      onToggle: (petId) => this._togglePet(petId),
      onLongPress: (petId, item) => this._showPetSkillPreview(petId, item),
    });

    const staminaCost = this._prepStage
      ? stageStaminaCost(this._prepStage, this._context)
      : 0;
    const startBtn = makeActionButton({
      title: '开始战斗',
      subtitle: staminaCost > 0 ? `体力 ${staminaCost}` : undefined,
      width: Math.min(560, w - 80),
      height: bottomBtnH,
      variant: 'success',
      onTap: () => this._startBattle(),
    });
    startBtn.position.set(w / 2, h - bottomPad - bottomBtnH / 2);
    this.container.addChild(startBtn);
  }

  private _buildFilterRow(w: number, y: number): number {
    const chips: Array<{ id: Element | 'all'; label: string }> = [
      { id: 'all', label: '全部' },
      { id: 'metal', label: '金' },
      { id: 'wood', label: '木' },
      { id: 'fire', label: '火' },
      { id: 'water', label: '水' },
      { id: 'earth', label: '土' },
    ];
    const chipW = 88;
    const chipH = 40;
    const gap = 10;
    const total = chips.length * chipW + (chips.length - 1) * gap;
    let x = (w - total) / 2 + chipW / 2;
    for (const chip of chips) {
      const on = this._filterElement === chip.id;
      const root = new PIXI.Container();
      root.position.set(x, y + chipH / 2);
      addStretchedPlate(
        root,
        on ? UI_IMAGES.btnPlateSuccess : UI_IMAGES.btnPlateCream,
        chipW,
        chipH,
      );
      root.addChild(makeText(chip.label, {
        size: FONT_SIZE.xs,
        fill: on ? COLORS.btnText : COLORS.textMain,
        bold: true,
        anchor: 0.5,
        ...(on ? { strokeColor: COLORS.btnSuccessBorder, strokeWidth: 3 } : {}),
      }));
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.hitArea = new PIXI.Rectangle(-chipW / 2, -chipH / 2, chipW, chipH);
      root.interactiveChildren = false;
      const id = chip.id;
      bindPointerTap(root, () => {
        if (this._filterElement === id) return;
        this._filterElement = id;
        this._build({ animate: false });
      });
      this.container.addChild(root);
      x += chipW + gap;
    }
    return chipH;
  }

  /** 编队顶栏只读难度；无可精英变体的关（Boss 等）不加后缀 */
  private _readOnlyModeSuffix(): string {
    const prep = this._prepStage;
    const base = this._baseStage;
    if (!prep || !base || this._context) return '';
    if (isEliteStageId(prep.id)) return ' · 精英';
    if (hasEliteVariant(base)) return ' · 普通';
    return '';
  }

  private _buildFreeLayout(w: number): void {
    const hint = makeText('点击卡片或空槽调整上阵', {
      size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: 0.5,
    });
    hint.position.set(w / 2, Game.safeTop + 12);
    this.container.addChild(hint);

    this._slotArea = new PIXI.Container();
    this.container.addChild(this._slotArea);

    const slotSize = 96;
    this._slotW = slotSize;
    this._slotH = slotSize;
    this._slotY = Game.safeTop + 48;

    const panelTop = this._slotY + slotSize + 16;
    const panelW = 690;
    const panelH = 182;
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

    this._listContent = buildTeamPetList({
      container: this.container,
      startY: listStartY,
      checks: this._listChecks,
      items: this._listItems,
      scroll: this._listScroll,
      onToggle: (petId) => this._togglePet(petId),
      onLongPress: (petId, item) => this._showPetSkillPreview(petId, item),
    });
  }

  private _startBattle(): void {
    if (!this._prepStage) return;
    if (PlayerData.team.length === 0) {
      Platform.showToast('至少上阵 1 只灵宠');
      return;
    }
    if (!checkStaminaFor(this._prepStage, this._context)) return;
    Platform.vibrateShort('medium');
    SceneManager.switchTo('battle', {
      stageId: this._prepStage.id,
      context: this._context,
    } satisfies BattleEnterData);
  }

  private _buildTitlePlaque(w: number, centerY: number): void {
    const plaque = makePageTitlePlaque({ text: '编队', screenWidth: w });
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

  /**
   * 槽位点击 = 下阵。换队长点卡面右下角皇冠（业界编队页的标准控件，不占顶栏）。
   */
  private _onSlotTap(petId: string): void {
    this._togglePet(petId);
  }

  private _onSetLeader(petId: string): void {
    const pet = PET_MAP.get(petId);
    if (!pet) return;
    if (!PlayerData.setLeader(petId)) return;
    const skill = resolveLeaderSkill(pet);
    Platform.vibrateShort('light');
    Platform.showToast(`${pet.name} 已任队长 · ${skill.text}`, 'success');
    this._refreshTeamUi();
    if (Platform.isMinigame) Game.syncFrameToScreen();
  }

  /** 当前上阵灵宠定义（空槽位过滤掉） */
  private _teamDefs(): PetDef[] {
    return PlayerData.team
      .map((id) => PET_MAP.get(id))
      .filter((def): def is PetDef => !!def);
  }

  private _refreshTeamUi(): void {
    const w = Game.logicWidth;
    const slotW = this._slotW;
    const slotH = this._slotH;
    const slotY = this._slotY;
    const prep = !!this._prepStage;
    this._slotUnbinds.forEach((u) => u());
    this._slotUnbinds = [];
    this._slotArea.removeChildren().forEach((c) => c.destroy({ children: true }));

    const team = PlayerData.team;

    if (prep) {
      this._refreshPrepStage(w, slotY, team);
    } else {
      const gap = 10;
      const totalW = TEAM_SIZE * slotW + (TEAM_SIZE - 1) * gap;
      const leftX = (w - totalW) / 2;
      for (let i = 0; i < TEAM_SIZE; i++) {
        this._paintFreeSlot(leftX, slotY, slotW, slotH, gap, i, team);
      }
    }

    const members: TeamMember[] = team
      .map((id) => PET_MAP.get(id))
      .filter((def): def is PetDef => !!def)
      .map((def) => ({ def, level: PlayerData.petLevel(def.id), star: PlayerData.petStar(def.id) }));

    if (prep && this._summaryHost) {
      this._summaryHost.removeChildren().forEach((c) => c.destroy({ children: true }));
      this._summaryHost.addChild(buildTeamPrepSummary(members, this._summaryW));
      this._intel?.setTeam(members.map((m) => m.def));
    } else if (!prep) {
      this._prevAgg = refreshTeamOverviewPanel(
        this._overview,
        this._overviewW,
        this._overviewH,
        members,
        this._prevAgg,
      );
    }

    for (const [petId, check] of this._listChecks) {
      if (!check) continue;
      const checked = PlayerData.isInTeam(petId);
      check.visible = checked;
      if (checked && !this._prevChecked.has(petId)) popIn(check, { duration: 0.26 });
    }

    this._prevTeam = [...team];
    this._prevChecked = new Set(team);
  }

  private _refreshPrepStage(w: number, baseY: number, team: readonly string[]): void {
    const layouts = stageSlotLayout(w / 2, baseY);
    // 珠 / 换队长钮统一置顶：相邻石座（尤其放大的队长座）会压住下沿控件
    const overlay = new PIXI.Container();
    for (const visual of STAGE_PAINT_ORDER) {
      const layout = layouts[visual];
      const slot = new PIXI.Container();
      slot.position.set(layout.x, layout.y);
      const petId = team[layout.teamIndex];
      const pet = petId ? PET_MAP.get(petId) : undefined;
      const size = pet
        ? addTeamStagePet(
          slot, pet, PlayerData.petStar(pet.id), layout.scale, layout.isLeaderSlot,
          layout.isLeaderSlot ? resolveLeaderSkill(pet) : undefined,
        )
        : addTeamStageEmpty(slot, layout.scale);
      this._slotUnbinds.push(size.unbind);
      const hitW = Math.max(110, size.width);
      const hitH = Math.max(160, size.height);
      slot.hitArea = new PIXI.Rectangle(-hitW / 2, -hitH * 0.78, hitW, hitH);
      slot.interactiveChildren = false;
      slot.eventMode = 'static';
      slot.cursor = 'pointer';
      if (pet) {
        bindPointerTap(slot, () => this._onSlotTap(pet.id), {
          onLongPress: () => this._showPetSkillPreview(pet.id, slot),
        });
        if (layout.isLeaderSlot && size.leaderPlaque && this._prevTeam[0] !== petId) {
          popIn(size.leaderPlaque, { duration: 0.34, fromScale: 0.72 });
        } else if (this._prevTeam[layout.teamIndex] !== petId) {
          fadeIn(slot, { duration: 0.24 });
        }
      } else {
        bindPointerTap(slot, () => Platform.showToast('请从下方列表选择灵宠上阵'));
      }
      this._slotArea.addChild(slot);

      if (!pet) continue;

      const orb = makeElementOrb(pet.element, STAGE_ORB_SIZE);
      orb.position.set(layout.x, baseY + STAGE_ORB_LOCAL_Y);
      overlay.addChild(orb);

      if (!layout.isLeaderSlot) {
        const chip = makeLeaderPickChip();
        chip.position.set(layout.x - 42, baseY + STAGE_ORB_LOCAL_Y + 2);
        overlay.addChild(chip);
        bindPointerTap(chip, () => this._onSetLeader(pet.id));
      }
    }
    this._slotArea.addChild(overlay);
  }

  private _paintFreeSlot(
    leftX: number, slotY: number, slotW: number, slotH: number, gap: number,
    i: number, team: readonly string[],
  ): void {
    const slot = new PIXI.Container();
    const cx = leftX + i * (slotW + gap) + slotW / 2;
    const cy = slotY + slotH / 2;
    slot.position.set(cx, cy);
    const petId = team[i];
    const pet = petId ? PET_MAP.get(petId) : undefined;

    if (pet) {
      addTeamPetAvatar(slot, pet, 0, 0, slotW);
      attachRarityBadge(slot, pet.rarity, -slotW / 2, -slotH / 2, slotW, { variant: 'codex' });
      if (i === 0) {
        const ring = new PIXI.Graphics();
        ring.lineStyle(3.5, COLORS.accentDeep, 1);
        ring.drawRoundedRect(-slotW / 2 + 1.5, -slotH / 2 + 1.5, slotW - 3, slotH - 3, 12);
        slot.addChild(ring);
      }
      slot.hitArea = new PIXI.Rectangle(-slotW / 2, -slotH / 2, slotW, slotH);
      slot.interactiveChildren = false;
      slot.eventMode = 'static';
      slot.cursor = 'pointer';
      bindPointerTap(slot, () => this._onSlotTap(pet.id), {
        onLongPress: () => this._showPetSkillPreview(pet.id, slot),
      });
      if (this._prevTeam[i] !== petId) fadeIn(slot, { duration: 0.24 });
      this._slotArea.addChild(slot);

      const isLeader = i === 0;
      const crown = makeLeaderCrown(isLeader);
      crown.position.set(cx + slotW / 2 - 20, cy + slotH / 2 - 36);
      this._slotArea.addChild(crown);
      if (isLeader) {
        bindPointerTap(crown, () => {
          Platform.showToast(`队长 ${pet.name} · ${resolveLeaderSkill(pet).text}`);
        });
      } else {
        bindPointerTap(crown, () => this._onSetLeader(pet.id));
      }
      return;
    }

    const empty = new PIXI.Graphics();
    empty.beginFill(0xfff8ec, 0.55);
    empty.drawRoundedRect(-slotW / 2, -slotH / 2, slotW, slotH, 12);
    empty.endFill();
    empty.lineStyle(2.5, 0xe0c896, 0.95);
    drawDashedRoundedRect(empty, -slotW / 2, -slotH / 2, slotW, slotH, 12, 8, 6);
    slot.addChild(empty);
    slot.addChild(makeText('+', { size: 42, fill: COLORS.textSub, anchor: 0.5 }));
    slot.hitArea = new PIXI.Rectangle(-slotW / 2, -slotH / 2, slotW, slotH);
    slot.interactiveChildren = false;
    slot.eventMode = 'static';
    slot.cursor = 'pointer';
    bindPointerTap(slot, () => Platform.showToast('请从下方列表选择灵宠上阵'));
    this._slotArea.addChild(slot);
  }

  private _dismissSkillPreview(): void {
    this._skillPreview?.dismiss();
    this._skillPreview = null;
  }

  /** 长按宠卡/槽位：悬浮主动技说明（复用战斗气泡） */
  private _showPetSkillPreview(petId: string, from: PIXI.Container): void {
    const pet = PET_MAP.get(petId);
    if (!pet || !from.parent) return;
    this._dismissSkillPreview();

    const halfH = from.hitArea instanceof PIXI.Rectangle
      ? -from.hitArea.y
      : Math.max(24, from.getLocalBounds().height / 2);
    const tip = this._previewLayer.toLocal(from.toGlobal(new PIXI.Point(0, -halfH - 4)));

    const skill = skillForPet(
      pet,
      PlayerData.petStar(petId),
      PlayerData.petLevel(petId),
    );
    Platform.vibrateShort('light');
    this._skillPreview = showSkillPreviewBubble(this._previewLayer, {
      skill,
      element: pet.element,
      x: tip.x,
      y: tip.y,
    });
  }
}

/**
 * 编队队长控件：角落小皇冠（原神/阴阳师/AFK 编队页同款）。
 * 现任实心金冠；其余淡描边金冠，点一下即设为队长。不占顶栏、不挡立绘。
 */
function makeLeaderCrown(active: boolean): PIXI.Container {
  const r = 16;
  const root = new PIXI.Container();
  const bg = new PIXI.Graphics();
  if (active) {
    bg.beginFill(COLORS.accentDeep, 0.96);
    bg.drawCircle(0, 0, r);
    bg.endFill();
    bg.lineStyle(1.5, 0xffe7b0, 0.95);
    bg.drawCircle(0, 0, r);
  } else {
    bg.beginFill(0x2a1a0c, 0.45);
    bg.drawCircle(0, 0, r);
    bg.endFill();
    bg.lineStyle(1.6, COLORS.accentDeep, 0.9);
    bg.drawCircle(0, 0, r);
  }
  root.addChild(bg);
  root.addChild(drawCrownIcon(active ? 0xfff4d4 : COLORS.accent, active));
  root.hitArea = new PIXI.Circle(0, 0, 18);
  root.eventMode = 'static';
  root.cursor = 'pointer';
  return root;
}

function drawCrownIcon(color: number, filled: boolean): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const pts = [
    -8, 5,
    -8, -1,
    -4, 3,
    0, -6,
    4, 3,
    8, -1,
    8, 5,
  ];
  if (filled) {
    g.beginFill(color, 1);
    g.drawPolygon(pts);
    g.endFill();
  } else {
    g.lineStyle(1.8, color, 1);
    g.drawPolygon(pts);
  }
  g.beginFill(color, filled ? 1 : 0.9);
  g.drawCircle(-8, -2, 1.6);
  g.drawCircle(0, -7, 1.8);
  g.drawCircle(8, -2, 1.6);
  g.endFill();
  return g;
}

function drawDashedRoundedRect(
  g: PIXI.Graphics,
  x: number, y: number, w: number, h: number,
  r: number, dash: number, gap: number,
): void {
  const segments: Array<[number, number, number, number]> = [
    [x + r, y, x + w - r, y],
    [x + w, y + r, x + w, y + h - r],
    [x + w - r, y + h, x + r, y + h],
    [x, y + h - r, x, y + r],
  ];
  for (const [x0, y0, x1, y1] of segments) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    let t = 0;
    let draw = true;
    while (t < len) {
      const seg = Math.min(draw ? dash : gap, len - t);
      if (draw) {
        g.moveTo(x0 + ux * t, y0 + uy * t);
        g.lineTo(x0 + ux * (t + seg), y0 + uy * (t + seg));
      }
      t += seg;
      draw = !draw;
    }
  }
  const corners: Array<[number, number, number, number]> = [
    [x + r, y + r, Math.PI, Math.PI * 1.5],
    [x + w - r, y + r, Math.PI * 1.5, Math.PI * 2],
    [x + w - r, y + h - r, 0, Math.PI * 0.5],
    [x + r, y + h - r, Math.PI * 0.5, Math.PI],
  ];
  for (const [cx, cy, a0, a1] of corners) {
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      if (i % 2 === 1) continue;
      const t0 = a0 + (a1 - a0) * (i / steps);
      const t1 = a0 + (a1 - a0) * ((i + 1) / steps);
      g.moveTo(cx + Math.cos(t0) * r, cy + Math.sin(t0) * r);
      g.lineTo(cx + Math.cos(t1) * r, cy + Math.sin(t1) * r);
    }
  }
}
