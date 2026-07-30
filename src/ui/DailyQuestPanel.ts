/**
 * 每日任务弹窗（对齐 docs/ui/daily_quest_ui_prototype.png）
 *
 * 布局：标题匾 → 今日进度+一键领取 → 4 行任务卡 → 全清横幅 → 底提示。
 * CTA 三态：领取 / 前往 / 已领取；领取带资源飞顶栏。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager } from '@/core/SceneManager';
import { TweenManager, Ease } from '@/core/TweenManager';
import { EventBus } from '@/core/EventBus';
import { TextureCache } from '@/core/TextureCache';
import { Platform } from '@/core/PlatformService';
import {
  QUEST_ALL_CLEAR_ID, QUEST_ALL_CLEAR_REWARD,
  type DailyQuestDef, type QuestTrigger,
} from '@/balance/dailyQuest';
import { formatReward, type RewardBundle } from '@/balance/rewards';
import { PlayerData } from '@/game/PlayerData';
import { grantReward } from '@/game/rewardGrant';
import { adUsesLeft, watchAd } from '@/game/adGate';
import { AD_REWARD_MULT } from '@/balance/monetization';
import {
  canClaimAllClear, hasClaimableQuest, isQuestDone, todayQuests,
} from '@/game/dailyQuestTracker';
import { analytics } from '@/analytics';
import { UI_IMAGES } from '@/config/Assets';
import { ensureAssets } from '@/config/Subpackages';
import {
  COLORS, FONT_SIZE,
  makeActionButton, makeCloseButton, makePanel, makeText, makeModalTitlePlaque, pulse,
} from '@/ui';
import {
  playClaimBurst, playRewardFly, rewardFlyIcons,
} from './ResourceFlyFx';

const PANEL_W = 680;
const PANEL_H = 800;
const ROW_H = 96;
const ROW_GAP = 8;
const INNER_W = PANEL_W - 56;

/** 翻倍已用哨兵：与任务 id 同存 questClaimed，跨日随日循环一起清 */
const questDoubleMark = (questId: string): string => `${questId}#x2`;

const QUEST_ICON: Readonly<Record<QuestTrigger, string>> = {
  stageClear: UI_IMAGES.navHome,
  comboReach: UI_IMAGES.iconStatAtk,
  gachaPull: UI_IMAGES.iconRecruit,
  realmClear: UI_IMAGES.navRealm,
  petLevelUp: UI_IMAGES.navPet,
  petStarUp: UI_IMAGES.navPet,
  towerFloor: UI_IMAGES.railTower,
};

const GO_SCENE: Readonly<Record<QuestTrigger, string>> = {
  stageClear: 'title',
  comboReach: 'title',
  gachaPull: 'gacha',
  realmClear: 'realm',
  petLevelUp: 'codex',
  petStarUp: 'codex',
  towerFloor: 'tower',
};

export class DailyQuestPanel extends PIXI.Container {
  private _dim!: PIXI.Graphics;
  private _content!: PIXI.Container;
  private _body!: PIXI.Container;
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
      UI_IMAGES.navHome, UI_IMAGES.navRealm, UI_IMAGES.navPet,
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

  private _refresh(): void {
    this._body.removeChildren().forEach((c) => c.destroy({ children: true }));

    const quests = todayQuests();
    const doneCount = quests.filter((q) => isQuestDone(q)).length;

    let y = -PANEL_H / 2 + 118;
    y = this._buildProgressHeader(y, doneCount, quests.length) + 14;

    quests.forEach((quest) => {
      const row = this._makeQuestRow(quest);
      row.position.set(0, y + ROW_H / 2);
      this._body.addChild(row);
      y += ROW_H + ROW_GAP;
    });

    y += 8;
    const bannerH = 128;
    const banner = this._makeAllClearBanner(bannerH);
    banner.position.set(0, y + bannerH / 2);
    this._body.addChild(banner);
    y += bannerH + 14;

    const tip = makeText('完成任务后记得领奖哦', {
      size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: 0.5,
    });
    tip.position.set(0, y);
    this._body.addChild(tip);
  }

  private _buildProgressHeader(y: number, done: number, total: number): number {
    const barH = 48;
    const bar = makePanel({
      width: INNER_W, height: barH, radius: barH / 2, centered: true,
      bg: 0xfff8ec, border: COLORS.panelBorderSoft, borderWidth: 2,
    });
    bar.position.set(0, y + barH / 2);
    this._body.addChild(bar);

    const label = makeText(`今日进度 ${done}/${total}`, {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    });
    label.position.set(-INNER_W / 2 + 20, y + barH / 2);
    this._body.addChild(label);

    // 圆点进度
    const dotsX = -INNER_W / 2 + 200;
    const dotsY = y + barH / 2;
    for (let i = 0; i < total; i++) {
      const g = new PIXI.Graphics();
      const filled = i < done;
      g.beginFill(filled ? 0x5cbf4a : 0xfffaf0, 1);
      g.lineStyle(2, filled ? 0x3d8a32 : COLORS.panelBorderSoft, 1);
      g.drawCircle(dotsX + i * 22, dotsY, 7);
      g.endFill();
      this._body.addChild(g);
    }

    const canBatch = hasClaimableQuest();
    const claimAll = makeActionButton({
      title: '一键领取',
      width: 168,
      height: 44,
      variant: canBatch ? 'success' : 'cream',
      enabled: canBatch && !this._busy,
      fontSize: FONT_SIZE.xs,
      onTap: () => void this._claimAll(),
    });
    claimAll.position.set(INNER_W / 2 - 96, y + barH / 2);
    this._body.addChild(claimAll);

    return y + barH;
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

    // 左：类型图标圆框
    const iconX = -INNER_W / 2 + 48;
    const ring = new PIXI.Graphics();
    ring.beginFill(0xfffdf6, 1);
    ring.lineStyle(2.5, claimable ? 0xe8a33d : COLORS.panelBorderSoft, 1);
    ring.drawCircle(iconX, 0, 32);
    ring.endFill();
    row.addChild(ring);
    this._mountSprite(row, QUEST_ICON[quest.trigger], iconX, 0, 48, claimed ? 0.45 : 1);

    // 中：任务名 + 进度条 + 奖励图标
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

    this._mountRewardIcons(row, quest.reward, textX, 30, claimed ? 0.45 : 1);

    // 右：CTA
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

  private _makeAllClearBanner(h: number): PIXI.Container {
    const claimed = PlayerData.isQuestClaimed(QUEST_ALL_CLEAR_ID);
    const claimable = canClaimAllClear();
    const banner = new PIXI.Container();
    const alpha = claimed ? 0.5 : 1;

    banner.addChild(makePanel({
      width: INNER_W, height: h, radius: 18, centered: true,
      bg: claimed ? 0xf0e6d4 : 0xfff0c8,
      bgAlpha: 0.98,
      border: claimable || !claimed ? 0xe8a33d : COLORS.panelBorderSoft,
      borderWidth: claimable ? 3 : 2.5,
    }));

    // 裁剪层：奖励文案绝不画出金框
    const content = new PIXI.Container();
    banner.addChild(content);
    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawRoundedRect(-INNER_W / 2 + 4, -h / 2 + 4, INNER_W - 8, h - 8, 14);
    mask.endFill();
    banner.addChild(mask);
    content.mask = mask;

    const title = makeText(claimable ? '全部完成 · 可领取' : '全部完成 · 额外奖励', {
      size: FONT_SIZE.sm,
      fill: claimed ? COLORS.textDisabled : 0x5a3210,
      bold: true, anchor: 0.5,
      role: 'title',
    });
    title.position.set(0, -h / 2 + 28);
    content.addChild(title);

    // 各资源：图标在上、文案在下，整体居中落在框内
    const r = QUEST_ALL_CLEAR_REWARD;
    const slots: Array<{ path: string; label: string }> = [];
    if (r.lingyu) slots.push({ path: UI_IMAGES.iconLingyu, label: `灵玉 ×${r.lingyu}` });
    if (r.coins) slots.push({ path: UI_IMAGES.iconCoin, label: `灵宠币 ×${r.coins}` });
    if (r.universal) slots.push({ path: UI_IMAGES.iconShard, label: `通用碎片 ×${r.universal}` });
    if (r.stamina) slots.push({ path: UI_IMAGES.iconStamina, label: `体力 ×${r.stamina}` });

    // 槽位从 2 涨到 4，间距同步收窄，否则会挤出横幅
    const gap = slots.length >= 4 ? 132 : 180;
    const startX = -((slots.length - 1) * gap) / 2;
    const iconY = 6;
    const labelY = 42;
    slots.forEach((s, i) => {
      const x = startX + i * gap;
      this._mountSprite(content, s.path, x, iconY, 48, alpha);
      const t = makeText(s.label, {
        size: FONT_SIZE.xs,
        fill: claimed ? COLORS.textDisabled : 0x6a3a14,
        bold: true, anchor: 0.5,
      });
      t.position.set(x, labelY);
      content.addChild(t);
    });

    if (claimed) {
      const dbl = this._makeDoubleChip(QUEST_ALL_CLEAR_ID, QUEST_ALL_CLEAR_REWARD);
      banner.addChild(dbl ?? this._makeClaimedStamp(0, 8));
      if (dbl) dbl.position.set(INNER_W / 2 - 78, 8);
    } else if (claimable) {
      banner.eventMode = 'static';
      banner.cursor = 'pointer';
      banner.hitArea = new PIXI.Rectangle(-INNER_W / 2, -h / 2, INNER_W, h);
      banner.on('pointertap', () => void this._claimAllClear());
    }

    return banner;
  }

  /**
   * 已领取的任务位换成翻倍广告位（IAA，日 3 次）。
   * 「哪条已翻过」用 `${questId}#x2` 哨兵写进 questClaimed —— 该账本本来就按日重置，
   * 不必为翻倍再加一份存档字段；广告日限只管总次数，管不了同一条任务被翻两次。
   */
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
      // 必须先清 busy 再刷 UI，否则新建广告钮会带着 enabled:false
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

    let cx = x;
    for (const it of items.slice(0, 3)) {
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
    this.visible = false;
    this.alpha = 0;
    SceneManager.switchTo(scene);
  }

  private async _claimOne(quest: DailyQuestDef): Promise<void> {
    if (this._busy || !isQuestDone(quest) || PlayerData.isQuestClaimed(quest.id)) return;
    this._busy = true;
    try {
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

  private async _claimAllClear(): Promise<void> {
    if (this._busy || !canClaimAllClear()) return;
    this._busy = true;
    try {
      if (!PlayerData.markQuestClaimed(QUEST_ALL_CLEAR_ID)) return;
      grantReward(QUEST_ALL_CLEAR_REWARD);
      analytics.trackDailyQuestClaim(QUEST_ALL_CLEAR_ID, {
        questName: '全部完成',
        reward: formatReward(QUEST_ALL_CLEAR_REWARD),
      });
      await this._playClaimFx(QUEST_ALL_CLEAR_REWARD);
      Platform.showToast(`领取成功 · ${formatReward(QUEST_ALL_CLEAR_REWARD)}`, 'success');
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
      if (canClaimAllClear()) {
        if (PlayerData.markQuestClaimed(QUEST_ALL_CLEAR_ID)) {
          grantReward(QUEST_ALL_CLEAR_REWARD);
          claimed.push(QUEST_ALL_CLEAR_REWARD);
          analytics.trackDailyQuestClaim(QUEST_ALL_CLEAR_ID, {
            questName: '全部完成',
            reward: formatReward(QUEST_ALL_CLEAR_REWARD),
          });
        }
      }

      if (claimed.length === 0) return;

      const merged = mergeRewards(claimed);
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
    playClaimBurst(this._fxLayer, from.x, from.y);
    const flySec = playRewardFly(this._fxLayer, reward, from);
    pulse(this._body, { peak: 1.015, duration: 0.24 });
    // 无图标可飞时也稍等一下
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
