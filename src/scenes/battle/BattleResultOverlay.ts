/**
 * 战斗结算浮层：胜/负面板、星级、奖励滚动入账、收录提示、卡关引导，以及失败/重试/下一关导航。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager } from '@/core/SceneManager';
import { TweenManager, Ease } from '@/core/TweenManager';
import { TextureCache } from '@/core/TextureCache';
import { getPetAvatarTexture } from '@/config/petAvatarTexture';
import { STAGES } from '@/balance/stages';
import { PET_MAP } from '@/balance/pets';
import { UI_PANEL_IMAGES, UI_IMAGES, petAvatarPath } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import type { BattleController } from '@/game/battle/BattleController';
import { makeButton } from './battleWidgets';
import { formatStarTurnHint } from '@/formulas/stars';
import { makeIconLabel, type IconLabelHandle } from '@/ui/IconLabel';
import { COLORS } from '@/ui/theme';
import type { BattleEnterData } from '../BattleScene';
import type { TeamEnterData } from '../TeamScene';
import { battleProgressHint } from './battleProgressHints';

const PANEL_W = 560;
const PANEL_H_DEFAULT = 820;
const BTN_W = 300;
const BTN_H = 68;
const BTN_GAP = 14;

/** 金框内胆：顶部/底部留给 ornate 边框，内容不得超出 */
const FRAME_INSET_TOP = 0.12;
const FRAME_INSET_BOTTOM = 0.14;

/** 文案区固定间距（避免面板偏高时被均匀拉稀） */
const WIN_GAP_TITLE_STARS = 50;
const WIN_GAP_STARS_DETAIL = 42;
const WIN_GAP_DETAIL_REWARDS = 40;
const WIN_REWARD_ROW_GAP = 40;
const WIN_GAP_REWARDS_DISCOVER = 20;
const REWARD_ICON_SIZE = 36;
const SHARD_ICON_SIZE = 40;

interface WinLayout {
  title: number;
  stars: number;
  detail: number;
  rewardYs: number[];
  discover: number;
  progressHint: number;
  buttonYs: number[];
}

export class BattleResultOverlay {
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
    mask.eventMode = 'static';
    this._overlayLayer.addChild(mask);

    const { panelH, fitScale } = this._panelMetrics(win);
    const nextStage = STAGES.find(
      (s) => s.chapter === ctrl.stage.chapter && s.index === ctrl.stage.index + 1,
    );
    const btnCount = (win && nextStage ? 1 : 0) + 2;
    const rewardRowCount = win
      ? 2 + result.shards.length + (milestoneLingyu > 0 ? 1 : 0)
      : 0;
    const progressHintText = win
      ? battleProgressHint(ctrl.stage.id, milestoneLingyu > 0)
      : null;
    const winLayout = win
      ? this._computeWinLayout(panelH, {
        btnCount,
        rewardRowCount,
        hasDiscover: newlyDiscovered.length > 0,
        hasProgressHint: !!progressHintText,
      })
      : null;

    const panel = new PIXI.Container();
    panel.addChild(this._makePanelBg(win, panelH));

    if (win && winLayout) {
      this._buildWinContent(
        panel, ctrl, result, milestoneLingyu, newlyDiscovered, progressHintText, winLayout,
      );
      this._buildNavButtons(panel, ctrl, win, winLayout.buttonYs);
    } else {
      this._buildLoseContent(panel, ctrl, defeatRefund, panelH);
      this._buildNavButtons(panel, ctrl, win, this._loseButtonYs(panelH, btnCount));
    }

    panel.position.set(w / 2, h / 2 - 16);
    const enterScale = 0.6 * fitScale;
    panel.scale.set(enterScale);
    panel.alpha = 0;
    this._overlayLayer.addChild(panel);
    TweenManager.to({
      target: panel.scale, props: { x: fitScale, y: fitScale },
      duration: 0.25, ease: Ease.easeOutBack,
    });
    TweenManager.to({ target: panel, props: { alpha: 1 }, duration: 0.2 });
  }

  private _panelMetrics(win: boolean): { panelH: number; fitScale: number } {
    const tex = win ? TextureCache.get(UI_PANEL_IMAGES.battleVictory) : null;
    const panelH = tex ? PANEL_W * (tex.height / tex.width) : PANEL_H_DEFAULT;
    const fitScale = Math.min(1, (Game.logicHeight * 0.78) / panelH);
    return { panelH, fitScale };
  }

  /** 奖励区自上而下排布，按钮贴金框底部 */
  private _computeWinLayout(
    panelH: number,
    opts: { btnCount: number; rewardRowCount: number; hasDiscover: boolean; hasProgressHint: boolean },
  ): WinLayout {
    const half = panelH / 2;
    const innerTop = -half + panelH * FRAME_INSET_TOP;
    const innerBottom = half - panelH * FRAME_INSET_BOTTOM;

    let y = innerTop + 38;
    const title = y;
    y += WIN_GAP_TITLE_STARS;
    const stars = y;
    y += WIN_GAP_STARS_DETAIL;
    const detail = y;

    const btnBlock = opts.btnCount * BTN_H + (opts.btnCount - 1) * BTN_GAP;
    const buttonYs = Array.from(
      { length: opts.btnCount },
      (_, i) => innerBottom - 14 - btnBlock + BTN_H / 2 + i * (BTN_H + BTN_GAP),
    );

    const rewardYs = Array.from(
      { length: opts.rewardRowCount },
      (_, i) => detail + WIN_GAP_DETAIL_REWARDS + i * WIN_REWARD_ROW_GAP,
    );

    const lastRewardY = rewardYs.length > 0
      ? rewardYs[rewardYs.length - 1]
      : detail;
    const discover = opts.hasDiscover
      ? lastRewardY + WIN_GAP_REWARDS_DISCOVER + 24
      : lastRewardY;
    const tailY = opts.hasDiscover ? discover + 52 : lastRewardY;
    const progressHint = opts.hasProgressHint
      ? tailY + (opts.hasDiscover ? 16 : WIN_GAP_REWARDS_DISCOVER + 28)
      : tailY;

    return { title, stars, detail, rewardYs, discover, progressHint, buttonYs };
  }

  private _placeIconRow(panel: PIXI.Container, row: IconLabelHandle, y: number): void {
    row.position.set(-row.width / 2, y);
    panel.addChild(row);
  }

  private _loseButtonYs(panelH: number, btnCount: number): number[] {
    const half = panelH / 2;
    const innerBottom = half - panelH * FRAME_INSET_BOTTOM;
    const btnBlock = btnCount * BTN_H + (btnCount - 1) * BTN_GAP;
    const firstBtnY = innerBottom - 8 - btnBlock + BTN_H / 2;
    return Array.from({ length: btnCount }, (_, i) => firstBtnY + i * (BTN_H + BTN_GAP));
  }

  private _makePanelBg(win: boolean, panelH: number): PIXI.Container {
    const bg = new PIXI.Container();
    if (win) {
      const tex = TextureCache.get(UI_PANEL_IMAGES.battleVictory);
      if (tex) {
        const sprite = new PIXI.Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.width = PANEL_W;
        sprite.height = panelH;
        bg.addChild(sprite);
        return bg;
      }
    }
    const g = new PIXI.Graphics();
    g.beginFill(win ? 0xfdf3df : 0x2e2148);
    g.lineStyle(3, win ? 0xc9822a : 0x5a4a82);
    g.drawRoundedRect(-PANEL_W / 2, -panelH / 2, PANEL_W, panelH, 28);
    g.endFill();
    bg.addChild(g);
    return bg;
  }

  private _buildWinContent(
    panel: PIXI.Container,
    ctrl: BattleController,
    result: ReturnType<BattleController['finish']>,
    milestoneLingyu: number,
    newlyDiscovered: string[],
    progressHintText: string | null,
    layout: WinLayout,
  ): void {
    const title = new PIXI.Text('战斗胜利！', {
      fontSize: 48, fill: COLORS.textTitle, fontWeight: 'bold',
      stroke: 0xfdf3df, strokeThickness: 4,
    });
    title.anchor.set(0.5);
    title.position.set(0, layout.title);
    panel.addChild(title);
    title.scale.set(0.2);
    TweenManager.to({
      target: title.scale, props: { x: 1, y: 1 },
      duration: 0.4, delay: 0.25, ease: Ease.easeOutBack,
    });

    const starText = new PIXI.Text(
      '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars),
      { fontSize: 50, fill: COLORS.accent },
    );
    starText.anchor.set(0.5);
    starText.position.set(0, layout.stars);
    panel.addChild(starText);

    const detail = new PIXI.Text(
      `回合数 ${result.turnsUsed}（${formatStarTurnHint(ctrl.stage.starTurnLimit)}）`,
      { fontSize: 22, fill: COLORS.textSub },
    );
    detail.anchor.set(0.5);
    detail.position.set(0, layout.detail);
    panel.addChild(detail);

    let rowIdx = 0;
    const nextRewardY = (): number => layout.rewardYs[rowIdx++];

    const coinRow = makeIconLabel({
      iconPath: UI_IMAGES.iconCoin,
      iconSize: REWARD_ICON_SIZE,
      caption: '灵宠币',
      captionFill: COLORS.textSub,
      text: `+0（持有 ${PlayerData.coins}）`,
      size: 24,
      fill: COLORS.textTitle,
    });
    this._placeIconRow(panel, coinRow, nextRewardY());
    const coinCounter = { v: 0 };
    TweenManager.to({
      target: coinCounter, props: { v: result.coins },
      duration: 0.5, delay: 0.3, ease: Ease.easeOutCubic,
      onUpdate: () => {
        coinRow.setText(`+${Math.round(coinCounter.v)}（持有 ${PlayerData.coins}）`);
        coinRow.position.x = -coinRow.width / 2;
      },
    });

    const expRow = makeIconLabel({
      iconPath: UI_IMAGES.iconExp,
      iconSize: REWARD_ICON_SIZE,
      caption: '经验',
      captionFill: COLORS.textSub,
      text: '+0',
      size: 24,
      fill: 0x4a8a62,
    });
    this._placeIconRow(panel, expRow, nextRewardY());
    const expCounter = { v: 0 };
    TweenManager.to({
      target: expCounter, props: { v: result.exp },
      duration: 0.5, delay: 0.3, ease: Ease.easeOutCubic,
      onUpdate: () => {
        expRow.setText(`+${Math.round(expCounter.v)}`);
        expRow.position.x = -expRow.width / 2;
      },
    });

    for (const shard of result.shards) {
      const pet = PET_MAP.get(shard.petId);
      const shardRow = makeIconLabel({
        iconPath: petAvatarPath(shard.petId, 1),
        iconSize: SHARD_ICON_SIZE,
        caption: `${pet?.name ?? shard.petId}碎片`,
        captionFill: COLORS.textSub,
        text: `×${shard.count}`,
        size: 24,
        fill: 0x4a8a62,
      });
      this._placeIconRow(panel, shardRow, nextRewardY());
    }

    if (milestoneLingyu > 0) {
      const lingyuRow = makeIconLabel({
        iconPath: UI_IMAGES.iconLingyu,
        iconSize: REWARD_ICON_SIZE,
        caption: '灵玉',
        captionFill: COLORS.textSub,
        text: `+${milestoneLingyu}`,
        size: 24,
        fill: COLORS.textTitle,
      });
      this._placeIconRow(panel, lingyuRow, nextRewardY());
    }

    if (newlyDiscovered.length > 0) {
      const iconSize = 48;
      const gap = 10;
      const rowW = newlyDiscovered.length * iconSize + (newlyDiscovered.length - 1) * gap;
      let ix = -rowW / 2 + iconSize / 2;
      const rowY = layout.discover;
      for (const cid of newlyDiscovered) {
        const tex = getPetAvatarTexture(cid, 1);
        if (tex) {
          const sp = new PIXI.Sprite(tex);
          sp.anchor.set(0.5, 1);
          const dw = iconSize - 4;
          sp.width = dw;
          sp.height = dw * (tex.height / tex.width);
          sp.position.set(ix, rowY + iconSize / 2 - 2);
          sp.alpha = 0;
          panel.addChild(sp);
          TweenManager.to({
            target: sp, props: { alpha: 1 },
            duration: 0.35, delay: 0.55, ease: Ease.easeOutCubic,
          });
        }
        ix += iconSize + gap;
      }

      const names = newlyDiscovered.map((cid) => PET_MAP.get(cid)?.name ?? cid).join('、');
      const discoverLine = new PIXI.Text(`${names} · 已进召唤池`, {
        fontSize: 20, fill: COLORS.accentDeep, align: 'center', fontWeight: 'bold',
      });
      discoverLine.anchor.set(0.5);
      discoverLine.position.set(0, rowY + iconSize / 2 + 18);
      discoverLine.alpha = 0;
      panel.addChild(discoverLine);

      TweenManager.to({
        target: discoverLine, props: { alpha: 1 },
        duration: 0.35, delay: 0.65, ease: Ease.easeOutCubic,
      });
    }

    if (progressHintText) {
      const hint = new PIXI.Text(progressHintText, {
        fontSize: 19, fill: COLORS.textTitle, align: 'center', fontWeight: 'bold', lineHeight: 26,
      });
      hint.anchor.set(0.5);
      hint.position.set(0, layout.progressHint);
      hint.alpha = 0;
      panel.addChild(hint);
      TweenManager.to({
        target: hint, props: { alpha: 1 },
        duration: 0.4, delay: 0.7, ease: Ease.easeOutCubic,
      });
    }
  }

  private _buildLoseContent(
    panel: PIXI.Container,
    ctrl: BattleController,
    defeatRefund: number,
    panelH: number,
  ): void {
    const half = panelH / 2;
    const innerTop = -half + panelH * FRAME_INSET_TOP;

    const title = new PIXI.Text('战斗失败…', {
      fontSize: 48, fill: 0xb0a5cc, fontWeight: 'bold',
      stroke: 0x2a2342, strokeThickness: 5,
    });
    title.anchor.set(0.5);
    title.position.set(0, innerTop + 48);
    panel.addChild(title);

    const refundLine = defeatRefund > 0 ? `\n保底经验 +${defeatRefund}` : '';
    const tip = new PIXI.Text(
      `提示：消除克制敌人属性的珠子伤害 ×1.6${refundLine}`,
      { fontSize: 22, fill: 0x9b8cc4, align: 'center', lineHeight: 30 },
    );
    tip.anchor.set(0.5);
    tip.position.set(0, innerTop + 130);
    panel.addChild(tip);

    const fails = BattleResultOverlay._failCounts.get(ctrl.stage.id) ?? 0;
    if (fails >= 2) {
      const guide = new PIXI.Text('卡关了？试试提升战力：', {
        fontSize: 20, fill: 0xffd75e, align: 'center',
      });
      guide.anchor.set(0.5);
      guide.position.set(0, innerTop + 200);
      panel.addChild(guide);

      const entries: { label: string; scene: string }[] = [
        { label: '召唤', scene: 'gacha' },
        { label: '商店', scene: 'shop' },
        { label: '编队', scene: 'team' },
      ];
      const gw = 140;
      const gap = 12;
      const totalW = entries.length * gw + (entries.length - 1) * gap;
      entries.forEach((en, i) => {
        const gx = -totalW / 2 + gw / 2 + i * (gw + gap);
        const gb = makeButton(en.label, gw, 56, 0x8c5ad6, () => {
          SceneManager.switchTo(en.scene);
        });
        gb.position.set(gx, innerTop + 260);
        panel.addChild(gb);
      });
    }
  }

  private _buildNavButtons(
    panel: PIXI.Container, ctrl: BattleController, win: boolean, buttonYs: number[],
  ): void {
    const nextStage = STAGES.find(
      (s) => s.chapter === ctrl.stage.chapter && s.index === ctrl.stage.index + 1,
    );

    const buttons: PIXI.Container[] = [];
    if (win && nextStage) {
      buttons.push(makeButton('下一关', BTN_W, BTN_H, 0xe8554d, () => {
        SceneManager.switchTo('team', { stageId: nextStage.id } satisfies TeamEnterData);
      }));
    }
    buttons.push(makeButton(win ? '再打一次' : '重试', BTN_W, BTN_H, win ? 0x4a3a72 : 0xe8554d, () => {
      SceneManager.switchTo('battle', { stageId: ctrl.stage.id } satisfies BattleEnterData);
    }));
    buttons.push(makeButton('返回主页', BTN_W, BTN_H, 0x4a3a72, () => {
      SceneManager.switchTo('title');
    }));

    buttonYs.forEach((y, i) => {
      buttons[i].position.set(0, y);
      panel.addChild(buttons[i]);
    });
  }
}
