/**
 * 战斗结算浮层 — 对齐 battle_victory / battle_defeat UI prototype v2
 * 轻量奶油金边卡片：胜局星级+奖励；败局提示+战力引导+看广告复活。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager } from '@/core/SceneManager';
import { TweenManager, Ease } from '@/core/TweenManager';
import { TextureCache } from '@/core/TextureCache';
import { getPetAvatarTexture } from '@/config/petAvatarTexture';
import { STAGES } from '@/balance/stages';
import { PET_MAP } from '@/balance/pets';
import { UI_IMAGES, petAvatarPath } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import { Platform } from '@/core/PlatformService';
import type { BattleController } from '@/game/battle/BattleController';
import { formatStarTurnHint } from '@/formulas/stars';
import {
  COLORS, FONT_SIZE,
  makeActionButton, makePanel, makeText, makeStarRow, makeIconLabel,
} from '@/ui';
import type { BattleEnterData } from '../BattleScene';
import type { TeamEnterData } from '../TeamScene';
import { battleProgressHint } from './battleProgressHints';
import { analytics } from '@/analytics';
import { bindPointerTap } from '@/utils/bindPointerTap';

const PANEL_W = 600;
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

    // 先按内容估算高度，再画底板
    const content = new PIXI.Container();
    card.addChild(content);

    let y = 0;
    // 顶部探头灵宠
    const peek = this._makePeekMascot(ctrl);
    if (peek) {
      peek.position.set(0, y);
      content.addChild(peek);
      y += 36;
    }

    const title = makeText('战斗胜利！', {
      size: 46, fill: TITLE_BROWN, bold: true, anchor: 0.5,
    });
    title.position.set(0, y + 28);
    content.addChild(title);
    title.scale.set(0.35);
    TweenManager.to({
      target: title.scale, props: { x: 1, y: 1 },
      duration: 0.4, delay: 0.15, ease: Ease.easeOutBack,
    });
    y += 72;

    const stars = makeStarRow({
      star: result.stars, maxStar: 3, style: 'sprite',
      starSize: 54, gap: 16, anchor: 'center',
    });
    stars.position.set(0, y + 28);
    content.addChild(stars);
    y += 72;

    y = this._addTurnBlock(content, y, result.turnsUsed, ctrl.stage.starTurnLimit);
    y += 18;

    const rewardBox = this._buildRewardBox(result, milestoneLingyu);
    rewardBox.position.set(0, y + rewardBox.boxH / 2);
    content.addChild(rewardBox);
    y += rewardBox.boxH + 16;

    if (newlyUnlocked.length > 0) {
      const drop = this._buildDropLine(newlyUnlocked);
      drop.position.set(0, y + 18);
      content.addChild(drop);
      y += 44;
    }

    if (progressHintText) {
      const chip = this._makeInfoChip(progressHintText, 0xe8f6e4, 0x4e8a36);
      chip.position.set(0, y + 18);
      content.addChild(chip);
      y += 44;
    }

    y += 8;
    const btnW = 420;
    const btnH = 78;
    const btnGap = 14;
    const btns: PIXI.Container[] = [];
    if (nextStage) {
      btns.push(makeActionButton({
        title: '下一关', width: btnW, height: btnH, variant: 'gold',
        onTap: () => {
          this.clear();
          SceneManager.switchTo('team', { stageId: nextStage.id } satisfies TeamEnterData);
        },
      }));
    }
    btns.push(makeActionButton({
      title: '再打一次', width: btnW, height: btnH, variant: 'cream',
      onTap: () => {
        this.clear();
        SceneManager.switchTo('battle', { stageId: ctrl.stage.id } satisfies BattleEnterData);
      },
    }));
    btns.push(makeActionButton({
      title: '返回主页', width: btnW, height: btnH, variant: 'cream',
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

    const padY = 28;
    const panelH = y + padY * 2;
    const bg = makePanel({
      width: PANEL_W, height: panelH, radius: 28,
      bg: CREAM, bgAlpha: 0.98,
      border: GOLD, borderWidth: 2.5,
      centered: true,
    });
    card.addChildAt(bg, 0);
    // 轻云纹角饰
    card.addChildAt(this._cornerClouds(PANEL_W, panelH), 1);
    content.position.set(0, -panelH / 2 + padY);

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

    let y = 0;
    const title = makeText('战斗失败', {
      size: 46, fill: TITLE_BROWN, bold: true, anchor: 0.5,
    });
    title.position.set(0, y + 28);
    content.addChild(title);
    // 两侧星芒
    content.addChild(this._spark(-150, y + 28));
    content.addChild(this._spark(150, y + 28));
    y += 64;

    const sad = this._makeSadMascot();
    sad.position.set(0, y + 70);
    content.addChild(sad);
    y += 150;

    const tipRow = new PIXI.Container();
    const bang = new PIXI.Graphics();
    bang.beginFill(0xe8a33d, 1);
    bang.drawCircle(0, 0, 14);
    bang.endFill();
    tipRow.addChild(bang);
    tipRow.addChild(makeText('!', {
      size: 18, fill: 0xffffff, bold: true, anchor: 0.5,
    }));
    const tip = makeText('提示：消除克制属性珠子伤害更高', {
      size: FONT_SIZE.xs, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    });
    tip.position.set(22, 0);
    tipRow.addChild(tip);
    tipRow.position.set(-(tip.width + 22) / 2, y + 12);
    content.addChild(tipRow);
    y += 40;

    if (defeatRefund > 0) {
      const chip = this._makeInfoChip(`保底经验 +${defeatRefund}`, 0xeef8e4, REWARD_GREEN);
      chip.position.set(0, y + 16);
      content.addChild(chip);
      y += 40;
    }

    // 卡关引导（失败 ≥1 次即展示，对齐原型常驻）
    const guide = this._buildGrowthGuide((scene) => {
      commitDefeat(() => SceneManager.switchTo(scene));
    });
    guide.position.set(0, y + guide.boxH / 2);
    content.addChild(guide);
    y += guide.boxH + 18;

    const reviveW = 460;
    const reviveH = 88;
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
    y += reviveH + 16;

    const halfW = 210;
    const halfH = 72;
    const gap = 16;
    const retry = makeActionButton({
      title: '重试', width: halfW, height: halfH, variant: 'cream',
      onTap: () => commitDefeat(() => {
        SceneManager.switchTo('battle', { stageId: ctrl.stage.id } satisfies BattleEnterData);
      }),
    });
    retry.position.set(-(halfW + gap) / 2, y + halfH / 2);
    content.addChild(retry);

    const home = makeActionButton({
      title: '返回主页', width: halfW, height: halfH, variant: 'cream',
      onTap: () => commitDefeat(() => SceneManager.switchTo('title')),
    });
    home.position.set((halfW + gap) / 2, y + halfH / 2);
    content.addChild(home);
    y += halfH;

    const padY = 28;
    const panelH = y + padY * 2;
    const bg = makePanel({
      width: PANEL_W, height: panelH, radius: 28,
      bg: CREAM, bgAlpha: 0.98,
      border: GOLD, borderWidth: 2.5,
      centered: true,
    });
    card.addChildAt(bg, 0);
    card.addChildAt(this._cornerClouds(PANEL_W, panelH), 1);
    content.position.set(0, -panelH / 2 + padY);

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
    const line = new PIXI.Graphics();
    line.lineStyle(1.5, GOLD_SOFT, 0.9);
    line.moveTo(-180, 0);
    line.lineTo(-40, 0);
    line.moveTo(40, 0);
    line.lineTo(180, 0);
    // 小菱形
    const diamond = (x: number) => {
      line.beginFill(GOLD, 1);
      line.moveTo(x, -5);
      line.lineTo(x + 5, 0);
      line.lineTo(x, 5);
      line.lineTo(x - 5, 0);
      line.closePath();
      line.endFill();
    };
    diamond(-40);
    diamond(40);
    line.position.set(0, y + 14);
    parent.addChild(line);

    const turn = makeText(`回合数 ${turns}`, {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: 0.5,
    });
    turn.position.set(0, y + 14);
    parent.addChild(turn);

    const hint = makeText(`（${formatStarTurnHint(starTurnLimit)}）`, {
      size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: 0.5,
    });
    hint.position.set(0, y + 40);
    parent.addChild(hint);
    return y + 56;
  }

  private _buildRewardBox(
    result: ReturnType<BattleController['finish']>,
    milestoneLingyu: number,
  ): PIXI.Container & { boxH: number } {
    const box = new PIXI.Container() as PIXI.Container & { boxH: number };
    const innerW = PANEL_W - 72;
    const rows: PIXI.Container[] = [];

    const coinRow = this._rewardRow(
      UI_IMAGES.iconCoin,
      `+${result.coins}`,
      REWARD_GREEN,
      `持有 ${PlayerData.coins}`,
    );
    rows.push(coinRow);

    const expRow = this._rewardRow(UI_IMAGES.iconExp, `+${result.exp}`, REWARD_GREEN);
    rows.push(expRow);

    for (const shard of result.shards) {
      const pet = PET_MAP.get(shard.petId);
      rows.push(this._rewardRow(
        petAvatarPath(shard.petId, 1),
        `×${shard.count}`,
        0x6b5cff,
        pet ? `${pet.name}碎片` : '碎片',
      ));
    }
    if (milestoneLingyu > 0) {
      rows.push(this._rewardRow(UI_IMAGES.iconLingyu, `+${milestoneLingyu}`, COLORS.textTitle));
    }

    const rowH = 52;
    const pad = 16;
    const headH = 36;
    const boxH = pad + headH + rows.length * rowH + pad;
    box.boxH = boxH;

    box.addChild(makePanel({
      width: innerW, height: boxH, radius: 16,
      bg: CREAM_INSET, bgAlpha: 0.95,
      border: GOLD_SOFT, borderWidth: 1.5,
      centered: true,
    }));

    const head = makeText('◆  获得奖励  ◆', {
      size: FONT_SIZE.xs, fill: COLORS.textSub, bold: true, anchor: 0.5,
    });
    head.position.set(0, -boxH / 2 + pad + headH / 2);
    box.addChild(head);

    rows.forEach((row, i) => {
      row.position.set(0, -boxH / 2 + pad + headH + i * rowH + rowH / 2);
      box.addChild(row);
    });
    return box;
  }

  private _rewardRow(
    iconPath: string,
    value: string,
    valueFill: number,
    holdHint?: string,
  ): PIXI.Container {
    const row = new PIXI.Container();
    const innerW = PANEL_W - 100;
    row.addChild(makePanel({
      width: innerW, height: 46, radius: 10,
      bg: 0xfffdf8, bgAlpha: 0.9,
      border: 0xe8d4a8, borderWidth: 1,
      centered: true,
    }));

    const label = makeIconLabel({
      iconPath,
      iconSize: 34,
      text: value,
      size: FONT_SIZE.sm,
      fill: valueFill,
      bold: true,
      gap: 10,
    });
    label.position.set(-innerW / 2 + 18, 0);
    // IconLabel 原点在左缘中心
    row.addChild(label);

    if (holdHint) {
      const pill = new PIXI.Container();
      const t = makeText(holdHint, {
        size: 13, fill: COLORS.textSub, bold: true, anchor: 0.5,
      });
      try { t.updateText(true); } catch { /* noop */ }
      const pw = Math.ceil(t.width) + 20;
      const ph = 26;
      pill.addChild(makePanel({
        width: pw, height: ph, radius: ph / 2,
        bg: 0xefe4ce, bgAlpha: 0.95,
        border: 0xe0c896, borderWidth: 1,
        centered: true,
      }));
      pill.addChild(t);
      pill.position.set(innerW / 2 - pw / 2 - 12, 0);
      row.addChild(pill);
    }
    return row;
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
    const boxH = 150;
    box.boxH = boxH;
    box.addChild(makePanel({
      width: innerW, height: boxH, radius: 16,
      bg: CREAM_INSET, bgAlpha: 0.96,
      border: GOLD_SOFT, borderWidth: 1.5,
      centered: true,
    }));

    const head = makeText('卡关了？试试提升战力', {
      size: FONT_SIZE.xs, fill: COLORS.textMain, bold: true, anchor: 0.5,
    });
    head.position.set(0, -boxH / 2 + 22);
    box.addChild(head);

    const entries: { label: string; icon: string; scene: string }[] = [
      { label: '召唤', icon: UI_IMAGES.iconRecruit, scene: 'gacha' },
      { label: '商店', icon: UI_IMAGES.navShop, scene: 'shop' },
      { label: '编队', icon: UI_IMAGES.navTeam, scene: 'team' },
    ];
    const gap = 100;
    const startX = -((entries.length - 1) * gap) / 2;
    entries.forEach((en, i) => {
      const item = new PIXI.Container();
      item.position.set(startX + i * gap, 18);
      const disc = new PIXI.Graphics();
      disc.beginFill(0xfffdf8, 1);
      disc.lineStyle(2, GOLD, 1);
      disc.drawCircle(0, 0, 28);
      disc.endFill();
      item.addChild(disc);
      const tex = TextureCache.get(en.icon);
      if (tex) {
        const sp = new PIXI.Sprite(tex);
        sp.anchor.set(0.5);
        sp.width = 36;
        sp.height = 36;
        item.addChild(sp);
      }
      const lab = makeText(en.label, {
        size: FONT_SIZE.xxs, fill: COLORS.textMain, bold: true, anchor: 0.5,
      });
      lab.position.set(0, 44);
      item.addChild(lab);
      item.eventMode = 'static';
      item.cursor = 'pointer';
      item.hitArea = new PIXI.Rectangle(-36, -36, 72, 90);
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

  private _makePeekMascot(ctrl: BattleController): PIXI.Container | null {
    const pet = ctrl.team[0]?.def;
    if (!pet) return null;
    const c = new PIXI.Container();
    const tex = getPetAvatarTexture(pet.id, 1);
    if (!tex) return null;
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5, 1);
    const size = 88;
    const cover = size / Math.max(tex.width, tex.height);
    sp.scale.set(cover);
    c.addChild(sp);
    return c;
  }

  /** 失败页：简笔委屈灵宠 + 蔫花（无独立立绘时的轻量占位） */
  private _makeSadMascot(): PIXI.Container {
    const c = new PIXI.Container();
    const g = new PIXI.Graphics();
    // 身体
    g.beginFill(0x5cb8b0, 1);
    g.drawEllipse(0, 10, 48, 42);
    g.endFill();
    // 角
    g.beginFill(0xf0d48a, 1);
    g.moveTo(-18, -28); g.lineTo(-10, -48); g.lineTo(-4, -26); g.closePath();
    g.moveTo(18, -28); g.lineTo(10, -48); g.lineTo(4, -26); g.closePath();
    g.endFill();
    // 眼（委屈）
    g.lineStyle(3, 0x2a3a3a, 1);
    g.moveTo(-18, -2); g.lineTo(-8, 2);
    g.moveTo(18, -2); g.lineTo(8, 2);
    // 泪
    g.lineStyle(0);
    g.beginFill(0x7ec8ff, 0.9);
    g.drawEllipse(-14, 12, 4, 8);
    g.drawEllipse(14, 12, 4, 8);
    g.endFill();
    // 蔫花
    g.beginFill(0x7a9a4a, 1);
    g.drawEllipse(62, 8, 16, 10);
    g.endFill();
    g.lineStyle(3, 0x5a7a3a, 1);
    g.moveTo(62, 18); g.quadraticCurveTo(70, 40, 58, 52);
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
