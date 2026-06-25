/**
 * 队伍栏：宠物槽位（头像 / 相框 / 属性角标 / 封印罩）、技能 CD 与就绪动效、
 * 上滑施法手势输入、受击后撤动效。
 *
 * 拥有槽位显示对象与手势监听；读取 BattleController 取队伍/技能状态，
 * 通过注入的回调把「请求施法」与「是否忙碌」交还编排者，避免反向依赖场景。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { TextureCache } from '@/core/TextureCache';
import { UI, ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import { petFrameImage, petAvatarPath } from '@/config/Assets';
import {
  createPetSkillReadyFx,
  triggerPetSkillReadyFlash,
  updatePetSkillReadyFx,
  type PetSkillReadyFxView,
} from '@/game/battle/PetSkillReadyFx';
import type { BattleController } from '@/game/battle/BattleController';
import type { BattleLayout } from './BattleLayout';

interface PetBarHooks {
  /** 上滑达阈值 → 请求对该槽位施法 */
  onSkillCast: (petIndex: number) => void;
  /** 当前是否处于忙碌（演出中），用于拦截输入 */
  isBusy: () => boolean;
}

export class BattlePetBar {
  private _slots: PIXI.Container[] = [];
  private _slotCdMask: PIXI.Graphics[] = [];
  private _slotCdText: PIXI.Text[] = [];
  private _slotReadyFx: PetSkillReadyFxView[] = [];
  private _slotWasReady: boolean[] = [];
  private _slotBaseY: number[] = [];
  private _petSwipe: { index: number; startY: number; triggered: boolean } | null = null;
  private _petSwipeMove: ((e: unknown) => void) | null = null;
  private _petSwipeUp: ((e: unknown) => void) | null = null;
  private _hooks!: PetBarHooks;

  constructor(private readonly _ctrl: BattleController, private readonly _layout: BattleLayout) {}

  build(parent: PIXI.Container, hooks: PetBarHooks): void {
    this._hooks = hooks;
    const { petSize, petGap, petFrameScale } = UI.battle;
    const total = this._ctrl.team.length * petSize + (this._ctrl.team.length - 1) * petGap;
    const startX = (Game.logicWidth - total) / 2 + petSize / 2;
    const y = this._layout.boardY - UI.battle.teamBarOffset + petSize / 2;
    const frameSize = petSize * petFrameScale;

    this._slotCdMask = [];
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

      const tex = TextureCache.get(petAvatarPath(pet.def.id, pet.star));
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

      const cdMask = new PIXI.Graphics();
      cdMask.beginFill(0x000000, 0.55);
      cdMask.drawRoundedRect(-petSize / 2, -petSize / 2, petSize, petSize, 16);
      cdMask.endFill();
      slot.addChild(cdMask);
      this._slotCdMask.push(cdMask);

      const cdText = new PIXI.Text('', {
        fontSize: 38, fill: 0xffffff, fontWeight: 'bold',
        stroke: 0x000000, strokeThickness: 4,
      });
      cdText.anchor.set(0.5);
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
      slot.on('pointerdown', (e: PIXI.FederatedPointerEvent) => this._onPetSlotDown(i, e));

      parent.addChild(slot);
      return slot;
    });

    this._installPetSwipeInput();
  }

  /** 槽位容器（编排者做冲刺/弹道起点定位用） */
  slotAt(index: number): PIXI.Container {
    return this._slots[index];
  }

  /** 刷新宠物槽技能状态（CD 数字 / 就绪动效） */
  refreshCooldowns(): void {
    this._ctrl.team.forEach((pet, i) => {
      const ready = pet.skillCdLeft <= 0;
      this._slotCdMask[i].visible = !ready;
      this._slotCdText[i].visible = !ready;
      this._slotCdText[i].text = String(pet.skillCdLeft);
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
      if (this._petSwipe?.index === i) {
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
    this._teardownPetSwipeInput();
  }

  // ════════════ 手势输入 ════════════

  /** 原生 pointer 坐标 → 设计坐标（与 BoardView 一致，兼容小游戏） */
  private _rawToDesign(e: unknown): { x: number; y: number } {
    const ev = e as {
      clientX?: number; clientY?: number; x?: number; y?: number;
      touches?: Array<{ clientX?: number; clientY?: number }>;
      changedTouches?: Array<{ clientX?: number; clientY?: number }>;
    };
    const t0 = ev.touches?.[0] ?? ev.changedTouches?.[0];
    const cx = ev.clientX ?? t0?.clientX ?? ev.x ?? 0;
    const cy = ev.clientY ?? t0?.clientY ?? ev.y ?? 0;
    const k = Game.designWidth / Game.screenWidth;
    return { x: cx * k, y: cy * k };
  }

  private _installPetSwipeInput(): void {
    this._teardownPetSwipeInput();
    const canvas = Game.app.view as unknown as HTMLElement;
    this._petSwipeMove = (e) => this._onPetSwipeMove(e);
    this._petSwipeUp = () => this._cancelPetSwipe(true);
    canvas.addEventListener('pointermove', this._petSwipeMove);
    canvas.addEventListener('pointerup', this._petSwipeUp);
    canvas.addEventListener('pointercancel', this._petSwipeUp);
  }

  private _teardownPetSwipeInput(): void {
    const canvas = Game.app.view as unknown as HTMLElement;
    if (this._petSwipeMove) canvas.removeEventListener('pointermove', this._petSwipeMove);
    if (this._petSwipeUp) {
      canvas.removeEventListener('pointerup', this._petSwipeUp);
      canvas.removeEventListener('pointercancel', this._petSwipeUp);
    }
    this._petSwipeMove = null;
    this._petSwipeUp = null;
    this._petSwipe = null;
  }

  private _onPetSlotDown(petIndex: number, e: PIXI.FederatedPointerEvent): void {
    if (this._hooks.isBusy() || !this._ctrl.canCastSkill(petIndex)) return;
    const native = (e.nativeEvent ?? e) as unknown;
    const p = this._rawToDesign(native);
    this._petSwipe = { index: petIndex, startY: p.y, triggered: false };
    TweenManager.cancelTarget(this._slots[petIndex]);
  }

  private _onPetSwipeMove(e: unknown): void {
    const swipe = this._petSwipe;
    if (!swipe || swipe.triggered) return;

    const p = this._rawToDesign(e);
    const dy = swipe.startY - p.y;
    const slot = this._slots[swipe.index];
    const baseY = this._slotBaseY[swipe.index];
    const { skillSwipeThreshold, skillSwipeLiftMax } = UI.battle;
    const lift = Math.min(Math.max(0, dy) * 0.55, skillSwipeLiftMax);

    slot.y = baseY - lift;
    slot.scale.set(1 + Math.min(dy / skillSwipeThreshold, 1) * 0.1);
    this._slotReadyFx[swipe.index].root.visible = false;

    if (dy >= skillSwipeThreshold) {
      swipe.triggered = true;
      slot.y = baseY;
      slot.scale.set(1);
      this._petSwipe = null;
      this._hooks.onSkillCast(swipe.index);
    }
  }

  private _cancelPetSwipe(animateBack: boolean): void {
    const swipe = this._petSwipe;
    if (!swipe || swipe.triggered) {
      this._petSwipe = null;
      return;
    }

    const slot = this._slots[swipe.index];
    const baseY = this._slotBaseY[swipe.index];
    this._petSwipe = null;

    if (!animateBack) {
      slot.y = baseY;
      slot.scale.set(1);
      return;
    }

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
}
