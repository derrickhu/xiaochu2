/**
 * 战斗结算浮层 — 对齐 battle_victory / battle_defeat UI prototype v2
 * 轻量奶油金边卡片：胜局星级+奖励；败局提示+战力引导+看广告复活。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager } from '@/core/SceneManager';
import { TweenManager, Ease } from '@/core/TweenManager';
import { TextureCache } from '@/core/TextureCache';
import { STAGES } from '@/balance/stages';
import { PET_MAP } from '@/balance/pets';
import { ECONOMY } from '@/balance/economy';
import { DAILY_FIRST_WIN_MULT } from '@/balance/dailyQuest';
import { UI_IMAGES, UI_PANEL_IMAGES, petAvatarPath } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import type { BattleContext } from '@/game/battleContext';
import { checkStaminaFor } from '@/game/staminaGate';
import { reportQuest } from '@/game/dailyQuestTracker';
import { contextDropScale, settleContextVictory } from './battleContextSettle';
import { playBossPetReveal } from './BossPetReveal';
import { Platform } from '@/core/PlatformService';
import type { BattleController } from '@/game/battle/BattleController';
import { formatStarTurnHint } from '@/formulas/stars';
import { getRarity } from '@/balance/rarity';
import {
  COLORS, FONT_SIZE,
  makeActionButton, makePanel, makeText, makeStarRow,
} from '@/ui';
import type { ActionButtonHandle } from '@/ui/ActionButton';
import { adUsesLeft, adUsesLeftText, watchAd } from '@/game/adGate';
import {
  type ConcreteReward,
  concreteRewardHasValue,
  formatConcreteRewardBrief,
  grantConcreteReward,
  scaleConcreteReward,
} from '@/game/rewardGrant';
import { AD_REWARD_MULT } from '@/balance/monetization';
import type { BattleEnterData } from '../BattleScene';
import type { TeamEnterData } from '../TeamScene';
import { battleProgressHint } from './battleProgressHints';
import { analytics } from '@/analytics';
import { bindPointerTap } from '@/utils/bindPointerTap';

/**
 * 对齐 battle_victory_ui_prototype_v2：
 * 板宽 560；按钮约板宽 55%，高按底板 3.2:1 比例，避免横向拉长。
 */
const PANEL_W = 560;
const BTN_ASPECT = 3.2;
const CREAM = 0xfff9ec;
const CREAM_INSET = 0xf5ead2;
const GOLD = 0xd4b87a;
const GOLD_SOFT = 0xe0c896;
const TITLE_BROWN = 0x5c3d24;
const REWARD_GREEN = 0x3d9a5c;
/** 结算奖励格：翻倍后可驱动数额/持有数刷新 */
interface RewardSlotHandle {
  amountText: PIXI.Text;
  holdText?: PIXI.Text;
  base: number;
  /** 默认 `+N`；碎片格用 `×N` */
  formatAmount?: (n: number) => string;
}

export interface BattleResultOptions {
  /** 战斗开始时刻，用于经分 duration_ms */
  battleStartedAt?: number;
  /** 副玩法上下文；缺省 = 主线 */
  context?: BattleContext;
  /** 本场最高 Combo（日常任务判定） */
  maxCombo?: number;
  /** 看广告复活成功后继续本场战斗 */
  onRevive?: () => void;
}

export class BattleResultOverlay {
  private static readonly _failCounts = new Map<string, number>();
  private _overlayLayer!: PIXI.Container;
  private _open = false;

  get isOpen(): boolean {
    return this._open;
  }

  build(parent: PIXI.Container): void {
    this._overlayLayer = new PIXI.Container();
    parent.addChild(this._overlayLayer);
  }

  clear(): void {
    this._open = false;
    this._overlayLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  show(
    ctrl: BattleController,
    win: boolean,
    opts: BattleResultOptions = {},
  ): void {
    this.clear();
    this._open = true;

    const startedAt = opts.battleStartedAt ?? 0;
    const durationMs = startedAt > 0 ? Date.now() - startedAt : 0;

    if (win) {
      this._showVictory(ctrl, durationMs, opts);
    } else {
      this._showDefeat(ctrl, durationMs, opts);
    }
  }

  private _showVictory(
    ctrl: BattleController,
    durationMs: number,
    opts: BattleResultOptions,
  ): void {
    const raw = ctrl.finish(true);
    const context = opts.context;
    const extraLines: string[] = [];

    // 每日首胜加成：最便宜的回访钩子，直接放大本场基础产出
    const firstWin = PlayerData.consumeFirstWin();
    const result = firstWin
      ? {
        ...raw,
        coins: Math.floor(raw.coins * DAILY_FIRST_WIN_MULT),
        exp: Math.floor(raw.exp * DAILY_FIRST_WIN_MULT),
      }
      : raw;
    if (firstWin) extraLines.push(`每日首胜 · 奖励 ×${DAILY_FIRST_WIN_MULT}`);

    const newlyUnlocked: string[] = [];
    /**
     * 本场实发包：展示 / 广告翻倍 / 再发一次只认这一份。
     * 禁止在按钮、奖励区各自再手写一份字段列表（之前漏翻灵玉就是这么漏的）。
     */
    const granted: ConcreteReward = {
      coins: result.coins,
      exp: result.exp,
      lingyu: 0,
      universal: result.universal,
      shards: [],
    };

    if (context) {
      // 副玩法自带产出口径：不写主线星数、不发首通灵玉、不触发 Boss 直掉
      // 折算必须落在 granted 上：展示、广告翻倍与实发共用这一份
      const scale = contextDropScale(context);
      granted.coins = Math.floor(granted.coins * scale.coins);
      granted.exp = Math.floor(granted.exp * scale.exp);
      granted.universal = Math.floor(granted.universal * scale.universal);
      PlayerData.addExp(granted.exp);
      PlayerData.addCoins(granted.coins);
      PlayerData.addUniversalShards(granted.universal);
      const skillCds: Record<string, number> = {};
      for (const pet of ctrl.team) {
        if (pet.skillCdLeft > 0) skillCds[pet.def.id] = pet.skillCdLeft;
      }
      extraLines.push(...settleContextVictory(context, {
        hpPctLeft: ctrl.heroHp / Math.max(1, ctrl.heroMaxHp),
        skillCds,
      }));
    } else {
      const repeat = PlayerData.isRepeatClear(ctrl.stage.id);
      // 实发：重复通关币/经验同衰减，翻倍广告必须按「实发」翻
      if (repeat) {
        granted.coins = Math.floor(result.coins * ECONOMY.coin.repeatClearPct);
        granted.exp = Math.floor(result.exp * ECONOMY.coin.repeatClearPct);
      }
      granted.lingyu = PlayerData.recordClear(ctrl.stage.id, result.stars, result.coins);
      PlayerData.addExp(granted.exp);
      for (const s of result.shards) PlayerData.addShards(s.petId, s.count);
      granted.shards = result.shards.map((s) => ({ ...s }));
      PlayerData.addUniversalShards(granted.universal);
      for (const pid of result.bossDropPets) {
        if (PlayerData.unlockPet(pid)) newlyUnlocked.push(pid);
      }
      if (repeat) {
        const pct = Math.round(ECONOMY.coin.repeatClearPct * 100);
        extraLines.push(`重复通关 · 灵宠币/经验按 ${pct}% 结算`);
      }
      reportQuest('stageClear');
    }
    reportQuest('comboReach', opts.maxCombo ?? 0);
    BattleResultOverlay._failCounts.delete(ctrl.stage.id);

    analytics.trackLevelClear(ctrl.stage.id, {
      durationMs,
      turnsUsed: result.turnsUsed,
      stars: result.stars,
      stageName: ctrl.stage.name,
    });

    const progressHintText = context
      ? null
      : battleProgressHint(ctrl.stage.id, granted.lingyu > 0);
    const nextStage = context
      ? undefined
      : STAGES.find(
        (s) => s.chapter === ctrl.stage.chapter && s.index === ctrl.stage.index + 1,
      );

    const root = this._mountScrim();
    const card = new PIXI.Container();
    root.addChild(card);

    const content = new PIXI.Container();
    card.addChild(content);

    // 内容从板内顶缘起算；趴宠单独叠在板外沿
    let y = 8;

    const title = makeText('战斗胜利！', {
      size: 44, fill: TITLE_BROWN, bold: true, anchor: 0.5,
      role: 'title',
    });
    title.position.set(0, y + 26);
    content.addChild(title);
    title.scale.set(0.35);
    TweenManager.to({
      target: title.scale, props: { x: 1, y: 1 },
      duration: 0.4, delay: 0.15, ease: Ease.easeOutBack,
    });
    y += 64;

    // UI 图：大号金星
    const stars = makeStarRow({
      star: result.stars, maxStar: 3, style: 'sprite',
      starSize: 76, gap: 22, anchor: 'center',
    });
    stars.position.set(0, y + 38);
    content.addChild(stars);
    y += 88;

    y = this._addTurnBlock(content, y, result.turnsUsed, ctrl.stage.starTurnLimit);
    y += 14;

    // 奖励区与广告翻倍共用 granted，改字段只改这一处
    const rewardBox = this._buildRewardBox(granted);
    rewardBox.position.set(0, y + rewardBox.boxH / 2);
    content.addChild(rewardBox);
    y += rewardBox.boxH + 14;

    // 章末 Boss 直掉：全屏亮相后再进结算；板上只留轻量收服条作备忘
    if (newlyUnlocked.length > 0) {
      const ribbon = this._buildPetDropRibbon(newlyUnlocked);
      ribbon.position.set(0, y + 22);
      content.addChild(ribbon);
      y += 48;
    }

    for (const line of extraLines) {
      const chip = this._makeInfoChip(line, 0xfdf0d8, 0xb5701f);
      chip.position.set(0, y + 18);
      content.addChild(chip);
      y += 40;
    }

    if (progressHintText) {
      const chip = this._makeInfoChip(progressHintText, 0xe8f6e4, 0x4e8a36);
      chip.position.set(0, y + 18);
      content.addChild(chip);
      y += 40;
    }

    y += 6;
    // UI 图：约板宽一半略多，高按胶囊底板比例，两端祥云不变形
    const btnW = Math.round(PANEL_W * 0.55);
    const btnH = Math.round(btnW / BTN_ASPECT);
    const btnGap = 14;
    const btns: PIXI.Container[] = this._buildVictoryButtons(ctrl, context, btnW, btnH, nextStage);
    // 翻倍位放在导航钮之上：一旦玩家点了「下一关」，本场奖励就再也翻不了了
    const doubleBtn = this._buildDoubleRewardButton(
      ctrl.stage.id,
      granted,
      btnW,
      btnH,
      (bonus) => rewardBox.applyAdDouble(bonus),
    );
    if (doubleBtn) btns.unshift(doubleBtn);
    for (const b of btns) {
      b.position.set(0, y + btnH / 2);
      content.addChild(b);
      y += btnH + btnGap;
    }
    y -= btnGap;

    const padTop = 36;
    const padBottom = 28;
    const panelH = y + padTop + padBottom;
    const board = this._makeVictoryBoard(PANEL_W, panelH);
    card.addChildAt(board, 0);

    // 趴宠：爪子压在板顶沿；略下压让大比例趴宠更贴板
    const peek = this._makePeekMascot();
    if (peek) {
      peek.position.set(0, -panelH / 2 + 18);
      card.addChild(peek);
    }

    content.position.set(0, -panelH / 2 + padTop);

    if (newlyUnlocked.length > 0) {
      // 先播全屏收服演出，再弹出胜利结算板
      card.alpha = 0;
      card.visible = false;
      void playBossPetReveal({
        parent: this._overlayLayer,
        petIds: newlyUnlocked,
        onDone: () => {
          card.visible = true;
          this._playCardEnter(card, panelH);
        },
      });
    } else {
      this._playCardEnter(card, panelH);
    }
  }

  /**
   * 结算奖励翻倍（IAA）：对「本场实发包」再发一份等额（×2 的差额）。
   *
   * 不重跑 finish()/recordClear：会把 Boss 直掉、星数状态再算一遍。
   * 补发 / 文案 / 数额动画都吃同一份 scaleConcreteReward(granted)，禁止再拆字段。
   */
  private _buildDoubleRewardButton(
    stageId: string,
    granted: ConcreteReward,
    btnW: number,
    btnH: number,
    onDoubled: (bonus: ConcreteReward) => void,
  ): ActionButtonHandle | null {
    if (adUsesLeft('victory_double') <= 0) return null;
    const bonus = scaleConcreteReward(granted, AD_REWARD_MULT - 1);
    if (!concreteRewardHasValue(bonus)) return null;
    const subLine = formatConcreteRewardBrief(bonus);

    let claimed = false;
    const btn = makeActionButton({
      title: `看广告 · 奖励 ×${AD_REWARD_MULT}`,
      subtitle: adUsesLeftText('victory_double'),
      width: btnW,
      height: btnH,
      variant: 'success',
      fontSize: FONT_SIZE.md,
      onTap: () => {
        void (async () => {
          if (claimed) return;
          if (!await watchAd('victory_double', { stageId })) return;
          claimed = true;
          grantConcreteReward(bonus);
          btn.setEnabled(false);
          btn.setLabels(`奖励已翻倍 ×${AD_REWARD_MULT}`, subLine);
          // 抖音激励关闭后宿主常自带「奖励领取成功」原生 toast，和数额滚动叠在一起会挡特效。
          // 先清掉，再错开一拍播数字（约对齐 toast 默认停留），玩家先看到按钮态再看数额涨。
          Platform.hideToast();
          setTimeout(() => {
            Platform.hideToast();
            onDoubled(bonus);
          }, 1200);
        })();
      },
    });
    return btn;
  }

  /**
   * 胜利页 CTA。
   * 主线：下一关 / 再打一次 / 返回主页；
   * 秘境：回秘境（次数在那里统一展示）；
   * 通天塔：继续下一层（残血继承，故不提供「再打一次」）。
   */
  private _buildVictoryButtons(
    ctrl: BattleController,
    context: BattleContext | undefined,
    btnW: number,
    btnH: number,
    nextStage: { id: string } | undefined,
  ): PIXI.Container[] {
    const btns: PIXI.Container[] = [];
    const go = (scene: string, data?: unknown): void => {
      this.clear();
      SceneManager.switchTo(scene, data);
    };

    if (context?.kind === 'tower') {
      btns.push(makeActionButton({
        title: '继续下一层', width: btnW, height: btnH, variant: 'gold',
        fontSize: FONT_SIZE.md,
        onTap: () => go('tower'),
      }));
      btns.push(makeActionButton({
        title: '返回主页', width: btnW, height: btnH, variant: 'cream',
        fontSize: FONT_SIZE.md,
        onTap: () => go('title'),
      }));
      return btns;
    }

    if (context?.kind === 'realm') {
      btns.push(makeActionButton({
        title: '返回秘境', width: btnW, height: btnH, variant: 'gold',
        fontSize: FONT_SIZE.md,
        onTap: () => go('realm'),
      }));
      btns.push(makeActionButton({
        title: '返回主页', width: btnW, height: btnH, variant: 'cream',
        fontSize: FONT_SIZE.md,
        onTap: () => go('title'),
      }));
      return btns;
    }

    if (nextStage) {
      btns.push(makeActionButton({
        title: '下一关', width: btnW, height: btnH, variant: 'gold',
        fontSize: FONT_SIZE.md,
        onTap: () => go('team', { stageId: nextStage.id } satisfies TeamEnterData),
      }));
    }
    btns.push(makeActionButton({
      title: '再打一次', width: btnW, height: btnH, variant: 'cream',
      fontSize: FONT_SIZE.md,
      // 重打跳过编队页直进战斗，体力门禁必须在这里补一道，否则可绕过扣费
      onTap: () => {
        if (!checkStaminaFor(ctrl.stage, context)) return;
        go('battle', { stageId: ctrl.stage.id } satisfies BattleEnterData);
      },
    }));
    btns.push(makeActionButton({
      title: '返回主页', width: btnW, height: btnH, variant: 'cream',
      fontSize: FONT_SIZE.md,
      onTap: () => go('title'),
    }));
    return btns;
  }

  private _showDefeat(
    ctrl: BattleController,
    durationMs: number,
    opts: BattleResultOptions,
  ): void {
    const context = opts.context;
    const defeatRefund = ctrl.defeatExpRefund();
    const fails = (BattleResultOverlay._failCounts.get(ctrl.stage.id) ?? 0) + 1;

    const commitDefeat = (navigate: () => void): void => {
      BattleResultOverlay._failCounts.set(ctrl.stage.id, fails);
      if (defeatRefund > 0) PlayerData.addExp(defeatRefund);
      // 塔战败封盘：需消耗每日重置次数才能从最近存档点续爬
      if (context?.kind === 'tower') PlayerData.towerEndRun();
      ctrl.finish(false);
      analytics.trackLevelFail(ctrl.stage.id, {
        durationMs,
        turnsUsed: ctrl.turnsUsed,
        reason: 'defeat',
        stageName: ctrl.stage.name,
      });
      this.clear();
      navigate();
    };

    const root = this._mountScrim();
    const card = new PIXI.Container();
    root.addChild(card);
    const content = new PIXI.Container();
    card.addChild(content);

    // 对齐 battle_defeat_ui_prototype_v2：标题 → 大号委屈宠 → 提示 → 保底经验 → 战力引导 → CTA
    let y = 8;

    const title = makeText('战斗失败', {
      size: 44, fill: TITLE_BROWN, bold: true, anchor: 0.5,
      role: 'title',
    });
    title.position.set(0, y + 26);
    content.addChild(title);
    content.addChild(this._spark(-132, y + 26));
    content.addChild(this._spark(132, y + 26));
    y += 58;

    // 原型：委屈宠约占板宽 0.40 高，板内居中（非趴顶）
    const mascotH = Math.round(PANEL_W * 0.40);
    const sad = this._makeDefeatMascot(mascotH);
    sad.position.set(0, y + mascotH / 2);
    content.addChild(sad);
    y += mascotH + 10;

    const tipRow = new PIXI.Container();
    const bang = new PIXI.Graphics();
    bang.beginFill(0xc9893a, 1);
    bang.drawCircle(0, 0, 13);
    bang.endFill();
    tipRow.addChild(bang);
    tipRow.addChild(makeText('!', {
      size: 17, fill: 0xffffff, bold: true, anchor: 0.5,
    }));
    const tip = makeText('提示：消除克制属性珠子伤害更高', {
      size: FONT_SIZE.xs, fill: TITLE_BROWN, bold: true, anchor: [0, 0.5],
      role: 'title',
    });
    tip.position.set(20, 0);
    tipRow.addChild(tip);
    try { tip.updateText(true); } catch { /* noop */ }
    tipRow.position.set(-(tip.width + 20) / 2, y + 14);
    content.addChild(tipRow);
    y += 36;

    if (defeatRefund > 0) {
      const chip = this._makeInfoChip(`保底经验 +${defeatRefund}`, 0xeef8e4, REWARD_GREEN);
      chip.position.set(0, y + 16);
      content.addChild(chip);
      y += 38;
    }

    y += 6;
    const guide = this._buildGrowthGuide((scene) => {
      commitDefeat(() => SceneManager.switchTo(scene));
    });
    guide.position.set(0, y + guide.boxH / 2);
    content.addChild(guide);
    y += guide.boxH + 16;

    // 原型：主 CTA 约板宽 74%，高按 success 底板 3.2:1
    const reviveW = Math.round(PANEL_W * 0.74);
    const reviveH = Math.round(reviveW / BTN_ASPECT);
    // 复活有日限（此前无限）：无限复活等于任何关都能硬耗过去，Boss 与体力门控同时失效
    if (adUsesLeft('battle_revive') > 0) {
      const reviveBtn = this._makeReviveButton(reviveW, reviveH, async () => {
        if (!await watchAd('battle_revive', { context: context?.kind ?? 'mainline' })) return;
        this.clear();
        opts.onRevive?.();
      });
      reviveBtn.position.set(0, y + reviveH / 2);
      content.addChild(reviveBtn);
      y += reviveH + 14;
    }

    const halfGap = 14;
    const halfW = Math.round((reviveW - halfGap) / 2);
    const halfH = Math.round(halfW / BTN_ASPECT);
    // 秘境次数已扣、塔已封盘，原地重试都不成立，退回各自的玩法首页
    const retryTitle = context ? (context.kind === 'tower' ? '返回通天塔' : '返回秘境') : '重试';
    const retryNav = (): void => {
      if (context?.kind === 'tower') {
        SceneManager.switchTo('tower');
      } else if (context?.kind === 'realm') {
        SceneManager.switchTo('realm');
      } else {
        SceneManager.switchTo('battle', { stageId: ctrl.stage.id } satisfies BattleEnterData);
      }
    };
    const retry = makeActionButton({
      title: retryTitle, width: halfW, height: halfH, variant: 'cream',
      fontSize: FONT_SIZE.md,
      onTap: () => {
        // 主线重试直进战斗，同样要过体力门禁；玩法首页只是导航，不拦
        if (!context && !checkStaminaFor(ctrl.stage)) return;
        commitDefeat(retryNav);
      },
    });
    retry.position.set(-(halfW + halfGap) / 2, y + halfH / 2);
    content.addChild(retry);

    const home = makeActionButton({
      title: '返回主页', width: halfW, height: halfH, variant: 'cream',
      fontSize: FONT_SIZE.md,
      onTap: () => commitDefeat(() => SceneManager.switchTo('title')),
    });
    home.position.set((halfW + halfGap) / 2, y + halfH / 2);
    content.addChild(home);
    y += halfH;

    const padTop = 32;
    const padBottom = 28;
    const panelH = y + padTop + padBottom;
    const board = this._makeVictoryBoard(PANEL_W, panelH);
    card.addChildAt(board, 0);
    content.position.set(0, -panelH / 2 + padTop);

    this._playCardEnter(card, panelH);
  }

  private _mountScrim(): PIXI.Container {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const root = new PIXI.Container();
    const mask = new PIXI.Graphics();
    mask.beginFill(COLORS.scrim, 0.55);
    mask.drawRect(0, 0, w, h);
    mask.endFill();
    mask.eventMode = 'static';
    root.addChild(mask);
    this._overlayLayer.addChild(root);
    return root;
  }

  private _playCardEnter(card: PIXI.Container, panelH: number): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const fitScale = Math.min(1, (h * 0.86) / panelH, (w - 48) / PANEL_W);
    card.position.set(w / 2, h / 2);
    card.scale.set(0.72 * fitScale);
    card.alpha = 0;
    TweenManager.to({
      target: card.scale, props: { x: fitScale, y: fitScale },
      duration: 0.28, ease: Ease.easeOutBack,
    });
    TweenManager.to({ target: card, props: { alpha: 1 }, duration: 0.2 });
  }

  private _addTurnBlock(
    parent: PIXI.Container,
    y: number,
    turns: number,
    starTurnLimit: number,
  ): number {
    // 先排文字，再按字宽拉开两侧金线，避免「回合数」与菱形/横线重叠
    const turn = makeText(`回合数 ${turns}`, {
      size: FONT_SIZE.md, fill: TITLE_BROWN, bold: true, anchor: 0.5,
      role: 'title',
    });
    try { turn.updateText(true); } catch { /* noop */ }
    const turnY = y + 16;
    turn.position.set(0, turnY);
    parent.addChild(turn);

    const halfGap = Math.max(48, Math.ceil(turn.width / 2) + 18);
    const line = new PIXI.Graphics();
    line.lineStyle(1.5, GOLD_SOFT, 0.9);
    line.moveTo(-190, 0);
    line.lineTo(-halfGap, 0);
    line.moveTo(halfGap, 0);
    line.lineTo(190, 0);
    const diamond = (x: number) => {
      line.beginFill(GOLD, 1);
      line.moveTo(x, -5);
      line.lineTo(x + 5, 0);
      line.lineTo(x, 5);
      line.lineTo(x - 5, 0);
      line.closePath();
      line.endFill();
    };
    diamond(-halfGap);
    diamond(halfGap);
    line.position.set(0, turnY);
    // 装饰线压在文字下层
    parent.addChildAt(line, parent.getChildIndex(turn));

    const hint = makeText(`（${formatStarTurnHint(starTurnLimit)}）`, {
      size: FONT_SIZE.xs, fill: COLORS.textSub, bold: true, anchor: 0.5,
      role: 'title',
    });
    hint.position.set(0, turnY + 30);
    parent.addChild(hint);
    return y + 64;
  }

  private _buildRewardBox(
    granted: ConcreteReward,
  ): PIXI.Container & {
    boxH: number;
    applyAdDouble: (bonus: ConcreteReward) => void;
  } {
    const box = new PIXI.Container() as PIXI.Container & {
      boxH: number;
      applyAdDouble: (bonus: ConcreteReward) => void;
    };
    const innerW = PANEL_W - 64;
    type ItemKey = 'coins' | 'exp' | 'shard' | 'universal' | 'lingyu';
    const items: {
      key: ItemKey;
      base: number;
      iconPath: string;
      name: string;
      amount: string;
      amountFill: number;
      holdHint?: string;
      formatAmount?: (n: number) => string;
    }[] = [
      {
        key: 'coins',
        base: granted.coins,
        iconPath: UI_IMAGES.iconCoin,
        name: '灵宠币',
        amount: `+${granted.coins}`,
        amountFill: 0xe8872a,
        holdHint: `持有 ${PlayerData.coins}`,
      },
      {
        key: 'exp',
        base: granted.exp,
        iconPath: UI_IMAGES.iconExp,
        name: '经验',
        amount: `+${granted.exp}`,
        amountFill: REWARD_GREEN,
      },
    ];
    for (const shard of granted.shards.slice(0, 1)) {
      items.push({
        key: 'shard',
        base: shard.count,
        iconPath: petAvatarPath(shard.petId, 1),
        name: '灵宠碎片',
        amount: `×${shard.count}`,
        amountFill: 0x7a5cff,
        formatAmount: (n) => `×${n}`,
      });
    }
    if (granted.universal > 0 && items.length < 3) {
      items.push({
        key: 'universal',
        base: granted.universal,
        iconPath: UI_IMAGES.iconShard,
        name: '通用碎片',
        amount: `+${granted.universal}`,
        amountFill: 0x7a5cff,
        holdHint: `持有 ${PlayerData.universalShards}`,
      });
    }
    if (granted.lingyu > 0 && items.length < 3) {
      items.push({
        key: 'lingyu',
        base: granted.lingyu,
        iconPath: UI_IMAGES.iconLingyu,
        name: '灵玉',
        amount: `+${granted.lingyu}`,
        amountFill: COLORS.textTitle,
      });
    }
    while (items.length > 3) items.pop();

    const gap = 8;
    const cardW = Math.floor((innerW - gap * (items.length - 1)) / Math.max(1, items.length));
    const cardH = 118;
    const pad = 12;
    const headH = 32;
    const boxH = pad + headH + cardH + pad;
    box.boxH = boxH;

    box.addChild(makePanel({
      width: innerW, height: boxH, radius: 16,
      bg: 0xf0e2c8, bgAlpha: 0.92,
      border: GOLD_SOFT, borderWidth: 1.5,
      centered: true,
    }));

    const head = makeText('◆  获得奖励  ◆', {
      size: FONT_SIZE.sm, fill: TITLE_BROWN, bold: true, anchor: 0.5,
      role: 'title',
    });
    head.position.set(0, -boxH / 2 + pad + headH / 2);
    box.addChild(head);

    const rowY = -boxH / 2 + pad + headH + cardH / 2;
    const totalW = items.length * cardW + (items.length - 1) * gap;
    let x0 = -totalW / 2 + cardW / 2;
    const slots: Partial<Record<ItemKey, RewardSlotHandle>> = {};
    items.forEach((it) => {
      const card = this._rewardCard(
        it.iconPath, it.name, it.amount, it.amountFill, cardW, cardH, it.holdHint,
      );
      card.position.set(x0, rowY);
      box.addChild(card);
      slots[it.key] = {
        amountText: card.amountText,
        holdText: card.holdText,
        base: it.base,
        formatAmount: it.formatAmount,
      };
      x0 += cardW + gap;
    });

    box.applyAdDouble = (bonus) => {
      // 与「奖励 ×2」文案对齐：面板上出现的项都滚到翻倍后总额
      if (bonus.coins > 0 && slots.coins) {
        this._animateRewardDouble(
          slots.coins, slots.coins.base + bonus.coins, () => `持有 ${PlayerData.coins}`,
        );
      }
      if (bonus.exp > 0 && slots.exp) {
        this._animateRewardDouble(slots.exp, slots.exp.base + bonus.exp);
      }
      if (bonus.lingyu > 0 && slots.lingyu) {
        this._animateRewardDouble(slots.lingyu, slots.lingyu.base + bonus.lingyu);
      }
      if (bonus.universal > 0 && slots.universal) {
        this._animateRewardDouble(
          slots.universal,
          slots.universal.base + bonus.universal,
          () => `持有 ${PlayerData.universalShards}`,
        );
      }
      const shardBonus = bonus.shards.reduce((n, s) => n + s.count, 0);
      if (shardBonus > 0 && slots.shard) {
        this._animateRewardDouble(slots.shard, slots.shard.base + shardBonus);
      }
      // 区标题改成「已 ×2」并弹一下，和数额滚动一起确认「奖励区真的变了」
      if (!head.destroyed) {
        head.text = `◆  奖励已 ×${AD_REWARD_MULT}  ◆`;
        head.style.fill = REWARD_GREEN;
        TweenManager.cancelTarget(head.scale);
        head.scale.set(1);
        TweenManager.to({
          target: head.scale, props: { x: 1.08, y: 1.08 },
          duration: 0.18, ease: Ease.easeOutBack,
          onComplete: () => {
            if (head.destroyed) return;
            TweenManager.to({
              target: head.scale, props: { x: 1, y: 1 },
              duration: 0.22, ease: Ease.easeInOutQuad,
            });
          },
        });
      }
    };
    return box;
  }

  /**
   * 翻倍后数额从基础值滚到总额，并弹一下 scale，让变化一眼可见。
   */
  private _animateRewardDouble(
    slot: RewardSlotHandle,
    finalAmount: number,
    holdHint?: () => string,
  ): void {
    if (finalAmount <= slot.base) return;
    const format = slot.formatAmount ?? ((n: number) => `+${n}`);
    const from = slot.base;
    const proxy = { v: from };
    TweenManager.cancelTarget(proxy);
    TweenManager.cancelTarget(slot.amountText.scale);
    TweenManager.to({
      target: proxy,
      props: { v: finalAmount },
      duration: 0.55,
      ease: Ease.easeOutCubic,
      onUpdate: () => {
        if (slot.amountText.destroyed) return;
        slot.amountText.text = format(Math.round(proxy.v));
      },
      onComplete: () => {
        if (slot.amountText.destroyed) return;
        slot.amountText.text = format(finalAmount);
        if (holdHint && slot.holdText && !slot.holdText.destroyed) {
          slot.holdText.text = holdHint();
        }
      },
    });
    slot.amountText.scale.set(1);
    TweenManager.to({
      target: slot.amountText.scale,
      props: { x: 1.35, y: 1.35 },
      duration: 0.2,
      ease: Ease.easeOutBack,
      onComplete: () => {
        if (slot.amountText.destroyed) return;
        TweenManager.to({
          target: slot.amountText.scale,
          props: { x: 1, y: 1 },
          duration: 0.25,
          ease: Ease.easeInOutQuad,
        });
      },
    });
  }

  /**
   * UI 图：左大图标 + 右名称/数额，铺满格内（勿缩成小图标小字）。
   */
  private _rewardCard(
    iconPath: string,
    name: string,
    amount: string,
    amountFill: number,
    w: number,
    h: number,
    holdHint?: string,
  ): PIXI.Container & { amountText: PIXI.Text; holdText?: PIXI.Text } {
    const card = new PIXI.Container() as PIXI.Container & {
      amountText: PIXI.Text;
      holdText?: PIXI.Text;
    };
    card.addChild(makePanel({
      width: w, height: h, radius: 12,
      bg: 0xeadabc, bgAlpha: 0.55,
      border: 0xdcc8a0, borderWidth: 1.2,
      centered: true,
    }));

    const pad = 8;
    const iconSize = Math.round(Math.min(h - pad * 2 - (holdHint ? 22 : 0), w * 0.42));
    const iconX = -w / 2 + pad + iconSize / 2;
    const contentTop = holdHint ? -6 : 0;

    const tex = TextureCache.get(iconPath);
    if (tex) {
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      const s = iconSize / Math.max(tex.width, tex.height);
      sp.scale.set(s);
      sp.position.set(iconX, contentTop - (holdHint ? 6 : 0));
      card.addChild(sp);
    }

    const textX = iconX + iconSize / 2 + 8;
    const nameT = makeText(name, {
      size: FONT_SIZE.xs, fill: TITLE_BROWN, bold: true, anchor: [0, 0.5],
      role: 'title',
      wordWrapWidth: w / 2 - 4,
    });
    nameT.position.set(textX, contentTop - 16);
    card.addChild(nameT);

    const amt = makeText(amount, {
      size: FONT_SIZE.md, fill: amountFill, bold: true, anchor: [0, 0.5],
      role: 'title',
    });
    amt.position.set(textX, contentTop + 14);
    card.addChild(amt);
    card.amountText = amt;

    if (holdHint) {
      // 持有数含阿拉伯数字：勿用宋体展示字（真机小字号下 96 易糊成 %）
      const t = makeText(holdHint, {
        size: FONT_SIZE.xs, fill: COLORS.textSub, bold: true, anchor: 0.5,
      });
      try { t.updateText(true); } catch { /* noop */ }
      const pw = Math.min(w - 12, Math.ceil(t.width) + 18);
      const ph = 26;
      const pill = new PIXI.Container();
      pill.addChild(makePanel({
        width: pw, height: ph, radius: ph / 2,
        bg: 0xe8d9b8, bgAlpha: 0.95,
        border: 0xd4c09a, borderWidth: 1,
        centered: true,
      }));
      pill.addChild(t);
      pill.position.set(0, h / 2 - pad - ph / 2);
      card.addChild(pill);
      card.holdText = t;
    }
    return card;
  }

  /** 结算板上的轻量备忘条（重头戏在全屏 BossPetReveal） */
  private _buildPetDropRibbon(ids: string[]): PIXI.Container {
    const petId = ids[0];
    const pet = PET_MAP.get(petId);
    const rar = getRarity(pet?.rarity ?? 1);
    const more = ids.length > 1 ? ` 等${ids.length}只` : '';
    const label = `已收服 ${pet?.name ?? petId}${more} · ${rar.code}`;
    return this._makeInfoChip(label, 0xfff0d0, rar.color);
  }

  private _buildGrowthGuide(
    onPick: (scene: string) => void,
  ): PIXI.Container & { boxH: number } {
    const box = new PIXI.Container() as PIXI.Container & { boxH: number };
    const innerW = PANEL_W - 72;
    // 对齐 defeat UI：大号圆环图标 + 底部胶囊标签，无白底圆盘
    const boxH = 188;
    box.boxH = boxH;
    box.addChild(makePanel({
      width: innerW, height: boxH, radius: 16,
      bg: CREAM_INSET, bgAlpha: 0.96,
      border: GOLD_SOFT, borderWidth: 1.5,
      centered: true,
    }));

    const head = makeText('卡关了？试试提升战力', {
      size: FONT_SIZE.sm, fill: TITLE_BROWN, bold: true, anchor: 0.5,
      role: 'title',
    });
    head.position.set(0, -boxH / 2 + 24);
    box.addChild(head);

    const entries: { label: string; icon: string; scene: string }[] = [
      { label: '召唤', icon: UI_IMAGES.iconRecruit, scene: 'gacha' },
      { label: '商店', icon: UI_IMAGES.navShop, scene: 'shop' },
      { label: '灵宠', icon: UI_IMAGES.navPet, scene: 'codex' },
    ];
    const gap = 128;
    const startX = -((entries.length - 1) * gap) / 2;
    const ringR = 46;
    const iconSize = 78;
    const rowY = 18;
    entries.forEach((en, i) => {
      const item = new PIXI.Container();
      item.position.set(startX + i * gap, rowY);

      // 细金边双环：填充用与底板同色，避免刺眼白底圆盘
      const ring = new PIXI.Graphics();
      ring.beginFill(CREAM_INSET, 1);
      ring.lineStyle(2.5, GOLD, 1);
      ring.drawCircle(0, 0, ringR);
      ring.endFill();
      ring.lineStyle(1.2, GOLD_SOFT, 0.85);
      ring.drawCircle(0, 0, ringR - 5);
      item.addChild(ring);

      const tex = TextureCache.get(en.icon);
      if (tex) {
        const sp = new PIXI.Sprite(tex);
        sp.anchor.set(0.5);
        const s = iconSize / Math.max(tex.width, tex.height);
        sp.scale.set(s);
        sp.position.set(0, -2);
        item.addChild(sp);
      }

      const lab = makeText(en.label, {
        size: FONT_SIZE.xs, fill: TITLE_BROWN, bold: true, anchor: 0.5,
        role: 'title',
      });
      try { lab.updateText(true); } catch { /* noop */ }
      const pillW = Math.max(64, Math.ceil(lab.width) + 22);
      const pillH = 28;
      const pill = makePanel({
        width: pillW, height: pillH, radius: pillH / 2,
        bg: 0xfff8ec, bgAlpha: 1,
        border: 0xb8905a, borderWidth: 1.5,
        centered: true,
      });
      // 标签压在圆环下沿（对齐 UI 图）
      const pillY = ringR - 4;
      pill.position.set(0, pillY);
      lab.position.set(0, pillY);
      item.addChild(pill);
      item.addChild(lab);

      item.eventMode = 'static';
      item.cursor = 'pointer';
      item.hitArea = new PIXI.Rectangle(-ringR - 8, -ringR - 8, (ringR + 8) * 2, ringR + pillY + pillH / 2 + 10);
      bindPointerTap(item, () => onPick(en.scene));
      box.addChild(item);
    });
    return box;
  }

  private _makeReviveButton(w: number, h: number, onTap: () => void): PIXI.Container {
    const btn = makeActionButton({
      title: '看广告复活',
      width: w,
      height: h,
      variant: 'success',
      onTap,
    });
    // 「广告」角标
    const tag = new PIXI.Container();
    tag.addChild(makePanel({
      width: 52, height: 24, radius: 8,
      bg: 0xff8c22, bgAlpha: 1,
      border: 0xffffff, borderWidth: 1.5,
      centered: true,
    }));
    tag.addChild(makeText('广告', {
      size: 13, fill: 0xffffff, bold: true, anchor: 0.5,
      role: 'title',
    }));
    tag.position.set(-w / 2 + 48, -h / 2 + 18);
    btn.addChild(tag);
    return btn;
  }

  private _makeInfoChip(text: string, bg: number, fill: number): PIXI.Container {
    const c = new PIXI.Container();
    const t = makeText(text, {
      size: FONT_SIZE.xs, fill, bold: true, anchor: 0.5,
    });
    try { t.updateText(true); } catch { /* noop */ }
    const pw = Math.ceil(t.width) + 36;
    const ph = 34;
    c.addChild(makePanel({
      width: pw, height: ph, radius: ph / 2,
      bg, bgAlpha: 0.96,
      border: GOLD_SOFT, borderWidth: 1.5,
      centered: true,
    }));
    c.addChild(t);
    return c;
  }

  /** 胜利奶油金边板（对齐 prototype v2） */
  private _makeVictoryBoard(w: number, h: number): PIXI.Container {
    const c = new PIXI.Container();
    const tex = TextureCache.get(UI_PANEL_IMAGES.battleVictory);
    if (tex) {
      const plane = new PIXI.NineSlicePlane(tex, 80, 96, 80, 80);
      plane.width = w;
      plane.height = h;
      plane.pivot.set(w / 2, h / 2);
      c.addChild(plane);
    } else {
      c.addChild(makePanel({
        width: w, height: h, radius: 28,
        bg: CREAM, bgAlpha: 0.98,
        border: GOLD, borderWidth: 2.5,
        centered: true,
      }));
      c.addChild(this._cornerClouds(w, h));
    }
    return c;
  }

  /** 固定白+薄荷绿趴宠；比例对齐 UI 图（约占板宽 1/3 强） */
  private _makePeekMascot(): PIXI.Container | null {
    const tex = TextureCache.get(UI_PANEL_IMAGES.battleVictoryPeek);
    if (!tex) return null;
    const c = new PIXI.Container();
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5, 1);
    // UI 图趴宠远大于标题字号；按板宽定高，避免「小脑袋顶大板」
    const targetH = Math.round(PANEL_W * 0.34);
    sp.scale.set(targetH / Math.max(1, tex.height));
    c.addChild(sp);
    return c;
  }

  /** 失败页委屈宠：对齐 prototype v2（白+薄荷绿+泪+枯莲） */
  private _makeDefeatMascot(targetH: number): PIXI.Container {
    const c = new PIXI.Container();
    const tex = TextureCache.get(UI_PANEL_IMAGES.battleDefeatMascot);
    if (tex) {
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      sp.scale.set(targetH / Math.max(1, tex.height));
      c.addChild(sp);
      return c;
    }
    // 贴图未就绪时的轻量占位（勿当正式立绘）
    const g = new PIXI.Graphics();
    g.beginFill(0xf4f7f5, 1);
    g.drawEllipse(0, 8, 56, 48);
    g.endFill();
    g.beginFill(0x7ec8ff, 0.85);
    g.drawEllipse(-16, 10, 5, 10);
    g.drawEllipse(16, 10, 5, 10);
    g.endFill();
    c.addChild(g);
    return c;
  }

  private _spark(x: number, y: number): PIXI.Graphics {
    const g = new PIXI.Graphics();
    g.beginFill(0xe8a33d, 0.95);
    const r = 7;
    g.moveTo(0, -r);
    g.lineTo(r * 0.3, -r * 0.3);
    g.lineTo(r, 0);
    g.lineTo(r * 0.3, r * 0.3);
    g.lineTo(0, r);
    g.lineTo(-r * 0.3, r * 0.3);
    g.lineTo(-r, 0);
    g.lineTo(-r * 0.3, -r * 0.3);
    g.closePath();
    g.endFill();
    g.position.set(x, y);
    return g;
  }

  private _cornerClouds(w: number, h: number): PIXI.Graphics {
    const g = new PIXI.Graphics();
    g.lineStyle(1.5, GOLD_SOFT, 0.45);
    const draw = (cx: number, cy: number, sx: number) => {
      g.moveTo(cx, cy);
      g.quadraticCurveTo(cx + 18 * sx, cy - 10, cx + 36 * sx, cy);
      g.quadraticCurveTo(cx + 50 * sx, cy + 8, cx + 28 * sx, cy + 14);
    };
    draw(-w / 2 + 28, -h / 2 + 36, 1);
    draw(w / 2 - 28, -h / 2 + 36, -1);
    return g;
  }
}
