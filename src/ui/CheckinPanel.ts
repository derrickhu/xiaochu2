/**
 * 七日签到弹窗（对齐 docs/ui/checkin_panel_prototype.png）
 *
 * 布局：标题匾 → 连签条 → 3×2 日卡（图标+数量）→ 第7天大奖条 → 签到 CTA。
 * 领取反馈对齐 xiao_chu：爆光 + 资源抛物线飞顶栏。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { EventBus } from '@/core/EventBus';
import { TextureCache } from '@/core/TextureCache';
import { Platform } from '@/core/PlatformService';
import { SfxManager } from '@/core/SfxManager';
import { CHECKIN_DAYS, checkinDay } from '@/balance/checkin';
import { formatReward } from '@/balance/rewards';
import { PlayerData } from '@/game/PlayerData';
import { grantReward } from '@/game/rewardGrant';
import { adUsesLeft, watchAd } from '@/game/adGate';
import { tryRequestSubscribe } from '@/game/subscribeGate';
import { AD_REWARD_MULT } from '@/balance/monetization';
import { analytics } from '@/analytics';
import { UI_IMAGES } from '@/config/Assets';
import { ensureAssets } from '@/config/Subpackages';
import {
  COLORS, FONT_SIZE,
  makeActionButton, makeCloseButton, makePanel, makeText, makeModalTitlePlaque, pulse,
} from '@/ui';
import {
  playClaimBurst, playRewardFly,
  primaryRewardAmount, primaryRewardIcon,
} from './ResourceFlyFx';

const PANEL_W = 680;
const PANEL_H = 720;
const CELL_GAP = 14;
/** 日卡可视高度（贴图必须严格装进此框，禁止 cover 溢出） */
const CELL_H = 148;

export class CheckinPanel extends PIXI.Container {
  private _dim!: PIXI.Graphics;
  private _content!: PIXI.Container;
  private _body!: PIXI.Container;
  private _fxLayer!: PIXI.Container;
  private _isOpen = false;
  private _signing = false;
  /** 今日卡中心（全局坐标），供飞效起点 */
  private _todayCellGlobal: { x: number; y: number } | null = null;

  constructor() {
    super();
    this.visible = false;
    this.zIndex = 9500;
    this.eventMode = 'static';
    this._buildShell();
    EventBus.on('checkin:open', () => this.open());
    EventBus.on('checkin:close', () => this.close());
  }

  open(): void {
    if (this._isOpen && this.visible) return;
    TweenManager.cancelTarget(this);
    this._isOpen = true;
    this._signing = false;
    this.visible = true;
    this._refresh();
    this.alpha = 0;
    TweenManager.to({ target: this, props: { alpha: 1 }, duration: 0.2, ease: Ease.easeOutQuad });
    // 卡面/匾走 CDN：先 ensureAssets（含下载）再刷一次，避免真机首开空图
    void this._hydrateAssets();
  }

  private async _hydrateAssets(): Promise<void> {
    const paths = [
      UI_IMAGES.iconLingyu, UI_IMAGES.iconCoin, UI_IMAGES.iconTicket, UI_IMAGES.iconShard,
      UI_IMAGES.iconStamina,
      UI_IMAGES.railCheckin, UI_IMAGES.modalTitlePlaque,
      UI_IMAGES.checkinCardNormal, UI_IMAGES.checkinCardToday, UI_IMAGES.checkinBannerDay7,
      UI_IMAGES.btnPlateSuccess, UI_IMAGES.btnPlateCream,
    ];
    await ensureAssets(paths).catch((e) => {
      console.warn('[Checkin] 资源预热失败', e);
    });
    if (!this._isOpen) return;
    this._refresh();
  }

  close(): void {
    if (!this._isOpen || this._signing) return;
    this._isOpen = false;
    TweenManager.cancelTarget(this);
    TweenManager.to({
      target: this,
      props: { alpha: 0 },
      duration: 0.15,
      ease: Ease.easeInQuad,
      onComplete: () => { if (!this._isOpen) this.visible = false; },
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

    // 顶匾骑在弹窗上沿（对齐原型：单独祥云奶油匾，不是裸字）
    const plaque = makeModalTitlePlaque({ text: '每日签到', panelWidth: PANEL_W });
    plaque.position.set(0, -PANEL_H / 2 + 18);
    this._content.addChild(plaque);

    const closeBtn = makeCloseButton({ onTap: () => this.close() });
    closeBtn.position.set(PANEL_W / 2 - 36, -PANEL_H / 2 + 36);
    this._content.addChild(closeBtn);

    this._body = new PIXI.Container();
    this._content.addChild(this._body);

    // 飞效层盖在弹窗内容之上、遮罩之内
    this._fxLayer = new PIXI.Container();
    this.addChild(this._fxLayer);
  }

  private _refresh(): void {
    this._body.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._todayCellGlobal = null;

    const checkin = PlayerData.checkin;
    const todayIndex = PlayerData.checkinDayIndex;
    const canSign = PlayerData.canCheckinToday;

    this._buildStreakBar(checkin.streak);
    this._buildDayGrid(todayIndex, canSign);
    this._buildDay7Banner(todayIndex, canSign);
    this._buildCta(todayIndex, canSign);
  }

  private _buildStreakBar(streak: number): void {
    const barW = PANEL_W - 72;
    const barH = 44;
    const y = -PANEL_H / 2 + 118;
    const bar = makePanel({
      width: barW, height: barH, radius: barH / 2, centered: true,
      bg: 0xfff8ec, border: COLORS.panelBorderSoft, borderWidth: 2,
    });
    bar.position.set(0, y);
    this._body.addChild(bar);

    const iconTex = TextureCache.get(UI_IMAGES.railCheckin);
    if (iconTex) {
      const icon = new PIXI.Sprite(iconTex);
      icon.anchor.set(0.5);
      icon.width = 30;
      icon.height = 30;
      icon.position.set(-barW / 2 + 28, y);
      this._body.addChild(icon);
    }

    const streakText = makeText(`连续签到 ${streak} 天`, {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    });
    streakText.position.set(-barW / 2 + 50, y);
    this._body.addChild(streakText);

    const tip = makeText('断签从第1天重新开始', {
      size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: [1, 0.5],
    });
    tip.position.set(barW / 2 - 18, y);
    this._body.addChild(tip);
  }

  private _buildDayGrid(todayIndex: number, canSign: boolean): void {
    const cols = 3;
    const cellW = (PANEL_W - 64 - CELL_GAP * (cols - 1)) / cols;
    const gridTop = -PANEL_H / 2 + 156;
    const rowPitch = CELL_H + CELL_GAP;

    // 先铺第二行再铺第一行，即使光晕轻微外扩也压在下层，避免「盖住上一行」
    const order = [3, 4, 5, 0, 1, 2];
    for (const i of order) {
      const day = CHECKIN_DAYS[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cell = this._makeDayCell(day.day, cellW, CELL_H, todayIndex, canSign);
      const x = -PANEL_W / 2 + 32 + col * (cellW + CELL_GAP) + cellW / 2;
      const y = gridTop + row * rowPitch + CELL_H / 2;
      cell.position.set(x, y);
      this._body.addChild(cell);

      const isToday = day.day === todayIndex && canSign;
      if (isToday) {
        this._todayCellGlobal = {
          x: Game.logicWidth / 2 + x,
          y: Game.logicHeight / 2 + y,
        };
      }
    }
  }

  private _buildDay7Banner(todayIndex: number, canSign: boolean): void {
    const def = checkinDay(7);
    const claimed = 7 < todayIndex || (7 === todayIndex && !canSign);
    const isToday = 7 === todayIndex && canSign;
    const w = PANEL_W - 56;
    const h = 128;
    const y = PANEL_H / 2 - 178;

    const banner = new PIXI.Container();
    banner.position.set(0, y);
    this._body.addChild(banner);

    // 未领时外扩软金光晕，强化「大奖」层级
    if (!claimed) {
      const halo = new PIXI.Graphics();
      halo.beginFill(0xffd978, isToday ? 0.42 : 0.28);
      halo.drawRoundedRect(-w / 2 - 10, -h / 2 - 8, w + 20, h + 16, 28);
      halo.endFill();
      banner.addChild(halo);
      this._pulseHalo(halo, isToday ? 0.42 : 0.28, isToday ? 0.58 : 0.4);
    }

    this._mountFrame(
      banner,
      UI_IMAGES.checkinBannerDay7,
      w,
      h,
      claimed ? 0.55 : 1,
    );

    if (!claimed) {
      banner.addChild(this._makeSparkleLayer(w, h));
    }

    // 左：十连券 右：碎片袋
    this._mountIcon(banner, UI_IMAGES.iconTicket, -w / 2 + 72, -2, 66, claimed ? 0.45 : 1);
    this._mountIcon(banner, UI_IMAGES.iconShard, w / 2 - 72, -2, 66, claimed ? 0.45 : 1);

    const titleFill = claimed ? COLORS.textDisabled : 0x5a3210;
    const title = makeText(isToday ? '第 7 天 · 今日大奖' : '第 7 天 · 大奖', {
      size: FONT_SIZE.md,
      fill: titleFill,
      bold: true, anchor: 0.5,
      role: 'title',
      strokeColor: claimed ? undefined : 0xfff6d8,
      strokeWidth: claimed ? 0 : 4,
    });
    title.position.set(0, -22);
    banner.addChild(title);

    const reward = makeText(formatReward(def.reward), {
      size: FONT_SIZE.sm,
      fill: claimed ? COLORS.textDisabled : 0x6a3a14,
      bold: true, anchor: 0.5,
      strokeColor: claimed ? undefined : 0xfff8e8,
      strokeWidth: claimed ? 0 : 3,
    });
    reward.position.set(0, 18);
    banner.addChild(reward);

    if (claimed) {
      banner.addChild(this._makeStamp(0, 0));
    }

    if (isToday) {
      this._todayCellGlobal = {
        x: Game.logicWidth / 2,
        y: Game.logicHeight / 2 + y,
      };
    }
  }

  private _buildCta(todayIndex: number, canSign: boolean): void {
    // 已签到后 CTA 位空着可惜：换成翻倍广告位（日 1 次），签到前不出现避免抢主 CTA
    const doubleReady = !canSign && adUsesLeft('checkin_double') > 0;
    const btn = makeActionButton({
      title: canSign
        ? `签到 · 第 ${todayIndex} 天`
        : (doubleReady ? `看广告 · 奖励 ×${AD_REWARD_MULT}` : '今日已签到'),
      subtitle: doubleReady ? formatReward(checkinDay(todayIndex).reward) : undefined,
      width: 380,
      height: 78,
      variant: canSign || doubleReady ? 'success' : 'cream',
      enabled: (canSign || doubleReady) && !this._signing,
      // 双行（看广告+奖励）用 md，避免大字顶出绿钮金边
      fontSize: doubleReady ? FONT_SIZE.md : FONT_SIZE.lg,
      onTap: () => void (canSign ? this._sign() : this._doubleReward(todayIndex)),
    });
    btn.position.set(0, PANEL_H / 2 - 56);
    this._body.addChild(btn);
  }

  /** 签到奖励翻倍（IAA）：补发一份当日奖励 */
  private async _doubleReward(todayIndex: number): Promise<void> {
    if (this._signing) return;
    this._signing = true;
    try {
      if (!await watchAd('checkin_double', { day: todayIndex })) return;
      const reward = checkinDay(todayIndex).reward;
      grantReward(reward);
      const from = this._todayCellGlobal ?? {
        x: Game.logicWidth / 2,
        y: Game.logicHeight / 2,
      };
      playClaimBurst(this._fxLayer, from.x, from.y);
      playRewardFly(this._fxLayer, reward, from);
      Platform.showToast(`奖励翻倍 · ${formatReward(reward)}`, 'success');
      EventBus.emit('home:refresh');
    } finally {
      // 先清 signing 再刷，否则广告 CTA 会以 enabled:false 建出来
      this._signing = false;
      if (this._isOpen) this._refresh();
    }
  }

  private _makeDayCell(
    day: number,
    w: number,
    h: number,
    todayIndex: number,
    canSign: boolean,
  ): PIXI.Container {
    const def = checkinDay(day);
    const claimed = day < todayIndex || (day === todayIndex && !canSign);
    const isToday = day === todayIndex && canSign;

    const cell = new PIXI.Container();

    // 今日：外扩柔光（不改格子占位，避免挤到相邻卡）
    if (isToday && !claimed) {
      const halo = new PIXI.Graphics();
      halo.beginFill(0xf5d78a, 0.35);
      halo.drawRoundedRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10, 20);
      halo.endFill();
      cell.addChild(halo);
    }

    // 底板：奶油底永远对齐格子；贴图 cover 居中盖住，杜绝双卡/透明偏移
    const framePath = isToday ? UI_IMAGES.checkinCardToday : UI_IMAGES.checkinCardNormal;
    this._mountDayFrame(cell, framePath, w, h, claimed ? 0.55 : 1, isToday);

    if (isToday) {
      cell.addChild(this._makeTodayRibbon(w / 2 - 6, -h / 2 + 6));
    }

    const dayLabel = makeText(`第 ${day} 天`, {
      size: FONT_SIZE.xs,
      fill: claimed ? COLORS.textDisabled : COLORS.textMain,
      bold: true, anchor: 0.5,
    });
    dayLabel.position.set(0, -h / 2 + 24);
    cell.addChild(dayLabel);

    const iconPath = primaryRewardIcon(def.reward);
    this._mountIcon(cell, iconPath, 0, 2, 52, claimed ? 0.4 : 1);

    const amount = makeText(primaryRewardAmount(def.reward), {
      size: FONT_SIZE.sm,
      fill: claimed ? COLORS.textDisabled : COLORS.textTitle,
      bold: true, anchor: 0.5,
    });
    amount.position.set(0, h / 2 - 26);
    cell.addChild(amount);

    if (claimed) {
      cell.addChild(this._makeStamp(0, 8));
    }
    return cell;
  }

  /**
   * 日卡底板：奶油底对齐格子；贴图强制拉满 w×h（禁止 cover 等比放大溢出邻格）。
   * 外层再加圆角遮罩，双保险避免贴图/光晕压到下一行。
   */
  private _mountDayFrame(
    parent: PIXI.Container,
    path: string,
    w: number,
    h: number,
    alpha: number,
    isToday: boolean,
  ): void {
    const frameHost = new PIXI.Container();
    parent.addChild(frameHost);

    const base = makePanel({
      width: w,
      height: h,
      radius: 16,
      centered: true,
      bg: isToday ? 0xfff3d8 : 0xfff8ec,
      border: isToday ? 0xe8a33d : COLORS.panelBorderSoft,
      borderWidth: isToday ? 3 : 2,
    });
    base.alpha = alpha;
    frameHost.addChild(base);

    const slot = new PIXI.Container();
    slot.alpha = alpha;
    frameHost.addChild(slot);

    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawRoundedRect(-w / 2, -h / 2, w, h, 16);
    mask.endFill();
    frameHost.addChild(mask);
    frameHost.mask = mask;

    const apply = (tex: PIXI.Texture): void => {
      slot.removeChildren().forEach((c) => c.destroy());
      if (!tex.width || !tex.height) return;
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      // 严格装进格子：非等比拉伸可接受，绝不能盖住邻行
      sp.width = w;
      sp.height = h;
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

  /** 大奖条底板（横幅允许非等比拉伸以铺满宽条） */
  private _mountFrame(
    parent: PIXI.Container,
    path: string,
    w: number,
    h: number,
    alpha: number,
  ): void {
    const slot = new PIXI.Container();
    slot.alpha = alpha;
    parent.addChildAt(slot, Math.min(1, parent.children.length));

    const fallback = makePanel({
      width: w, height: h, radius: 18, centered: true,
      bg: 0xfff6dc, border: 0xe8a33d, borderWidth: 2.5,
    });
    slot.addChild(fallback);

    const apply = (tex: PIXI.Texture): void => {
      slot.removeChildren().forEach((c) => c.destroy());
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      sp.width = w;
      sp.height = h;
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

  /** 第7天浮动星芒（贴图自带星点，再叠一层呼吸闪烁） */
  private _makeSparkleLayer(w: number, h: number): PIXI.Container {
    const layer = new PIXI.Container();
    const spots: Array<{ x: number; y: number; s: number; delay: number }> = [
      { x: -w * 0.32, y: -h * 0.28, s: 10, delay: 0 },
      { x: w * 0.28, y: -h * 0.22, s: 8, delay: 0.25 },
      { x: -w * 0.18, y: h * 0.26, s: 7, delay: 0.45 },
      { x: w * 0.34, y: h * 0.18, s: 9, delay: 0.15 },
      { x: 0, y: -h * 0.34, s: 6, delay: 0.55 },
      { x: w * 0.08, y: h * 0.32, s: 7, delay: 0.35 },
    ];
    for (const sp of spots) {
      const star = this._drawSparkle(sp.s);
      star.position.set(sp.x, sp.y);
      star.alpha = 0.35;
      layer.addChild(star);
      const twinkle = (): void => {
        if (star.destroyed) return;
        TweenManager.to({
          target: star,
          props: { alpha: 1 },
          duration: 0.55,
          delay: sp.delay,
          ease: Ease.easeOutQuad,
        });
        TweenManager.to({
          target: star.scale,
          props: { x: 1.25, y: 1.25 },
          duration: 0.55,
          delay: sp.delay,
          ease: Ease.easeOutQuad,
          onComplete: () => {
            if (star.destroyed) return;
            TweenManager.to({
              target: star,
              props: { alpha: 0.25 },
              duration: 0.7,
              ease: Ease.easeInQuad,
            });
            TweenManager.to({
              target: star.scale,
              props: { x: 0.85, y: 0.85 },
              duration: 0.7,
              ease: Ease.easeInQuad,
              onComplete: twinkle,
            });
          },
        });
      };
      twinkle();
    }
    return layer;
  }

  private _drawSparkle(size: number): PIXI.Graphics {
    const g = new PIXI.Graphics();
    const half = size / 2;
    g.beginFill(0xffffff, 0.95);
    g.moveTo(0, -half);
    g.lineTo(half * 0.28, -half * 0.28);
    g.lineTo(half, 0);
    g.lineTo(half * 0.28, half * 0.28);
    g.lineTo(0, half);
    g.lineTo(-half * 0.28, half * 0.28);
    g.lineTo(-half, 0);
    g.lineTo(-half * 0.28, -half * 0.28);
    g.closePath();
    g.endFill();
    g.beginFill(0xfff6c8, 0.85);
    g.drawCircle(0, 0, size * 0.18);
    g.endFill();
    return g;
  }

  private _pulseHalo(halo: PIXI.Graphics, lo: number, hi: number): void {
    const tick = (): void => {
      if (halo.destroyed) return;
      TweenManager.to({
        target: halo,
        props: { alpha: hi },
        duration: 0.9,
        ease: Ease.easeInOutQuad,
        onComplete: () => {
          if (halo.destroyed) return;
          TweenManager.to({
            target: halo,
            props: { alpha: lo },
            duration: 0.9,
            ease: Ease.easeInOutQuad,
            onComplete: tick,
          });
        },
      });
    };
    halo.alpha = lo;
    tick();
  }

  private _makeTodayRibbon(cornerX: number, cornerY: number): PIXI.Container {
    const ribbon = new PIXI.Container();
    const rw = 56;
    const rh = 24;
    // 锚在右上角内侧，避免飘到下一格
    ribbon.position.set(cornerX - rw - 2, cornerY + 2);
    const g = new PIXI.Graphics();
    g.beginFill(0xe85a4a, 1);
    g.drawRoundedRect(0, 0, rw, rh, 8);
    g.endFill();
    ribbon.addChild(g);
    const t = makeText('今日', {
      size: 13, fill: 0xfffaf0, bold: true, anchor: 0.5,
    });
    t.position.set(rw / 2, rh / 2);
    ribbon.addChild(t);
    return ribbon;
  }

  private _makeStamp(x: number, y: number): PIXI.Container {
    const stamp = new PIXI.Container();
    stamp.position.set(x, y);
    stamp.rotation = -0.28;
    const g = new PIXI.Graphics();
    g.lineStyle(3, 0x5a9a4a, 0.92);
    g.beginFill(0xd8f0d0, 0.55);
    g.drawRoundedRect(-48, -18, 96, 36, 8);
    g.endFill();
    stamp.addChild(g);
    const t = makeText('已领取', {
      size: FONT_SIZE.xs, fill: 0x3d7a36, bold: true, anchor: 0.5,
    });
    stamp.addChild(t);
    return stamp;
  }

  private _mountIcon(
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
      sp.width = size;
      sp.height = size;
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

  private async _sign(): Promise<void> {
    if (this._signing || !PlayerData.canCheckinToday) return;
    this._signing = true;
    // 订阅须在点击手势内调用（抖音广告金 / 留存建议接入）
    await tryRequestSubscribe('checkin');

    const day = PlayerData.doCheckin();
    if (day === null) {
      this._signing = false;
      return;
    }
    const def = checkinDay(day);
    grantReward(def.reward);
    analytics.trackCheckinSign({
      day,
      streak: PlayerData.checkin.streak,
      totalDays: PlayerData.checkin.totalDays,
    });

    const from = this._todayCellGlobal ?? {
      x: Game.logicWidth / 2,
      y: Game.logicHeight / 2,
    };
    Platform.vibrateShort('medium');
    SfxManager.playRewardGet();
    playClaimBurst(this._fxLayer, from.x, from.y);
    const flySec = playRewardFly(this._fxLayer, def.reward, from);

    // 今日卡脉冲一下
    pulse(this._body, { peak: 1.02, duration: 0.28 });

    Platform.showToast(`签到成功 · ${formatReward(def.reward)}`, 'success');

    // 飞效播完再刷新格子状态，避免图标瞬间消失
    await waitSec(Math.max(0.35, flySec * 0.55));
    EventBus.emit('home:refresh');
    // 先清 signing 再刷：否则「看广告」钮会带着 enabled:false（关窗重开才恢复）
    this._signing = false;
    if (this._isOpen) this._refresh();
  }
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
