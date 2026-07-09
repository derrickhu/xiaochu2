/**
 * 队伍栏：宠物槽位（头像 / 相框 / 属性角标 / 封印罩）、技能 CD 与就绪动效、
 * 上滑施法手势输入、受击后撤动效。
 *
 * 拥有槽位显示对象与手势监听；读取 BattleController 取队伍/技能状态，
 * 通过注入的回调把「请求施法」与「是否忙碌」交还编排者，避免反向依赖场景。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';
import { TweenManager, Ease } from '@/core/TweenManager';
import { TextureCache } from '@/core/TextureCache';
import { getPetAvatarTexture } from '@/config/petAvatarTexture';
import { UI, ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import { petFrameImage, UI_BATTLE_IMAGES } from '@/config/Assets';
import {
  createPetSkillReadyFx,
  triggerPetSkillReadyFlash,
  updatePetSkillReadyFx,
  type PetSkillReadyFxView,
} from '@/game/battle/PetSkillReadyFx';
import { getGrowthUi } from '@/balance/growth';
import { makeText, makePanel, COLORS } from '@/ui';
import type { BattleController } from '@/game/battle/BattleController';
import type { BattleLayout } from './BattleLayout';
import { showPetSkillPreview, TAP_SLOP, type PetSkillPreviewHandle } from './PetSkillPreviewBubble';
import { bindCanvasPointerMove, type CanvasPointerMoveHandle } from '@/minigame/canvasInteraction';
import { clientEventToDesign, designPointToLocal } from '@/utils/clientEventToDesign';
import { displayAlive, readScale } from '@/core/animationGuard';

interface PetBarHooks {
  /** 上滑达阈值 → 请求对该槽位施法 */
  onSkillCast: (petIndex: number) => void;
  /** 当前是否处于忙碌（演出中），用于拦截输入 */
  isBusy: () => boolean;
}

export class BattlePetBar {
  private _slots: PIXI.Container[] = [];
  private _petSize = 0;
  private _slotCdBadge: PIXI.Graphics[] = [];
  private _slotCdText: PIXI.Text[] = [];
  private _slotReadyFx: PetSkillReadyFxView[] = [];
  private _slotWasReady: boolean[] = [];
  private _slotBaseY: number[] = [];
  private _petPointer: { index: number; startX: number; startY: number; triggered: boolean; canCast: boolean } | null = null;
  private _petSwipeBridge: CanvasPointerMoveHandle | null = null;
  private _previewLayer: PIXI.Container | null = null;
  private _skillPreview: PetSkillPreviewHandle | null = null;
  private _hooks!: PetBarHooks;

  constructor(private readonly _ctrl: BattleController, private readonly _layout: BattleLayout) {}

  build(parent: PIXI.Container, hooks: PetBarHooks): void {
    this._hooks = hooks;
    const { petFrameScale } = UI.battle;
    const {
      petSize, petGap, petBarSidePad, petBarCenterY,
      petBarPanelY, petBarPanelH, petBarPanelW,
    } = this._layout;
    this._petSize = petSize;
    const startX = petBarSidePad + petSize / 2;
    const y = petBarCenterY;
    const frameSize = petSize * petFrameScale;
    const starUi = getGrowthUi('panel');
    const w = Game.logicWidth;

    // cream 宠物栏底板贴图（Gemini，对齐 mockup；缺图回退程序面板）
    const panelTex = TextureCache.get(UI_BATTLE_IMAGES.petPanel);
    if (panelTex) {
      const panel = new PIXI.Sprite(panelTex);
      panel.anchor.set(0.5);
      panel.width = petBarPanelW;
      panel.height = petBarPanelH;
      panel.position.set(w / 2, petBarPanelY);
      parent.addChild(panel);
    } else {
      parent.addChild(makePanel({
        width: petBarPanelW,
        height: petBarPanelH,
        radius: 22,
        bg: COLORS.panelBg,
        bgAlpha: 0.96,
        border: COLORS.panelBorder,
        borderWidth: 4,
        centered: true,
      })).position.set(w / 2, petBarPanelY);
    }

    this._slotCdBadge = [];
    this._slotCdText = [];
    this._slotReadyFx = [];
    this._slotWasReady = [];
    this._slotBaseY = [];
    // 5 星总宽 ≈ 宠物格宽（略大一点更清晰）
    const MAX_STARS = 5;
    const starGap = 1;
    const starSize = Math.max(
      UI.battle.petStarSize,
      Math.floor((petSize - (MAX_STARS - 1) * starGap) / MAX_STARS),
    );
    const starTex = TextureCache.get(UI_BATTLE_IMAGES.petStar);

    this._slots = this._ctrl.team.map((pet, i) => {
      const slot = new PIXI.Container();
      slot.position.set(startX + i * (petSize + petGap), y);
      this._slotBaseY.push(y);
      const color = ORB_COLOR[pet.def.element];

      // 浅色槽底（相框下垫一层）
      const bg = new PIXI.Graphics();
      bg.beginFill(COLORS.panelBgAlt, 0.85);
      bg.drawRoundedRect(-petSize / 2 + 1, -petSize / 2 + 1, petSize - 2, petSize - 2, 14);
      bg.endFill();
      slot.addChild(bg);

      const tex = getPetAvatarTexture(pet.def.id, pet.star);
      if (tex) {
        const avatar = new PIXI.Sprite(tex);
        avatar.anchor.set(0.5, 1);
        const drawW = petSize - 2;
        const drawH = drawW * (tex.height / tex.width);
        avatar.width = drawW;
        avatar.height = drawH;
        avatar.position.set(0, petSize / 2 - 1);
        slot.addChild(avatar);
      }

      const frameTex = TextureCache.get(petFrameImage(pet.def.element));
      if (frameTex) {
        const frame = new PIXI.Sprite(frameTex);
        frame.anchor.set(0.5);
        frame.width = frameSize;
        frame.height = frameSize;
        slot.addChild(frame);
      }

      // 属性角标：左上
      const badge = makeText(ELEMENT_NAME[pet.def.element], {
        size: Math.max(14, Math.round(petSize * 0.17)),
        fill: COLORS.white,
        bold: true,
        anchor: 0.5,
        strokeColor: 0x000000,
        strokeWidth: 3,
      });
      badge.position.set(-petSize / 2 + 14, -petSize / 2 + 14);
      slot.addChild(badge);

      // Lv 角标：右下，对齐 mockup（白字 + 深棕描边）
      const lvSize = Math.max(16, Math.round(petSize * 0.18));
      const lvText = makeText(`Lv.${pet.level}`, {
        size: lvSize,
        fill: COLORS.white,
        bold: true,
        anchor: [1, 1],
        strokeColor: COLORS.textMain,
        strokeWidth: Math.max(4, Math.round(lvSize * 0.22)),
      });
      lvText.position.set(petSize / 2 - 2, petSize / 2 - 1);
      slot.addChild(lvText);

      // Q 版星级：固定 5 槽铺满宠物格宽，按星级点亮
      {
        const filled = Math.min(Math.max(pet.star, 0), MAX_STARS);
        const starRow = new PIXI.Container();
        const rowW = MAX_STARS * starSize + (MAX_STARS - 1) * starGap;
        for (let s = 0; s < MAX_STARS; s++) {
          const lit = s < filled;
          if (starTex) {
            const star = new PIXI.Sprite(starTex);
            star.anchor.set(0.5);
            star.width = starSize;
            star.height = starSize;
            if (!lit) {
              star.tint = 0x9a8a70;
              star.alpha = 0.35;
            }
            star.position.set(-rowW / 2 + starSize / 2 + s * (starSize + starGap), 0);
            starRow.addChild(star);
          } else {
            const fallback = makeText('★', {
              size: starSize,
              fill: lit ? 0xf5c84a : starUi.starEmpty,
              bold: true,
              anchor: 0.5,
              strokeColor: lit ? 0xb5701f : 0x8a7a60,
              strokeWidth: 2,
            });
            if (!lit) fallback.alpha = 0.45;
            fallback.position.set(-rowW / 2 + starSize / 2 + s * (starSize + starGap), 0);
            starRow.addChild(fallback);
          }
        }
        starRow.position.set(0, petSize / 2 + starSize / 2 + 2);
        slot.addChild(starRow);
      }

      // 技能 CD 回合圆标：右上角（对齐 mockup_v2 深棕圆 + 白字）
      const cdR = Math.max(14, Math.round(petSize * UI.battle.petCdBadgeRatio / 2));
      const cdBadge = new PIXI.Graphics();
      cdBadge.beginFill(COLORS.battleCdBadgeBg, 1);
      cdBadge.lineStyle(2.5, COLORS.battleCdBadgeRing, 1);
      cdBadge.drawCircle(0, 0, cdR);
      cdBadge.endFill();
      cdBadge.position.set(petSize / 2 - 2, -petSize / 2 + 2);
      slot.addChild(cdBadge);
      this._slotCdBadge.push(cdBadge);

      const cdFont = Math.max(16, Math.round(cdR * 1.35));
      const cdText = makeText(pet.skillCdLeft > 0 ? String(pet.skillCdLeft) : '', {
        size: cdFont,
        fill: COLORS.white,
        bold: true,
        anchor: 0.5,
        strokeColor: COLORS.battleCdBadgeBg,
        strokeWidth: Math.max(3, Math.round(cdFont * 0.18)),
      });
      cdText.position.set(0, 0);
      cdBadge.addChild(cdText);
      this._slotCdText.push(cdText);
      cdBadge.visible = pet.skillCdLeft > 0;

      const readyFx = createPetSkillReadyFx(petSize, color);
      slot.addChild(readyFx.root);
      this._slotReadyFx.push(readyFx);
      this._slotWasReady.push(pet.skillCdLeft <= 0);

      if (this._ctrl.bannedElements.has(pet.def.element)) {
        const banMask = new PIXI.Graphics();
        banMask.beginFill(COLORS.scrim, 0.5);
        banMask.drawRoundedRect(-petSize / 2, -petSize / 2, petSize, petSize, 16);
        banMask.endFill();
        slot.addChild(banMask);
        const banText = makeText('封', {
          size: 30, fill: 0xff6b6b, bold: true, anchor: 0.5,
          strokeColor: 0x000000, strokeWidth: 4,
        });
        slot.addChild(banText);
      }

      slot.eventMode = 'static';
      slot.cursor = 'pointer';
      if (!Platform.isMinigame || Platform.isDevtools) {
        slot.on('pointerdown', (e: PIXI.FederatedPointerEvent) => this._onPetSlotDown(i, e));
      }

      parent.addChild(slot);
      return slot;
    });

    this._previewLayer = new PIXI.Container();
    // 预览层稍后由 raisePreviewLayer 置顶，避免被英雄血条挡住
    parent.addChild(this._previewLayer);

    this._installPetSwipeInput();
  }

  /** 技能说明气泡置顶（须在英雄血条等 HUD 之后调用） */
  raisePreviewLayer(parent: PIXI.Container): void {
    if (!this._previewLayer) return;
    parent.addChild(this._previewLayer);
  }

  /** 槽位容器（编排者做冲刺/弹道起点定位用） */
  slotAt(index: number): PIXI.Container {
    return this._slots[index];
  }

  /** 刷新宠物槽技能 CD 圆标与就绪动效 */
  refreshCooldowns(): void {
    this._ctrl.team.forEach((pet, i) => {
      const ready = pet.skillCdLeft <= 0;
      const badge = this._slotCdBadge[i];
      const cdText = this._slotCdText[i];
      if (badge && cdText) {
        if (ready) {
          badge.visible = false;
        } else {
          badge.visible = true;
          cdText.text = String(pet.skillCdLeft);
        }
      }
      if (ready && !this._slotWasReady[i]) {
        triggerPetSkillReadyFlash(this._slotReadyFx[i]);
      }
      this._slotWasReady[i] = ready;
    });
  }

  /** 技能就绪槽：旋转光弧 + 上升粒子 + 双箭头（对齐 xiao_chu，无每帧 Graphics 重绘） */
  update(dt: number): void {
    const petSize = this._petSize;
    const canAct = !this._hooks.isBusy() && this._ctrl.state === 'playerTurn';

    this._ctrl.team.forEach((pet, i) => {
      const fx = this._slotReadyFx[i];
      if (pet.skillCdLeft > 0) {
        fx.root.visible = false;
        return;
      }
      if (this._petPointer?.index === i) {
        fx.root.visible = false;
        return;
      }
      updatePetSkillReadyFx(
        fx,
        dt,
        petSize,
        canAct,
        true,
        canAct && displayAlive(this._slots[i]) ? readScale(this._slots[i]) ?? undefined : undefined,
      );
    });
  }

  /** 队伍栏整体后撤再弹回（受击方向感） */
  recoil(heavy: boolean): void {
    const offset = heavy ? 16 : 10;
    for (const slot of this._slots) {
      const baseX = slot.x;
      TweenManager.cancelTarget(slot);
      TweenManager.to({
        target: slot,
        props: { x: baseX + offset },
        duration: UI.anim.heroHitRecoil * 0.35,
        ease: Ease.easeOutQuad,
        onComplete: () => {
          TweenManager.to({
            target: slot,
            props: { x: baseX },
            duration: UI.anim.heroHitRecoil * 0.65,
            ease: Ease.easeOutBack,
          });
        },
      });
    }
  }

  teardownInput(): void {
    this._hideSkillPreview();
    this._teardownPetSwipeInput();
  }

  // ════════════ 手势输入 ════════════

  /** 原生 touch/pointer → 设计坐标 */
  private _rawToDesign(e: unknown): { x: number; y: number } {
    return clientEventToDesign(e);
  }

  private _onCanvasPetDown(e: unknown): void {
    if (this._hooks.isBusy()) return;
    const design = clientEventToDesign(e);
    const half = this._petSize / 2;
    for (let i = 0; i < this._slots.length; i++) {
      const slot = this._slots[i];
      const local = designPointToLocal(slot, design.x, design.y);
      if (local.x >= -half && local.x <= half && local.y >= -half && local.y <= half) {
        // 小游戏真机：槽位点击走 canvas；浏览器/devtools 仍由 slot.pointerdown 处理，避免重复
        if (Platform.isMinigame && !Platform.isDevtools) {
          this._onPetSlotDown(i, e);
        }
        return;
      }
    }
    // 点到宠物栏外：收起技能说明气泡
    this._hideSkillPreview();
  }

  private _installPetSwipeInput(): void {
    this._teardownPetSwipeInput();
    this._petSwipeBridge = bindCanvasPointerMove({
      // 始终监听 down：真机负责点宠；各端点空白处关闭气泡
      onDown: (e) => this._onCanvasPetDown(e),
      onMove: (e) => this._onPetSwipeMove(e),
      onUp: (e) => this._cancelPetPointer(true, e),
    });
  }

  private _teardownPetSwipeInput(): void {
    this._petSwipeBridge?.destroy();
    this._petSwipeBridge = null;
    this._petPointer = null;
  }

  private _hideSkillPreview(): void {
    this._skillPreview?.dismiss();
    this._skillPreview = null;
  }

  private _onPetSlotDown(petIndex: number, e: unknown): void {
    if (this._hooks.isBusy()) return;
    const p = this._rawToDesign(e);
    this._hideSkillPreview();
    const canCast = this._ctrl.canCastSkill(petIndex);
    this._petPointer = { index: petIndex, startX: p.x, startY: p.y, triggered: false, canCast };
    if (canCast) TweenManager.cancelTarget(this._slots[petIndex]);
  }

  private _onPetSwipeMove(e: unknown): void {
    const ptr = this._petPointer;
    if (!ptr || ptr.triggered || !ptr.canCast) return;

    const p = this._rawToDesign(e);
    const dy = ptr.startY - p.y;
    const slot = this._slots[ptr.index];
    if (!slot || slot.destroyed) return;
    const baseY = this._slotBaseY[ptr.index];
    const { skillSwipeThreshold, skillSwipeLiftMax } = UI.battle;
    const lift = Math.min(Math.max(0, dy) * 0.55, skillSwipeLiftMax);

    slot.y = baseY - lift;
    const slotScale = readScale(slot);
    slotScale?.set(1 + Math.min(dy / skillSwipeThreshold, 1) * 0.1);
    this._slotReadyFx[ptr.index].root.visible = false;

    if (dy >= skillSwipeThreshold) {
      ptr.triggered = true;
      slot.y = baseY;
      readScale(slot)?.set(1);
      this._petPointer = null;
      this._hooks.onSkillCast(ptr.index);
    }
  }

  private _cancelPetPointer(animateBack: boolean, endEvent?: unknown): void {
    const ptr = this._petPointer;
    if (!ptr || ptr.triggered) {
      this._petPointer = null;
      return;
    }

    const slot = this._slots[ptr.index];
    if (!slot || slot.destroyed) {
      this._petPointer = null;
      return;
    }
    const baseY = this._slotBaseY[ptr.index];
    let isTap = true;
    if (endEvent) {
      const p = this._rawToDesign(endEvent);
      const dx = p.x - ptr.startX;
      const dy = p.y - ptr.startY;
      isTap = dx * dx + dy * dy <= TAP_SLOP * TAP_SLOP;
    }
    const index = ptr.index;
    this._petPointer = null;

    if (!animateBack) {
      slot.y = baseY;
      readScale(slot)?.set(1);
    } else {
      TweenManager.cancelTarget(slot);
      TweenManager.to({
        target: slot,
        props: { y: baseY },
        duration: 0.12,
        ease: Ease.easeOutQuad,
      });
      const slotScale = readScale(slot);
      if (slotScale) {
        TweenManager.to({
          target: slotScale,
          props: { x: 1, y: 1 },
          duration: 0.12,
          ease: Ease.easeOutQuad,
        });
      }
    }

    if (isTap) this._showSkillPreview(index);
  }

  private _showSkillPreview(petIndex: number): void {
    if (!this._previewLayer) return;
    const pet = this._ctrl.team[petIndex];
    const slot = this._slots[petIndex];
    this._skillPreview = showPetSkillPreview(this._previewLayer, pet, slot.x, slot.y);
  }
}
