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
import { battlePreloadImages } from '@/config/assetPreload';
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
import { BattlePetBar } from './battle/BattlePetBar';
import { BattleResultOverlay } from './battle/BattleResultOverlay';
import { presentSkillCast, type SkillCastDeps } from './battle/battleSkillPresenter';
import { SceneEnterSeq, deferSceneBuild } from '@/utils/sceneEnterSeq';

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
  private _petBar!: BattlePetBar;
  private _overlay!: BattleResultOverlay;

  private _busy = false;
  private _tickerCb = (): void => this._update();
  private readonly _enterSeq = new SceneEnterSeq();

  onEnter(data?: unknown): void {
    Game.setMaxFPS(UI.fps.battle);
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
    this._petBar = new BattlePetBar(this._ctrl, this._layout);
    this._overlay = new BattleResultOverlay();

    void this._enter(this._enterSeq.next());
  }

  private async _enter(token: number): Promise<void> {
    const stageId = this._ctrl.stage.id;
    await ensureAssets(battlePreloadImages(stageId, PlayerData.team));
    if (!this._enterSeq.stillValid(token)) return;
    deferSceneBuild(token, this._enterSeq, 'battle', () => {
      this._build();
      this._hud.refreshEnemy(false);
      this._hud.refreshHeroHp();
      Game.ticker.add(this._tickerCb);
    });
  }

  onExit(): void {
    this._enterSeq.cancel();
    Game.ticker.remove(this._tickerCb);
    this._boardView?.cancelDrag();
    this._boardView?.destroy();
    this._boardView = null;
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

    // 敌人区 + 英雄血条
    this._hud.buildEnemyArea(this.container);
    this._hud.buildHeroBar(this.container);

    // 队伍栏 + buff 状态行
    this._petBar.build(this.container, {
      onSkillCast: (i) => void this._onSkillCast(i),
      isBusy: () => this._busy,
    });
    this._hud.buildStatus(this.container);

    // 拖珠倒计时条
    this._hud.buildDragBar(this.container);

    // 珠盘
    this._boardView = new BoardView(this._board, {
      canDrag: () => !this._busy && this._ctrl.state === 'playerTurn',
      onDragEnd: (didMove) => {
        void this._onDragEnd(didMove);
      },
      // 队伍未覆盖的属性珠 = 无效珠（可消无伤害）；表现见 BoardView.refreshOrbStates
      isOrbActive: (orb) => orb === 'heart' || this._ctrl.teamElementSet.has(orb as Element),
    });
    this._boardView.container.position.set(this._layout.boardX, this._layout.boardY);
    this.container.addChild(this._boardView.container);

    // Combo 大字（棋盘上方）
    this._hud.buildCombo(this.container);

    // 特效层（粒子 / 飘字 / 闪光），其上再叠结算浮层
    this._fx.build(this.container, w, h);
    this._overlay.build(this.container);

    // 初始刷新槽位 CD / 状态行
    this._refreshSkillUi();
  }

  // ════════════ 每帧 ════════════

  private _update(): void {
    const dt = Game.ticker.deltaMS / 1000;
    this._boardView?.update(dt);
    this._fx.update(dt);
    this._petBar.update(dt);
    this._hud.redrawDragBar(this._boardView);
    this._hud.redrawHpBars();
  }

  /** 刷新槽位技能 CD + buff 状态行（队伍栏 + HUD 协同） */
  private _refreshSkillUi(): void {
    this._petBar.refreshCooldowns();
    this._hud.refreshStatus();
  }

  // ════════════ 回合演出序列 ════════════

  private async _onDragEnd(didMove: boolean): Promise<void> {
    if (this._busy || this._ctrl.state !== 'playerTurn') return;
    if (!didMove) return; // 没动过不算回合

    this._busy = true;
    this._ctrl.beginResolve();

    // ---- 消除/下落连锁，收集所有组 ----
    // 节奏对齐智龙迷城：一组一组爆掉，每组 Combo +1 跳字、轻震，连锁(天降)时强调
    const allGroups: MatchGroup[] = [];
    let chainDepth = 0;
    for (;;) {
      const groups = this._board.findMatches();
      if (groups.length === 0) break;
      for (const group of groups) {
        allGroups.push(group);
        this._board.clearCells(group.cells);
        this._burstGroup(group);
        this._hud.showCombo(allGroups.length, chainDepth > 0);
        Platform.vibrateShort(allGroups.length >= 7 ? 'medium' : 'light');
        if (allGroups.length >= 7) this._fx.shakeLight();
        await this._boardView!.playClear(group);
        await delay(UI.anim.groupClearGap);
      }
      const moves = this._board.collapse();
      await this._boardView!.playFall(moves);
      this._boardView!.refreshOrbStates();
      chainDepth++;
    }

    // 高 Combo 收尾：全屏属性光 + 中震，给“打出大连锁”一个确定性的爽点
    if (allGroups.length >= 7) {
      this._fx.flash(0xfff3c8, 0.22, 0.35);
      this._fx.shakeMedium();
      Platform.vibrateShort('heavy');
    }

    if (allGroups.length === 0) {
      // 拖了但没消除：仍消耗回合，直接敌人行动
      this._hud.hideCombo();
      await this._enemyPhase();
      this._busy = false;
      return;
    }

    // ---- 宠物攻击结算 ----
    const resolution = this._ctrl.resolveTurn(allGroups);
    await this._playPetPhase(resolution);
    this._hud.hideCombo();

    if (this._ctrl.isFinished) {
      this._busy = false;
      return;
    }

    // ---- 敌人回合 ----
    await this._enemyPhase();
    this._busy = false;
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

  private async _playPetPhase(res: TurnResolution): Promise<void> {
    // 回血先行
    if (res.heal > 0) {
      const healed = this._ctrl.applyHeal(res.heal);
      if (healed > 0) {
        this._hud.refreshHeroHp();
        this._fx.spawnFloat(`+${healed}`, Game.logicWidth / 2, this._layout.heroBarY - 24, 0x6fd86a);
        await delay(UI.anim.attackGap);
      }
    }

    for (const attack of res.attacks) {
      await this._playPetAttack(attack);
      const { enemyDead } = this._ctrl.applyPetAttack(attack);
      this._hud.refreshEnemyHp();
      if (enemyDead && await this._handleEnemyDefeat()) return;
      await delay(UI.anim.attackGap);
    }
    this._ctrl.beginEnemyTurn();
  }

  /** 敌人死亡处理：死亡演出 → 下一波入场 / 胜利结算。返回 true = 战斗已结束 */
  private async _handleEnemyDefeat(): Promise<boolean> {
    await this._hud.playEnemyDeath(this._fx);
    if (this._ctrl.hasNextWave()) {
      this._ctrl.nextWave();
      await this._hud.playWaveEnter();
      return false;
    }
    this._overlay.show(this._ctrl, true);
    return true;
  }

  private async _enemyPhase(): Promise<void> {
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
        if (result.heroDead) {
          this._overlay.show(this._ctrl, false);
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
      default:
        await delay(0.2);
    }
    this._ctrl.beginPlayerTurn();
    this._refreshSkillUi();
  }

  /** 单只宠物冲刺 → 属性弹道飞向敌人 → 命中瞬间受击反馈 + 飘字 → 回位 */
  private _playPetAttack(attack: PetAttack): Promise<void> {
    return new Promise((resolve) => {
      const slot = this._petBar.slotAt(attack.petIndex);
      const baseY = slot.y;
      TweenManager.to({
        target: slot, props: { y: baseY - 46 },
        duration: UI.anim.petDash, ease: Ease.easeOutQuad,
        onComplete: () => {
          // 弹道与回位并行；命中瞬间才弹伤害数字
          TweenManager.to({
            target: slot, props: { y: baseY },
            duration: UI.anim.petReturn, ease: Ease.easeInQuad,
          });
          void this._fx.fireProjectileBetween(
            slot.x, slot.y - 60, this._layout.enemyCenterX, this._layout.enemyCenterY, attack.element,
          ).then(() => {
            this._hud.playEnemyHit(this._fx, attack.element, attack.damage, attack.isCrit);
            this._spawnDamageFloat(attack);
            resolve();
          });
        },
      });
    });
  }

  /** 伤害数字：属性着色，暴击放大 + 标记，克制加前缀 */
  private _spawnDamageFloat(attack: PetAttack): void {
    const color = attack.isCrit ? 0xffd75e : ORB_COLOR[attack.element];
    const prefix = attack.counter === 1 ? '克 ' : '';
    const text = `${prefix}${attack.damage}${attack.isCrit ? ' 暴击!' : ''}`;
    this._fx.spawnFloat(
      text,
      this._layout.enemyCenterX + (Math.random() - 0.5) * 120,
      this._layout.enemyCenterY - 40,
      color,
      attack.isCrit ? 1.4 : 1,
    );
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
      handleEnemyDefeat: () => this._handleEnemyDefeat(),
    };
    const battleEnded = await presentSkillCast(deps, petIndex);
    if (battleEnded) return; // 战斗已结束，保持 busy 拦截输入

    this._refreshSkillUi();
    this._busy = false;
  }
}
