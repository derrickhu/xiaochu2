/**
 * 编队场景：战前按 team_prep_ui_prototype_v1 布局；
 * 自由编队保留槽位 + 总览 + 宠物池。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { teamPreloadImages, teamPetAvatarEntries, ensurePetAvatars } from '@/config/assetPreload';
import { ensureAssets } from '@/config/Subpackages';
import { Platform } from '@/core/PlatformService';
import { UI } from '@/balance/ui';
import {
  PET_MAP, TEAM_SIZE,
  type PetDef,
} from '@/balance/pets';
import { STAGE_MAP, formatStageShortLabel, type StageDef } from '@/balance/stages';
import type { TeamMember } from '@/formulas/team';
import { BACKGROUND_IMAGES } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import type { BattleEnterData } from './BattleScene';
import {
  COLORS, FONT_SIZE, RADIUS,
  makeActionButton, makeBackButton, makeCoverBackground, makePanel, makeText,
  makeNamePlaque,
  staggerIn, popIn, fadeIn, attachRarityBadge,
} from '@/ui';
import { ScrollListController } from '@/ui/ScrollList';
import {
  refreshTeamOverviewPanel,
  type TeamOverviewSnapshot,
} from './teamOverviewPanel';
import { addTeamPetAvatar, addTeamPrepSlotPet, buildTeamPetList } from './teamPetList';
import { buildTeamEnemyIntelCard } from './teamEnemyIntelCard';
import {
  buildTeamPrepSummary,
  makeSectionTitle,
} from './teamPrepChrome';
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
  private _listContent: PIXI.Container | null = null;
  private _listItems = new Map<string, PIXI.Container>();
  private _listScroll = new ScrollListController();
  private readonly _enterSeq = new SceneEnterSeq();
  private _summaryHost: PIXI.Container | null = null;
  private _summaryW = 0;

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
    this._summaryHost = null;
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
    back.position.set(80, Game.safeHeaderCenterY);
    this.container.addChild(back);

    this._buildTitlePlaque(w, Game.safeHeaderCenterY);

    if (prep && this._prepStage) {
      this._buildPrepLayout(w, h, this._prepStage);
    } else {
      this._buildFreeLayout(w);
    }

    staggerIn([...this._listItems.values()], { stepDelay: 0.03, offsetY: 16, duration: 0.3 });
    this._refreshTeamUi();
  }

  private _buildPrepLayout(w: number, h: number, stage: StageDef): void {
    const panelW = 690;
    let y = Game.safeTop + 24;

    const stageLabel = makeText(formatStageShortLabel(stage), {
      size: FONT_SIZE.xs, fill: COLORS.textSub, bold: true, anchor: 0.5,
    });
    stageLabel.position.set(w / 2, Game.safeHeaderCenterY + 36);
    this.container.addChild(stageLabel);

    const intel = buildTeamEnemyIntelCard({ stage, width: panelW });
    intel.root.position.set((w - panelW) / 2, y);
    this.container.addChild(intel.root);
    y += intel.height + 14;

    const teamTitle = makeSectionTitle('我的队伍', panelW);
    teamTitle.position.set(w / 2, y + 12);
    this.container.addChild(teamTitle);
    y += 30;

    // 竖卡高度 = 托盘内容区高度（对齐原型：头像与背景板同高）
    const slotW = 124;
    const slotH = 176;
    const trayPadX = 12;
    const trayPadTop = 10;
    const summaryH = 36;
    const trayH = trayPadTop + slotH + summaryH + 8;
    const tray = makePanel({
      width: panelW, height: trayH, radius: 16,
      bg: 0xfff8ec, bgAlpha: 0.96,
      border: 0xe0c896, borderWidth: 2,
      centered: false,
    });
    tray.position.set((w - panelW) / 2, y);
    this.container.addChild(tray);

    this._slotW = slotW;
    this._slotH = slotH;
    this._slotY = y + trayPadTop;
    this._slotArea = new PIXI.Container();
    this.container.addChild(this._slotArea);

    this._summaryW = panelW - trayPadX * 2;
    this._summaryHost = new PIXI.Container();
    this._summaryHost.position.set(w / 2, y + trayPadTop + slotH + summaryH / 2);
    this.container.addChild(this._summaryHost);
    y += trayH + 12;

    const bottomBtnH = 104;
    const bottomPad = 16;
    const listBtnGap = 10;
    const listBottom = h - bottomPad - bottomBtnH - listBtnGap;

    // 可选灵宠区：整块奶油外板（对齐 UI 原型，标题 + 双列卡都在板内）
    const pickPadTop = 38;
    const pickPadBot = 12;
    const pickH = Math.max(120, listBottom - y);
    const pickPanel = makePanel({
      width: panelW, height: pickH, radius: 16,
      bg: 0xfff8ec, bgAlpha: 0.96,
      border: 0xe0c896, borderWidth: 2,
      centered: false,
    });
    pickPanel.position.set((w - panelW) / 2, y);
    this.container.addChild(pickPanel);

    const pickTitle = makeSectionTitle('可选灵宠', panelW - 40);
    pickTitle.position.set(w / 2, y + 18);
    this.container.addChild(pickTitle);

    this._listContent = buildTeamPetList({
      container: this.container,
      startY: y + pickPadTop,
      listBottom: y + pickH - pickPadBot,
      compact: true,
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
    // 与 UI 图一致：淡奶油底，避免深色脚垫
    footShield.addChild(makePanel({
      width: w, height: footH, radius: 0,
      bg: 0xfff8ec, bgAlpha: 0.94,
      centered: true,
    }));
    bindPointerTap(footShield, () => { /* absorb */ });
    this.container.addChild(footShield);

    const startBtn = makeActionButton({
      title: '开始战斗',
      width: Math.min(620, w - 56),
      height: bottomBtnH,
      variant: 'success',
      onTap: () => this._startBattle(),
    });
    startBtn.position.set(w / 2, h - bottomPad - bottomBtnH / 2);
    this.container.addChild(startBtn);
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

    this._listContent = buildTeamPetList({
      container: this.container,
      startY: listStartY,
      checks: this._listChecks,
      items: this._listItems,
      scroll: this._listScroll,
      onToggle: (petId) => this._togglePet(petId),
    });
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
      width: Math.min(420, w - 160),
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
    const slotW = this._slotW;
    const slotH = this._slotH;
    const slotY = this._slotY;
    const prep = !!this._prepStage;
    this._slotArea.removeChildren().forEach((c) => c.destroy({ children: true }));

    const gap = prep ? 14 : 10;
    const totalW = TEAM_SIZE * slotW + (TEAM_SIZE - 1) * gap;
    const leftX = (w - totalW) / 2;
    const y = slotY;

    const team = PlayerData.team;
    for (let i = 0; i < TEAM_SIZE; i++) {
      const slot = new PIXI.Container();
      const cx = leftX + i * (slotW + gap) + slotW / 2;
      const cy = y + slotH / 2;
      slot.position.set(cx, cy);
      const petId = team[i];
      const pet = petId ? PET_MAP.get(petId) : undefined;

      if (pet) {
        if (prep) {
          addTeamPrepSlotPet(
            slot, pet, slotW, slotH,
            PlayerData.petLevel(pet.id),
            PlayerData.petStar(pet.id),
          );
        } else {
          addTeamPetAvatar(slot, pet, 0, 0, slotW);
          attachRarityBadge(slot, pet.rarity, -slotW / 2, -slotH / 2, slotW, { variant: 'codex' });
        }
        slot.hitArea = new PIXI.Rectangle(-slotW / 2, -slotH / 2, slotW, slotH);
        slot.interactiveChildren = false;
        slot.eventMode = 'static';
        slot.cursor = 'pointer';
        bindPointerTap(slot, () => this._togglePet(pet.id));
        if (this._prevTeam[i] !== petId) fadeIn(slot, { duration: 0.24 });
      } else {
        const empty = new PIXI.Graphics();
        empty.beginFill(0xfff8ec, prep ? 0.55 : 0.55);
        empty.drawRoundedRect(-slotW / 2, -slotH / 2, slotW, slotH, 12);
        empty.endFill();
        empty.lineStyle(2.5, 0xe0c896, 0.95);
        drawDashedRoundedRect(empty, -slotW / 2, -slotH / 2, slotW, slotH, 12, 8, 6);
        slot.addChild(empty);
        const plus = makeText('+', { size: prep ? 48 : 42, fill: COLORS.textSub, anchor: 0.5 });
        slot.addChild(plus);
        slot.hitArea = new PIXI.Rectangle(-slotW / 2, -slotH / 2, slotW, slotH);
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

    if (prep && this._summaryHost) {
      this._summaryHost.removeChildren().forEach((c) => c.destroy({ children: true }));
      this._summaryHost.addChild(buildTeamPrepSummary(members, this._summaryW));
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
      const checked = PlayerData.isInTeam(petId);
      check.visible = checked;
      if (checked && !this._prevChecked.has(petId)) popIn(check, { duration: 0.26 });
    }

    this._prevTeam = [...team];
    this._prevChecked = new Set(team);
  }
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
