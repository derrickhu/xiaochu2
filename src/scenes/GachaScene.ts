/**
 * 抽卡场景：灵玉单抽 / 十连，按 gachaRate 出货，保底进度可见，召唤台演出揭示。
 *
 * 数值与落库全部走 PlayerData（单一真源）；本场景只负责演出与交互。
 * 揭示时间轴解耦在 gacha/gachaRevealSequence.ts；场景只构建结构 + 编排。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { Platform } from '@/core/PlatformService';
import { TextureCache } from '@/core/TextureCache';
import { getPetAvatarTexture } from '@/config/petAvatarTexture';
import { gachaPreloadImages, gachaPetAvatarEntries, ensurePetAvatars } from '@/config/assetPreload';
import { ensureAssets } from '@/config/Subpackages';
import { UI, ELEMENT_NAME } from '@/balance/ui';
import { PET_MAP } from '@/balance/pets';
import type { Element } from '@/balance/combat';
import { RARITIES, getRarity } from '@/balance/rarity';
import { ECONOMY } from '@/balance/economy';
import { PlayerData } from '@/game/PlayerData';
import { poolGachaRates, type PullOutcome } from '@/game/gacha/Gacha';
import { gachaPoolPets } from '@/game/playerGacha';
import {
  BACKGROUND_IMAGES, UI_IMAGES, UI_FX_IMAGES,
} from '@/config/Assets';
import {
  COLORS, FONT_SIZE, RADIUS,
  makeBackButton, makeButton, makeCoverBackground, makePanel, makeText, makeNamePlaque,
  attachRarityBadge, makeCurrencyLabel, makeProgressBar, makeActionButton,
  SceneFx, type ActionButtonHandle,
} from '@/ui';
import { GachaRevealSequence } from './gacha/gachaRevealSequence';
import { buildGachaCompareCard, pickBestNewOutcome } from './gacha/gachaCompareCard';
import { SceneEnterSeq, deferSceneBuild } from '@/utils/sceneEnterSeq';
import { bindPointerTap } from '@/utils/bindPointerTap';

export class GachaScene implements Scene {
  readonly name = 'gacha';
  readonly container = new PIXI.Container();

  /** 主页面内容层（element 切换 / 抽卡后局部重建；onExit 整页重建避免二次进入脏状态） */
  private _page = new PIXI.Container();

  /** 当前选中的五行筛选；null = 全局池（默认） */
  private _elementFilter: Element | null = null;
  /** 结果浮层当前的特效宿主（由 update 驱动） */
  private _fx: SceneFx | null = null;
  private _reveal: GachaRevealSequence | null = null;
  /** 上次抽卡数量，用于「再抽一次」 */
  private _lastCount: 1 | 10 = 1;
  /** 主界面抽卡按钮（结果浮层打开时需禁用，避免误触底层十连） */
  private _singlePullBtn: ActionButtonHandle | null = null;
  private _tenPullBtn: ActionButtonHandle | null = null;
  private readonly _enterSeq = new SceneEnterSeq();

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    void this._enter(this._enterSeq.next());
  }

  private async _enter(token: number): Promise<void> {
    await ensureAssets(gachaPreloadImages());
    await ensurePetAvatars(gachaPetAvatarEntries());
    if (!this._enterSeq.stillValid(token)) return;
    deferSceneBuild(token, this._enterSeq, 'gacha', () => {
      this._ensurePage();
      this._build();
    });
  }

  /** 保证 _page 挂载到 container 且未销毁 */
  private _ensurePage(): void {
    if (this._page.destroyed) this._page = new PIXI.Container();
    if (this._page.parent !== this.container) {
      this.container.addChild(this._page);
    }
  }

  onExit(): void {
    this._enterSeq.cancel();
    this._teardownResults();
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._page = new PIXI.Container();
  }

  update(dt: number): void {
    this._fx?.update(dt);
  }

  private _build(): void {
    if (SceneManager.current?.name !== 'gacha') return;
    this._ensurePage();
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._page.removeChildren().forEach((c) => c.destroy({ children: true }));

    // 砸金蛋主视觉背景（对齐原型）
    this._page.addChild(makeCoverBackground(BACKGROUND_IMAGES.gachaEgg, w, h));

    const back = makeBackButton({
      onTap: () => SceneManager.switchTo('title'),
    });
    back.position.set(80, Game.safeTop + 36);
    this._page.addChild(back);

    this._buildTitlePlaque(w, Game.safeTop + 36, '灵宠召唤');

    // 灵玉右上角胶囊
    const balance = makeCurrencyLabel('lingyu', PlayerData.lingyu);
    const balPadX = 14;
    const balH = 44;
    const balW = Math.ceil(balance.width) + balPadX * 2;
    const balBg = makePanel({
      width: balW, height: balH, radius: balH / 2, centered: false,
      bg: COLORS.panelBg, bgAlpha: 0.92, border: COLORS.panelBorderSoft, borderWidth: 2,
    });
    balBg.position.set(w - balW - 24, Game.safeTop + 16);
    balance.position.set(balPadX, (balH - 38) / 2);
    balBg.addChild(balance);
    this._page.addChild(balBg);

    this._buildPity(w, Game.safeTop + 100);

    const tip = makeText('敲碎金蛋，召唤仙灵', {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: 0.5,
      strokeColor: 0xfff8ec, strokeWidth: 4,
    });
    tip.position.set(w / 2, h - 250);
    this._page.addChild(tip);

    // 金蛋热区：点击 = 单抽
    const eggHit = new PIXI.Graphics();
    eggHit.beginFill(0xffffff, 0.001);
    eggHit.drawEllipse(0, 0, 170, 210);
    eggHit.endFill();
    eggHit.position.set(w / 2, h * 0.48);
    eggHit.eventMode = 'static';
    eggHit.cursor = 'pointer';
    bindPointerTap(eggHit, () => this._doPull(1));
    this._page.addChild(eggHit);

    this._buildPullButtons(w, h);
  }

  /** 保底进度：对齐原型「距离 SSR 灵宠必出还差 N 抽」 */
  private _buildPity(w: number, y: number): void {
    const pity = ECONOMY.gacha.pitySSR;
    const cur = Math.min(pity, PlayerData.gachaSinceHigh);
    const remain = Math.max(0, pity - cur);
    const ssrColor = getRarity(3).color;

    const row = new PIXI.Container();
    const prefix = makeText('距离 ', {
      size: FONT_SIZE.xs, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    });
    const ssr = makeText('SSR', {
      size: FONT_SIZE.xs, fill: ssrColor, bold: true, anchor: [0, 0.5],
    });
    const rest = makeText(` 灵宠必出还差 ${remain} 抽`, {
      size: FONT_SIZE.xs, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    });
    prefix.position.set(0, 0);
    ssr.position.set(prefix.width, 0);
    rest.position.set(prefix.width + ssr.width, 0);
    row.addChild(prefix, ssr, rest);
    row.position.set(w / 2 - (prefix.width + ssr.width + rest.width) / 2, y);
    this._page.addChild(row);

    // 复用战斗英雄血条外框，内槽铺金进度
    const barW = 480;
    const barH = 40;
    const bar = makeProgressBar({
      width: barW, height: barH, ratio: cur / pity, frame: true,
    });
    bar.position.set(w / 2 - barW / 2, y + 18);
    this._page.addChild(bar);

    const floorNote = makeText('十连必出 SR 或以上 · UR 概率更高', {
      size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: 0.5,
    });
    floorNote.position.set(w / 2, y + 68);
    this._page.addChild(floorNote);

    // 紧凑概率一行（与配置一致：UR 3.5 / SSR 10 / SR 26.5 / R 60）
    const rates = poolGachaRates(gachaPoolPets(this._activePoolElement()));
    const parts: string[] = [];
    for (const tier of [...RARITIES].reverse()) {
      const rate = rates.get(tier);
      if (rate === undefined) continue;
      parts.push(`${getRarity(tier).code} ${(rate * 100).toFixed(1)}%`);
    }
    if (parts.length) {
      const rateLine = makeText(parts.join('  ·  '), {
        size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: 0.5,
      });
      rateLine.position.set(w / 2, y + 90);
      this._page.addChild(rateLine);
    }
  }

  private _buildTitlePlaque(w: number, centerY: number, label: string): void {
    const plaque = makeNamePlaque({
      text: label,
      width: Math.min(480, w - 80),
      size: 'lg',
    });
    plaque.position.set(w / 2, centerY);
    this._page.addChild(plaque);
  }

  private _buildPullButtons(w: number, h: number): void {
    const g = ECONOMY.gacha;
    // 底板约 2.2:1，略增高避免九宫拉伸压扁云纹边框
    const btnW = 310;
    const btnH = 128;
    const gap = 18;
    const y = h - 132;

    this._singlePullBtn = makeActionButton({
      title: '单抽',
      subtitle: `${g.singleCost} 灵玉`,
      width: btnW,
      height: btnH,
      variant: 'gold',
      enabled: PlayerData.lingyu >= g.singleCost,
      onTap: () => this._doPull(1),
    });
    this._singlePullBtn.position.set(w / 2 - btnW / 2 - gap / 2, y);
    this._page.addChild(this._singlePullBtn);

    this._tenPullBtn = makeActionButton({
      title: '十连',
      subtitle: `${g.tenCost} 灵玉`,
      width: btnW,
      height: btnH,
      variant: 'cream',
      enabled: PlayerData.lingyu >= g.tenCost,
      onTap: () => this._doPull(10),
    });
    this._tenPullBtn.position.set(w / 2 + btnW / 2 + gap / 2, y);
    this._page.addChild(this._tenPullBtn);
  }

  /** 结果浮层期间禁用主界面抽卡按钮（灵玉已扣但按钮 enabled 未刷新，会误触十连） */
  private _setMainPullButtonsEnabled(enabled: boolean): void {
    const g = ECONOMY.gacha;
    this._singlePullBtn?.setEnabled(enabled && PlayerData.lingyu >= g.singleCost);
    this._tenPullBtn?.setEnabled(enabled && PlayerData.lingyu >= g.tenCost);
  }

  private _activePoolElement(): Element | undefined {
    return this._elementFilter ?? undefined;
  }

  private _doPull(count: 1 | 10): void {
    const el = this._activePoolElement();
    if (PlayerData.gachaPoolIds(el).length === 0) {
      Platform.showToast(el ? `${ELEMENT_NAME[el]}系暂无可召唤生物` : '召唤池为空');
      return;
    }
    let list: PullOutcome[] | null;
    if (count === 1) {
      const o = PlayerData.pullGachaSingle(Math.random, el);
      list = o ? [o] : null;
    } else {
      list = PlayerData.pullGachaTen(Math.random, el);
    }
    if (!list) {
      Platform.showToast('灵玉不足');
      return;
    }
    this._lastCount = count;
    this._showResults(list);
  }

  // ── 结果浮层 + 揭示演出 ──

  private _teardownResults(): void {
    this._reveal?.destroy();
    this._reveal = null;
    this._fx?.destroy();
    this._fx = null;
  }

  private _showResults(outcomes: PullOutcome[]): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._teardownResults();
    this._setMainPullButtonsEnabled(false);

    const overlay = new PIXI.Container();
    this.container.addChild(overlay);

    const scrim = new PIXI.Graphics();
    scrim.beginFill(COLORS.scrim, 0.82);
    scrim.drawRect(0, 0, w, h);
    scrim.endFill();
    scrim.eventMode = 'static';
    scrim.hitArea = new PIXI.Rectangle(0, 0, w, h);
    // 吸收空白区域点击，避免穿透到底层主界面按钮
    bindPointerTap(scrim, () => {});
    overlay.addChild(scrim);

    // 受震屏影响的舞台层（scrim 不参与，避免露边）
    const stage = new PIXI.Container();
    overlay.addChild(stage);
    const fxBack = new PIXI.Container();
    const cardsLayer = new PIXI.Container();
    const fxFront = new PIXI.Container();

    const heading = makeText(outcomes.length > 1 ? '十连结果' : '召唤结果', {
      size: FONT_SIZE.lg, fill: COLORS.textInverse, bold: true, anchor: 0.5,
    });
    heading.position.set(w / 2, Game.safeTop + 70);

    stage.addChild(fxBack, heading, cardsLayer, fxFront);

    const gridTop = Game.safeTop + 120;
    const cards = this._buildResultCards(outcomes, gridTop);
    cards.forEach((c) => cardsLayer.addChild(c));

    // 特效宿主（在舞台之上、按钮之下；flash 在最顶但不拦截）
    this._fx = new SceneFx();
    this._fx.build(overlay, w, h, stage);
    const fx = this._fx;

    // 跳过按钮（演出中可见）
    const skipBtn = makeButton({
      label: '跳过', width: 110, height: 48, variant: 'ghost',
      onTap: () => this._reveal?.skip(),
    });
    skipBtn.position.set(w - 90, Game.safeTop + 40);
    overlay.addChild(skipBtn);

    const centerY = gridTop + (outcomes.length > 1 ? 180 : 230);
    this._reveal = new GachaRevealSequence({
      w, h, centerY, outcomes,
      handles: { fxBack, fxFront, cards, heading },
      textures: {
        pillar: TextureCache.get(UI_FX_IMAGES.lightPillar),
        circle: TextureCache.get(UI_FX_IMAGES.summonCircle),
        starburst: TextureCache.get(UI_FX_IMAGES.starburst),
        aura: TextureCache.get(UI_FX_IMAGES.auraRing),
        spark: TextureCache.get(UI_FX_IMAGES.particleSpark),
      },
      flash: (color, peak, dur) => fx.flash(color, peak, dur),
      shake: (lvl) => { if (lvl === 'heavy') fx.shakeHeavy(); else if (lvl === 'medium') fx.shakeMedium(); else fx.shakeLight(); },
      burst: (x, y, color, strong) => fx.burst({
        x, y, color, count: strong ? 26 : 12,
        speed: strong ? 460 : 300, life: strong ? 0.9 : 0.6,
        gravity: 240, size: strong ? 46 : 28, endScale: 0.1,
        texture: TextureCache.get(UI_FX_IMAGES.particleSpark) ?? undefined,
        blendMode: PIXI.BLEND_MODES.ADD,
      }),
      vibrate: (p) => Platform.vibrateShort(p),
      onDone: () => {
        skipBtn.visible = false;
        this._buildCompareCard(overlay, outcomes);
        this._buildResultButtons(overlay, () => {
          this._teardownResults();
          overlay.destroy({ children: true });
          this._build(); // _build 会按最新灵玉重建主界面按钮
        });
      },
    });
    this._reveal.play();
  }

  /** NEW 出货战力对比卡 + 一键上阵（无 NEW 或无可对比对象时不展示） */
  private _buildCompareCard(overlay: PIXI.Container, outcomes: readonly PullOutcome[]): void {
    const best = pickBestNewOutcome(outcomes);
    if (!best) return;
    const h = Game.logicHeight;
    // 底部「再抽 / 确定」按钮区顶边约在 h-100，对比卡与其留 14px 间距
    const resultBtnTop = h - 100;
    const card = buildGachaCompareCard({
      w: Game.logicWidth,
      bottomY: resultBtnTop - 14,
      outcome: best,
      onDeployed: () => {
        Platform.showToast(`${PET_MAP.get(best.petId)?.name ?? ''} 已上阵`);
        card?.root.destroy({ children: true });
      },
    });
    if (card) overlay.addChild(card.root);
  }

  /** 结果操作按钮：再抽一次（灵玉足够）+ 确定 */
  private _buildResultButtons(overlay: PIXI.Container, onClose: () => void): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const g = ECONOMY.gacha;
    const cost = this._lastCount === 10 ? g.tenCost : g.singleCost;
    const el = this._activePoolElement();
    const canRepull = PlayerData.lingyu >= cost
      && PlayerData.gachaPoolIds(el).length > 0;

    const btnW = 260;
    const y = h - 100;

    const again = makeButton({
      label: `再抽 ${this._lastCount === 10 ? '十连' : '单抽'}`, width: btnW, height: 72,
      variant: 'recruit', enabled: canRepull,
      onTap: () => {
        this._teardownResults();
        overlay.destroy({ children: true });
        this._doPull(this._lastCount);
      },
    });
    again.position.set(w / 2 - btnW / 2 - 14, y);
    overlay.addChild(again);

    const confirm = makeButton({
      label: '确定', width: btnW, height: 72, variant: 'success',
      onTap: onClose,
    });
    confirm.position.set(w / 2 + btnW / 2 + 14, y);
    overlay.addChild(confirm);
  }

  private _buildResultCards(outcomes: PullOutcome[], startY: number): PIXI.Container[] {
    const w = Game.logicWidth;
    const cols = outcomes.length > 1 ? 5 : 1;
    const cardW = outcomes.length > 1 ? 120 : 280;
    const cardH = cardW * 1.3;
    const gap = 16;
    const rowW = cols * cardW + (cols - 1) * gap;
    const left = w / 2 - rowW / 2;

    return outcomes.map((o, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const card = this._buildResultCard(o, cardW, cardH);
      // 以中心为锚，便于揭示时从中心回弹
      card.pivot.set(cardW / 2, cardH / 2);
      card.position.set(
        left + col * (cardW + gap) + cardW / 2,
        startY + row * (cardH + gap) + cardH / 2,
      );
      return card;
    });
  }

  private _buildResultCard(o: PullOutcome, cardW: number, cardH: number): PIXI.Container {
    const pet = PET_MAP.get(o.petId);
    const def = getRarity(o.rarity);
    const card = new PIXI.Container();

    card.addChild(makePanel({
      width: cardW, height: cardH, radius: RADIUS.small, centered: false,
      bg: COLORS.panelBg, border: def.color, borderWidth: 3,
    }));

    const avatarSize = cardW * 0.66;
    const avatarLeft = (cardW - avatarSize) / 2;
    const avatarTop = cardH * 0.16;

    const avatarTex = getPetAvatarTexture(o.petId, 1);
    if (avatarTex) {
      const avatar = new PIXI.Sprite(avatarTex);
      avatar.width = avatarSize;
      avatar.height = avatarSize;
      avatar.position.set(avatarLeft, avatarTop);
      card.addChild(avatar);
    }
    attachRarityBadge(card, o.rarity, avatarLeft, avatarTop, avatarSize, { variant: 'list' });

    const name = pet?.name ?? o.petId;
    const nameText = makeText(name.length > 5 ? `${name.slice(0, 5)}…` : name, {
      size: cardW > 200 ? FONT_SIZE.sm : FONT_SIZE.xxs,
      fill: COLORS.textMain, bold: true, anchor: 0.5,
    });
    nameText.position.set(cardW / 2, cardH * 0.74);
    card.addChild(nameText);

    // NEW SSR/UR 展示护航包内容（碎片可直升 2★，经验可立刻拉等级）
    const newText = o.escort
      ? (cardW > 200 ? `NEW · 护航 +${o.escort.shards}碎片 +${o.escort.exp}经验` : 'NEW·护航包')
      : 'NEW';
    const tagText = o.duplicate ? `+${o.shards} 碎片` : newText;
    const tag = makeText(tagText, {
      size: cardW > 200 ? FONT_SIZE.xs : FONT_SIZE.xxs,
      fill: o.duplicate ? COLORS.textSub : COLORS.btnSuccessBorder,
      bold: true, anchor: 0.5,
    });
    tag.position.set(cardW / 2, cardH * 0.88);
    card.addChild(tag);

    return card;
  }
}
