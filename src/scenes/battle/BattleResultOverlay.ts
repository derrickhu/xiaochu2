/**
 * 战斗结算浮层：胜/负面板、星级、奖励滚动入账、收录提示、卡关引导，以及失败/重试/下一关导航。
 *
 * 拥有结算层显示对象与「各关连续失败次数」内存计数（胜利清零，用于卡关引导触发）。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager } from '@/core/SceneManager';
import { TweenManager, Ease } from '@/core/TweenManager';
import { STAGES } from '@/balance/stages';
import { PET_MAP } from '@/balance/pets';
import { PlayerData } from '@/game/PlayerData';
import type { BattleController } from '@/game/battle/BattleController';
import { makeButton } from './battleWidgets';
import type { BattleEnterData } from '../BattleScene';
import type { TeamEnterData } from '../TeamScene';

export class BattleResultOverlay {
  /** 各关卡连续失败次数（内存级，胜利清零）：用于卡关引导触发 */
  private static readonly _failCounts = new Map<string, number>();

  private _overlayLayer!: PIXI.Container;

  build(parent: PIXI.Container): void {
    this._overlayLayer = new PIXI.Container();
    parent.addChild(this._overlayLayer);
  }

  show(ctrl: BattleController, win: boolean): void {
    const result = ctrl.finish(win);
    let milestoneLingyu = 0;
    let defeatRefund = 0;
    const newlyDiscovered: string[] = [];
    if (win) {
      milestoneLingyu = PlayerData.recordClear(ctrl.stage.id, result.stars, result.coins);
      PlayerData.addExp(result.exp);
      for (const s of result.shards) PlayerData.addShards(s.petId, s.count);
      for (const cid of result.discoveredCreatures) {
        if (PlayerData.discover(cid)) newlyDiscovered.push(cid);
      }
      BattleResultOverlay._failCounts.delete(ctrl.stage.id);
    } else {
      defeatRefund = ctrl.defeatExpRefund();
      if (defeatRefund > 0) PlayerData.addExp(defeatRefund);
      BattleResultOverlay._failCounts.set(
        ctrl.stage.id,
        (BattleResultOverlay._failCounts.get(ctrl.stage.id) ?? 0) + 1,
      );
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
      stroke: win ? 0x9a5a00 : 0x2a2342, strokeThickness: 6,
    });
    title.anchor.set(0.5);
    title.position.set(0, -180);
    panel.addChild(title);
    if (win) {
      title.scale.set(0.2);
      TweenManager.to({
        target: title.scale, props: { x: 1, y: 1 },
        duration: 0.4, delay: 0.25, ease: Ease.easeOutBack,
      });
    }

    if (win) {
      const starText = new PIXI.Text(
        '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars),
        { fontSize: 64, fill: 0xffd75e },
      );
      starText.anchor.set(0.5);
      starText.position.set(0, -90);
      panel.addChild(starText);

      const detail = new PIXI.Text(
        `回合数 ${result.turnsUsed} / ${ctrl.stage.starTurnLimit}` +
        `${result.noDamage ? ' · 无伤' : ''}`,
        { fontSize: 26, fill: 0x9b8cc4 },
      );
      detail.anchor.set(0.5);
      detail.position.set(0, -28);
      panel.addChild(detail);

      const coinText = new PIXI.Text(`灵宠币 +0（持有 ${PlayerData.coins}）`, {
        fontSize: 32, fill: 0xffe082, fontWeight: 'bold',
      });
      coinText.anchor.set(0.5);
      coinText.position.set(0, 24);
      panel.addChild(coinText);
      const coinCounter = { v: 0 };
      TweenManager.to({
        target: coinCounter, props: { v: result.coins },
        duration: 0.5, delay: 0.3, ease: Ease.easeOutCubic,
        onUpdate: () => {
          coinText.text = `灵宠币 +${Math.round(coinCounter.v)}（持有 ${PlayerData.coins}）`;
        },
      });

      const shardSummary = result.shards
        .map((s) => `${PET_MAP.get(s.petId)?.name ?? s.petId}碎片×${s.count}`)
        .join('  ');
      const lingyuSuffix = milestoneLingyu > 0 ? `   首通灵玉 +${milestoneLingyu}` : '';
      const tail = `${shardSummary ? `\n${shardSummary}` : ''}${lingyuSuffix}`;
      const rewardText = new PIXI.Text(
        `经验 +0${tail}`,
        { fontSize: 24, fill: 0x9fe6b0, align: 'center' },
      );
      rewardText.anchor.set(0.5);
      rewardText.position.set(0, 78);
      panel.addChild(rewardText);
      const expCounter = { v: 0 };
      TweenManager.to({
        target: expCounter, props: { v: result.exp },
        duration: 0.5, delay: 0.3, ease: Ease.easeOutCubic,
        onUpdate: () => {
          rewardText.text = `经验 +${Math.round(expCounter.v)}${tail}`;
        },
      });

      if (newlyDiscovered.length > 0) {
        const names = newlyDiscovered
          .map((cid) => PET_MAP.get(cid)?.name ?? cid)
          .join('、');
        const discoverText = new PIXI.Text(
          `已收录入宠物池：${names}\n可在召唤/商店中获取`,
          { fontSize: 24, fill: 0xffd75e, align: 'center', fontWeight: 'bold' },
        );
        discoverText.anchor.set(0.5);
        discoverText.position.set(0, 140);
        discoverText.alpha = 0;
        panel.addChild(discoverText);
        TweenManager.to({
          target: discoverText, props: { alpha: 1 },
          duration: 0.4, delay: 0.6, ease: Ease.easeOutCubic,
        });
      }
    } else {
      const refundLine = defeatRefund > 0 ? `\n保底经验 +${defeatRefund}` : '';
      const tip = new PIXI.Text(
        `提示：消除克制敌人属性的珠子伤害 ×1.6${refundLine}`,
        { fontSize: 26, fill: 0x9b8cc4, align: 'center' },
      );
      tip.anchor.set(0.5);
      tip.position.set(0, -110);
      panel.addChild(tip);

      const fails = BattleResultOverlay._failCounts.get(ctrl.stage.id) ?? 0;
      if (fails >= 2) {
        const guide = new PIXI.Text('卡关了？试试提升战力：', {
          fontSize: 24, fill: 0xffd75e, align: 'center',
        });
        guide.anchor.set(0.5);
        guide.position.set(0, -54);
        panel.addChild(guide);

        const entries: { label: string; scene: string }[] = [
          { label: '召唤', scene: 'gacha' },
          { label: '商店', scene: 'shop' },
          { label: '编队', scene: 'team' },
        ];
        const gw = 150;
        const gap = 16;
        const totalW = entries.length * gw + (entries.length - 1) * gap;
        entries.forEach((en, i) => {
          const gx = -totalW / 2 + gw / 2 + i * (gw + gap);
          const gb = makeButton(en.label, gw, 64, 0x8c5ad6, () => {
            SceneManager.switchTo(en.scene);
          });
          gb.position.set(gx, 6);
          panel.addChild(gb);
        });
      }
    }

    const nextStage = STAGES.find(
      (s) => s.chapter === ctrl.stage.chapter && s.index === ctrl.stage.index + 1,
    );
    let btnY = 110;
    if (win && nextStage) {
      const nextBtn = makeButton('下一关', 320, 76, 0xe8554d, () => {
        SceneManager.switchTo('team', { stageId: nextStage.id } satisfies TeamEnterData);
      });
      nextBtn.position.set(0, btnY);
      panel.addChild(nextBtn);
      btnY += 96;
    }
    const retryBtn = makeButton(win ? '再打一次' : '重试', 320, 76, win ? 0x4a3a72 : 0xe8554d, () => {
      SceneManager.switchTo('battle', { stageId: ctrl.stage.id } satisfies BattleEnterData);
    });
    retryBtn.position.set(0, btnY);
    panel.addChild(retryBtn);
    btnY += 96;
    const homeBtn = makeButton('返回主页', 320, 76, 0x4a3a72, () => {
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
}
