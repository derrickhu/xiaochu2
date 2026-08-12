/**
 * 五行秘境（对齐 docs/ui/secret_realm_ui_prototype.png = B 版）
 *
 * 顶栏：返回 + 匾「五行秘境」+ 剩余次数
 * 五行宝石条 → 洞府名 → 大门立绘（视觉中心）+ 右侧悬浮提示/奖励板
 * 难度三段 + 编队出战 + 底栏
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { Platform } from '@/core/PlatformService';
import { TextureCache } from '@/core/TextureCache';
import { ELEMENT_NAME, ORB_COLOR, UI } from '@/balance/ui';
import type { Element } from '@/balance/combat';
import {
  buildRealmStage, openRealmsOn, REALM_TIERS, REALMS, SECRET_REALM,
  realmCounterElement, resolveRealmTier, realmTierUnlockHint,
  type RealmDef, type RealmTierDef,
} from '@/balance/secretRealm';
import { BACKGROUND_IMAGES, UI_IMAGES } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import { adUsesLeft, watchAd } from '@/game/adGate';
import type { BattleContext } from '@/game/battleContext';
import {
  COLORS, FONT_SIZE, BOTTOM_NAV_RESERVE,
  buildBottomNav, makeBackButton, makeCoverBackground,
  makeSceneTitlePlaque, makeText, pressFeedback,
  makeWarmGoldCtaButton, WARM_GOLD_CTA_SIZE,
} from '@/ui';
import { TweenManager, Ease } from '@/core/TweenManager';
import { bindPointerTap } from '@/utils/bindPointerTap';
import type { TeamEnterData } from './TeamScene';
import { analytics } from '@/analytics';

/** 五行宝石统一尺寸；选中只加细光环，不再放大到盖住邻居 */
const CHIP = 76;
const CHIP_HALO = 10;
/** 难度 + CTA：出战钮复用通天塔暖金挑战匾 */
const CTA_BTN_W = WARM_GOLD_CTA_SIZE.width;
const CTA_BTN_H = WARM_GOLD_CTA_SIZE.height;
const ACTION_BLOCK_H = 64 + 12 + CTA_BTN_H;

const REALM_GATE: Readonly<Record<Element, string>> = {
  metal: UI_IMAGES.realmGateMetal,
  wood: UI_IMAGES.realmGateWood,
  water: UI_IMAGES.realmGateWater,
  fire: UI_IMAGES.realmGateFire,
  earth: UI_IMAGES.realmGateEarth,
};

const REALM_ORB: Readonly<Record<Element, string>> = {
  metal: UI_IMAGES.realmOrbMetal,
  wood: UI_IMAGES.realmOrbWood,
  water: UI_IMAGES.realmOrbWater,
  fire: UI_IMAGES.realmOrbFire,
  earth: UI_IMAGES.realmOrbEarth,
};

export class SecretRealmScene implements Scene {
  readonly name = 'realm';
  readonly container = new PIXI.Container();

  private _selectedId: string | null = null;
  private _selectedTier = 2;
  private _body: PIXI.Container | null = null;

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    this._ensureSelection();
    this._build();
    void TextureCache.preload([
      BACKGROUND_IMAGES.realm,
      UI_IMAGES.navRealm,
      UI_IMAGES.sceneTitlePlaque,
      UI_IMAGES.iconLingyu,
      UI_IMAGES.iconCoin,
      UI_IMAGES.realmDiffIdle,
      UI_IMAGES.realmDiffSelected,
      UI_IMAGES.towerBtnCta,
      ...Object.values(REALM_GATE),
      ...Object.values(REALM_ORB),
    ]);
    void Game.warmScenePresent();
  }

  onExit(): void {
    this._body = null;
    this.container.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });
  }

  private _ensureSelection(): void {
    const open = openRealmsOn();
    const openIds = new Set(open.map((r) => r.id));
    if (!this._selectedId || !REALMS.some((r) => r.id === this._selectedId)) {
      this._selectedId = open[0]?.id ?? REALMS[0].id;
    } else if (!openIds.has(this._selectedId) && open.length > 0 && open.length < REALMS.length) {
      this._selectedId = open[0].id;
    }
    let best = 1;
    for (const t of REALM_TIERS) {
      if (PlayerData.isChapterUnlocked(t.unlockChapter)) best = t.tier;
    }
    const cur = REALM_TIERS.find((t) => t.tier === this._selectedTier);
    if (!cur || !PlayerData.isChapterUnlocked(cur.unlockChapter)) {
      this._selectedTier = best;
    }
  }

  /** 按当前通关进度解析选中档（高阶会动态抬难度/奖励） */
  private _activeTier(): RealmTierDef {
    return resolveRealmTier(this._selectedTier, PlayerData.clearedChapters);
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._body = null;
    this.container.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });

    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.realm, w, h));

    // 顶栏轻托底，匾更清晰
    const headerBand = new PIXI.Graphics();
    headerBand.beginFill(0xfff8ec, 0.35);
    headerBand.drawRect(0, 0, w, Game.safeTop + 70);
    headerBand.endFill();
    this.container.addChild(headerBand);

    const back = makeBackButton({ onTap: () => SceneManager.switchTo('title', PlayerData.titleEnter()) });
    back.position.set(72, Game.safeHeaderCenterY);
    this.container.addChild(back);

    const plaque = makeSceneTitlePlaque({ text: '五行秘境', screenWidth: w });
    plaque.position.set(w / 2, Game.safeHeaderCenterY);
    this.container.addChild(plaque);

    const runs = makeText(
      `剩余 ${PlayerData.realmRunsLeft}/${SECRET_REALM.dailyRuns}`,
      { size: FONT_SIZE.xs, fill: COLORS.textTitle, bold: true, anchor: [1, 0.5] },
    );
    runs.position.set(w - 22, Game.safeHeaderCenterY);
    this.container.addChild(runs);

    this._body = new PIXI.Container();
    this.container.addChild(this._body);
    this._refreshBody();

    buildBottomNav(this.container, w, h, 'realm');
  }

  private _refreshBody(): void {
    if (!this._body) return;
    this._body.removeChildren().forEach((c) => c.destroy({ children: true }));

    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const realm = REALMS.find((r) => r.id === this._selectedId) ?? REALMS[0];
    const openList = openRealmsOn();
    const openIds = new Set(openList.map((r) => r.id));
    const isOpen = openIds.has(realm.id);
    const tier = this._activeTier();

    const contentTop = Game.safeTop + 12;
    const contentBottom = h - BOTTOM_NAV_RESERVE - 4;
    let y = contentTop;

    y = this._buildElementStrip(w, y, openIds, openList.length) + 6;

    // 舞台：洞府名 + 大门 + 右侧信息板，吃满中间高度
    const stageBottom = contentBottom - ACTION_BLOCK_H - 10;
    const stageH = Math.max(420, stageBottom - y);
    this._buildStage(w, y, stageH, realm, tier, isOpen);
    y += stageH + 12;

    y = this._buildDifficulty(w, y) + 16;
    this._buildCta(w, y, realm, isOpen);
  }

  private _buildElementStrip(
    w: number,
    y: number,
    openIds: Set<string>,
    openCount: number,
  ): number {
    // 间距 > 光环；两侧再留边，避免金/土贴屏被裁
    const slot = CHIP + CHIP_HALO * 2 + 8;
    const gap = 18;
    const sidePad = 28;
    const total = REALMS.length * slot + (REALMS.length - 1) * gap;
    const usable = Math.min(total, w - sidePad * 2);
    const scaleGap = total > usable
      ? Math.max(10, Math.floor((usable - REALMS.length * slot) / (REALMS.length - 1)))
      : gap;
    const rowW = REALMS.length * slot + (REALMS.length - 1) * scaleGap;
    let x = (w - rowW) / 2 + slot / 2;
    const rowH = CHIP + 36;

    let selectedChip: PIXI.Container | null = null;
    for (const realm of REALMS) {
      const open = openIds.has(realm.id);
      const selected = realm.id === this._selectedId;
      const showToday = open && (openCount === 1 || selected);
      const chip = this._makeElementChip(realm, open, selected, showToday);
      chip.position.set(x, y + CHIP / 2);
      this._body!.addChild(chip);
      if (selected) selectedChip = chip;
      x += slot + scaleGap;
    }
    if (selectedChip) this._body!.addChild(selectedChip);
    return y + rowH;
  }

  private _makeElementChip(
    realm: RealmDef,
    open: boolean,
    selected: boolean,
    showToday: boolean,
  ): PIXI.Container {
    const root = new PIXI.Container();
    const color = ORB_COLOR[realm.element];
    const r = CHIP / 2;

    if (selected) {
      // 细金环 + 淡属性光，圆心与宝石锚点严格同心
      const halo = new PIXI.Graphics();
      halo.beginFill(color, 0.22);
      halo.drawCircle(0, 0, r + CHIP_HALO);
      halo.endFill();
      halo.lineStyle(4, 0xe8a33d, 0.95);
      halo.drawCircle(0, 0, r + 4);
      root.addChild(halo);
    }

    this._mountSprite(root, REALM_ORB[realm.element], 0, 0, CHIP);

    const under = makeText(ELEMENT_NAME[realm.element], {
      size: FONT_SIZE.xs,
      fill: selected ? color : (open ? COLORS.textTitle : COLORS.textDisabled),
      bold: true, anchor: 0.5,
      role: 'title',
    });
    under.position.set(0, r + 18);
    root.addChild(under);

    if (showToday) {
      const badge = new PIXI.Container();
      badge.position.set(r * 0.58, -r * 0.58);
      const bg = new PIXI.Graphics();
      bg.beginFill(0xe85a4a, 1);
      bg.drawRoundedRect(-18, -11, 36, 22, 10);
      bg.endFill();
      badge.addChild(bg);
      badge.addChild(makeText('今日', {
        size: 12, fill: 0xfffaf0, bold: true, anchor: 0.5,
      }));
      root.addChild(badge);
    } else if (!open) {
      root.alpha = 0.5;
    }

    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.hitArea = new PIXI.Circle(0, 0, r + CHIP_HALO + 4);
    root.on('pointertap', () => {
      if (this._selectedId === realm.id) return;
      this._selectedId = realm.id;
      this._refreshBody();
    });
    return root;
  }

  private _buildStage(
    w: number,
    y: number,
    stageH: number,
    realm: RealmDef,
    tier: RealmTierDef,
    isOpen: boolean,
  ): void {
    const stage = new PIXI.Container();
    stage.position.set(0, y);
    this._body!.addChild(stage);

    // 洞府名居中（大门上方）
    const nameY = 8;
    const name = makeText(realm.name, {
      size: FONT_SIZE.xl + 2,
      fill: ORB_COLOR[realm.element],
      bold: true, anchor: 0.5,
      role: 'title',
      strokeColor: 0xfff8ec,
      strokeWidth: 5,
    });
    name.position.set(w / 2, nameY + 22);
    stage.addChild(name);
    this._diamond(stage, w / 2 - 130, nameY + 22, ORB_COLOR[realm.element]);
    this._diamond(stage, w / 2 + 130, nameY + 22, ORB_COLOR[realm.element]);

    // 大门居中（右侧信息卡可轻微叠在门边上，对齐原型）
    const panelW = 168;
    const panelX = w - 10 - panelW;
    const gateTop = nameY + 52;
    const gateH = Math.max(300, stageH - gateTop - 8);
    const gateW = Math.min(560, w - 24);
    const gateX = (w - gateW) / 2;
    this._mountCoverArt(stage, REALM_GATE[realm.element], gateX, gateTop, gateW, gateH, 28);

    // 门后柔光，轻微呼吸
    const glow = new PIXI.Graphics();
    glow.beginFill(ORB_COLOR[realm.element], 0.16);
    glow.drawEllipse(w / 2, gateTop + gateH * 0.55, gateW * 0.42, gateH * 0.38);
    glow.endFill();
    glow.alpha = 0.7;
    stage.addChildAt(glow, 0);
    this._breathe(glow);

    // 右侧两卡：克制提示（拱顶）+ 挑战奖励（尖底）
    const hintH = 188;
    const rewardH = 168;
    const stackGap = 12;
    const stackH = hintH + stackGap + rewardH;
    const hintY = gateTop + Math.max(4, (gateH - stackH) / 2);
    this._buildHintPanel(stage, panelX, hintY, panelW, hintH, realm, isOpen);
    this._buildRewardPanel(stage, panelX, hintY + hintH + stackGap, panelW, rewardH, tier);
  }

  /** 柔光 alpha 来回（销毁后自动停） */
  private _breathe(target: PIXI.DisplayObject): void {
    const tick = (to: number): void => {
      if (target.destroyed) return;
      TweenManager.to({
        target,
        props: { alpha: to },
        duration: 1.6,
        ease: Ease.easeInOutQuad,
        onComplete: () => tick(to > 0.75 ? 0.45 : 0.95),
      });
    };
    tick(0.95);
  }

  private _diamond(parent: PIXI.Container, x: number, y: number, color: number): void {
    const g = new PIXI.Graphics();
    g.beginFill(color, 0.85);
    g.moveTo(x, y - 8);
    g.lineTo(x + 8, y);
    g.lineTo(x, y + 8);
    g.lineTo(x - 8, y);
    g.closePath();
    g.endFill();
    parent.addChild(g);
  }

  private _buildHintPanel(
    parent: PIXI.Container,
    x: number,
    y: number,
    panelW: number,
    panelH: number,
    realm: RealmDef,
    isOpen: boolean,
  ): void {
    const panel = new PIXI.Container();
    panel.position.set(x, y);
    parent.addChild(panel);

    const tipH = 54;
    const peak = 12;
    this._drawHintPlate(panel, panelW, panelH, tipH, peak);

    // 上方大宝石 + 属性字（字按玉面光学居中：贴图底尖会拉低几何中心）
    const orbY = peak + 8 + (panelH - tipH - peak) * 0.40;
    const orbSize = 92;
    this._mountSprite(panel, REALM_ORB[realm.element], panelW / 2, orbY, orbSize);
    const elLabel = makeText(ELEMENT_NAME[realm.element], {
      size: Math.round(orbSize * 0.36),
      fill: 0x5c3d24,
      bold: true,
      anchor: 0.5,
      role: 'title',
    });
    try { elLabel.updateText(true); } catch { /* noop */ }
    // 底尖约 6% 高 → 玉心略上；中文字面又常偏上 → 再略下压对齐
    const gemCenterY = orbY - orbSize * 0.04;
    elLabel.position.set(panelW / 2, gemCenterY + elLabel.height * 0.06);
    panel.addChild(elLabel);

    // 底部提示条：! + 克制文案
    const counter = realmCounterElement(realm);
    const tip = isOpen
      ? `${ELEMENT_NAME[counter]}属灵宠克制${ELEMENT_NAME[realm.element]}敌人`
      : '今日未开放，周末或对应日再来';
    const bangBg = new PIXI.Graphics();
    bangBg.beginFill(0xe85a2a, 1);
    bangBg.drawCircle(0, 0, 9);
    bangBg.endFill();
    bangBg.position.set(16, panelH - tipH / 2 - 2);
    panel.addChild(bangBg);
    const bang = makeText('!', {
      size: FONT_SIZE.xs, fill: 0xffffff, bold: true, anchor: 0.5,
    });
    bang.position.copyFrom(bangBg.position);
    panel.addChild(bang);

    const tipText = makeText(tip, {
      size: FONT_SIZE.xxs, fill: 0x6b4423, bold: true, anchor: [0, 0.5],
      wordWrapWidth: panelW - 44,
    });
    try { tipText.updateText(true); } catch { /* noop */ }
    tipText.position.set(28, panelH - tipH / 2 - 2);
    panel.addChild(tipText);
  }

  private _buildRewardPanel(
    parent: PIXI.Container,
    x: number,
    y: number,
    panelW: number,
    panelH: number,
    tier: RealmTierDef,
  ): void {
    const panel = new PIXI.Container();
    panel.position.set(x, y);
    parent.addChild(panel);

    const tip = 16;
    this._drawRewardPlate(panel, panelW, panelH, tip);

    const pad = 12;
    const title = makeText('挑战奖励', {
      size: FONT_SIZE.sm, fill: 0x6b4423, bold: true, anchor: 0.5,
      role: 'title',
    });
    title.position.set(panelW / 2, pad + 16);
    panel.addChild(title);
    try { title.updateText(true); } catch { /* noop */ }

    // 标题两侧菱形分隔线
    const deco = new PIXI.Graphics();
    deco.lineStyle(1.5, 0xb08a52, 0.85);
    const ly = title.y;
    const tw = title.width;
    deco.moveTo(pad + 4, ly);
    deco.lineTo(panelW / 2 - tw / 2 - 14, ly);
    deco.moveTo(panelW / 2 + tw / 2 + 14, ly);
    deco.lineTo(panelW - pad - 4, ly);
    panel.addChild(deco);
    this._diamond(panel, panelW / 2 - tw / 2 - 22, ly, 0xb08a52);
    this._diamond(panel, panelW / 2 + tw / 2 + 22, ly, 0xb08a52);

    // 高阶动态档：标明当前等效章，避免玩家以为永远停在 8 章
    let slotsTop = pad + 40;
    if (tier.dynamicScale) {
      const scaleHint = makeText(`难度·第${tier.scaleChapter}章`, {
        size: FONT_SIZE.xxs, fill: 0x8a5a32, bold: true, anchor: 0.5,
      });
      scaleHint.position.set(panelW / 2, pad + 36);
      panel.addChild(scaleHint);
      slotsTop = pad + 52;
    }

    const slot = 52;
    const gap = 12;
    const total = slot * 2 + gap;
    const leftX = (panelW - total) / 2 + slot / 2;
    const rightX = leftX + slot + gap;
    const cy = slotsTop + (panelH - tip - slotsTop) * 0.38;
    this._mountRewardSlot(panel, UI_IMAGES.iconLingyu, '灵玉', `×${tier.lingyu}`, leftX, cy, slot);
    this._mountRewardSlot(panel, UI_IMAGES.iconCoin, '灵宠币', `×${tier.coins}`, rightX, cy, slot);
  }

  /** 克制卡：拱顶奶油板 + 底部提示条 */
  private _drawHintPlate(
    parent: PIXI.Container,
    w: number,
    h: number,
    tipH: number,
    peak: number,
  ): void {
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.1);
    this._pathHintPlate(shadow, 2, 4, w, h, peak);
    shadow.endFill();
    parent.addChildAt(shadow, 0);

    const body = new PIXI.Graphics();
    body.beginFill(0xfff8ec, 0.96);
    body.lineStyle(2, 0xc4a06a, 1);
    this._pathHintPlate(body, 0, 0, w, h, peak);
    body.endFill();
    parent.addChild(body);

    // 底部提示底（略深）
    const tip = new PIXI.Graphics();
    tip.beginFill(0xf0e2c4, 0.98);
    tip.drawRoundedRect(3, h - tipH, w - 6, tipH - 3, 12);
    tip.endFill();
    parent.addChild(tip);

    // 顶角小菱形点缀
    this._diamond(parent, 18, peak + 14, 0xc4a06a);
    this._diamond(parent, w - 18, peak + 14, 0xc4a06a);
    this._diamond(parent, w / 2, 4, 0xc4a06a);
  }

  private _pathHintPlate(
    g: PIXI.Graphics,
    ox: number,
    oy: number,
    w: number,
    h: number,
    peak: number,
  ): void {
    const r = 14;
    g.moveTo(ox + r, oy + peak);
    g.lineTo(ox + w * 0.38, oy + peak);
    g.quadraticCurveTo(ox + w / 2, oy - 2, ox + w * 0.62, oy + peak);
    g.lineTo(ox + w - r, oy + peak);
    g.quadraticCurveTo(ox + w, oy + peak, ox + w, oy + peak + r);
    g.lineTo(ox + w, oy + h - r);
    g.quadraticCurveTo(ox + w, oy + h, ox + w - r, oy + h);
    g.lineTo(ox + r, oy + h);
    g.quadraticCurveTo(ox, oy + h, ox, oy + h - r);
    g.lineTo(ox, oy + peak + r);
    g.quadraticCurveTo(ox, oy + peak, ox + r, oy + peak);
    g.closePath();
  }

  /** 奖励卡：圆角顶 + 尖底 */
  private _drawRewardPlate(
    parent: PIXI.Container,
    w: number,
    h: number,
    tip: number,
  ): void {
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.1);
    this._pathRewardPlate(shadow, 2, 4, w, h, tip);
    shadow.endFill();
    parent.addChildAt(shadow, 0);

    const body = new PIXI.Graphics();
    body.beginFill(0xfff8ec, 0.96);
    body.lineStyle(2, 0xb08a52, 1);
    this._pathRewardPlate(body, 0, 0, w, h, tip);
    body.endFill();
    parent.addChild(body);

    this._diamond(parent, 16, 16, 0xb08a52);
    this._diamond(parent, w - 16, 16, 0xb08a52);
  }

  private _pathRewardPlate(
    g: PIXI.Graphics,
    ox: number,
    oy: number,
    w: number,
    h: number,
    tip: number,
  ): void {
    const r = 14;
    const bodyBottom = oy + h - tip;
    g.moveTo(ox + r, oy);
    g.lineTo(ox + w - r, oy);
    g.quadraticCurveTo(ox + w, oy, ox + w, oy + r);
    g.lineTo(ox + w, bodyBottom - 8);
    g.quadraticCurveTo(ox + w, bodyBottom, ox + w - 18, bodyBottom + 4);
    g.lineTo(ox + w / 2 + 10, oy + h - 4);
    g.quadraticCurveTo(ox + w / 2, oy + h + 2, ox + w / 2 - 10, oy + h - 4);
    g.lineTo(ox + 18, bodyBottom + 4);
    g.quadraticCurveTo(ox, bodyBottom, ox, bodyBottom - 8);
    g.lineTo(ox, oy + r);
    g.quadraticCurveTo(ox, oy, ox + r, oy);
    g.closePath();
  }

  private _mountRewardSlot(
    parent: PIXI.Container,
    iconPath: string,
    title: string,
    amount: string,
    x: number,
    y: number,
    slot = 52,
  ): void {
    const box = new PIXI.Graphics();
    box.beginFill(0xf7edd8, 0.95);
    box.lineStyle(1.5, 0xb08a52, 0.8);
    box.drawRoundedRect(x - slot / 2, y - slot / 2, slot, slot, 10);
    box.endFill();
    parent.addChild(box);
    this._mountSprite(parent, iconPath, x, y, slot - 12);

    const name = makeText(title, {
      size: FONT_SIZE.xxs, fill: 0x6b4423, bold: true, anchor: 0.5,
    });
    const qty = makeText(amount, {
      size: FONT_SIZE.xxs, fill: 0x8a5a32, bold: true, anchor: 0.5,
    });
    for (const t of [name, qty]) {
      try { t.updateText(true); } catch { /* noop */ }
      if (t.width > slot + 8) t.scale.set((slot + 8) / t.width);
    }
    name.position.set(x, y + slot / 2 + 12);
    qty.position.set(x, y + slot / 2 + 26);
    parent.addChild(name, qty);
  }

  private _buildDifficulty(w: number, y: number): number {
    const btnW = 210;
    const btnH = 64;
    const gap = 14;
    const total = REALM_TIERS.length * btnW + (REALM_TIERS.length - 1) * gap;
    let x = (w - total) / 2 + btnW / 2;

    for (const base of REALM_TIERS) {
      const unlocked = PlayerData.isChapterUnlocked(base.unlockChapter);
      const selected = base.tier === this._selectedTier;
      const resolved = resolveRealmTier(base.tier, PlayerData.clearedChapters);
      const pill = new PIXI.Container();
      pill.position.set(x, y + btnH / 2);
      this._body!.addChild(pill);

      // 原型贴图底板：青绿 idle / 暖金 selected
      this._mountPlate(
        pill,
        selected ? UI_IMAGES.realmDiffSelected : UI_IMAGES.realmDiffIdle,
        btnW,
        btnH,
        unlocked ? 1 : 0.55,
      );

      // 未解锁也显示门槛章；高阶已解锁时标当前等效章
      let label = base.name;
      if (!unlocked) label = `${base.name}·${base.unlockChapter}章`;
      else if (base.dynamicScale) label = `${base.name}·${resolved.scaleChapter}`;

      pill.addChild(makeText(label, {
        size: FONT_SIZE.sm,
        fill: selected ? 0x6b3e12 : (unlocked ? 0x2f6a5a : COLORS.textDisabled),
        bold: true, anchor: 0.5,
        role: 'title',
      }));

      // 锁定档也可点：toast 说明何时解锁（避免「点了没反应」）
      pill.eventMode = 'static';
      pill.cursor = 'pointer';
      pill.hitArea = new PIXI.Rectangle(-btnW / 2, -btnH / 2, btnW, btnH);
      pressFeedback(pill);
      bindPointerTap(pill, () => {
        if (!unlocked) {
          Platform.showToast(realmTierUnlockHint(base));
          return;
        }
        if (this._selectedTier === base.tier) return;
        this._selectedTier = base.tier;
        this._refreshBody();
      });
      x += btnW + gap;
    }
    return y + btnH;
  }

  private _buildCta(w: number, y: number, realm: RealmDef, isOpen: boolean): void {
    const runsOk = PlayerData.realmRunsLeft > 0;
    const tierBase = REALM_TIERS.find((t) => t.tier === this._selectedTier) ?? REALM_TIERS[0];
    const unlocked = PlayerData.isChapterUnlocked(tierBase.unlockChapter);
    const canEnter = isOpen && runsOk && unlocked;
    // 次数用尽是「已经想玩」的最强信号，此时才出广告位（IAA，日 2 次）
    const adRun = isOpen && unlocked && !runsOk && adUsesLeft('realm_extra_run') > 0;
    let title = '编队出战';
    if (adRun) title = '看广告 +1 次';
    else if (!isOpen) title = '今日未开放';
    else if (!runsOk) title = '次数已用完';
    else if (!unlocked) title = '难度未解锁';

    // 与通天塔「挑战第 N 层」同款暖金挑战匾
    const btn = makeWarmGoldCtaButton({
      title,
      width: CTA_BTN_W,
      height: CTA_BTN_H,
      // 未解锁也保持可点，用来 toast 解锁条件
      enabled: canEnter || adRun || !unlocked,
      onTap: () => {
        if (!unlocked) {
          Platform.showToast(realmTierUnlockHint(tierBase));
          return;
        }
        if (adRun) {
          void this._watchExtraRun();
          return;
        }
        if (!canEnter) return;
        this._enterRealm(realm, this._activeTier());
      },
    });
    btn.position.set(w / 2, y + CTA_BTN_H / 2);
    this._body!.addChild(btn);
  }

  /** 广告加次数：realmRunsLeft 直接读广告计数，看完即多一次，无需另发道具 */
  private async _watchExtraRun(): Promise<void> {
    if (!await watchAd('realm_extra_run', { tier: this._selectedTier })) return;
    Platform.showToast('秘境次数 +1', 'success');
    this._refreshBody();
  }

  /** 难度 pill 底板贴图 */
  private _mountPlate(
    parent: PIXI.Container,
    path: string,
    w: number,
    h: number,
    alpha = 1,
  ): void {
    const slot = new PIXI.Container();
    parent.addChildAt(slot, 0);
    const apply = (tex: PIXI.Texture): void => {
      slot.removeChildren().forEach((c) => c.destroy());
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      sp.width = w;
      sp.height = h;
      sp.alpha = alpha;
      slot.addChild(sp);
    };
    const cached = TextureCache.get(path);
    if (cached) {
      apply(cached);
      return;
    }
    const fb = new PIXI.Graphics();
    fb.beginFill(0xfff3d8, 0.95);
    fb.lineStyle(3, 0xe0b44a, 1);
    fb.drawRoundedRect(-w / 2, -h / 2, w, h, Math.min(40, h / 2));
    fb.endFill();
    fb.alpha = alpha;
    slot.addChild(fb);
    void TextureCache.load(path).then((tex) => {
      if (!slot.destroyed) apply(tex);
    }).catch(() => null);
  }

  private _mountCoverArt(
    parent: PIXI.Container,
    path: string,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
  ): void {
    const host = new PIXI.Container();
    host.position.set(x, y);
    parent.addChild(host);

    // 轻底，避免透明边发虚
    const plate = new PIXI.Graphics();
    plate.beginFill(0xfff8ec, 0.18);
    plate.drawRoundedRect(0, 0, w, h, radius);
    plate.endFill();
    host.addChild(plate);

    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawRoundedRect(0, 0, w, h, radius);
    mask.endFill();
    host.addChild(mask);

    const slot = new PIXI.Container();
    host.addChild(slot);
    slot.mask = mask;

    const apply = (tex: PIXI.Texture): void => {
      slot.removeChildren().forEach((c) => c.destroy());
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      // contain：完整门洞，不裁切关键结构
      const scale = Math.min(w / Math.max(1, tex.width), h / Math.max(1, tex.height)) * 0.96;
      sp.scale.set(scale);
      sp.position.set(w / 2, h / 2);
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

  private _mountSprite(
    parent: PIXI.Container,
    path: string,
    x: number,
    y: number,
    size: number,
  ): void {
    const slot = new PIXI.Container();
    slot.position.set(x, y);
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

  private _enterRealm(realm: RealmDef, tier: RealmTierDef): void {
    if (PlayerData.realmRunsLeft <= 0) {
      Platform.showToast(`今日秘境次数已用完（${SECRET_REALM.dailyRuns} 次），明天再来`);
      return;
    }
    if (!openRealmsOn().some((r) => r.id === realm.id)) {
      Platform.showToast('该秘境今日未开放');
      return;
    }
    const stage = buildRealmStage(realm, tier.tier, PlayerData.clearedChapters);
    const context: BattleContext = { kind: 'realm', realmId: realm.id, tier: tier.tier };
    analytics.track('secret_realm_start', {
      realm_id: realm.id,
      element: realm.element,
      tier: tier.tier,
      scale_chapter: tier.scaleChapter,
      runs_left: PlayerData.realmRunsLeft,
    });
    Platform.vibrateShort('medium');
    SceneManager.switchTo('team', {
      stageId: stage.id,
      context,
      backScene: 'realm',
    } satisfies TeamEnterData);
  }
}
