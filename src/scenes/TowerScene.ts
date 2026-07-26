/**
 * 通天塔（对齐 docs/ui/tower_ui_prototype.png）
 *
 * 顶栏：返回 + 匾「通天塔」+ 重置次数
 * 中央宝塔立绘 + 右侧「本轮状态」卡
 * 层数里程碑横条 + 底部挑战/重置 CTA
 *
 * 与主线差异：HP / 技能 CD 跨层继承；战败回落存档点，需消耗每日重置续爬。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { Platform } from '@/core/PlatformService';
import { TextureCache } from '@/core/TextureCache';
import { UI } from '@/balance/ui';
import { formatReward } from '@/balance/rewards';
import {
  buildTowerStage, checkpointFloorOf,
  TOWER, TOWER_MILESTONE_REWARD, towerStageId,
} from '@/balance/tower';
import { BACKGROUND_IMAGES, UI_IMAGES } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import { grantReward } from '@/game/rewardGrant';
import type { BattleContext } from '@/game/battleContext';
import {
  COLORS, FONT_SIZE, FONT_FAMILY_DISPLAY, BOTTOM_NAV_RESERVE,
  buildBottomNav, makeBackButton, makeCoverBackground,
  makePanel, makeSceneTitlePlaque, makeText,
  makeWarmGoldCtaButton, WARM_GOLD_CTA_SIZE, pressFeedback,
} from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';
import type { TeamEnterData } from './TeamScene';
import { analytics } from '@/analytics';

const MILESTONE_PREVIEW = 4;
/** 里程碑：更高更窄；挑战钮更小一档 */
const TOWER_PANEL_W = 480;
const CTA_BTN_W = WARM_GOLD_CTA_SIZE.width;
const CTA_BTN_H = WARM_GOLD_CTA_SIZE.height;
const STATUS_W = 200;
const STATUS_H = 270;
const STATUS_FOOTER_H = 42;

export class TowerScene implements Scene {
  readonly name = 'tower';
  readonly container = new PIXI.Container();

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    this._build();
    void TextureCache.preload([
      BACKGROUND_IMAGES.tower,
      UI_IMAGES.towerPagoda,
      UI_IMAGES.towerBtnCta,
      UI_IMAGES.sceneTitlePlaque,
      UI_IMAGES.btnBack,
      UI_IMAGES.iconLingyu,
      UI_IMAGES.iconShard,
    ]);
    void Game.warmScenePresent();
  }

  onExit(): void {
    this.container.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this.container.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });

    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.tower, w, h));

    const headerBand = new PIXI.Graphics();
    headerBand.beginFill(0xfff8ec, 0.28);
    headerBand.drawRect(0, 0, w, Game.safeTop + 70);
    headerBand.endFill();
    this.container.addChild(headerBand);

    const back = makeBackButton({ onTap: () => SceneManager.switchTo('title') });
    back.position.set(72, Game.safeHeaderCenterY);
    this.container.addChild(back);

    const plaque = makeSceneTitlePlaque({ text: '通天塔', screenWidth: w });
    plaque.position.set(w / 2, Game.safeHeaderCenterY);
    this.container.addChild(plaque);

    const resets = makeText(
      `重置 ${PlayerData.towerResetsLeft}/${TOWER.dailyResets}`,
      { size: FONT_SIZE.xs, fill: COLORS.textTitle, bold: true, anchor: [1, 0.5] },
    );
    resets.position.set(w - 22, Game.safeHeaderCenterY);
    this.container.addChild(resets);

    // 内容区给底栏留位；挑战 CTA 叠在底栏上方
    const contentTop = Game.safeTop + 72;
    const contentBottom = h - BOTTOM_NAV_RESERVE - 4;
    const ctaTop = contentBottom - CTA_BTN_H;
    const milestoneH = 168;
    const milestoneTop = ctaTop - 18 - milestoneH;
    // 塔可略叠进里程碑上沿，保证够大；下方仍留按钮区
    const stageBottom = milestoneTop + 28;
    const stageH = Math.max(420, stageBottom - contentTop);

    this._buildStage(w, contentTop, stageH);
    this._buildMilestone(w, milestoneTop, milestoneH);
    this._buildCta(w, ctaTop);
    buildBottomNav(this.container, w, h, 'tower');
  }

  private _buildStage(w: number, y: number, stageH: number): void {
    const stage = new PIXI.Container();
    stage.position.set(0, y);
    this.container.addChild(stage);

    // 再放大一档，位置略下移（相对上一版 0.42）
    const towerH = Math.min(Math.round(stageH * 1.18), 820);
    const towerW = Math.round(towerH * (315 / 900) * 1.32);
    const towerX = w * 0.46;
    const towerY = stageH * 0.48;
    this._mountSprite(stage, UI_IMAGES.towerPagoda, towerX, towerY, towerW, towerH);

    const panelX = w - 14 - STATUS_W;
    const panelY = Math.max(8, (stageH - STATUS_H) * 0.32);
    this._buildStatusCard(stage, panelX, panelY);
  }

  /**
   * 右侧状态区 —— 严格对齐截图：
   * 「本轮状态」→ 大号层数 → 起手血量 → 绿条+金菱 → 分隔 → 最高/存档 → 底栏规则带
   */
  private _buildStatusCard(parent: PIXI.Container, x: number, y: number): void {
    const tower = PlayerData.tower;
    const card = new PIXI.Container();
    card.position.set(x, y);
    parent.addChild(card);

    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.1);
    shadow.drawRoundedRect(3, 5, STATUS_W, STATUS_H, 14);
    shadow.endFill();
    card.addChild(shadow);

    card.addChild(makePanel({
      width: STATUS_W, height: STATUS_H, radius: 14,
      bg: 0xf7f3e9, bgAlpha: 0.96,
      border: 0xb08a52, borderWidth: 2,
      centered: false,
    }));

    // 底栏色带（规则区）
    const footer = new PIXI.Graphics();
    footer.beginFill(0xefe6d5, 1);
    const fr = 12;
    const fy = STATUS_H - STATUS_FOOTER_H;
    footer.moveTo(2, fy);
    footer.lineTo(STATUS_W - 2, fy);
    footer.lineTo(STATUS_W - 2, STATUS_H - fr);
    footer.quadraticCurveTo(STATUS_W - 2, STATUS_H - 2, STATUS_W - fr, STATUS_H - 2);
    footer.lineTo(fr, STATUS_H - 2);
    footer.quadraticCurveTo(2, STATUS_H - 2, 2, STATUS_H - fr);
    footer.closePath();
    footer.endFill();
    card.addChild(footer);

    // 角花轻点缀
    this._cornerFlourish(card, 10, 10, 1, 1);
    this._cornerFlourish(card, STATUS_W - 10, 10, -1, 1);
    this._cornerFlourish(card, 10, STATUS_H - 10, 1, -1);
    this._cornerFlourish(card, STATUS_W - 10, STATUS_H - 10, -1, -1);

    const pad = 16;
    const cx = STATUS_W / 2;
    let cy = 20;

    const eyebrow = makeText('「本轮状态」', {
      size: 14, fill: 0x5c4033, bold: true, anchor: 0.5,
    });
    eyebrow.position.set(cx, cy);
    card.addChild(eyebrow);
    cy += 30;

    const floorTitle = tower.runEnded
      ? `第 ${checkpointFloorOf(tower.runFloor)} 层`
      : `第 ${tower.runFloor} 层`;
    const floorText = makeText(floorTitle, {
      size: 36, fill: 0x5c4033, bold: true, anchor: 0.5,
      fontFamily: FONT_FAMILY_DISPLAY,
    });
    floorText.position.set(cx, cy);
    card.addChild(floorText);
    cy += 36;

    const hpRatio = tower.runEnded ? 0 : Math.max(0, Math.min(1, tower.runHpPct));
    const hpPct = Math.round(hpRatio * 100);
    const hpLabel = makeText(
      tower.runEnded ? '本轮已中断' : `起手血量 ${hpPct}%`,
      { size: FONT_SIZE.xxs, fill: 0x5c4033, bold: true, anchor: 0.5 },
    );
    hpLabel.position.set(cx, cy);
    card.addChild(hpLabel);
    cy += 18;

    const barW = STATUS_W - pad * 2;
    const barH = 16;
    this._drawStatusHpBar(card, pad, cy, barW, barH, hpRatio);
    cy += barH + 18;

    const line = new PIXI.Graphics();
    line.lineStyle(1.5, 0xc4b49a, 0.75);
    line.moveTo(pad + 8, cy);
    line.lineTo(STATUS_W - pad - 8, cy);
    card.addChild(line);
    this._diamond(card, cx, cy, 0xc4b49a);
    cy += 22;

    const meta = makeText(
      `最高 ${tower.bestFloor} · 存档每${TOWER.checkpointEvery}层`,
      { size: FONT_SIZE.xxs, fill: 0x5c4033, bold: true, anchor: 0.5 },
    );
    try { meta.updateText(true); } catch { /* noop */ }
    if (meta.width > STATUS_W - pad * 2) {
      meta.scale.set((STATUS_W - pad * 2) / meta.width);
    }
    meta.position.set(cx, cy);
    card.addChild(meta);

    const tip = makeText(
      `血量跨层继承 · 每层回${Math.round(TOWER.healPctPerFloor * 100)}%`,
      {
        size: 13, fill: 0x5c4033, bold: true, anchor: 0.5,
        wordWrapWidth: STATUS_W - 20,
        align: 'center',
      },
    );
    tip.position.set(cx, STATUS_H - STATUS_FOOTER_H / 2);
    card.addChild(tip);
  }

  /** 状态卡血条：胶囊绿条 + 末端金菱 */
  private _drawStatusHpBar(
    parent: PIXI.Container,
    x: number,
    y: number,
    w: number,
    h: number,
    ratio: number,
  ): void {
    const g = new PIXI.Graphics();
    const r = h / 2;
    g.beginFill(0xfaf8f2, 1);
    g.lineStyle(1.5, 0xc4b8a0, 1);
    g.drawRoundedRect(x, y, w, h, r);
    g.endFill();

    const t = Math.max(0, Math.min(1, ratio));
    if (t > 0.001) {
      const fw = Math.max(h, w * t);
      g.beginFill(0x6dbf7a, 1);
      g.drawRoundedRect(x, y, fw, h, r);
      g.endFill();
      // 末端高亮一点，近似渐变
      g.beginFill(0xa8d59d, 0.55);
      g.drawRoundedRect(x + fw - h, y + 1, h - 1, h - 2, r - 1);
      g.endFill();

      const dx = x + fw;
      const dy = y + h / 2;
      const d = new PIXI.Graphics();
      d.beginFill(0xf0d060, 1);
      d.lineStyle(1, 0xc9a45a, 1);
      d.moveTo(dx, dy - 7);
      d.lineTo(dx + 7, dy);
      d.lineTo(dx, dy + 7);
      d.lineTo(dx - 7, dy);
      d.closePath();
      d.endFill();
      parent.addChild(g);
      parent.addChild(d);
      return;
    }
    parent.addChild(g);
  }

  private _cornerFlourish(
    parent: PIXI.Container,
    x: number,
    y: number,
    sx: number,
    sy: number,
  ): void {
    const g = new PIXI.Graphics();
    g.lineStyle(1.5, 0xb08a52, 0.7);
    g.moveTo(x, y + 10 * sy);
    g.lineTo(x, y);
    g.lineTo(x + 10 * sx, y);
    parent.addChild(g);
  }

  /**
   * 里程碑横条 —— 严格对齐 UI 图三态：
   * 已领(灰圈+层数+灰六角「已领」) / 待领(金光圈+层数+金六角「待领」) / 未达成(奖励图+六角「N层」)
   */
  private _buildMilestone(w: number, y: number, panelH: number): void {
    const tower = PlayerData.tower;
    // 更高更窄，两侧多留白
    const panelW = Math.min(TOWER_PANEL_W, w - 160);
    const panelX = (w - panelW) / 2;
    const panel = new PIXI.Container();
    panel.position.set(panelX, y);
    this.container.addChild(panel);

    panel.addChild(makePanel({
      width: panelW, height: panelH, radius: 14,
      bg: 0xfdf6e9, bgAlpha: 0.96,
      border: 0xb08a52, borderWidth: 2,
      centered: false,
    }));
    this._diamond(panel, 12, 12, 0xb08a52);
    this._diamond(panel, panelW - 12, 12, 0xb08a52);
    this._diamond(panel, 12, panelH - 12, 0xb08a52);
    this._diamond(panel, panelW - 12, panelH - 12, 0xb08a52);

    const title = makeText('里程碑', {
      size: FONT_SIZE.sm, fill: 0x5c4033, bold: true, anchor: 0.5,
      fontFamily: FONT_FAMILY_DISPLAY,
    });
    title.position.set(panelW / 2, 22);
    panel.addChild(title);
    try { title.updateText(true); } catch { /* noop */ }

    const deco = new PIXI.Graphics();
    deco.lineStyle(1.5, 0xb08a52, 0.85);
    const ly = title.y;
    const tw = title.width;
    deco.moveTo(28, ly);
    deco.lineTo(panelW / 2 - tw / 2 - 14, ly);
    deco.moveTo(panelW / 2 + tw / 2 + 14, ly);
    deco.lineTo(panelW - 28, ly);
    panel.addChild(deco);
    this._diamond(panel, panelW / 2 - tw / 2 - 20, ly, 0xb08a52);
    this._diamond(panel, panelW / 2 + tw / 2 + 20, ly, 0xb08a52);

    const firstFloor = Math.max(
      TOWER.milestoneEvery,
      (Math.floor(tower.bestFloor / TOWER.milestoneEvery) - 1) * TOWER.milestoneEvery,
    );
    // 圆更大、图标吃满圆面，窄板内仍两侧留白
    const circleR = 36;
    const gap = 22;
    const total = MILESTONE_PREVIEW * (circleR * 2) + (MILESTONE_PREVIEW - 1) * gap;
    let x = (panelW - total) / 2 + circleR;
    const cy = 78;

    for (let i = 0; i < MILESTONE_PREVIEW; i++) {
      const floor = firstFloor + i * TOWER.milestoneEvery;
      const claimed = PlayerData.isTowerMilestoneClaimed(floor);
      const reached = tower.bestFloor >= floor;
      const claimable = reached && !claimed;
      const state: 'claimed' | 'claimable' | 'locked' = claimed
        ? 'claimed'
        : (claimable ? 'claimable' : 'locked');
      this._mountMilestoneSlot(panel, x, cy, circleR, floor, state);
      x += circleR * 2 + gap;
    }
  }

  private _mountMilestoneSlot(
    parent: PIXI.Container,
    x: number,
    y: number,
    r: number,
    floor: number,
    state: 'claimed' | 'claimable' | 'locked',
  ): void {
    const root = new PIXI.Container();
    root.position.set(x, y);
    parent.addChild(root);

    if (state === 'claimable') {
      const halo = new PIXI.Graphics();
      halo.beginFill(0xffe08a, 0.4);
      halo.drawCircle(0, 0, r + 7);
      halo.endFill();
      halo.beginFill(0xffd24a, 0.18);
      halo.drawCircle(0, 0, r + 12);
      halo.endFill();
      root.addChild(halo);
    }

    const ring = new PIXI.Graphics();
    if (state === 'claimable') {
      ring.beginFill(0xffe9a0, 1);
      ring.lineStyle(2.5, 0xe0b44a, 1);
      ring.drawCircle(0, 0, r);
      ring.endFill();
    } else if (state === 'claimed') {
      ring.beginFill(0xd8d0c4, 0.95);
      ring.lineStyle(1.8, 0xa8a098, 0.7);
      ring.drawCircle(0, 0, r);
      ring.endFill();
    } else {
      ring.beginFill(0xfffdf8, 0.98);
      ring.lineStyle(1.8, 0xc4a06a, 0.9);
      ring.drawCircle(0, 0, r);
      ring.endFill();
      ring.lineStyle(1, 0xc4a06a, 0.35);
      ring.drawCircle(0, 0, r + 3);
    }
    root.addChild(ring);

    if (state === 'locked') {
      // 未达成：圈内图标放大，保证看清
      const icon = Math.round(r * 0.95);
      this._mountSprite(root, UI_IMAGES.iconLingyu, -r * 0.32, -2, icon, icon);
      this._mountSprite(root, UI_IMAGES.iconShard, r * 0.34, 4, Math.round(icon * 0.92), Math.round(icon * 0.92));
    } else {
      const floorText = makeText(`${floor}层`, {
        size: state === 'claimable' ? 22 : 20,
        fill: state === 'claimable' ? 0x5c3d24 : 0x8a8680,
        bold: true,
        anchor: 0.5,
        fontFamily: FONT_FAMILY_DISPLAY,
      });
      try { floorText.updateText(true); } catch { /* noop */ }
      if (floorText.width > r * 1.55) floorText.scale.set((r * 1.55) / floorText.width);
      root.addChild(floorText);
    }

    // 底部六角标签
    const tagLabel = state === 'claimed'
      ? '已领'
      : (state === 'claimable' ? '待领' : `${floor}层`);
    const tagFill = state === 'claimed'
      ? 0xd0ccc4
      : (state === 'claimable' ? 0xfff0c8 : 0xf5efe6);
    const tagBorder = state === 'claimed'
      ? 0xa8a098
      : (state === 'claimable' ? 0xc9a45a : 0xc4a06a);
    const tagTextFill = state === 'claimed'
      ? 0x7a7670
      : 0x5c4033;
    const tagW = Math.round(r * 1.25);
    const tagH = 20;
    const tagY = r + 16;
    root.addChild(this._drawHexTag(0, tagY, tagW, tagH, tagFill, tagBorder));
    const tagText = makeText(tagLabel, {
      size: 13, fill: tagTextFill, bold: true, anchor: 0.5,
    });
    tagText.position.set(0, tagY);
    root.addChild(tagText);

    if (state === 'claimable') {
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.hitArea = new PIXI.Rectangle(-r - 8, -r - 8, (r + 8) * 2, r * 2 + tagH + 28);
      pressFeedback(root);
      bindPointerTap(root, () => {
        if (!PlayerData.claimTowerMilestone(floor)) return;
        grantReward(TOWER_MILESTONE_REWARD);
        Platform.showToast(`领取成功 · ${formatReward(TOWER_MILESTONE_REWARD)}`, 'success');
        this._build();
      });
    }
  }

  /** 横向六角标签（圆角矩形切角近似） */
  private _drawHexTag(
    x: number,
    y: number,
    w: number,
    h: number,
    fill: number,
    border: number,
  ): PIXI.Graphics {
    const g = new PIXI.Graphics();
    const hw = w / 2;
    const hh = h / 2;
    const cut = Math.min(8, hw * 0.35);
    g.beginFill(fill, 1);
    g.lineStyle(1.5, border, 1);
    g.moveTo(x - hw + cut, y - hh);
    g.lineTo(x + hw - cut, y - hh);
    g.lineTo(x + hw, y);
    g.lineTo(x + hw - cut, y + hh);
    g.lineTo(x - hw + cut, y + hh);
    g.lineTo(x - hw, y);
    g.closePath();
    g.endFill();
    return g;
  }

  private _buildCta(w: number, y: number): void {
    const tower = PlayerData.tower;

    if (!tower.runEnded) {
      // 文案对齐原型：挑战第37层（无空格）
      const btn = makeWarmGoldCtaButton({
        title: `挑战第${tower.runFloor}层`,
        width: CTA_BTN_W,
        height: CTA_BTN_H,
        onTap: () => this._challenge(tower.runFloor),
      });
      btn.position.set(w / 2, y + CTA_BTN_H / 2);
      this.container.addChild(btn);
      return;
    }

    const canReset = PlayerData.towerResetsLeft > 0;
    const needsAd = PlayerData.towerResetNeedsAd;
    const title = canReset
      ? (needsAd ? '看广告重置' : '免费重置')
      : '今日次数已用完';
    const btn = makeWarmGoldCtaButton({
      title,
      width: CTA_BTN_W,
      height: CTA_BTN_H,
      enabled: canReset,
      onTap: () => void this._reset(needsAd),
    });
    btn.position.set(w / 2, y + CTA_BTN_H / 2);
    this.container.addChild(btn);

    if (canReset) {
      const sub = makeText(
        `从第 ${checkpointFloorOf(tower.runFloor)} 层满血重来`,
        { size: FONT_SIZE.xxs, fill: 0x8a6a4a, bold: true, anchor: 0.5 },
      );
      sub.position.set(w / 2, y + CTA_BTN_H + 14);
      this.container.addChild(sub);
    }
  }

  private _challenge(floor: number): void {
    if (PlayerData.team.length === 0) {
      Platform.showToast('至少上阵 1 只灵宠');
      return;
    }
    buildTowerStage(floor);
    const context: BattleContext = { kind: 'tower', floor };
    analytics.track('tower_floor_start', {
      floor,
      best_floor: PlayerData.tower.bestFloor,
      hp_pct: Math.round(PlayerData.tower.runHpPct * 100),
    });
    Platform.vibrateShort('medium');
    SceneManager.switchTo('team', {
      stageId: towerStageId(floor),
      context,
      backScene: 'tower',
    } satisfies TeamEnterData);
  }

  private async _reset(needsAd: boolean): Promise<void> {
    if (needsAd) {
      analytics.trackAdShow('tower_reset');
      const ok = await Platform.showRewardedVideo();
      if (!ok) {
        Platform.showToast('广告未完成，请重试');
        return;
      }
    }
    if (!PlayerData.towerReset()) {
      Platform.showToast('今日重置次数已用完');
      return;
    }
    analytics.track('tower_reset', { by_ad: needsAd, floor: PlayerData.tower.runFloor });
    Platform.showToast(`已重置 · 从第 ${PlayerData.tower.runFloor} 层重来`, 'success');
    this._build();
  }

  private _diamond(parent: PIXI.Container, x: number, y: number, color: number): void {
    const g = new PIXI.Graphics();
    g.beginFill(color, 0.9);
    g.moveTo(x, y - 5);
    g.lineTo(x + 5, y);
    g.lineTo(x, y + 5);
    g.lineTo(x - 5, y);
    g.closePath();
    g.endFill();
    parent.addChild(g);
  }

  private _mountSprite(
    parent: PIXI.Container,
    path: string,
    x: number,
    y: number,
    w: number,
    h?: number,
  ): void {
    const slot = new PIXI.Container();
    slot.position.set(x, y);
    parent.addChild(slot);
    const apply = (tex: PIXI.Texture): void => {
      slot.removeChildren().forEach((c) => c.destroy());
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      if (h != null) {
        sp.width = w;
        sp.height = h;
      } else {
        const scale = w / Math.max(tex.width, tex.height);
        sp.scale.set(scale);
      }
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
}
