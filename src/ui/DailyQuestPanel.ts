/**
 * 每日任务弹窗
 *
 * 布局：标题匾 → 活跃度条+4 宝箱 → 可拖任务列表 → 底提示。
 * CTA 三态：领取 / 前往 / 已领取；领取带资源飞顶栏。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager } from '@/core/SceneManager';
import { TweenManager, Ease } from '@/core/TweenManager';
import { EventBus } from '@/core/EventBus';
import { TextureCache } from '@/core/TextureCache';
import { Platform } from '@/core/PlatformService';
import { SfxManager } from '@/core/SfxManager';
import {
  DAILY_ACTIVITY_CAP,
  DAILY_ACTIVITY_CHESTS,
  type ActivityChestDef,
  type DailyQuestDef,
  type QuestTrigger,
} from '@/balance/dailyQuest';
import { formatReward, type RewardBundle } from '@/balance/rewards';
import { PlayerData } from '@/game/PlayerData';
import { grantReward } from '@/game/rewardGrant';
import { adUsesLeft, watchAd } from '@/game/adGate';
import { tryRequestSubscribe } from '@/game/subscribeGate';
import { AD_REWARD_MULT } from '@/balance/monetization';
import {
  canClaimActivityChest, hasClaimableQuest, isQuestDone, reportQuest, todayActivity, todayQuests,
} from '@/game/dailyQuestTracker';
import { analytics } from '@/analytics';
import { UI_IMAGES } from '@/config/Assets';
import { ensureAssets } from '@/config/Subpackages';
import {
  COLORS, FONT_SIZE,
  makeActionButton, makeCloseButton, makePanel, makeText, makeModalTitlePlaque, pulse,
} from '@/ui';
import { ScrollListController } from '@/ui/ScrollList';
import {
  playClaimBurst, playRewardFly, rewardFlyIcons,
} from './ResourceFlyFx';

const PANEL_W = 680;
const PANEL_H = 860;
const ROW_H = 96;
const ROW_GAP = 8;
const INNER_W = PANEL_W - 56;
const ACTIVITY_H = 118;
const LIST_BOTTOM_PAD = 36;

/** 翻倍已用哨兵：与任务 id 同存 questClaimed，跨日随日循环一起清 */
const questDoubleMark = (questId: string): string => `${questId}#x2`;

const QUEST_ICON: Readonly<Record<QuestTrigger, string>> = {
  login: UI_IMAGES.railDaily,
  stageClear: UI_IMAGES.navHome,
  staminaSpend: UI_IMAGES.iconStamina,
  comboReach: UI_IMAGES.iconStatAtk,
  gachaPull: UI_IMAGES.iconRecruit,
  realmClear: UI_IMAGES.navRealm,
  petLevelUp: UI_IMAGES.navPet,
  shopBuy: UI_IMAGES.navShop,
  towerFloor: UI_IMAGES.railTower,
};

const GO_SCENE: Readonly<Record<QuestTrigger, string>> = {
  login: 'title',
  stageClear: 'title',
  staminaSpend: 'title',
  comboReach: 'title',
  gachaPull: 'gacha',
  realmClear: 'realm',
  petLevelUp: 'codex',
  shopBuy: 'shop',
  towerFloor: 'tower',
};

export class DailyQuestPanel extends PIXI.Container {
  private _dim!: PIXI.Graphics;
  private _content!: PIXI.Container;
  private _body!: PIXI.Container;
  private _listHost: PIXI.Container | null = null;
  private _listContent: PIXI.Container | null = null;
  private _listMask: PIXI.Graphics | null = null;
  private readonly _scroll = new ScrollListController();
  private _fxLayer!: PIXI.Container;
  private _isOpen = false;
  private _busy = false;

  constructor() {
    super();
    this.visible = false;
    this.zIndex = 9500;
    this.eventMode = 'static';
    this._buildShell();
    EventBus.on('daily-quest:open', () => this.open());
    EventBus.on('daily-quest:close', () => this.close());
  }

  open(): void {
    if (this._isOpen) return;
    this._isOpen = true;
    this._busy = false;
    this.visible = true;
    reportQuest('login');
    this._refresh();
    this.alpha = 0;
    TweenManager.to({ target: this, props: { alpha: 1 }, duration: 0.2, ease: Ease.easeOutQuad });
    void this._hydrateAssets();
  }

  private async _hydrateAssets(): Promise<void> {
    const paths = [
      UI_IMAGES.iconLingyu, UI_IMAGES.iconCoin, UI_IMAGES.iconExp,
      UI_IMAGES.iconShard, UI_IMAGES.iconTicket, UI_IMAGES.iconStamina,
      UI_IMAGES.btnPlateSuccess, UI_IMAGES.btnPlateCream, UI_IMAGES.modalTitlePlaque,
      UI_IMAGES.navHome, UI_IMAGES.navRealm, UI_IMAGES.navPet, UI_IMAGES.navShop,
      UI_IMAGES.iconRecruit, UI_IMAGES.railTower, UI_IMAGES.iconStatAtk,
      UI_IMAGES.railDaily, UI_IMAGES.questChest,
    ];
    await ensureAssets(paths).catch((e) => {
      console.warn('[DailyQuest] 资源预热失败', e);
    });
    if (!this._isOpen) return;
    this._refresh();
  }

  close(): void {
    if (!this._isOpen || this._busy) return;
    this._isOpen = false;
    this._scroll.detach();
    TweenManager.to({
      target: this,
      props: { alpha: 0 },
      duration: 0.15,
      ease: Ease.easeInQuad,
      onComplete: () => { this.visible = false; },
    });
  }

  private _buildShell(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    this._dim = new PIXI.Graphics();
    this._dim.beginFill(0x000000, 0.62);
    this._dim.drawRect(0, 0, w, h);
    this._dim.endFill();
    this._dim.eventMode = 'static';
    this._dim.on('pointertap', () => this.close());
    this.addChild(this._dim);

    this._content = new PIXI.Container();
    this._content.position.set(w / 2, h / 2);
    this._content.eventMode = 'static';
    this._content.on('pointertap', (e) => e.stopPropagation());
    this.addChild(this._content);

    this._content.addChild(makePanel({
      width: PANEL_W, height: PANEL_H,
      bg: COLORS.panelBg, border: COLORS.panelBorder,
      borderWidth: 3, radius: 28, centered: true,
    }));

    const plaque = makeModalTitlePlaque({ text: '每日任务', panelWidth: PANEL_W });
    plaque.position.set(0, -PANEL_H / 2 + 18);
    this._content.addChild(plaque);

    const sub = makeText('每日 0 点刷新', {
      size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: 0.5,
    });
    sub.position.set(0, -PANEL_H / 2 + 92);
    this._content.addChild(sub);

    const closeBtn = makeCloseButton({ onTap: () => this.close() });
    closeBtn.position.set(PANEL_W / 2 - 36, -PANEL_H / 2 + 36);
    this._content.addChild(closeBtn);

    this._body = new PIXI.Container();
    this._content.addChild(this._body);

    this._fxLayer = new PIXI.Container();
    this.addChild(this._fxLayer);
  }

  private _clearListLayer(): void {
    this._scroll.detach();
    if (this._listHost) {
      this._listHost.removeChildren().forEach((c) => c.destroy({ children: true }));
      this._listHost.parent?.removeChild(this._listHost);
      if (!this._listHost.destroyed) this._listHost.destroy({ children: true });
    }
    this._listHost = null;
    this._listContent = null;
    this._listMask = null;
  }

  private _refresh(): void {
    this._body.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._clearListLayer();

    const quests = todayQuests();
    const activity = todayActivity();

    let y = -PANEL_H / 2 + 118;
    y = this._buildActivityHeader(y, activity) + 12;

    const tipY = PANEL_H / 2 - 28;
    const tip = makeText('完成任务攒活跃，开宝箱领大奖', {
      size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: 0.5,
    });
    tip.position.set(0, tipY);
    this._body.addChild(tip);

    // 列表视口：屏幕坐标，便于 ScrollList 与 mask 对齐
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const listLocalTop = y;
    const listScreenTop = h / 2 + listLocalTop;
    const listScreenBottom = h / 2 + tipY - LIST_BOTTOM_PAD;
    const viewportH = Math.max(120, listScreenBottom - listScreenTop);

    const host = new PIXI.Container();
    this.addChild(host);
    this._listHost = host;

    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawRoundedRect(w / 2 - INNER_W / 2, listScreenTop, INNER_W, viewportH, 12);
    mask.endFill();
    host.addChild(mask);
    this._listMask = mask;

    const list = new PIXI.Container();
    list.position.set(w / 2, listScreenTop);
    host.addChild(list);
    list.mask = mask;
    this._listContent = list;

    let rowY = ROW_H / 2;
    quests.forEach((quest) => {
      const row = this._makeQuestRow(quest);
      row.position.set(0, rowY);
      list.addChild(row);
      rowY += ROW_H + ROW_GAP;
    });
    const contentH = rowY - ROW_GAP / 2;
    const scrollMin = Math.min(
      listScreenTop,
      listScreenTop - Math.max(0, contentH - viewportH),
    );

    this._scroll.attach({
      content: () => this._listContent,
      viewportTop: listScreenTop,
      viewportH,
      scrollMin,
      listTop: listScreenTop,
      moveThreshold: 6,
    });
    // 列表后加，保证飞奖励层仍在最上
    this.setChildIndex(this._fxLayer, this.children.length - 1);
  }

  private _buildActivityHeader(y: number, activity: number): number {
    const bar = makePanel({
      width: INNER_W, height: ACTIVITY_H, radius: 18, centered: true,
      bg: 0xfff8ec, border: COLORS.panelBorderSoft, borderWidth: 2,
    });
    bar.position.set(0, y + ACTIVITY_H / 2);
    this._body.addChild(bar);

    const shown = Math.min(DAILY_ACTIVITY_CAP, activity);
    const label = makeText(`活跃度 ${shown}/${DAILY_ACTIVITY_CAP}`, {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    });
    label.position.set(-INNER_W / 2 + 18, y + 22);
    this._body.addChild(label);

    const canBatch = hasClaimableQuest();
    const claimAll = makeActionButton({
      title: '一键领取',
      width: 140,
      height: 40,
      variant: canBatch ? 'success' : 'cream',
      enabled: canBatch && !this._busy,
      fontSize: FONT_SIZE.xs,
      onTap: () => void this._claimAll(),
    });
    // 右缘留白，避免贴边/出框
    claimAll.position.set(INNER_W / 2 - 88, y + 22);
    this._body.addChild(claimAll);

    // 进度轨内缩：宝箱圆半径约 26，两端需给足边距，100 档才不会出框
    const trackPad = 40;
    const trackW = INNER_W - trackPad * 2;
    const trackX = -trackW / 2;
    const trackY = y + 72;
    const trackH = 14;
    const track = new PIXI.Graphics();
    track.beginFill(COLORS.trackBg, 1);
    track.drawRoundedRect(trackX, trackY - trackH / 2, trackW, trackH, trackH / 2);
    track.endFill();
    const ratio = Math.max(0, Math.min(1, shown / DAILY_ACTIVITY_CAP));
    if (ratio > 0.001) {
      track.beginFill(0x6dbf7a, 1);
      track.drawRoundedRect(
        trackX, trackY - trackH / 2,
        Math.max(trackW * ratio, trackH), trackH, trackH / 2,
      );
      track.endFill();
    }
    this._body.addChild(track);

    for (const chest of DAILY_ACTIVITY_CHESTS) {
      const cx = trackX + trackW * (chest.need / DAILY_ACTIVITY_CAP);
      this._body.addChild(this._makeChestNode(chest, cx, trackY));
    }

    return y + ACTIVITY_H;
  }

  private _makeChestNode(chest: ActivityChestDef, x: number, y: number): PIXI.Container {
    const claimed = PlayerData.isQuestClaimed(chest.id);
    const claimable = canClaimActivityChest(chest);
    const node = new PIXI.Container();
    node.position.set(x, y);

    const ring = new PIXI.Graphics();
    ring.beginFill(claimed ? 0xf0e6d4 : claimable ? 0xfff0c8 : 0xfffdf6, 1);
    ring.lineStyle(2.5, claimable ? 0xe8a33d : COLORS.panelBorderSoft, 1);
    ring.drawCircle(0, 0, 24);
    ring.endFill();
    node.addChild(ring);

    this._mountSprite(node, UI_IMAGES.questChest, 0, -2, 36, claimed ? 0.4 : 1);

    const need = makeText(`${chest.need}`, {
      size: 12,
      fill: claimed ? COLORS.textDisabled : COLORS.textSub,
      bold: true, anchor: 0.5,
    });
    need.position.set(0, 22);
    node.addChild(need);

    if (claimable) {
      node.eventMode = 'static';
      node.cursor = 'pointer';
      node.hitArea = new PIXI.Circle(0, 0, 26);
      node.on('pointertap', () => void this._claimChest(chest));
    } else if (claimed) {
      const stamp = makeText('已领', {
        size: 11, fill: 0x3d7a36, bold: true, anchor: 0.5,
      });
      stamp.position.set(0, -18);
      node.addChild(stamp);
    }

    return node;
  }

  private _makeQuestRow(quest: DailyQuestDef): PIXI.Container {
    const progress = Math.min(quest.target, PlayerData.questProgress(quest.id));
    const done = isQuestDone(quest);
    const claimed = PlayerData.isQuestClaimed(quest.id);
    const claimable = done && !claimed;
    const row = new PIXI.Container();

    row.addChild(makePanel({
      width: INNER_W, height: ROW_H, radius: 16, centered: true,
      bg: claimed ? 0xf0e6d4 : 0xfff8ec,
      bgAlpha: 0.97,
      border: claimable ? 0xe8a33d : COLORS.panelBorderSoft,
      borderWidth: claimable ? 2.5 : 2,
    }));

    const iconX = -INNER_W / 2 + 48;
    const ring = new PIXI.Graphics();
    ring.beginFill(0xfffdf6, 1);
    ring.lineStyle(2.5, claimable ? 0xe8a33d : COLORS.panelBorderSoft, 1);
    ring.drawCircle(iconX, 0, 32);
    ring.endFill();
    row.addChild(ring);
    this._mountSprite(row, QUEST_ICON[quest.trigger], iconX, 0, 48, claimed ? 0.45 : 1);

    const textX = -INNER_W / 2 + 96;
    const name = makeText(quest.name, {
      size: FONT_SIZE.sm,
      fill: claimed ? COLORS.textDisabled : COLORS.textMain,
      bold: true, anchor: [0, 0.5],
    });
    name.position.set(textX, -28);
    row.addChild(name);

    const barW = 210;
    const barH = 14;
    const barY = 2;
    const bar = new PIXI.Graphics();
    bar.beginFill(COLORS.trackBg, 1);
    bar.drawRoundedRect(textX, barY - barH / 2, barW, barH, barH / 2);
    bar.endFill();
    const ratio = Math.max(0, Math.min(1, progress / quest.target));
    if (ratio > 0.001) {
      bar.beginFill(ratio >= 1 ? COLORS.trackFillFull : 0x6dbf7a, 1);
      bar.drawRoundedRect(textX, barY - barH / 2, Math.max(barW * ratio, barH), barH, barH / 2);
      bar.endFill();
    }
    row.addChild(bar);

    const prog = makeText(`${progress}/${quest.target}`, {
      size: FONT_SIZE.xxs,
      fill: claimed ? COLORS.textDisabled : COLORS.textSub,
      bold: true, anchor: [0, 0.5],
    });
    prog.position.set(textX + barW + 8, barY);
    row.addChild(prog);

    const act = makeText(`+${quest.activity}活跃`, {
      size: 12,
      fill: claimed ? COLORS.textDisabled : 0xb07a2a,
      bold: true, anchor: [0, 0.5],
    });
    act.position.set(textX + 200, 30);
    row.addChild(act);

    this._mountRewardIcons(row, quest.reward, textX, 30, claimed ? 0.45 : 1);

    if (claimed) {
      const dbl = this._makeDoubleChip(quest.id, quest.reward);
      row.addChild(dbl ?? this._makeClaimedStamp(INNER_W / 2 - 78, 0));
      if (dbl) dbl.position.set(INNER_W / 2 - 78, 0);
    } else if (claimable) {
      const btn = makeActionButton({
        title: '领取',
        width: 128,
        height: 52,
        variant: 'success',
        enabled: !this._busy,
        fontSize: FONT_SIZE.sm,
        onTap: () => void this._claimOne(quest),
      });
      btn.position.set(INNER_W / 2 - 78, 0);
      row.addChild(btn);
    } else {
      const btn = makeActionButton({
        title: '前往',
        width: 128,
        height: 52,
        variant: 'cream',
        enabled: !this._busy,
        fontSize: FONT_SIZE.sm,
        onTap: () => this._goTo(quest.trigger),
      });
      btn.position.set(INNER_W / 2 - 78, 0);
      row.addChild(btn);
    }

    return row;
  }

  private _makeDoubleChip(questId: string, reward: RewardBundle): PIXI.Container | null {
    if (adUsesLeft('quest_double') <= 0) return null;
    if (PlayerData.isQuestClaimed(questDoubleMark(questId))) return null;
    return makeActionButton({
      title: `广告 ×${AD_REWARD_MULT}`,
      width: 128,
      height: 52,
      variant: 'success',
      enabled: !this._busy,
      fontSize: FONT_SIZE.sm,
      onTap: () => void this._doubleQuest(questId, reward),
    });
  }

  private async _doubleQuest(questId: string, reward: RewardBundle): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      if (PlayerData.isQuestClaimed(questDoubleMark(questId))) return;
      if (!await watchAd('quest_double', { quest: questId })) return;
      if (!PlayerData.markQuestClaimed(questDoubleMark(questId))) return;
      grantReward(reward);
      await this._playClaimFx(reward);
      Platform.showToast(`奖励翻倍 · ${formatReward(reward)}`, 'success');
      EventBus.emit('home:refresh');
    } finally {
      this._busy = false;
      if (this._isOpen) this._refresh();
    }
  }

  private _makeClaimedStamp(x: number, y: number): PIXI.Container {
    const stamp = new PIXI.Container();
    stamp.position.set(x, y);
    stamp.rotation = -0.28;
    const g = new PIXI.Graphics();
    g.lineStyle(3, 0x5a9a4a, 0.92);
    g.beginFill(0xd8f0d0, 0.55);
    g.drawRoundedRect(-46, -16, 92, 32, 8);
    g.endFill();
    stamp.addChild(g);
    stamp.addChild(makeText('已领取', {
      size: FONT_SIZE.xs, fill: 0x3d7a36, bold: true, anchor: 0.5,
    }));
    return stamp;
  }

  private _mountRewardIcons(
    parent: PIXI.Container,
    reward: RewardBundle,
    x: number,
    y: number,
    alpha: number,
  ): void {
    const items: Array<{ path: string; amount: number }> = [];
    if (reward.lingyu) items.push({ path: UI_IMAGES.iconLingyu, amount: reward.lingyu });
    if (reward.coins) items.push({ path: UI_IMAGES.iconCoin, amount: reward.coins });
    if (reward.exp) items.push({ path: UI_IMAGES.iconExp, amount: reward.exp });
    if (reward.tickets) items.push({ path: UI_IMAGES.iconTicket, amount: reward.tickets });
    if (reward.shards) items.push({ path: UI_IMAGES.iconShard, amount: reward.shards });
    if (reward.universal) items.push({ path: UI_IMAGES.iconShard, amount: reward.universal });
    if (reward.stamina) items.push({ path: UI_IMAGES.iconStamina, amount: reward.stamina });

    let cx = x;
    for (const it of items.slice(0, 2)) {
      this._mountSprite(parent, it.path, cx + 12, y, 26, alpha);
      const t = makeText(`×${it.amount}`, {
        size: 14,
        fill: alpha < 1 ? COLORS.textDisabled : COLORS.textTitle,
        bold: true, anchor: [0, 0.5],
      });
      t.position.set(cx + 28, y);
      parent.addChild(t);
      cx += 78;
    }
  }

  private _mountSprite(
    parent: PIXI.Container,
    path: string,
    x: number,
    y: number,
    size: number,
    alpha: number,
  ): void {
    const slot = new PIXI.Container();
    slot.position.set(x, y);
    slot.alpha = alpha;
    parent.addChild(slot);
    const apply = (tex: PIXI.Texture): void => {
      slot.removeChildren().forEach((c) => c.destroy());
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      const scale = size / Math.max(tex.width, tex.height);
      sp.scale.set(scale);
      slot.addChild(sp);
    };
    const cached = TextureCache.get(path);
    if (cached) {
      apply(cached);
      return;
    }
    void TextureCache.load(path).then((tex) => {
      if (!slot.destroyed) apply(tex);
    }).catch(() => null);
  }

  private _goTo(trigger: QuestTrigger): void {
    const scene = GO_SCENE[trigger];
    this._isOpen = false;
    this._scroll.detach();
    this.visible = false;
    this.alpha = 0;
    if (scene === 'title' || SceneManager.current?.name === scene) return;
    SceneManager.switchTo(scene);
  }

  private async _claimOne(quest: DailyQuestDef): Promise<void> {
    if (this._busy || !isQuestDone(quest) || PlayerData.isQuestClaimed(quest.id)) return;
    this._busy = true;
    try {
      await tryRequestSubscribe('quest');
      if (!PlayerData.markQuestClaimed(quest.id)) return;
      grantReward(quest.reward);
      analytics.trackDailyQuestClaim(quest.id, {
        questName: quest.name,
        reward: formatReward(quest.reward),
      });
      await this._playClaimFx(quest.reward);
      Platform.showToast(`领取成功 · ${formatReward(quest.reward)}`, 'success');
      EventBus.emit('home:refresh');
    } finally {
      this._busy = false;
      if (this._isOpen) this._refresh();
    }
  }

  private async _claimChest(chest: ActivityChestDef): Promise<void> {
    if (this._busy || !canClaimActivityChest(chest)) return;
    this._busy = true;
    try {
      if (!PlayerData.markQuestClaimed(chest.id)) return;
      grantReward(chest.reward);
      SfxManager.playChestOpen();
      analytics.trackDailyQuestClaim(chest.id, {
        questName: `活跃宝箱 ${chest.need}`,
        reward: formatReward(chest.reward),
      });
      await this._playClaimFx(chest.reward);
      Platform.showToast(`领取成功 · ${formatReward(chest.reward)}`, 'success');
      EventBus.emit('home:refresh');
    } finally {
      this._busy = false;
      if (this._isOpen) this._refresh();
    }
  }

  private async _claimAll(): Promise<void> {
    if (this._busy || !hasClaimableQuest()) return;
    this._busy = true;
    try {
      const claimed: RewardBundle[] = [];
      for (const quest of todayQuests()) {
        if (!isQuestDone(quest) || PlayerData.isQuestClaimed(quest.id)) continue;
        if (!PlayerData.markQuestClaimed(quest.id)) continue;
        grantReward(quest.reward);
        claimed.push(quest.reward);
        analytics.trackDailyQuestClaim(quest.id, {
          questName: quest.name,
          reward: formatReward(quest.reward),
        });
      }
      // 领完任务后再扫宝箱（活跃度随领取上涨）
      for (const chest of DAILY_ACTIVITY_CHESTS) {
        if (!canClaimActivityChest(chest)) continue;
        if (!PlayerData.markQuestClaimed(chest.id)) continue;
        grantReward(chest.reward);
        claimed.push(chest.reward);
        analytics.trackDailyQuestClaim(chest.id, {
          questName: `活跃宝箱 ${chest.need}`,
          reward: formatReward(chest.reward),
        });
      }

      if (claimed.length === 0) return;

      const merged = mergeRewards(claimed);
      if (claimed.some((r) => r.universal || r.stamina || (r.lingyu ?? 0) >= 40)) {
        SfxManager.playChestOpen();
      }
      await this._playClaimFx(merged);
      Platform.showToast(`领取成功 · ${formatReward(merged)}`, 'success');
      EventBus.emit('home:refresh');
    } finally {
      this._busy = false;
      if (this._isOpen) this._refresh();
    }
  }

  private async _playClaimFx(reward: RewardBundle): Promise<void> {
    const from = {
      x: Game.logicWidth / 2,
      y: Game.logicHeight / 2,
    };
    Platform.vibrateShort('medium');
    SfxManager.playRewardGet();
    playClaimBurst(this._fxLayer, from.x, from.y);
    const flySec = playRewardFly(this._fxLayer, reward, from);
    pulse(this._body, { peak: 1.015, duration: 0.24 });
    const wait = Math.max(0.28, flySec * 0.55, rewardFlyIcons(reward).length ? 0.35 : 0.2);
    await waitSec(wait);
  }
}

function mergeRewards(list: RewardBundle[]): RewardBundle {
  const out: RewardBundle = {};
  for (const r of list) {
    if (r.lingyu) out.lingyu = (out.lingyu ?? 0) + r.lingyu;
    if (r.coins) out.coins = (out.coins ?? 0) + r.coins;
    if (r.exp) out.exp = (out.exp ?? 0) + r.exp;
    if (r.tickets) out.tickets = (out.tickets ?? 0) + r.tickets;
    if (r.shards) out.shards = (out.shards ?? 0) + r.shards;
    if (r.universal) out.universal = (out.universal ?? 0) + r.universal;
    if (r.stamina) out.stamina = (out.stamina ?? 0) + r.stamina;
  }
  return out;
}

function waitSec(sec: number): Promise<void> {
  return new Promise((resolve) => {
    const state = { t: 0 };
    TweenManager.to({
      target: state,
      props: { t: 1 },
      duration: sec,
      ease: Ease.linear,
      onComplete: () => resolve(),
    });
  });
}
