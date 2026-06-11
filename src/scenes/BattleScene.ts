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
import { UI, ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import { COMBAT } from '@/balance/combat';
import { STAGES } from '@/balance/stages';
import { comboMultiplier } from '@/formulas/damage';
import { enemyImage, petImage } from '@/config/Assets';
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
  private _floatLayer!: PIXI.Container;
  private _overlayLayer!: PIXI.Container;

  private _floatPool!: ObjectPool<PIXI.Text>;

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
    this._ctrl = new BattleController(stageId);
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

    // ---- 飘字层 / 结算层 ----
    this._floatLayer = new PIXI.Container();
    this.container.addChild(this._floatLayer);
    this._overlayLayer = new PIXI.Container();
    this.container.addChild(this._overlayLayer);

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

      this.container.addChild(slot);
      return slot;
    });
  }

  // ════════════ 每帧 ════════════

  private _update(): void {
    const dt = Game.ticker.deltaMS / 1000;
    this._boardView?.update(dt);
    this._redrawDragBar();
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
    const allGroups: MatchGroup[] = [];
    for (;;) {
      const groups = this._board.findMatches();
      if (groups.length === 0) break;
      for (const group of groups) {
        allGroups.push(group);
        this._showCombo(allGroups.length);
        this._board.clearCells(group.cells);
        await this._boardView!.playClear(group);
      }
      const moves = this._board.collapse();
      await this._boardView!.playFall(moves);
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
      if (enemyDead) {
        await this._playEnemyDeath();
        if (this._ctrl.hasNextWave()) {
          this._ctrl.nextWave();
          await this._playWaveEnter();
        } else {
          this._finishBattle(true);
          return;
        }
      }
      await this._delay(UI.anim.attackGap);
    }
    this._ctrl.beginEnemyTurn();
  }

  /** 单只宠物冲刺 → 敌人受击 → 飘字 → 回位 */
  private _playPetAttack(attack: PetAttack): Promise<void> {
    return new Promise((resolve) => {
      const slot = this._petSlots[attack.petIndex];
      const baseY = slot.y;
      TweenManager.to({
        target: slot, props: { y: baseY - 46 },
        duration: UI.anim.petDash, ease: Ease.easeOutQuad,
        onComplete: () => {
          // 受击反馈 + 飘字
          this._playEnemyHit();
          const color = attack.isCrit ? 0xffd75e : ORB_COLOR[attack.element];
          const prefix = attack.counter === 1 ? '克 ' : '';
          const text = `${prefix}${attack.damage}${attack.isCrit ? '!' : ''}`;
          this._spawnFloat(
            text,
            this._enemyCenterX + (Math.random() - 0.5) * 120,
            this._enemyCenterY - 40,
            color,
            attack.isCrit ? 1.35 : 1,
          );
          TweenManager.to({
            target: slot, props: { y: baseY },
            duration: UI.anim.petReturn, ease: Ease.easeInQuad,
            onComplete: resolve,
          });
        },
      });
    });
  }

  private _playEnemyHit(): void {
    const c = this._enemyContainer;
    TweenManager.cancelTarget(c);
    this._enemySprite.tint = 0xff7070;
    TweenManager.to({
      target: c, props: { x: this._enemyCenterX + 12 },
      duration: UI.anim.enemyHitFlash / 2,
      onComplete: () => {
        TweenManager.to({
          target: c, props: { x: this._enemyCenterX },
          duration: UI.anim.enemyHitFlash / 2,
          onComplete: () => { this._enemySprite.tint = 0xffffff; },
        });
      },
    });
  }

  private _playEnemyDeath(): Promise<void> {
    return new Promise((resolve) => {
      TweenManager.to({
        target: this._enemyContainer, props: { alpha: 0 },
        duration: UI.anim.waveEnter, ease: Ease.easeInQuad,
        onComplete: resolve,
      });
    });
  }

  private _playWaveEnter(): Promise<void> {
    this._refreshEnemy(true);
    return new Promise((resolve) => {
      this._enemyContainer.alpha = 0;
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
    if (result.damage > 0) {
      // 敌人前冲 + 英雄掉血
      await new Promise<void>((resolve) => {
        const baseY = this._enemyContainer.y;
        TweenManager.to({
          target: this._enemyContainer, props: { y: baseY + 36 },
          duration: UI.anim.petDash, ease: Ease.easeOutQuad,
          onComplete: () => {
            this._refreshHeroHp();
            this._spawnFloat(`-${result.damage}`, Game.logicWidth / 2, this._heroBarY - 24, 0xff5252);
            TweenManager.to({
              target: this._enemyContainer, props: { y: baseY },
              duration: UI.anim.petReturn, ease: Ease.easeInQuad,
              onComplete: resolve,
            });
          },
        });
      });
      if (result.heroDead) {
        this._finishBattle(false);
        return;
      }
    } else {
      await this._delay(0.2);
    }
    this._ctrl.beginPlayerTurn();
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
    this._enemyNameText.text =
      `${enemy.def.name} · ${ELEMENT_NAME[enemy.def.element]}属性`;
    this._enemyNameText.style.fill = ORB_COLOR[enemy.def.element];
    this._waveText.text = `第 ${this._ctrl.waveIndex + 1}/${this._ctrl.totalWaves} 波`;
    this._refreshEnemyHp();
    this._refreshEnemyCd();
  }

  private _refreshEnemyHp(): void {
    const enemy = this._ctrl.enemy;
    const { enemyHpBarWidth: bw, enemyHpBarHeight: bh } = UI.battle;
    const x = (Game.logicWidth - bw) / 2;
    const y = this._enemyCenterY + UI.battle.enemySize / 2 + 8;
    const ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
    const g = this._enemyHpBar;
    g.clear();
    g.beginFill(0x1a1126);
    g.drawRoundedRect(x, y, bw, bh, bh / 2);
    g.endFill();
    if (ratio > 0) {
      g.beginFill(ratio > 0.3 ? 0xe8554d : 0xff2d2d);
      g.drawRoundedRect(x, y, Math.max(bw * ratio, bh), bh, bh / 2);
      g.endFill();
    }
    this._enemyHpText.text = `${enemy.hp} / ${enemy.maxHp}`;
  }

  private _refreshEnemyCd(): void {
    const cd = this._ctrl.enemy.attackCountdown;
    this._enemyCdText.text = this._ctrl.enemy.hp > 0 ? `${cd} 回合后攻击` : '';
  }

  private _refreshHeroHp(): void {
    const { heroHpBarHeight: bh } = UI.battle;
    const x = UI.board.marginX;
    const bw = Game.logicWidth - x * 2;
    const ratio = this._ctrl.heroHp / this._ctrl.heroMaxHp;
    const g = this._heroHpBar;
    g.clear();
    g.beginFill(0x1a1126);
    g.drawRoundedRect(x, this._heroBarY, bw, bh, bh / 2);
    g.endFill();
    if (ratio > 0) {
      g.beginFill(ratio > 0.3 ? 0x6fd86a : 0xffb74d);
      g.drawRoundedRect(x, this._heroBarY, Math.max(bw * ratio, bh), bh, bh / 2);
      g.endFill();
    }
    this._heroHpText.text = `${this._ctrl.heroHp} / ${this._ctrl.heroMaxHp}`;
  }

  private _showCombo(combo: number): void {
    this._comboText.visible = true;
    this._comboText.text = combo >= 2
      ? `${combo} Combo ×${comboMultiplier(combo).toFixed(1)}`
      : '1 Combo';
    // 跳动
    TweenManager.cancelTarget(this._comboText.scale);
    this._comboText.scale.set(1.35);
    TweenManager.to({
      target: this._comboText.scale, props: { x: 1, y: 1 },
      duration: 0.18, ease: Ease.easeOutQuad,
    });
  }

  private _hideCombo(): void {
    const t = this._comboText;
    TweenManager.to({
      target: t, props: { alpha: 0 },
      duration: 0.4, delay: 0.5,
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
