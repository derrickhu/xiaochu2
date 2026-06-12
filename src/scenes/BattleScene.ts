/**
 * 战斗场景：组合 BoardView（转珠） + BattleController（结算） + 战斗 UI
 *
 * 演出序列（async/await 驱动）：
 *   拖珠松手 → 逐组消除(Combo 跳动) → 下落连锁 → 宠物依次冲刺攻击
 *   → 敌人受击闪烁/抖动 + 伤害飘字 → 敌人回合 → 回到玩家回合
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { TweenManager, Ease } from '@/core/TweenManager';
import { TextureCache } from '@/core/TextureCache';
import { ObjectPool } from '@/core/ObjectPool';
import { FxLayer, flashWhite } from '@/core/FxLayer';
import { ScreenShake } from '@/core/ScreenShake';
import { FlashOverlay } from '@/core/FlashOverlay';
import { Platform } from '@/core/PlatformService';
import { UI, ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import { COMBAT, type Element } from '@/balance/combat';
import { STAGES } from '@/balance/stages';
import { comboMultiplier } from '@/formulas/damage';
import { enemyImage, petImage, ORB_IMAGES } from '@/config/Assets';
import { BoardModel, type MatchGroup } from '@/game/board/BoardModel';
import { BoardView } from '@/game/board/BoardView';
import {
  BattleController,
  type PetAttack,
  type TurnResolution,
} from '@/game/battle/BattleController';
import { PlayerData } from '@/game/PlayerData';

export interface BattleEnterData {
  stageId: string;
}

export class BattleScene implements Scene {
  readonly name = 'battle';
  readonly container = new PIXI.Container();

  private _ctrl!: BattleController;
  private _board!: BoardModel;
  private _boardView: BoardView | null = null;

  // ---- UI 引用 ----
  private _waveText!: PIXI.Text;
  private _enemySprite!: PIXI.Sprite;
  private _enemyContainer!: PIXI.Container;
  private _enemyHpBar!: PIXI.Graphics;
  private _enemyHpText!: PIXI.Text;
  private _enemyNameText!: PIXI.Text;
  private _enemyCdText!: PIXI.Text;
  private _heroHpBar!: PIXI.Graphics;
  private _heroHpText!: PIXI.Text;
  private _dragBar!: PIXI.Graphics;
  private _comboText!: PIXI.Text;
  private _petSlots: PIXI.Container[] = [];
  private _slotCdMask: PIXI.Graphics[] = [];
  private _slotCdText: PIXI.Text[] = [];
  private _slotGlow: PIXI.Graphics[] = [];
  private _statusText!: PIXI.Text;
  private _floatLayer!: PIXI.Container;
  private _overlayLayer!: PIXI.Container;

  private _floatPool!: ObjectPool<PIXI.Text>;

  // ---- 手感强化（阶段二） ----
  private _fx!: FxLayer;
  private _shake!: ScreenShake;
  private _flash!: FlashOverlay;
  /** 血条显示状态：shown = 主条（快速跟随），white = 损血白条（延迟收缩） */
  private _enemyHpDisp = { shown: 1, white: 1 };
  private _heroHpDisp = { shown: 1, white: 1 };

  // ---- 布局 ----
  private _boardX = 0;
  private _boardY = 0;
  private _enemyCenterX = 0;
  private _enemyCenterY = 0;
  private _heroBarY = 0;

  private _busy = false;
  private _tickerCb = (): void => this._update();

  onEnter(data?: unknown): void {
    Game.setMaxFPS(UI.fps.battle);
    PlayerData.load();

    const stageId = (data as BattleEnterData | undefined)?.stageId ?? STAGES[0].id;
    this._ctrl = new BattleController(stageId, PlayerData.team);
    this._board = new BoardModel();
    this._busy = false;

    this._computeLayout();
    this._build();
    this._refreshEnemy(false);
    this._refreshHeroHp();

    Game.ticker.add(this._tickerCb);
  }

  onExit(): void {
    Game.ticker.remove(this._tickerCb);
    this._boardView?.cancelDrag();
    this._boardView?.destroy();
    this._boardView = null;
    this._floatPool?.clear();
    this._fx?.destroy();
    this._flash?.destroy();
    this._shake?.reset();
    this._petSlots = [];
    TweenManager.cancelTarget(this.container);
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  // ════════════ 布局与构建 ════════════

  private _computeLayout(): void {
    const cell = UI.board.cellSize;
    this._boardX = UI.board.marginX;
    this._boardY = Game.logicHeight - UI.board.bottomOffset - cell * COMBAT.boardRows;
    this._enemyCenterX = Game.logicWidth / 2;
    this._enemyCenterY = Game.safeTop + 110 + UI.battle.enemySize / 2;
    this._heroBarY = this._boardY - UI.battle.teamBarOffset - 44;
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    // 背景
    const bg = new PIXI.Graphics();
    bg.beginFill(0x241a38);
    bg.drawRect(0, 0, w, h);
    bg.endFill();
    this.container.addChild(bg);

    // ---- 顶栏：返回 + 关卡名 + 波次 ----
    const backBtn = this._makeButton('返回', 130, 56, 0x4a3a72, () => {
      SceneManager.switchTo('title');
    });
    backBtn.position.set(85, Game.safeTop + 30);
    this.container.addChild(backBtn);

    const stageText = new PIXI.Text(
      `${this._ctrl.stage.name}${this._ctrl.stage.isBoss ? ' · BOSS' : ''}`,
      { fontSize: 34, fill: 0xd9cdf5, fontWeight: 'bold' },
    );
    stageText.anchor.set(0.5);
    stageText.position.set(w / 2, Game.safeTop + 30);
    this.container.addChild(stageText);

    this._waveText = new PIXI.Text('', { fontSize: 26, fill: 0x9b8cc4 });
    this._waveText.anchor.set(1, 0.5);
    this._waveText.position.set(w - 30, Game.safeTop + 30);
    this.container.addChild(this._waveText);

    // ---- 敌人区 ----
    this._enemyContainer = new PIXI.Container();
    this._enemyContainer.position.set(this._enemyCenterX, this._enemyCenterY);
    this._enemySprite = new PIXI.Sprite();
    this._enemySprite.anchor.set(0.5);
    this._enemyContainer.addChild(this._enemySprite);
    this.container.addChild(this._enemyContainer);

    this._enemyNameText = new PIXI.Text('', { fontSize: 28, fill: 0xffffff, fontWeight: 'bold' });
    this._enemyNameText.anchor.set(0.5);
    this._enemyNameText.position.set(w / 2, this._enemyCenterY - UI.battle.enemySize / 2 - 28);
    this.container.addChild(this._enemyNameText);

    this._enemyHpBar = new PIXI.Graphics();
    this.container.addChild(this._enemyHpBar);
    this._enemyHpText = new PIXI.Text('', { fontSize: 22, fill: 0xffffff });
    this._enemyHpText.anchor.set(0.5);
    this._enemyHpText.position.set(w / 2, this._enemyCenterY + UI.battle.enemySize / 2 + 32);
    this.container.addChild(this._enemyHpText);

    this._enemyCdText = new PIXI.Text('', { fontSize: 24, fill: 0xffb74d });
    this._enemyCdText.anchor.set(0.5);
    this._enemyCdText.position.set(w / 2, this._enemyCenterY + UI.battle.enemySize / 2 + 66);
    this.container.addChild(this._enemyCdText);

    // ---- 英雄血条 ----
    this._heroHpBar = new PIXI.Graphics();
    this.container.addChild(this._heroHpBar);
    this._heroHpText = new PIXI.Text('', { fontSize: 22, fill: 0xffffff });
    this._heroHpText.anchor.set(0.5);
    this._heroHpText.position.set(w / 2, this._heroBarY + UI.battle.heroHpBarHeight / 2);
    this.container.addChild(this._heroHpText);

    // ---- 队伍栏 ----
    this._buildTeamBar();

    // ---- 拖珠倒计时条 ----
    this._dragBar = new PIXI.Graphics();
    this.container.addChild(this._dragBar);

    // ---- 珠盘 ----
    this._boardView = new BoardView(this._board, {
      canDrag: () => !this._busy && this._ctrl.state === 'playerTurn',
      onDragEnd: (didMove) => {
        void this._onDragEnd(didMove);
      },
      // 队伍未覆盖的属性珠 = 无效珠（消除无伤害），暗淡显示
      isOrbActive: (orb) => orb === 'heart' || this._ctrl.teamElementSet.has(orb as Element),
    });
    this._boardView.container.position.set(this._boardX, this._boardY);
    this.container.addChild(this._boardView.container);

    // ---- Combo 大字（棋盘上方居中） ----
    this._comboText = new PIXI.Text('', {
      fontSize: 44,
      fill: 0xffe082,
      fontWeight: 'bold',
      stroke: 0x4a2c00,
      strokeThickness: 5,
    });
    this._comboText.anchor.set(0.5);
    this._comboText.position.set(w / 2, this._boardY - 36);
    this._comboText.visible = false;
    this.container.addChild(this._comboText);

    // ---- 特效层（粒子在飘字之下、棋盘之上） ----
    this._fx = new FxLayer();
    this.container.addChild(this._fx.container);

    // ---- 飘字层 / 全屏闪光 / 结算层 ----
    this._floatLayer = new PIXI.Container();
    this.container.addChild(this._floatLayer);
    this._flash = new FlashOverlay(w, h);
    this.container.addChild(this._flash.container);
    this._overlayLayer = new PIXI.Container();
    this.container.addChild(this._overlayLayer);

    this._shake = new ScreenShake(this.container);

    this._floatPool = new ObjectPool<PIXI.Text>({
      create: () => {
        const t = new PIXI.Text('', {
          fontSize: 40, fill: 0xffffff, fontWeight: 'bold',
          stroke: 0x000000, strokeThickness: 4,
        });
        t.anchor.set(0.5);
        return t;
      },
      onGet: (t) => {
        t.visible = true;
        t.alpha = 1;
        t.scale.set(1);
      },
      onRelease: (t) => {
        TweenManager.cancelTarget(t);
        t.visible = false;
        if (t.parent) t.parent.removeChild(t);
      },
      maxSize: 24,
      onDiscard: (t) => t.destroy(),
    });
  }

  private _buildTeamBar(): void {
    const { petSize, petGap } = UI.battle;
    const total = this._ctrl.team.length * petSize + (this._ctrl.team.length - 1) * petGap;
    const startX = (Game.logicWidth - total) / 2 + petSize / 2;
    const y = this._boardY - UI.battle.teamBarOffset + petSize / 2;

    this._slotCdMask = [];
    this._slotCdText = [];
    this._slotGlow = [];
    this._petSlots = this._ctrl.team.map((pet, i) => {
      const slot = new PIXI.Container();
      slot.position.set(startX + i * (petSize + petGap), y);

      // 属性色底框
      const frame = new PIXI.Graphics();
      frame.beginFill(0x1a1126);
      frame.lineStyle(4, ORB_COLOR[pet.def.element]);
      frame.drawRoundedRect(-petSize / 2, -petSize / 2, petSize, petSize, 16);
      frame.endFill();
      slot.addChild(frame);

      const tex = TextureCache.get(petImage(pet.def.id));
      if (tex) {
        const avatar = new PIXI.Sprite(tex);
        avatar.anchor.set(0.5);
        const scale = (petSize - 12) / Math.max(avatar.width, avatar.height);
        avatar.scale.set(scale);
        slot.addChild(avatar);
      }

      // 属性字角标
      const badge = new PIXI.Text(ELEMENT_NAME[pet.def.element], {
        fontSize: 22, fill: 0xffffff, fontWeight: 'bold',
        stroke: 0x000000, strokeThickness: 3,
      });
      badge.anchor.set(0.5);
      badge.position.set(petSize / 2 - 16, -petSize / 2 + 16);
      slot.addChild(badge);

      // 技能 CD 遮罩 + 数字
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

      // 就绪发光框
      const glow = new PIXI.Graphics();
      glow.lineStyle(5, 0xffe082);
      glow.drawRoundedRect(-petSize / 2 - 5, -petSize / 2 - 5, petSize + 10, petSize + 10, 19);
      glow.visible = false;
      slot.addChild(glow);
      this._slotGlow.push(glow);

      slot.eventMode = 'static';
      slot.cursor = 'pointer';
      slot.on('pointertap', () => {
        void this._onSkillTap(i);
      });

      this.container.addChild(slot);
      return slot;
    });

    // 护盾 / 增伤 buff 状态行（英雄血条上方右侧）
    this._statusText = new PIXI.Text('', { fontSize: 22, fill: 0x8fd4ff, fontWeight: 'bold' });
    this._statusText.anchor.set(1, 0.5);
    this._statusText.position.set(Game.logicWidth - UI.board.marginX, this._heroBarY - 20);
    this.container.addChild(this._statusText);

    this._refreshSkillUi();
  }

  /** 刷新宠物槽技能状态（CD 数字 / 就绪发光）与 buff 状态行 */
  private _refreshSkillUi(): void {
    this._ctrl.team.forEach((pet, i) => {
      const ready = pet.skillCdLeft <= 0;
      this._slotCdMask[i].visible = !ready;
      this._slotCdText[i].visible = !ready;
      this._slotCdText[i].text = String(pet.skillCdLeft);
      this._slotGlow[i].visible = ready;
    });
    const parts: string[] = [];
    if (this._ctrl.shield > 0) parts.push(`护盾 ${this._ctrl.shield}`);
    if (this._ctrl.dmgBuff) {
      parts.push(`伤害×${this._ctrl.dmgBuff.mult} 剩${this._ctrl.dmgBuff.turnsLeft}回合`);
    }
    this._statusText.text = parts.join('   ');
  }

  // ════════════ 每帧 ════════════

  private _update(): void {
    const dt = Game.ticker.deltaMS / 1000;
    this._boardView?.update(dt);
    this._fx?.update(dt);
    this._shake?.update(dt);
    this._redrawDragBar();
    this._redrawHpBars();
  }

  /** 每帧重绘双方血条（主条 + 损血白条均为补间值） */
  private _redrawHpBars(): void {
    // ---- 敌人 ----
    {
      const { enemyHpBarWidth: bw, enemyHpBarHeight: bh } = UI.battle;
      const x = (Game.logicWidth - bw) / 2;
      const y = this._enemyCenterY + UI.battle.enemySize / 2 + 8;
      const g = this._enemyHpBar;
      const { shown, white } = this._enemyHpDisp;
      g.clear();
      g.beginFill(0x1a1126);
      g.drawRoundedRect(x, y, bw, bh, bh / 2);
      g.endFill();
      if (white > 0.001) {
        g.beginFill(0xf5e0d3);
        g.drawRoundedRect(x, y, Math.max(bw * white, bh), bh, bh / 2);
        g.endFill();
      }
      if (shown > 0.001) {
        g.beginFill(shown > 0.3 ? 0xe8554d : 0xff2d2d);
        g.drawRoundedRect(x, y, Math.max(bw * shown, bh), bh, bh / 2);
        g.endFill();
      }
    }
    // ---- 英雄 ----
    {
      const { heroHpBarHeight: bh } = UI.battle;
      const x = UI.board.marginX;
      const bw = Game.logicWidth - x * 2;
      const g = this._heroHpBar;
      const { shown, white } = this._heroHpDisp;
      g.clear();
      g.beginFill(0x1a1126);
      g.drawRoundedRect(x, this._heroBarY, bw, bh, bh / 2);
      g.endFill();
      if (white > 0.001) {
        g.beginFill(0xeadfc8);
        g.drawRoundedRect(x, this._heroBarY, Math.max(bw * white, bh), bh, bh / 2);
        g.endFill();
      }
      if (shown > 0.001) {
        g.beginFill(shown > 0.3 ? 0x6fd86a : 0xffb74d);
        g.drawRoundedRect(x, this._heroBarY, Math.max(bw * shown, bh), bh, bh / 2);
        g.endFill();
      }
    }
  }

  /** 血条补间：主条快速跟随，掉血时白条延迟收缩展示刚损失的部分 */
  private _animateHp(disp: { shown: number; white: number }, ratio: number): void {
    TweenManager.cancelTarget(disp);
    if (ratio >= disp.white) {
      disp.white = ratio; // 回血：白条直接跟上
    }
    TweenManager.to({
      target: disp, props: { shown: ratio },
      duration: UI.anim.hpTween, ease: Ease.easeOutQuad,
    });
    if (ratio < disp.white) {
      TweenManager.to({
        target: disp, props: { white: ratio },
        duration: UI.anim.hpWhiteTween, delay: UI.anim.hpWhiteDelay, ease: Ease.easeOutQuad,
      });
    }
  }

  private _redrawDragBar(): void {
    const g = this._dragBar;
    g.clear();
    if (!this._boardView?.dragging) return;
    const left = this._boardView.dragTimeLeft;
    const w = this._boardView.boardWidth * left;
    const y = this._boardY - UI.battle.dragBarHeight - 4;
    g.beginFill(0x3a2d58);
    g.drawRoundedRect(this._boardX, y, this._boardView.boardWidth, UI.battle.dragBarHeight, 5);
    g.endFill();
    g.beginFill(left > 0.3 ? 0x6fd86a : 0xff7a5c);
    g.drawRoundedRect(this._boardX, y, Math.max(w, 8), UI.battle.dragBarHeight, 5);
    g.endFill();
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
        this._showCombo(allGroups.length, chainDepth > 0);
        Platform.vibrateShort(allGroups.length >= 7 ? 'medium' : 'light');
        if (allGroups.length >= 7) this._shake.light();
        await this._boardView!.playClear(group);
        await this._delay(UI.anim.groupClearGap);
      }
      const moves = this._board.collapse();
      await this._boardView!.playFall(moves);
      chainDepth++;
    }

    // 高 Combo 收尾：全屏属性光 + 中震，给“打出大连锁”一个确定性的爽点
    if (allGroups.length >= 7) {
      this._flash.flash(0xfff3c8, 0.22, 0.35);
      this._shake.medium();
      Platform.vibrateShort('heavy');
    }

    if (allGroups.length === 0) {
      // 拖了但没消除：仍消耗回合，直接敌人行动
      this._hideCombo();
      await this._enemyPhase();
      this._busy = false;
      return;
    }

    // ---- 宠物攻击结算 ----
    const resolution = this._ctrl.resolveTurn(allGroups);
    await this._playPetPhase(resolution);
    this._hideCombo();

    if (this._ctrl.isFinished) {
      this._busy = false;
      return;
    }

    // ---- 敌人回合 ----
    await this._enemyPhase();
    this._busy = false;
  }

  private async _playPetPhase(res: TurnResolution): Promise<void> {
    // 回血先行
    if (res.heal > 0) {
      const healed = this._ctrl.applyHeal(res.heal);
      if (healed > 0) {
        this._refreshHeroHp();
        this._spawnFloat(`+${healed}`, Game.logicWidth / 2, this._heroBarY - 24, 0x6fd86a);
        await this._delay(UI.anim.attackGap);
      }
    }

    for (const attack of res.attacks) {
      await this._playPetAttack(attack);
      const { enemyDead } = this._ctrl.applyPetAttack(attack);
      this._refreshEnemyHp();
      if (enemyDead && await this._handleEnemyDefeat()) return;
      await this._delay(UI.anim.attackGap);
    }
    this._ctrl.beginEnemyTurn();
  }

  /** 敌人死亡处理：死亡演出 → 下一波入场 / 胜利结算。返回 true = 战斗已结束 */
  private async _handleEnemyDefeat(): Promise<boolean> {
    await this._playEnemyDeath();
    if (this._ctrl.hasNextWave()) {
      this._ctrl.nextWave();
      await this._playWaveEnter();
      return false;
    }
    this._finishBattle(true);
    return true;
  }

  // ════════════ 宠物主动技 ════════════

  private async _onSkillTap(petIndex: number): Promise<void> {
    if (this._busy || !this._ctrl.canCastSkill(petIndex)) return;
    this._busy = true;
    const pet = this._ctrl.team[petIndex];
    const color = ORB_COLOR[pet.def.element];
    const result = this._ctrl.castSkill(petIndex);
    this._refreshSkillUi();
    Platform.vibrateShort('medium');

    // 通用演出：属性色全屏闪 + 技能名横幅
    this._flash.flash(color, 0.25, 0.4);
    await this._showSkillBanner(pet.def.skill.name, color);

    switch (result.type) {
      case 'instantDmg': {
        const slot = this._petSlots[petIndex];
        await this._fireProjectile(slot.x, slot.y - 60, result.element);
        this._playEnemyHit(result.element, result.damage, true);
        this._spawnFloat(
          `${result.damage}`,
          this._enemyCenterX + (Math.random() - 0.5) * 100,
          this._enemyCenterY - 40,
          color, 1.4,
        );
        this._refreshEnemyHp();
        if (result.enemyDead && await this._handleEnemyDefeat()) return;
        break;
      }
      case 'teamAttack': {
        // 全队齐射：所有槽位同时发弹道，命中弹一次总伤害
        await Promise.all(this._petSlots.map((slot, i) =>
          this._fireProjectile(slot.x, slot.y - 60, this._ctrl.team[i].def.element),
        ));
        this._playEnemyHit(pet.def.element, result.damage, true);
        this._spawnFloat(`${result.damage}`, this._enemyCenterX, this._enemyCenterY - 40, color, 1.5);
        this._refreshEnemyHp();
        if (result.enemyDead && await this._handleEnemyDefeat()) return;
        break;
      }
      case 'healPct': {
        this._refreshHeroHp();
        this._spawnFloat(`+${result.healed}`, Game.logicWidth / 2, this._heroBarY - 24, 0x6fd86a, 1.2);
        this._fx.burst({
          x: Game.logicWidth / 2, y: this._heroBarY,
          color: 0x8be78b, count: 12, speed: 280, gravity: -200, size: 14, life: 0.6,
        });
        break;
      }
      case 'shield': {
        this._spawnFloat(`护盾 ${result.value}`, Game.logicWidth / 2, this._heroBarY - 24, 0x8fd4ff, 1.2);
        this._fx.burst({
          x: Game.logicWidth / 2, y: this._heroBarY,
          color: 0x8fd4ff, count: 12, speed: 280, gravity: -200, size: 14, life: 0.6,
        });
        break;
      }
      case 'dmgBoost': {
        this._spawnFloat(
          `全队伤害 ×${result.mult}（${result.turns} 回合）`,
          Game.logicWidth / 2, this._heroBarY - 24, 0xffb74d, 1.1,
        );
        break;
      }
      case 'convertOrbs': {
        const cells = this._board.convertRandom(result.to, result.count);
        for (const { r, c } of cells) {
          const cell = UI.board.cellSize;
          this._fx.burst({
            x: this._boardX + c * cell + cell / 2,
            y: this._boardY + r * cell + cell / 2,
            color: ORB_COLOR[result.to],
            count: 5, speed: 240, size: 12, life: 0.35,
          });
        }
        await this._boardView!.playConvert(cells, result.to);
        break;
      }
    }

    this._refreshSkillUi();
    this._busy = false;
  }

  /** 技能名横幅：放大弹入 → 短暂停留 → 淡出 */
  private _showSkillBanner(name: string, color: number): Promise<void> {
    return new Promise((resolve) => {
      const t = new PIXI.Text(name, {
        fontSize: 64, fill: color, fontWeight: 'bold',
        stroke: 0x1a1126, strokeThickness: 7,
      });
      t.anchor.set(0.5);
      t.position.set(Game.logicWidth / 2, Game.logicHeight * 0.42);
      t.scale.set(1.8);
      t.alpha = 0;
      this._floatLayer.addChild(t);
      TweenManager.to({
        target: t, props: { alpha: 1 },
        duration: UI.anim.comboPop,
      });
      TweenManager.to({
        target: t.scale, props: { x: 1, y: 1 },
        duration: UI.anim.comboPop, ease: Ease.easeOutBack,
        onComplete: () => {
          TweenManager.to({
            target: t, props: { alpha: 0, y: t.y - 40 },
            duration: UI.anim.skillBanner * 0.4, delay: UI.anim.skillBanner * 0.35,
            ease: Ease.easeOutQuad,
            onComplete: () => {
              t.destroy();
              resolve();
            },
          });
        },
      });
    });
  }

  /** 单只宠物冲刺 → 属性弹道飞向敌人 → 命中瞬间受击反馈 + 飘字 → 回位 */
  private _playPetAttack(attack: PetAttack): Promise<void> {
    return new Promise((resolve) => {
      const slot = this._petSlots[attack.petIndex];
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
          void this._fireProjectile(slot.x, slot.y - 60, attack.element).then(() => {
            this._playEnemyHit(attack.element, attack.damage, attack.isCrit);
            this._spawnDamageFloat(attack);
            resolve();
          });
        },
      });
    });
  }

  /** 属性色弹道：珠子贴图缩小版 + 拖尾粒子，从宠物槽飞向敌人 */
  private _fireProjectile(fromX: number, fromY: number, element: Element): Promise<void> {
    return new Promise((resolve) => {
      const color = ORB_COLOR[element];
      const tex = TextureCache.get(ORB_IMAGES[element]);
      const p = new PIXI.Sprite(tex ?? PIXI.Texture.WHITE);
      p.anchor.set(0.5);
      p.width = 48;
      p.height = 48;
      if (!tex) p.tint = color;
      p.position.set(fromX, fromY);
      this._fx.container.addChild(p);

      let frame = 0;
      TweenManager.to({
        target: p, props: { x: this._enemyCenterX, y: this._enemyCenterY },
        duration: UI.anim.projectile, ease: Ease.easeInQuad,
        onUpdate: () => {
          if (++frame % 2 === 0) {
            this._fx.burst({
              x: p.x, y: p.y, color,
              count: 1, speed: 40, gravity: 0,
              size: 12, life: 0.22, alpha: 0.8,
            });
          }
        },
        onComplete: () => {
          p.destroy();
          resolve();
        },
      });
    });
  }

  /** 伤害数字：属性着色，暴击放大 + 标记，克制加前缀 */
  private _spawnDamageFloat(attack: PetAttack): void {
    const color = attack.isCrit ? 0xffd75e : ORB_COLOR[attack.element];
    const prefix = attack.counter === 1 ? '克 ' : '';
    const text = `${prefix}${attack.damage}${attack.isCrit ? ' 暴击!' : ''}`;
    this._spawnFloat(
      text,
      this._enemyCenterX + (Math.random() - 0.5) * 120,
      this._enemyCenterY - 40,
      color,
      attack.isCrit ? 1.4 : 1,
    );
  }

  /** 受击三件套：闪白 + 击退回弹 + 属性色粒子飞溅；大伤害附加震屏 */
  private _playEnemyHit(element: Element, damage: number, forceStrong = false): void {
    const c = this._enemyContainer;
    TweenManager.cancelTarget(c);
    c.x = this._enemyCenterX;
    flashWhite(this._enemySprite, UI.anim.enemyWhiteFlash);
    this._fx.burst({
      x: this._enemyCenterX + (Math.random() - 0.5) * 60,
      y: this._enemyCenterY + (Math.random() - 0.5) * 60,
      color: ORB_COLOR[element],
      count: 9, speed: 430, size: 15, life: 0.4,
    });
    TweenManager.to({
      target: c, props: { x: this._enemyCenterX + 18 },
      duration: UI.anim.enemyHitFlash / 2, ease: Ease.easeOutQuad,
      onComplete: () => {
        TweenManager.to({
          target: c, props: { x: this._enemyCenterX },
          duration: UI.anim.enemyHitFlash, ease: Ease.easeOutQuad,
        });
      },
    });
    if (forceStrong || damage >= this._ctrl.enemy.maxHp * 0.15) {
      this._shake.medium();
      Platform.vibrateShort('medium');
    }
  }

  /** 敌人死亡：闪白 + 碎裂粒子 + 缩小淡出 */
  private _playEnemyDeath(): Promise<void> {
    flashWhite(this._enemySprite, 0.16, 0.95);
    const color = ORB_COLOR[this._ctrl.enemy.def.element];
    this._fx.burst({
      x: this._enemyCenterX, y: this._enemyCenterY,
      color: 0xffffff, count: 12, speed: 520, size: 20, life: 0.55,
    });
    this._fx.burst({
      x: this._enemyCenterX, y: this._enemyCenterY,
      color, count: 10, speed: 380, size: 15, life: 0.5,
    });
    this._shake.medium();
    Platform.vibrateShort('heavy');
    return new Promise((resolve) => {
      TweenManager.to({
        target: this._enemyContainer, props: { alpha: 0 },
        duration: UI.anim.enemyDeath, ease: Ease.easeInQuad,
        onComplete: resolve,
      });
      TweenManager.to({
        target: this._enemyContainer.scale, props: { x: 0.7, y: 0.7 },
        duration: UI.anim.enemyDeath, ease: Ease.easeInCubic,
      });
    });
  }

  private _playWaveEnter(): Promise<void> {
    this._refreshEnemy(true);
    return new Promise((resolve) => {
      this._enemyContainer.alpha = 0;
      this._enemyContainer.scale.set(1);
      this._enemyContainer.x = this._enemyCenterX + 160;
      TweenManager.to({
        target: this._enemyContainer, props: { alpha: 1, x: this._enemyCenterX },
        duration: UI.anim.waveEnter, ease: Ease.easeOutQuad,
        onComplete: resolve,
      });
    });
  }

  private async _enemyPhase(): Promise<void> {
    const result = this._ctrl.enemyAct();
    this._refreshEnemyCd();
    switch (result.action) {
      case 'attack':
      case 'chargedAttack': {
        await this._playEnemyAttack(result.damage, result.absorbed, result.action === 'chargedAttack');
        if (result.heroDead) {
          this._finishBattle(false);
          return;
        }
        break;
      }
      case 'charge':
        await this._playEnemyCharge();
        break;
      case 'heal':
        await this._playEnemyHeal(result.healed);
        break;
      case 'shield':
        await this._playEnemyShield();
        break;
      default:
        await this._delay(0.2);
    }
    this._ctrl.beginPlayerTurn();
    this._refreshSkillUi();
  }

  /** 敌人前冲攻击：蓄力重击时演出全面加重 */
  private _playEnemyAttack(damage: number, absorbed: number, heavy: boolean): Promise<void> {
    return new Promise((resolve) => {
      const baseY = this._enemyContainer.y;
      TweenManager.to({
        target: this._enemyContainer, props: { y: baseY + (heavy ? 60 : 36) },
        duration: UI.anim.petDash, ease: Ease.easeOutQuad,
        onComplete: () => {
          this._refreshHeroHp();
          if (absorbed > 0) {
            this._spawnFloat(
              `盾挡 -${absorbed}`,
              Game.logicWidth / 2 - 90, this._heroBarY - 24, 0x8fd4ff,
            );
          }
          if (damage > 0) {
            this._spawnFloat(
              `-${damage}`,
              Game.logicWidth / 2 + (absorbed > 0 ? 90 : 0),
              this._heroBarY - 24, 0xff5252,
              heavy ? 1.4 : 1,
            );
            // 英雄受击：红屏闪 + 震屏 + 振动（重击全部升档）
            this._flash.flash(0xff2d2d, heavy ? 0.3 : 0.18, heavy ? 0.45 : 0.35);
            if (heavy) {
              this._shake.heavy();
              Platform.vibrateLong();
            } else {
              this._shake.medium();
              Platform.vibrateShort('medium');
            }
          } else {
            // 完全被护盾挡下：蓝色轻闪
            this._flash.flash(0x8fd4ff, 0.12, 0.25);
            Platform.vibrateShort('light');
          }
          TweenManager.to({
            target: this._enemyContainer, props: { y: baseY },
            duration: UI.anim.petReturn, ease: Ease.easeInQuad,
            onComplete: resolve,
          });
        },
      });
    });
  }

  /** 蓄力起手：红色凝聚粒子 + 立绘膨胀脉冲 + 预告（文字由 _refreshEnemyCd 常驻） */
  private async _playEnemyCharge(): Promise<void> {
    this._fx.burst({
      x: this._enemyCenterX, y: this._enemyCenterY,
      color: 0xff5252, count: 14, speed: 200, gravity: -350,
      size: 14, life: UI.anim.chargeWarn,
    });
    this._spawnFloat('蓄力中！', this._enemyCenterX, this._enemyCenterY - 60, 0xff5252, 1.3);
    Platform.vibrateShort('medium');
    const s = this._enemyContainer.scale;
    await new Promise<void>((resolve) => {
      TweenManager.to({
        target: s, props: { x: 1.12, y: 1.12 },
        duration: UI.anim.chargeWarn / 2, ease: Ease.easeOutQuad,
        onComplete: () => {
          TweenManager.to({
            target: s, props: { x: 1, y: 1 },
            duration: UI.anim.chargeWarn / 2, ease: Ease.easeInQuad,
            onComplete: resolve,
          });
        },
      });
    });
  }

  private async _playEnemyHeal(healed: number): Promise<void> {
    this._fx.burst({
      x: this._enemyCenterX, y: this._enemyCenterY,
      color: 0x8be78b, count: 12, speed: 240, gravity: -250, size: 14, life: 0.55,
    });
    this._spawnFloat(`+${healed}`, this._enemyCenterX, this._enemyCenterY - 50, 0x8be78b, 1.2);
    this._refreshEnemyHp();
    await this._delay(0.45);
  }

  private async _playEnemyShield(): Promise<void> {
    this._fx.burst({
      x: this._enemyCenterX, y: this._enemyCenterY,
      color: 0xb0c4de, count: 12, speed: 260, gravity: -150, size: 15, life: 0.5,
    });
    this._spawnFloat('减伤护壁！', this._enemyCenterX, this._enemyCenterY - 50, 0xb0c4de, 1.2);
    this._refreshEnemyCd();
    await this._delay(0.45);
  }

  // ════════════ 结算 ════════════

  private _finishBattle(win: boolean): void {
    const result = this._ctrl.finish(win);
    if (win) {
      PlayerData.recordClear(this._ctrl.stage.id, result.stars, result.coins);
    }

    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const mask = new PIXI.Graphics();
    mask.beginFill(0x000000, 0.65);
    mask.drawRect(0, 0, w, h);
    mask.endFill();
    mask.eventMode = 'static'; // 拦截下层点击
    this._overlayLayer.addChild(mask);

    const panel = new PIXI.Container();
    const panelBg = new PIXI.Graphics();
    panelBg.beginFill(0x2e2148);
    panelBg.lineStyle(3, win ? 0xffd75e : 0x5a4a82);
    panelBg.drawRoundedRect(-280, -260, 560, 520, 28);
    panelBg.endFill();
    panel.addChild(panelBg);

    const title = new PIXI.Text(win ? '战斗胜利！' : '战斗失败…', {
      fontSize: 56, fill: win ? 0xffe082 : 0xb0a5cc, fontWeight: 'bold',
    });
    title.anchor.set(0.5);
    title.position.set(0, -180);
    panel.addChild(title);

    if (win) {
      // 星数
      const starText = new PIXI.Text(
        '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars),
        { fontSize: 64, fill: 0xffd75e },
      );
      starText.anchor.set(0.5);
      starText.position.set(0, -90);
      panel.addChild(starText);

      const detail = new PIXI.Text(
        `回合数 ${result.turnsUsed} / ${this._ctrl.stage.starTurnLimit}` +
        `${result.noDamage ? ' · 无伤' : ''}`,
        { fontSize: 26, fill: 0x9b8cc4 },
      );
      detail.anchor.set(0.5);
      detail.position.set(0, -28);
      panel.addChild(detail);

      const coinText = new PIXI.Text(`灵宠币 +${result.coins}（持有 ${PlayerData.coins}）`, {
        fontSize: 32, fill: 0xffe082, fontWeight: 'bold',
      });
      coinText.anchor.set(0.5);
      coinText.position.set(0, 30);
      panel.addChild(coinText);
    } else {
      const tip = new PIXI.Text('提示：消除克制敌人属性的珠子\n伤害 ×1.6，心珠可以回血', {
        fontSize: 28, fill: 0x9b8cc4, align: 'center',
      });
      tip.anchor.set(0.5);
      tip.position.set(0, -60);
      panel.addChild(tip);
    }

    // 按钮组
    const nextStage = STAGES.find(
      (s) => s.chapter === this._ctrl.stage.chapter && s.index === this._ctrl.stage.index + 1,
    );
    let btnY = 110;
    if (win && nextStage) {
      const nextBtn = this._makeButton('下一关', 320, 76, 0xe8554d, () => {
        SceneManager.switchTo('battle', { stageId: nextStage.id } satisfies BattleEnterData);
      });
      nextBtn.position.set(0, btnY);
      panel.addChild(nextBtn);
      btnY += 96;
    }
    const retryBtn = this._makeButton(win ? '再打一次' : '重试', 320, 76, win ? 0x4a3a72 : 0xe8554d, () => {
      SceneManager.switchTo('battle', { stageId: this._ctrl.stage.id } satisfies BattleEnterData);
    });
    retryBtn.position.set(0, btnY);
    panel.addChild(retryBtn);
    btnY += 96;
    const homeBtn = this._makeButton('返回主页', 320, 76, 0x4a3a72, () => {
      SceneManager.switchTo('title');
    });
    homeBtn.position.set(0, btnY);
    panel.addChild(homeBtn);

    panel.position.set(w / 2, h / 2 - 40);
    panel.scale.set(0.6);
    panel.alpha = 0;
    this._overlayLayer.addChild(panel);
    TweenManager.to({
      target: panel.scale, props: { x: 1, y: 1 },
      duration: 0.25, ease: Ease.easeOutBack,
    });
    TweenManager.to({ target: panel, props: { alpha: 1 }, duration: 0.2 });
  }

  // ════════════ UI 刷新 ════════════

  /** 刷新敌人立绘/名字/血条/倒计时（switchWave = 是否波次切换） */
  private _refreshEnemy(switchWave: boolean): void {
    const enemy = this._ctrl.enemy;
    const tex = TextureCache.get(enemyImage(enemy.def.id));
    if (tex) {
      this._enemySprite.texture = tex;
      const scale = UI.battle.enemySize / Math.max(tex.width, tex.height);
      this._enemySprite.scale.set(scale);
    }
    if (!switchWave) this._enemyContainer.alpha = 1;
    // 新敌人：血条显示状态直接复位满格（不播补间）
    const ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
    TweenManager.cancelTarget(this._enemyHpDisp);
    this._enemyHpDisp.shown = ratio;
    this._enemyHpDisp.white = ratio;
    this._enemyNameText.text =
      `${enemy.def.name} · ${ELEMENT_NAME[enemy.def.element]}属性`;
    this._enemyNameText.style.fill = ORB_COLOR[enemy.def.element];
    this._waveText.text = `第 ${this._ctrl.waveIndex + 1}/${this._ctrl.totalWaves} 波`;
    this._refreshEnemyHp();
    this._refreshEnemyCd();
  }

  private _refreshEnemyHp(): void {
    const enemy = this._ctrl.enemy;
    const ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
    this._enemyHpText.text = `${enemy.hp} / ${enemy.maxHp}`;
    this._animateHp(this._enemyHpDisp, ratio);
  }

  /** 敌人状态行：蓄力预告（红字）优先于普攻倒计时，附加减伤状态 */
  private _refreshEnemyCd(): void {
    const enemy = this._ctrl.enemy;
    if (enemy.hp <= 0) {
      this._enemyCdText.text = '';
      return;
    }
    const parts: string[] = [];
    if (enemy.charging) {
      parts.push(`⚠ 蓄力中！下回合重击 ×${enemy.charging.mult}`);
      this._enemyCdText.style.fill = 0xff5252;
      // 预告脉冲，提醒玩家这回合要做防御准备
      TweenManager.cancelTarget(this._enemyCdText.scale);
      this._enemyCdText.scale.set(1.25);
      TweenManager.to({
        target: this._enemyCdText.scale, props: { x: 1, y: 1 },
        duration: UI.anim.chargeWarn, ease: Ease.easeOutQuad,
      });
    } else {
      parts.push(`${enemy.attackCountdown} 回合后攻击`);
      this._enemyCdText.style.fill = 0xffb74d;
    }
    if (enemy.dmgReduction) {
      parts.push(`减伤${Math.round(enemy.dmgReduction.reduction * 100)}%·剩${enemy.dmgReduction.turnsLeft}回合`);
    }
    this._enemyCdText.text = parts.join('  ');
  }

  private _refreshHeroHp(): void {
    const ratio = this._ctrl.heroHp / this._ctrl.heroMaxHp;
    this._heroHpText.text = `${this._ctrl.heroHp} / ${this._ctrl.heroMaxHp}`;
    this._animateHp(this._heroHpDisp, ratio);
  }

  /** 消除组爆裂粒子：组内每颗珠喷属性色光点 */
  private _burstGroup(group: MatchGroup): void {
    const cell = UI.board.cellSize;
    const color = ORB_COLOR[group.orb];
    for (const { r, c } of group.cells) {
      this._fx.burst({
        x: this._boardX + c * cell + cell / 2,
        y: this._boardY + r * cell + cell / 2,
        color,
        count: 6,
        speed: 320,
        size: 13,
        life: UI.anim.orbBurst,
      });
    }
  }

  /** Combo 跳字：数字越大字号越大颜色越烈；连锁(天降)时弹跳更强 */
  private _showCombo(combo: number, emphasized = false): void {
    const tier = UI.comboTiers.find((t) => combo >= t.from) ?? UI.comboTiers[UI.comboTiers.length - 1];
    this._comboText.visible = true;
    this._comboText.alpha = 1;
    this._comboText.style.fontSize = tier.fontSize;
    this._comboText.style.fill = tier.color;
    this._comboText.text = combo >= 2
      ? `${combo} Combo ×${comboMultiplier(combo).toFixed(1)}`
      : '1 Combo';
    TweenManager.cancelTarget(this._comboText);
    TweenManager.cancelTarget(this._comboText.scale);
    this._comboText.scale.set(emphasized ? 1.7 : 1.4);
    TweenManager.to({
      target: this._comboText.scale, props: { x: 1, y: 1 },
      duration: UI.anim.comboPop, ease: Ease.easeOutBack,
    });
  }

  private _hideCombo(): void {
    const t = this._comboText;
    TweenManager.to({
      target: t, props: { alpha: 0 },
      duration: UI.anim.comboFade, delay: UI.anim.comboFadeDelay,
      onComplete: () => {
        t.visible = false;
        t.alpha = 1;
      },
    });
  }

  private _spawnFloat(text: string, x: number, y: number, color: number, scale = 1): void {
    const t = this._floatPool.get();
    t.text = text;
    t.style.fill = color;
    t.position.set(x, y);
    t.scale.set(scale);
    this._floatLayer.addChild(t);
    TweenManager.to({
      target: t, props: { y: y - 70, alpha: 0 },
      duration: UI.anim.damageFloat, ease: Ease.easeOutQuad,
      onComplete: () => this._floatPool.release(t),
    });
  }

  // ════════════ 工具 ════════════

  private _makeButton(
    label: string, width: number, height: number, color: number, onTap: () => void,
  ): PIXI.Container {
    const btn = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.beginFill(color);
    bg.drawRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    bg.endFill();
    btn.addChild(bg);
    const text = new PIXI.Text(label, { fontSize: Math.floor(height * 0.45), fill: 0xffffff, fontWeight: 'bold' });
    text.anchor.set(0.5);
    btn.addChild(text);
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', onTap);
    return btn;
  }

  private _delay(sec: number): Promise<void> {
    return new Promise((resolve) => {
      TweenManager.to({
        target: { t: 0 }, props: { t: 1 },
        duration: sec, onComplete: resolve,
      });
    });
  }
}
