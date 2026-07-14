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
import { UI_IMAGES, UI_PANEL_IMAGES, petAvatarPath } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import { Platform } from '@/core/PlatformService';
import type { BattleController } from '@/game/battle/BattleController';
import { formatStarTurnHint } from '@/formulas/stars';
import {
  COLORS, FONT_FAMILY_DISPLAY, FONT_SIZE,
  makeActionButton, makePanel, makeText, makeStarRow,
} from '@/ui';
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
export interface BattleResultHooks {
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
    battleStartedAt = 0,
    hooks: BattleResultHooks = {},
  ): void {
    this.clear();
    this._open = true;

    const durationMs = battleStartedAt > 0 ? Date.now() - battleStartedAt : 0;

    if (win) {
      this._showVictory(ctrl, durationMs);
    } else {
      this._showDefeat(ctrl, durationMs, hooks);
    }
  }

  private _showVictory(ctrl: BattleController, durationMs: number): void {
    const result = ctrl.finish(true);
    let milestoneLingyu = 0;
    const newlyUnlocked: string[] = [];
    milestoneLingyu = PlayerData.recordClear(ctrl.stage.id, result.stars, result.coins);
    PlayerData.addExp(result.exp);
    for (const s of result.shards) PlayerData.addShards(s.petId, s.count);
    for (const pid of result.bossDropPets) {
      if (PlayerData.unlockPet(pid)) newlyUnlocked.push(pid);
    }
    BattleResultOverlay._failCounts.delete(ctrl.stage.id);

    analytics.trackLevelClear(ctrl.stage.id, {
      durationMs,
      turnsUsed: result.turnsUsed,
      stars: result.stars,
      stageName: ctrl.stage.name,
    });

    const progressHintText = battleProgressHint(ctrl.stage.id, milestoneLingyu > 0);
    const nextStage = STAGES.find(
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
      fontFamily: FONT_FAMILY_DISPLAY,
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

    const rewardBox = this._buildRewardBox(result, milestoneLingyu);
    rewardBox.position.set(0, y + rewardBox.boxH / 2);
    content.addChild(rewardBox);
    y += rewardBox.boxH + 14;

    if (newlyUnlocked.length > 0) {
      const drop = this._buildDropLine(newlyUnlocked);
      drop.position.set(0, y + 18);
      content.addChild(drop);
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
    const btns: PIXI.Container[] = [];
    if (nextStage) {
      btns.push(makeActionButton({
        title: '下一关', width: btnW, height: btnH, variant: 'gold',
        fontSize: FONT_SIZE.md,
        onTap: () => {
          this.clear();
          SceneManager.switchTo('team', { stageId: nextStage.id } satisfies TeamEnterData);
        },
      }));
    }
    btns.push(makeActionButton({
      title: '再打一次', width: btnW, height: btnH, variant: 'cream',
      fontSize: FONT_SIZE.md,
      onTap: () => {
        this.clear();
        SceneManager.switchTo('battle', { stageId: ctrl.stage.id } satisfies BattleEnterData);
      },
    }));
    btns.push(makeActionButton({
      title: '返回主页', width: btnW, height: btnH, variant: 'cream',
      fontSize: FONT_SIZE.md,
      onTap: () => {
        this.clear();
        SceneManager.switchTo('title');
      },
    }));
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
    this._playCardEnter(card, panelH);
  }

  private _showDefeat(
    ctrl: BattleController,
    durationMs: number,
    hooks: BattleResultHooks,
  ): void {
    const defeatRefund = ctrl.defeatExpRefund();
    const fails = (BattleResultOverlay._failCounts.get(ctrl.stage.id) ?? 0) + 1;

    const commitDefeat = (navigate: () => void): void => {
      BattleResultOverlay._failCounts.set(ctrl.stage.id, fails);
      if (defeatRefund > 0) PlayerData.addExp(defeatRefund);
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
      fontFamily: FONT_FAMILY_DISPLAY,
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
      fontFamily: FONT_FAMILY_DISPLAY,
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
    const reviveBtn = this._makeReviveButton(reviveW, reviveH, async () => {
      const ok = await Platform.showRewardedVideo();
      if (!ok) {
        Platform.showToast('广告未完成，请重试');
        return;
      }
      this.clear();
      hooks.onRevive?.();
    });
    reviveBtn.position.set(0, y + reviveH / 2);
    content.addChild(reviveBtn);
    y += reviveH + 14;

    const halfGap = 14;
    const halfW = Math.round((reviveW - halfGap) / 2);
    const halfH = Math.round(halfW / BTN_ASPECT);
    const retry = makeActionButton({
      title: '重试', width: halfW, height: halfH, variant: 'cream',
      fontSize: FONT_SIZE.md,
      onTap: () => commitDefeat(() => {
        SceneManager.switchTo('battle', { stageId: ctrl.stage.id } satisfies BattleEnterData);
      }),
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
      fontFamily: FONT_FAMILY_DISPLAY,
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
      fontFamily: FONT_FAMILY_DISPLAY,
    });
    hint.position.set(0, turnY + 30);
    parent.addChild(hint);
    return y + 64;
  }

  private _buildRewardBox(
    result: ReturnType<BattleController['finish']>,
    milestoneLingyu: number,
  ): PIXI.Container & { boxH: number } {
    const box = new PIXI.Container() as PIXI.Container & { boxH: number };
    const innerW = PANEL_W - 64;
    const items: {
      iconPath: string;
      name: string;
      amount: string;
      amountFill: number;
      holdHint?: string;
    }[] = [
      {
        iconPath: UI_IMAGES.iconCoin,
        name: '灵宠币',
        amount: `+${result.coins}`,
        amountFill: 0xe8872a,
        holdHint: `持有 ${PlayerData.coins}`,
      },
      {
        iconPath: UI_IMAGES.iconExp,
        name: '经验',
        amount: `+${result.exp}`,
        amountFill: REWARD_GREEN,
      },
    ];
    for (const shard of result.shards.slice(0, 1)) {
      items.push({
        iconPath: petAvatarPath(shard.petId, 1),
        name: '灵宠碎片',
        amount: `×${shard.count}`,
        amountFill: 0x7a5cff,
      });
    }
    if (milestoneLingyu > 0 && items.length < 3) {
      items.push({
        iconPath: UI_IMAGES.iconLingyu,
        name: '灵玉',
        amount: `+${milestoneLingyu}`,
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
      fontFamily: FONT_FAMILY_DISPLAY,
    });
    head.position.set(0, -boxH / 2 + pad + headH / 2);
    box.addChild(head);

    const rowY = -boxH / 2 + pad + headH + cardH / 2;
    const totalW = items.length * cardW + (items.length - 1) * gap;
    let x0 = -totalW / 2 + cardW / 2;
    items.forEach((it) => {
      const card = this._rewardCard(
        it.iconPath, it.name, it.amount, it.amountFill, cardW, cardH, it.holdHint,
      );
      card.position.set(x0, rowY);
      box.addChild(card);
      x0 += cardW + gap;
    });
    return box;
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
  ): PIXI.Container {
    const card = new PIXI.Container();
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
      fontFamily: FONT_FAMILY_DISPLAY,
      wordWrapWidth: w / 2 - 4,
    });
    nameT.position.set(textX, contentTop - 16);
    card.addChild(nameT);

    const amt = makeText(amount, {
      size: FONT_SIZE.md, fill: amountFill, bold: true, anchor: [0, 0.5],
      fontFamily: FONT_FAMILY_DISPLAY,
    });
    amt.position.set(textX, contentTop + 14);
    card.addChild(amt);

    if (holdHint) {
      const t = makeText(holdHint, {
        size: 13, fill: COLORS.textSub, bold: true, anchor: 0.5,
        fontFamily: FONT_FAMILY_DISPLAY,
      });
      try { t.updateText(true); } catch { /* noop */ }
      const pw = Math.min(w - 12, Math.ceil(t.width) + 18);
      const ph = 24;
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
    }
    return card;
  }

  private _buildDropLine(ids: string[]): PIXI.Container {
    const c = new PIXI.Container();
    const names = ids.map((pid) => PET_MAP.get(pid)?.name ?? pid).join('、');
    c.addChild(makeText(`${names} · 获得灵宠`, {
      size: FONT_SIZE.xs, fill: COLORS.accentDeep, bold: true, anchor: 0.5,
    }));
    return c;
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
      fontFamily: FONT_FAMILY_DISPLAY,
    });
    head.position.set(0, -boxH / 2 + 24);
    box.addChild(head);

    const entries: { label: string; icon: string; scene: string }[] = [
      { label: '召唤', icon: UI_IMAGES.iconRecruit, scene: 'gacha' },
      { label: '商店', icon: UI_IMAGES.navShop, scene: 'shop' },
      { label: '编队', icon: UI_IMAGES.navTeam, scene: 'team' },
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
        fontFamily: FONT_FAMILY_DISPLAY,
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
      fontFamily: FONT_FAMILY_DISPLAY,
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
