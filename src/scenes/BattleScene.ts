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
import { BgmManager } from '@/core/BgmManager';
import { SfxManager } from '@/core/SfxManager';
import { enemyDisplayTierOf } from '@/balance/enemyDisplay';
import { isComboMilestone } from './battle/ComboDisplay';
import { GMManager } from '@/core/GMManager';
import { battlePreloadImages, battlePetAvatarEntries, ensurePetAvatars } from '@/config/assetPreload';
import { UI_FX_IMAGES } from '@/config/Assets';
import { ensureAssets } from '@/config/Subpackages';
import { UI, ORB_COLOR } from '@/balance/ui';
import type { Element } from '@/balance/combat';
import { STAGES } from '@/balance/stages';
import { BoardModel, type MatchGroup } from '@/game/board/BoardModel';
import { BoardView } from '@/game/board/BoardView';
import { BattleController, type PetAttack, type TurnResolution } from '@/game/battle/BattleController';
import type { EnemyActResult } from '@/game/battle/battleTypes';
import { PlayerData } from '@/game/PlayerData';
import { makeButton, delay } from './battle/battleWidgets';
import { computeBattleLayout, type BattleLayout } from './battle/BattleLayout';
import { BattleFx, type TurnPetDamageSummary } from './battle/BattleFx';
import { BattleHud } from './battle/BattleHud';
import { BattleStatusIcons } from './battle/BattleStatusIcons';
import { BattlePetBar } from './battle/BattlePetBar';
import { BattleResultOverlay } from './battle/BattleResultOverlay';
import { presentSkillCast, type SkillCastDeps } from './battle/battleSkillPresenter';
import { analytics } from '@/analytics';
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

/** 汇总本回合各宠物累计伤害，供总伤害出现时槽位常驻展示 */
function buildTurnPetSummaries(
  attacks: readonly PetAttack[],
  petBar: BattlePetBar,
): TurnPetDamageSummary[] {
  const byPet = new Map<number, { damage: number; isCrit: boolean; element: Element }>();
  for (const a of attacks) {
    const prev = byPet.get(a.petIndex);
    if (prev) {
      prev.damage += a.damage;
      prev.isCrit = prev.isCrit || a.isCrit;
    } else {
      byPet.set(a.petIndex, { damage: a.damage, isCrit: a.isCrit, element: a.element });
    }
  }
  const summaries: TurnPetDamageSummary[] = [];
  for (const [petIndex, info] of byPet) {
    const slot = petBar.slotAt(petIndex);
    if (!slot || slot.destroyed) continue;
    summaries.push({
      slotX: slot.x,
      slotY: slot.y,
      element: info.element,
      damage: info.damage,
      isCrit: info.isCrit,
    });
  }
  summaries.sort((a, b) => a.slotX - b.slotX);
  return summaries;
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
  /** 场景是否仍处于可更新/可演出状态（onExit 后置 false） */
  private _alive = false;
  /** 拖珠结算代次：场景退出或强制收敛时递增，陈旧 async 演出立即短路 */
  private _resolveSeq = 0;
  /** 真机结算 present 循环句柄，onExit 时必须立即停止 */
  private _stopPresent: (() => void) | null = null;
  private _tickerCb = (): void => this._update();
  private readonly _enterSeq = new SceneEnterSeq();
  private readonly _gmInstantClear = (): string => this._executeGmInstantClear();
  private _battleStartedAt = 0;

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
      this._alive = true;
      this._battleStartedAt = Date.now();
      analytics.trackLevelStart(this._ctrl.stage.id, this._ctrl.stage.name);
      GMManager.registerInstantClearHandler(this._gmInstantClear);
      this._hud.refreshEnemy(false);
      this._hud.refreshHeroHp();
      this._syncBattleBgm(true);
      Game.ticker.add(this._tickerCb);
    });
  }

  /** Boss / 守关波切 Boss BGM，其余保持主 BGM */
  private _syncBattleBgm(playEntranceSfx = false): void {
    const tier = enemyDisplayTierOf(this._ctrl.enemy.def);
    const intense = this._ctrl.stage.isBoss || tier === 'boss' || tier === 'miniBoss';
    if (intense) {
      BgmManager.playBoss();
      if (playEntranceSfx) SfxManager.playBoss();
    } else {
      BgmManager.resumeNormal();
    }
  }

  onExit(): void {
    this._alive = false;
    BgmManager.resumeNormal();
    GMManager.unregisterInstantClearHandler();
    this._resolveSeq++;
    this._stopPresent?.();
    this._stopPresent = null;
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

    if (GMManager.isEnabled) {
      const gmSkip = makeButton('GM跳过', 120, 48, 0xc81e3c, () => {
        GMManager.executeCommand('instant_clear');
      });
      gmSkip.position.set(220, headerY);
      this.container.addChild(gmSkip);
    }

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

    // 关卡号顶栏（最后绘制，保证不被敌人区背景遮挡）
    this._hud.buildStageHeader(this.container);

    this._overlay.build(this.container);

    // 初始刷新槽位 CD / 状态行
    this._refreshSkillUi();
  }

  // ════════════ 每帧 ════════════

  private _update(dt = Game.ticker.deltaMS / 1000): void {
    if (!this._alive) return;
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

    this._stopPresent?.();
    this._stopPresent = startMinigamePresentLoop({
      onUpdate: (dt) => {
        if (!this._alive || isStale()) return;
        this._update(dt);
      },
    });
    try {
      await this._resolveAfterDrag(isStale);
    } catch (e) {
      if (!isStale()) console.error('[BattleScene] _onDragEnd', e);
    } finally {
      this._stopPresent?.();
      this._stopPresent = null;
      if (isStale()) return;
      // 胜负已定：飘字已在结算前等完，这里只收敛血条/combo，避免 clearTransient 截断尾帧
      if (this._ctrl.isFinished) {
        this._hud.hideCombo(true);
        this._hud.snapHpBarsToModel();
        this._boardView?.refreshOrbStates();
      } else {
        this._settleBattleVisuals(visualScope);
      }
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
          const combo = allGroups.length;
          // 音效顺序对齐 xiao_chu startNextElimAnim：连击升调 → 里程碑 → 消除
          SfxManager.playComboHit(combo);
          if (isComboMilestone(combo)) SfxManager.playComboMilestone(combo);
          if (this._groupPlaysElimSfx(group)) {
            SfxManager.playEliminate(group.cells.length);
          }
          this._board.clearCells(group.cells);
          this._burstGroup(group);
          this._hud.showCombo(combo, this._fx);
          Platform.vibrateShort(allGroups.length >= 7 ? 'medium' : 'light');
          if (allGroups.length >= 7) this._fx.shakeLight();
          void this._boardView!.playClear(group);
          if (isStale()) return;
          // 16 帧节拍驱动下一组连击音（动画并行，不叠在 playClear 尾部）
          await delay(UI.anim.comboElimBeat);
        }
        if (isStale()) return;
        await delay(UI.anim.orbClear * 0.35);
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
      const skipEnemyPhase = await this._playPetPhase(resolution, isStale);

      if (isStale() || this._ctrl.isFinished) {
        return;
      }

      if (!skipEnemyPhase) {
        await this._enemyPhase(isStale);
      }
    } catch (e) {
      if (!isStale()) throw e;
    }
  }

  /** 消除组爆裂粒子：组内每颗珠喷属性色光点 */
  private _groupPlaysElimSfx(group: MatchGroup): boolean {
    if (group.orb === 'heart') return true;
    return this._ctrl.teamElementSet.has(group.orb as Element);
  }

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

  /**
   * 宠物攻击演出 + 结算。
   * @returns true = 本回合已切波，新波敌人本回合不行动（与模拟器一致）
   */
  private async _playPetPhase(res: TurnResolution, isStale: () => boolean): Promise<boolean> {
    // 回血先行
    if (res.heal > 0) {
      const healed = this._ctrl.applyHeal(res.heal);
      if (healed > 0) {
        this._hud.refreshHeroHp();
        this._fx.spawnHeroHealFloat(healed, Game.logicWidth / 2, this._layout.heroBarY - 24);
        SfxManager.playHeal();
        await delay(UI.anim.attackGap);
        if (isStale()) return false;
      }
    }

    let appliedDamage = 0;
    let waveAdvanced = false;
    const appliedAttacks: PetAttack[] = [];

    for (let i = 0; i < res.attacks.length; i++) {
      if (isStale()) return waveAdvanced;
      const attack = res.attacks[i];
      await this._playPetAttack(attack, i, res.attacks.length, isStale);
      if (isStale()) return waveAdvanced;
      const { enemyDead } = this._ctrl.applyPetAttack(attack);
      appliedAttacks.push(attack);
      appliedDamage += attack.damage;
      this._hud.refreshEnemyHp();
      if (enemyDead) {
        // 击杀路径：把本回合已出手伤害带入，先播「总伤害」再弹结算
        const battleEnded = await this._handleEnemyDefeat(isStale, {
          total: appliedDamage,
          combo: res.combo,
          hitCount: appliedAttacks.length,
          petSummaries: buildTurnPetSummaries(appliedAttacks, this._petBar),
        });
        if (battleEnded || isStale()) return waveAdvanced;
        waveAdvanced = true;
        break;
      }
      await delay(UI.anim.attackGap);
    }
    if (isStale()) return waveAdvanced;

    if (appliedDamage > 0 && res.attacks.length > 0 && !waveAdvanced) {
      if (UI.anim.turnTotalLeadIn > 0) {
        await delay(UI.anim.turnTotalLeadIn);
        if (isStale()) return waveAdvanced;
      }
      // 非击杀：总伤害/槽位 recap 仅作表现，不阻塞下方转珠
      void this._fx.showTurnTotalDamage({
        total: appliedDamage,
        combo: res.combo,
        hitCount: res.attacks.length,
        x: this._layout.enemyCenterX,
        y: this._layout.enemyCenterY,
        enemyMaxHp: this._ctrl.enemy.maxHp,
        petSummaries: buildTurnPetSummaries(appliedAttacks, this._petBar),
      });
    }

    if (waveAdvanced) {
      this._ctrl.beginPlayerTurn();
    } else {
      this._ctrl.beginEnemyTurn();
    }
    return waveAdvanced;
  }

  /** GM：立即通关当前关卡（跳过剩余波次与演出） */
  private _executeGmInstantClear(): string {
    if (!this._alive || this._ctrl.isFinished) return '战斗已结束';
    this._resolveSeq++;
    this._stopPresent?.();
    this._stopPresent = null;
    this._busy = false;
    this._boardView?.cancelDrag();
    if (this._ctrl.turnsUsed === 0) this._ctrl.turnsUsed = 1;
    while (this._ctrl.hasNextWave()) this._ctrl.nextWave();
    this._ctrl.enemy.hp = 0;
    this._settleBattleVisuals();
    this._overlay.show(this._ctrl, true, this._battleStartedAt);
    return `已通关：${this._ctrl.stage.name}`;
  }

  /**
   * 敌人死亡处理：死亡演出 → 单段飘字 →（可选）总伤害汇总 → 反应停顿 → 下一波 / 胜利结算。
   * 返回 true = 战斗已结束。
   */
  private async _handleEnemyDefeat(
    isStale: () => boolean,
    turnRecap?: {
      total: number;
      combo: number;
      hitCount: number;
      petSummaries: ReturnType<typeof buildTurnPetSummaries>;
    },
  ): Promise<boolean> {
    if (isStale()) return true;
    await this._hud.playEnemyDeath(this._fx);
    if (isStale()) return true;

    // 1) 等最后一击单段伤害飘字出全
    await Promise.race([
      this._fx.waitForDamageFloats(),
      delay(UI.anim.victoryFloatHold),
    ]);
    if (isStale()) return true;

    // 2) 击杀当回合也要播「总伤害」（非击杀路径在 _playPetPhase 里 fire-and-forget）
    if (turnRecap && turnRecap.total > 0) {
      if (UI.anim.turnTotalLeadIn > 0) {
        await delay(UI.anim.turnTotalLeadIn);
        if (isStale()) return true;
      }
      await Promise.race([
        this._fx.showTurnTotalDamage({
          total: turnRecap.total,
          combo: turnRecap.combo,
          hitCount: turnRecap.hitCount,
          x: this._layout.enemyCenterX,
          y: this._layout.enemyCenterY,
          enemyMaxHp: this._ctrl.enemy.maxHp,
          petSummaries: turnRecap.petSummaries,
        }),
        delay(UI.anim.victoryTotalHold),
      ]);
      if (isStale()) return true;
    }

    // 3) 全部伤害表现结束后，给玩家一点反应时间再切波/弹结算
    if (UI.anim.victoryReactionHold > 0) {
      await delay(UI.anim.victoryReactionHold);
      if (isStale()) return true;
    }

    if (this._ctrl.hasNextWave()) {
      this._ctrl.nextWave();
      SfxManager.playNextFloor();
      this._syncBattleBgm();
      await this._hud.playWaveEnter();
      return false;
    }
    SfxManager.playVictory();
    this._overlay.show(this._ctrl, true, this._battleStartedAt);
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
        await this._presentEnemyHeroDamage(result, heavy);
        if (isStale()) return;
        if (result.heroDead) {
          SfxManager.playGameOver();
          this._overlay.show(this._ctrl, false, this._battleStartedAt);
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
        if (result.damage > 0 || result.absorbed > 0) {
          await this._presentEnemyHeroDamage(result, false);
        }
        break;
      case 'shield':
        await this._hud.playEnemyShield(this._fx);
        if (result.damage > 0 || result.absorbed > 0) {
          await this._presentEnemyHeroDamage(result, false);
        }
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
      SfxManager.playGameOver();
      this._overlay.show(this._ctrl, false, this._battleStartedAt);
      await delay(0.3);
      return;
    }
    if (this._ctrl.enemy.hp <= 0 && await this._handleEnemyDefeat(isStale)) return;

    this._ctrl.beginPlayerTurn();
    this._refreshSkillUi();
  }

  /** 单只宠物冲刺 → 属性弹道飞向敌人 → 命中瞬间受击反馈 + 飘字 → 回位 */
  private async _playPetAttack(
    attack: PetAttack,
    orderIdx: number,
    hitCount: number,
    isStale: () => boolean,
  ): Promise<void> {
    if (isStale()) return;
    const slot = this._petBar.slotAt(attack.petIndex);
    if (!slot || slot.destroyed) return;
    const baseY = slot.y;
    const finishHit = once(() => {
      if (isStale() || slot.destroyed) return;
      TweenManager.cancelTarget(slot);
      slot.y = baseY;
      if (attack.isCrit) SfxManager.playAttackCrit();
      else SfxManager.playAttack();
      SfxManager.playPetDmgHit(attack.isCrit);
      this._hud.playEnemyHit(this._fx, attack.element, attack.damage, attack.isCrit);
      this._spawnDamageFloat(attack, orderIdx, hitCount);
    });

    minigameFallback(UI.anim.petDash + UI.anim.projectile + 0.42, finishHit);

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
      UI.anim.projectile + 0.15,
    );
    if (isStale() || slot.destroyed) return;
    finishHit();
  }

  /** 伤害数字：显示在出手宠物槽位上方，便于对应哪只宠物打了多少 */
  private _spawnDamageFloat(attack: PetAttack, orderIdx: number, _hitCount: number): void {
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

  /** 敌人对英雄的弹道 + 命中反馈（普攻 / 蓄力 / 技能后追刀共用） */
  private async _presentEnemyHeroDamage(result: EnemyActResult, heavy: boolean): Promise<void> {
    await this._hud.playEnemyAttack(
      this._fx, result.damage, result.absorbed, heavy,
      () => this._playHeroHit(this._ctrl.enemy.def.element, result.damage, result.absorbed, heavy),
    );
  }

  /**
   * 英雄受击反馈：飘字 + 星爆/护环冲击 + 红屏闪 + 震屏 + 血条字跳动 + 队伍栏后撤
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
    const maxHp = Math.max(1, this._ctrl.heroMaxHp);
    const dmgRatio = (damage + absorbed) / maxHp;

    if (absorbed > 0 && damage <= 0) {
      SfxManager.playBlock();
    }
    if (damage > 0) {
      SfxManager.playEnemyAttack(dmgRatio);
      SfxManager.playHeroHurt(dmgRatio);
    }

    if (absorbed > 0) {
      this._fx.spawnHeroHitFloat(`盾挡 -${absorbed}`, hitX - 90, hitY - 28, 'shield');
    }

    if (damage > 0) {
      this._fx.spawnHeroHitFloat(
        `-${damage}`,
        hitX + (absorbed > 0 ? 90 : 0),
        hitY - 28,
        'damage',
        heavy,
      );
      this._fx.spawnHeroHitImpact(hitX, hitY, element, heavy);
      this._fx.flash(0xff2d2d, heavy ? 0.32 : 0.22, heavy ? 0.45 : 0.35);
      if (heavy) {
        this._fx.shakeHeavy();
        Platform.vibrateLong();
      } else {
        this._fx.shakeMedium();
        Platform.vibrateShort('medium');
      }
      this._hud.pulseHeroHpText(heavy);
      this._hud.flashHeroHpBar(true);
      this._petBar.recoil(heavy);
    } else if (absorbed > 0) {
      this._fx.spawnHeroShieldImpact(hitX, hitY);
      this._fx.flash(0x8fd4ff, 0.14, 0.28);
      Platform.vibrateShort('light');
      this._hud.flashHeroHpBar(false);
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
