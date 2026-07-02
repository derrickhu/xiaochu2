/**
 * 战斗场景（编排者）：组合 BoardView（转珠） + BattleController（结算） + 各战斗 UI 协作组件，
 * 只负责生命周期、回合流程与跨组件的演出时序，具体表现委托给协作组件：
 *   - BattleFx          粒子 / 飘字 / 弹道 / 震屏 / 闪光 / 技能横幅
 *   - BattleHud         敌人区 / 英雄血条 / Combo / 拖珠条 / 状态行 / 受击演出
 *   - BattlePetBar      队伍槽 / 技能 CD / 就绪动效 / 上滑施法手势
 *   - BattleResultOverlay 胜负结算浮层
 *
 * 演出序列（async/await 驱动）：
 *   拖珠松手 → 逐组消除(Combo 跳动) → 下落连锁 → 宠物依次冲刺攻击
 *   → 敌人受击闪烁/抖动 + 伤害飘字 → 敌人回合(属性弹道→英雄受击反馈) → 回到玩家回合
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { TweenManager, Ease } from '@/core/TweenManager';
import { Platform } from '@/core/PlatformService';
import { battlePreloadImages, battlePetAvatarEntries, ensurePetAvatars } from '@/config/assetPreload';
import { UI_FX_IMAGES } from '@/config/Assets';
import { ensureAssets } from '@/config/Subpackages';
import { UI, ORB_COLOR } from '@/balance/ui';
import type { Element } from '@/balance/combat';
import { STAGES } from '@/balance/stages';
import { BoardModel, type MatchGroup } from '@/game/board/BoardModel';
import { BoardView } from '@/game/board/BoardView';
import { BattleController, type PetAttack, type TurnResolution } from '@/game/battle/BattleController';
import { PlayerData } from '@/game/PlayerData';
import { makeButton, delay } from './battle/battleWidgets';
import { computeBattleLayout, type BattleLayout } from './battle/BattleLayout';
import { BattleFx } from './battle/BattleFx';
import { BattleHud } from './battle/BattleHud';
import { BattleStatusIcons } from './battle/BattleStatusIcons';
import { BattlePetBar } from './battle/BattlePetBar';
import { BattleResultOverlay } from './battle/BattleResultOverlay';
import { presentSkillCast, type SkillCastDeps } from './battle/battleSkillPresenter';
import { SceneEnterSeq, deferSceneBuild } from '@/utils/sceneEnterSeq';
import {
  guardedPromise, guardedTween, minigameFallback, once, startMinigamePresentLoop,
} from '@/core/animationGuard';

export interface BattleEnterData {
  stageId: string;
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export class BattleScene implements Scene {
  readonly name = 'battle';
  readonly container = new PIXI.Container();

  private _ctrl!: BattleController;
  private _board!: BoardModel;
  private _boardView: BoardView | null = null;

  private _layout!: BattleLayout;
  private _fx!: BattleFx;
  private _hud!: BattleHud;
  private _statusIcons!: BattleStatusIcons;
  private _petBar!: BattlePetBar;
  private _overlay!: BattleResultOverlay;

  private _busy = false;
  /** 拖珠结算代次：场景退出或强制收敛时递增，陈旧 async 演出立即短路 */
  private _resolveSeq = 0;
  private _tickerCb = (): void => this._update();
  private readonly _enterSeq = new SceneEnterSeq();

  onEnter(data?: unknown): void {
    PlayerData.load();

    const stageId = (data as BattleEnterData | undefined)?.stageId ?? STAGES[0].id;
    this._ctrl = new BattleController(stageId, PlayerData.team, Math.random,
      (id) => ({ level: PlayerData.petLevel(id), star: PlayerData.petStar(id) }));
    this._board = new BoardModel();
    if (this._ctrl.sealOrbCount > 0) {
      this._board.sealRandom(this._ctrl.sealOrbCount);
    }
    this._busy = false;

    this._layout = computeBattleLayout();
    this._fx = new BattleFx();
    this._hud = new BattleHud(this._ctrl, this._layout);
    this._statusIcons = new BattleStatusIcons(this._ctrl, this._layout);
    this._petBar = new BattlePetBar(this._ctrl, this._layout);
    this._overlay = new BattleResultOverlay();

    void this._enter(this._enterSeq.next());
  }

  private async _enter(token: number): Promise<void> {
    const stageId = this._ctrl.stage.id;
    await ensureAssets(battlePreloadImages(stageId, PlayerData.team));
    await ensurePetAvatars(battlePetAvatarEntries(stageId, PlayerData.team));
    // pkg-fx 特效贴图懒加载：不阻塞进场；失败/加载中时演出自动降级为纯白粒子
    void ensureAssets([
      UI_FX_IMAGES.starburst, UI_FX_IMAGES.auraRing, UI_FX_IMAGES.particleSpark,
    ]).catch(() => { /* 降级路径：BattleFx 内按贴图缺失回退粒子 */ });
    if (!this._enterSeq.stillValid(token)) return;
    deferSceneBuild(token, this._enterSeq, 'battle', () => {
      this._build();
      this._hud.refreshEnemy(false);
      this._hud.refreshHeroHp();
      Game.ticker.add(this._tickerCb);
    });
  }

  onExit(): void {
    this._resolveSeq++;
    this._enterSeq.cancel();
    Game.ticker.remove(this._tickerCb);
    this._boardView?.cancelDrag();
    this._boardView?.destroy();
    this._boardView = null;
    this._statusIcons?.destroy();
    this._petBar?.teardownInput();
    this._fx?.destroy();
    TweenManager.cancelTarget(this.container);
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  // ════════════ 构建（仅编排 z 序，具体显示对象由各组件创建） ════════════

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    // 全屏暗色渐变底（对齐 xiao_chu drawBattleBg，棋盘区不贴图）
    const bg = new PIXI.Graphics();
    const steps = 32;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const color = t < 0.5
        ? lerpColor(0x0e0b15, 0x161220, t * 2)
        : lerpColor(0x161220, 0x0a0810, (t - 0.5) * 2);
      bg.beginFill(color);
      bg.drawRect(0, (h / steps) * i, w, h / steps + 1);
      bg.endFill();
    }
    this.container.addChild(bg);

    // 敌人区属性背景（最底层）
    this._hud.buildEnemyBg(this.container);

    // 顶栏：返回 + 关卡名（与 xiao_chu 一样画在敌人区背景之上）
    const headerY = this._layout.headerY;
    const backBtn = makeButton('返回', 130, 56, 0x4a3a72, () => {
      SceneManager.switchTo('title');
    });
    backBtn.position.set(85, headerY);
    this.container.addChild(backBtn);

    const stageText = new PIXI.Text(
      `${this._ctrl.stage.name}${this._ctrl.stage.isBoss ? ' · BOSS' : ''}`,
      {
        fontSize: 30, fill: 0xf0e0c0, fontWeight: 'bold',
        dropShadow: true, dropShadowColor: 0x000000, dropShadowBlur: 4, dropShadowDistance: 2,
      },
    );
    stageText.anchor.set(0.5);
    stageText.position.set(w / 2, headerY);
    this.container.addChild(stageText);

    // 敌人区（尽早 refresh，避免后续组件构建异常时立绘/背景未挂上）
    this._hud.buildEnemyArea(this.container);
    this._hud.refreshEnemy(false);

    this._hud.buildHeroBar(this.container);

    // 队伍栏 + buff 状态行
    this._petBar.build(this.container, {
      onSkillCast: (i) => void this._onSkillCast(i),
      isBusy: () => this._busy,
    });
    this._hud.buildStatus(this.container);
    this._statusIcons.build(this.container);

    // 拖珠倒计时条
    this._hud.buildDragBar(this.container);

    // 特效层（粒子 / 飘字 / 闪光）—— 先加，珠盘后加以保证跟手珠不被挡住
    this._fx.build(this.container, w, h);

    // 珠盘（须在 FX 之上；输入走 canvas touchstart，不依赖 Pixi 层级）
    this._boardView = new BoardView(this._board, {
      canDrag: () => !this._busy && this._ctrl.state === 'playerTurn',
      onDragEnd: (didMove) => {
        void this._onDragEnd(didMove);
      },
      isOrbActive: (orb) => orb === 'heart' || this._ctrl.teamElementSet.has(orb as Element),
      dragTimeLimit: () => this._ctrl.dragTimeLimit,
    });
    this._boardView.container.position.set(this._layout.boardX, this._layout.boardY);
    this.container.addChild(this._boardView.container);

    // Combo 大字（棋盘中央，叠在珠盘与粒子之上）
    this._hud.buildCombo(this.container);

    this._overlay.build(this.container);

    // 初始刷新槽位 CD / 状态行
    this._refreshSkillUi();
  }

  // ════════════ 每帧 ════════════

  private _update(dt = Game.ticker.deltaMS / 1000): void {
    this._boardView?.update(dt);
    this._fx.update(dt);
    this._petBar.update(dt);
    this._hud.redrawDragBar(this._boardView);
    this._hud.redrawHpBars();
    this._hud.updateCombo(dt);
  }

  /** 刷新槽位技能 CD + buff 状态行 + 状态图标行（队伍栏 + HUD 协同） */
  private _refreshSkillUi(): void {
    this._petBar.refreshCooldowns();
    this._hud.refreshStatus();
    this._statusIcons.refresh();
  }

  // ════════════ 回合演出序列 ════════════

  private async _onDragEnd(didMove: boolean): Promise<void> {
    if (this._busy || this._ctrl.state !== 'playerTurn') return;
    if (!didMove) return;

    this._busy = true;
    this._ctrl.beginResolve();
    const visualScope = this._fx.beginTransientScope();
    const seq = ++this._resolveSeq;
    const isStale = (): boolean => seq !== this._resolveSeq;

    const stopPresent = startMinigamePresentLoop({
      onUpdate: (dt) => this._update(dt),
    });
    try {
      await this._resolveAfterDrag(isStale);
    } catch (e) {
      if (!isStale()) console.error('[BattleScene] _onDragEnd', e);
    } finally {
      stopPresent();
      if (isStale()) return;
      this._settleBattleVisuals(visualScope);
      this._busy = false;
      if (!this._ctrl.isFinished && this._ctrl.state !== 'playerTurn') {
        this._ctrl.beginPlayerTurn();
      }
    }
  }

  private async _resolveAfterDrag(isStale: () => boolean): Promise<void> {
    if (isStale()) return;
    try {
      const allGroups: MatchGroup[] = [];
      for (;;) {
        if (isStale()) return;
        const groups = this._board.findMatches();
        if (groups.length === 0) break;
        for (const group of groups) {
          if (isStale()) return;
          allGroups.push(group);
          this._board.clearCells(group.cells);
          this._burstGroup(group);
          this._hud.showCombo(allGroups.length, this._fx);
          Platform.vibrateShort(allGroups.length >= 7 ? 'medium' : 'light');
          if (allGroups.length >= 7) this._fx.shakeLight();
          await this._boardView!.playClear(group);
          if (isStale()) return;
          await delay(UI.anim.groupClearGap);
        }
        if (isStale()) return;
        const moves = this._board.collapse();
        await this._boardView!.playFall(moves);
        this._boardView!.refreshOrbStates();
      }

      if (isStale()) return;

      if (allGroups.length >= 7) {
        this._fx.flash(0xfff3c8, 0.22, 0.35);
        this._fx.shakeMedium();
        Platform.vibrateShort('heavy');
      }

      if (allGroups.length === 0) {
        await this._enemyPhase(isStale);
        return;
      }

      const resolution = this._ctrl.resolveTurn(allGroups);
      await this._playPetPhase(resolution, isStale);

      if (isStale() || this._ctrl.isFinished) {
        return;
      }

      await this._enemyPhase(isStale);
    } catch (e) {
      if (!isStale()) throw e;
    }
  }

  /** 消除组爆裂粒子：组内每颗珠喷属性色光点 */
  private _burstGroup(group: MatchGroup): void {
    const cell = UI.board.cellSize;
    const color = ORB_COLOR[group.orb];
    for (const { r, c } of group.cells) {
      this._fx.burst({
        x: this._layout.boardX + c * cell + cell / 2,
        y: this._layout.boardY + r * cell + cell / 2,
        color,
        count: 6,
        speed: 320,
        size: 13,
        life: UI.anim.orbBurst,
      });
    }
  }

  private async _playPetPhase(res: TurnResolution, isStale: () => boolean): Promise<void> {
    // 回血先行
    if (res.heal > 0) {
      const healed = this._ctrl.applyHeal(res.heal);
      if (healed > 0) {
        this._hud.refreshHeroHp();
        this._fx.spawnFloat(`+${healed}`, Game.logicWidth / 2, this._layout.heroBarY - 24, 0x6fd86a);
        await delay(UI.anim.attackGap);
        if (isStale()) return;
      }
    }

    for (let i = 0; i < res.attacks.length; i++) {
      if (isStale()) return;
      const attack = res.attacks[i];
      await this._playPetAttack(attack, i, isStale);
      if (isStale()) return;
      const { enemyDead } = this._ctrl.applyPetAttack(attack);
      this._hud.refreshEnemyHp();
      if (enemyDead && await this._handleEnemyDefeat(isStale)) return;
      await delay(UI.anim.attackGap);
    }
    if (isStale()) return;
    this._ctrl.beginEnemyTurn();
  }

  /** 敌人死亡处理：死亡演出 → 下一波入场 / 胜利结算。返回 true = 战斗已结束 */
  private async _handleEnemyDefeat(isStale: () => boolean): Promise<boolean> {
    if (isStale()) return true;
    await this._hud.playEnemyDeath(this._fx);
    if (isStale()) return true;
    if (this._ctrl.hasNextWave()) {
      this._ctrl.nextWave();
      await this._hud.playWaveEnter();
      return false;
    }
    this._overlay.show(this._ctrl, true);
    await delay(0.3);
    return true;
  }

  /** 回合/战斗逻辑已落定后，把表现层强制收敛到稳定帧，避免真机残留中间态。 */
  private _settleBattleVisuals(scopeId?: number): void {
    this._hud.hideCombo(true);
    this._hud.snapHpBarsToModel();
    this._fx.clearTransient(scopeId);
    this._boardView?.refreshOrbStates();
    Game.app?.renderer?.render(Game.stage);
  }

  private async _enemyPhase(isStale: () => boolean): Promise<void> {
    if (isStale()) return;
    const result = this._ctrl.enemyAct();
    this._hud.refreshEnemyCd();
    switch (result.action) {
      case 'attack':
      case 'chargedAttack': {
        const heavy = result.action === 'chargedAttack';
        await this._hud.playEnemyAttack(
          this._fx, result.damage, result.absorbed, heavy,
          () => this._playHeroHit(this._ctrl.enemy.def.element, result.damage, result.absorbed, heavy),
        );
        if (isStale()) return;
        if (result.heroDead) {
          this._overlay.show(this._ctrl, false);
          await delay(0.3);
          return;
        }
        break;
      }
      case 'charge':
        await this._hud.playEnemyCharge(this._fx);
        break;
      case 'heal':
        await this._hud.playEnemyHeal(this._fx, result.healed);
        break;
      case 'shield':
        await this._hud.playEnemyShield(this._fx);
        break;
      case 'sealOrbs': {
        const sealed = this._board.sealRandom(result.boardSealCount ?? 0);
        this._boardView?.refreshOrbStates();
        await this._hud.playEnemyDebuff(this._fx, result, `封印 ${sealed.length} 颗珠子！`);
        break;
      }
      case 'poison':
        await this._hud.playEnemyDebuff(this._fx, result, `中毒 ${result.value ?? 0}/回合 ×${result.turns ?? 0}`);
        break;
      case 'timeSqueeze':
        await this._hud.playEnemyDebuff(this._fx, result, `转珠时间 -${result.value ?? 0} 秒 ×${result.turns ?? 0}`);
        break;
      case 'healBlock':
        await this._hud.playEnemyDebuff(this._fx, result, `禁疗！回复减半 ×${result.turns ?? 0}`);
        break;
      case 'enrage':
        await this._hud.playEnemyEnrage(this._fx, result.value ?? 1);
        break;
      case 'skillSeal': {
        const petName = this._ctrl.team[result.sealedPetIndex ?? 0]?.def.name ?? '';
        await this._hud.playEnemyDebuff(this._fx, result, `${petName} 技能被封印 ×${result.turns ?? 0}`);
        break;
      }
      default:
        if (result.stunnedSkip) {
          await this._hud.playEnemyStunned(this._fx);
        } else {
          await delay(0.2);
        }
    }

    if (isStale()) return;

    for (const tick of result.dotTicks ?? []) {
      if (isStale()) return;
      if (tick.amount <= 0) continue;
      if (tick.owner === 'enemy') {
        await this._hud.playEnemyDotTick(this._fx, tick.amount);
      } else {
        await this._hud.playHeroDotTick(this._fx, tick.amount);
      }
    }
    if (isStale()) return;
    if (result.heroDead) {
      this._overlay.show(this._ctrl, false);
      await delay(0.3);
      return;
    }
    if (this._ctrl.enemy.hp <= 0 && await this._handleEnemyDefeat(isStale)) return;

    this._ctrl.beginPlayerTurn();
    this._refreshSkillUi();
  }

  /** 单只宠物冲刺 → 属性弹道飞向敌人 → 命中瞬间受击反馈 + 飘字 → 回位 */
  private async _playPetAttack(attack: PetAttack, orderIdx: number, isStale: () => boolean): Promise<void> {
    if (isStale()) return;
    const slot = this._petBar.slotAt(attack.petIndex);
    if (!slot || slot.destroyed) return;
    const baseY = slot.y;
    const finishHit = once(() => {
      if (isStale() || slot.destroyed) return;
      TweenManager.cancelTarget(slot);
      slot.y = baseY;
      this._hud.playEnemyHit(this._fx, attack.element, attack.damage, attack.isCrit);
      this._spawnDamageFloat(attack, orderIdx);
    });

    minigameFallback(UI.anim.petDash + UI.anim.projectile + 0.35, finishHit);

    if (Platform.isMinigame) {
      slot.y = baseY - 46;
      await delay(UI.anim.petDash);
      if (isStale() || slot.destroyed) return;
      slot.y = baseY;
    } else {
      await guardedTween({
        target: slot, props: { y: baseY - 46 },
        duration: UI.anim.petDash, ease: Ease.easeOutQuad,
      });
      if (isStale() || slot.destroyed) return;
      void guardedTween({
        target: slot, props: { y: baseY },
        duration: UI.anim.petReturn, ease: Ease.easeInQuad,
      });
    }

    if (isStale()) return;
    await guardedPromise(
      this._fx.fireProjectileBetween(
        slot.x, slot.y - 60, this._layout.enemyCenterX, this._layout.enemyCenterY, attack.element,
      ),
      UI.anim.projectile + 0.12,
    );
    if (isStale() || slot.destroyed) return;
    finishHit();
  }

  /** 伤害数字：从出手宠物槽位弹出，属性色 + 克制/暴击标记 */
  private _spawnDamageFloat(attack: PetAttack, orderIdx: number): void {
    const slot = this._petBar.slotAt(attack.petIndex);
    if (!slot || slot.destroyed) return;
    this._fx.spawnPetDamageFloat({
      slotX: slot.x,
      slotY: slot.y,
      element: attack.element,
      damage: attack.damage,
      isCrit: attack.isCrit,
      counter: attack.counter,
      orderIdx,
    });
  }

  /**
   * 英雄受击反馈：飘字 + 属性/红色粒子 + 红屏闪 + 震屏 + 血条字跳动 + 队伍栏后撤
   * （护盾全挡时改为蓝色轻反馈）
   */
  private _playHeroHit(
    element: Element,
    damage: number,
    absorbed: number,
    heavy: boolean,
  ): void {
    this._hud.refreshHeroHp();
    const hitX = Game.logicWidth / 2;
    const hitY = this._layout.heroBarY;

    if (absorbed > 0) {
      this._fx.spawnFloat(`盾挡 -${absorbed}`, hitX - 90, hitY - 28, 0x8fd4ff);
    }

    if (damage > 0) {
      this._fx.spawnFloat(
        `-${damage}`,
        hitX + (absorbed > 0 ? 90 : 0),
        hitY - 28,
        0xff5252,
        heavy ? 1.45 : 1.15,
      );
      this._fx.burst({
        x: hitX, y: hitY,
        color: ORB_COLOR[element],
        count: heavy ? 14 : 9,
        speed: heavy ? 400 : 300,
        size: heavy ? 18 : 14,
        life: 0.45,
      });
      this._fx.burst({
        x: hitX, y: hitY,
        color: 0xff5252,
        count: heavy ? 8 : 5,
        speed: 240,
        size: 12,
        life: 0.35,
      });
      this._fx.flash(0xff2d2d, heavy ? 0.32 : 0.22, heavy ? 0.45 : 0.35);
      if (heavy) {
        this._fx.shakeHeavy();
        Platform.vibrateLong();
      } else {
        this._fx.shakeMedium();
        Platform.vibrateShort('medium');
      }
      this._hud.pulseHeroHpText(heavy);
      this._petBar.recoil(heavy);
    } else if (absorbed > 0) {
      this._fx.flash(0x8fd4ff, 0.14, 0.28);
      this._fx.burst({
        x: hitX, y: hitY,
        color: 0x8fd4ff,
        count: 7, speed: 200, size: 14, life: 0.32,
      });
      Platform.vibrateShort('light');
    }
  }

  // ════════════ 宠物主动技 ════════════

  private async _onSkillCast(petIndex: number): Promise<void> {
    if (this._busy || !this._ctrl.canCastSkill(petIndex)) return;
    this._busy = true;

    const deps: SkillCastDeps = {
      ctrl: this._ctrl,
      fx: this._fx,
      hud: this._hud,
      petBar: this._petBar,
      board: this._board,
      boardView: this._boardView!,
      layout: this._layout,
      refreshSkillUi: () => this._refreshSkillUi(),
      handleEnemyDefeat: () => this._handleEnemyDefeat(() => false),
    };
    const battleEnded = await presentSkillCast(deps, petIndex);
    if (battleEnded) return; // 战斗已结束，保持 busy 拦截输入

    this._refreshSkillUi();
    this._busy = false;
  }
}
