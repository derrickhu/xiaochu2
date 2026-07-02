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
import { petFrameImage } from '@/config/Assets';
import {
  createPetSkillReadyFx,
  triggerPetSkillReadyFlash,
  updatePetSkillReadyFx,
  type PetSkillReadyFxView,
} from '@/game/battle/PetSkillReadyFx';
import type { BattleController } from '@/game/battle/BattleController';
import type { BattleLayout } from './BattleLayout';
import { showPetSkillPreview, TAP_SLOP, type PetSkillPreviewHandle } from './PetSkillPreviewBubble';
import { bindCanvasPointerMove, type CanvasPointerMoveHandle } from '@/minigame/canvasInteraction';
import { clientEventToDesign, designPointToLocal } from '@/utils/clientEventToDesign';

interface PetBarHooks {
  /** 上滑达阈值 → 请求对该槽位施法 */
  onSkillCast: (petIndex: number) => void;
  /** 当前是否处于忙碌（演出中），用于拦截输入 */
  isBusy: () => boolean;
}

export class BattlePetBar {
  private _slots: PIXI.Container[] = [];
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
    const { petSize, petGap, petFrameScale } = UI.battle;
    const total = this._ctrl.team.length * petSize + (this._ctrl.team.length - 1) * petGap;
    const startX = (Game.logicWidth - total) / 2 + petSize / 2;
    const y = this._layout.boardY - UI.battle.teamBarOffset + petSize / 2;
    const frameSize = petSize * petFrameScale;

    this._slotCdBadge = [];
    this._slotCdText = [];
    this._slotReadyFx = [];
    this._slotWasReady = [];
    this._slotBaseY = [];
    this._slots = this._ctrl.team.map((pet, i) => {
      const slot = new PIXI.Container();
      slot.position.set(startX + i * (petSize + petGap), y);
      this._slotBaseY.push(y);
      const color = ORB_COLOR[pet.def.element];

      const bg = new PIXI.Graphics();
      bg.beginFill(0x1a1126);
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

      const badge = new PIXI.Text(ELEMENT_NAME[pet.def.element], {
        fontSize: 22, fill: 0xffffff, fontWeight: 'bold',
        stroke: 0x000000, strokeThickness: 3,
      });
      badge.anchor.set(0.5);
      badge.position.set(petSize / 2 - 16, -petSize / 2 + 16);
      slot.addChild(badge);

      // 冷却标记：右下角小圆标（对齐 xiao_chu，不暗化头像）
      const cdR = petSize * 0.2;
      const cdCx = petSize / 2 - cdR - 2;
      const cdCy = petSize / 2 - cdR - 2;
      const cdBadge = new PIXI.Graphics();
      cdBadge.beginFill(0x000000, 0.75);
      cdBadge.drawCircle(cdCx, cdCy, cdR);
      cdBadge.endFill();
      cdBadge.lineStyle(1, 0xffffff, 0.3);
      cdBadge.drawCircle(cdCx, cdCy, cdR);
      slot.addChild(cdBadge);
      this._slotCdBadge.push(cdBadge);

      const cdText = new PIXI.Text('', {
        fontSize: Math.round(petSize * 0.22), fill: 0xffd700, fontWeight: 'bold',
      });
      cdText.anchor.set(0.5);
      cdText.position.set(cdCx, cdCy);
      slot.addChild(cdText);
      this._slotCdText.push(cdText);

      const readyFx = createPetSkillReadyFx(petSize, color);
      slot.addChild(readyFx.root);
      this._slotReadyFx.push(readyFx);
      this._slotWasReady.push(pet.skillCdLeft <= 0);

      if (this._ctrl.bannedElements.has(pet.def.element)) {
        const banMask = new PIXI.Graphics();
        banMask.beginFill(0x000000, 0.55);
        banMask.drawRoundedRect(-petSize / 2, -petSize / 2, petSize, petSize, 16);
        banMask.endFill();
        slot.addChild(banMask);
        const banText = new PIXI.Text('封', {
          fontSize: 30, fill: 0xff6b6b, fontWeight: 'bold',
          stroke: 0x000000, strokeThickness: 4,
        });
        banText.anchor.set(0.5);
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
    parent.addChild(this._previewLayer);

    this._installPetSwipeInput();
  }

  /** 槽位容器（编排者做冲刺/弹道起点定位用） */
  slotAt(index: number): PIXI.Container {
    return this._slots[index];
  }

  /** 刷新宠物槽技能状态（CD 数字 / 就绪动效） */
  refreshCooldowns(): void {
    this._ctrl.team.forEach((pet, i) => {
      const badge = this._slotCdBadge[i];
      const cdText = this._slotCdText[i];
      if (!badge || !cdText) return;
      const ready = pet.skillCdLeft <= 0;
      badge.visible = !ready;
      cdText.visible = !ready;
      cdText.text = String(pet.skillCdLeft);
      if (ready && !this._slotWasReady[i]) {
        triggerPetSkillReadyFlash(this._slotReadyFx[i]);
      }
      this._slotWasReady[i] = ready;
    });
  }

  /** 技能就绪槽：旋转光弧 + 上升粒子 + 双箭头（对齐 xiao_chu，无每帧 Graphics 重绘） */
  update(dt: number): void {
    const { petSize } = UI.battle;
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
        canAct ? this._slots[i].scale : undefined,
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
    const half = UI.battle.petSize / 2;
    for (let i = 0; i < this._slots.length; i++) {
      const slot = this._slots[i];
      const local = designPointToLocal(slot, design.x, design.y);
      if (local.x >= -half && local.x <= half && local.y >= -half && local.y <= half) {
        this._onPetSlotDown(i, e);
        return;
      }
    }
  }

  private _installPetSwipeInput(): void {
    this._teardownPetSwipeInput();
    this._petSwipeBridge = bindCanvasPointerMove({
      onDown: Platform.isMinigame && !Platform.isDevtools
        ? (e) => this._onCanvasPetDown(e)
        : undefined,
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
    slot.scale.set(1 + Math.min(dy / skillSwipeThreshold, 1) * 0.1);
    this._slotReadyFx[ptr.index].root.visible = false;

    if (dy >= skillSwipeThreshold) {
      ptr.triggered = true;
      slot.y = baseY;
      slot.scale.set(1);
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
      slot.scale.set(1);
    } else {
      TweenManager.cancelTarget(slot);
      TweenManager.to({
        target: slot,
        props: { y: baseY },
        duration: 0.12,
        ease: Ease.easeOutQuad,
      });
      TweenManager.to({
        target: slot.scale,
        props: { x: 1, y: 1 },
        duration: 0.12,
        ease: Ease.easeOutQuad,
      });
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
