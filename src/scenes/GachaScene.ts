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
import { UI, ELEMENT_NAME } from '@/balance/ui';
import { PET_MAP } from '@/balance/pets';
import type { Element } from '@/balance/combat';
import { RARITIES, getRarity } from '@/balance/rarity';
import { standardGachaRates } from '@/balance/rarity';
import { ECONOMY } from '@/balance/economy';
import { PlayerData } from '@/game/PlayerData';
import type { PullOutcome } from '@/game/gacha/Gacha';
import {
  BACKGROUND_IMAGES, UI_IMAGES, UI_FX_IMAGES, GACHA_PRELOAD_IMAGES, petImage,
} from '@/config/Assets';
import {
  COLORS, FONT_SIZE, RADIUS,
  makeButton, makeCoverBackground, makePanel, makeText,
  makeRarityBadge, makeCurrencyLabel, makeProgressBar,
  SceneFx,
} from '@/ui';
import { GachaRevealSequence } from './gacha/gachaRevealSequence';
import { SceneEnterSeq, deferSceneBuild } from '@/utils/sceneEnterSeq';

const GACHA_ELEMENTS: readonly Element[] = ['metal', 'wood', 'water', 'fire', 'earth'];

const ELEMENT_TINT: Readonly<Record<Element, number>> = {
  metal: 0xe6c84f, wood: 0x6fcf5f, water: 0x4f9fe6, fire: 0xe6634f, earth: 0xc9925f,
};

export class GachaScene implements Scene {
  readonly name = 'gacha';
  readonly container = new PIXI.Container();

  /** 主页面内容层（element 切换 / 抽卡后局部重建；onExit 整页重建避免二次进入脏状态） */
  private _page = new PIXI.Container();

  /** 当前选中的五行召唤池 */
  private _element: Element = 'metal';
  /** 结果浮层当前的特效宿主（由 update 驱动） */
  private _fx: SceneFx | null = null;
  private _reveal: GachaRevealSequence | null = null;
  /** 上次抽卡数量，用于「再抽一次」 */
  private _lastCount: 1 | 10 = 1;
  private readonly _enterSeq = new SceneEnterSeq();

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    void this._enter(this._enterSeq.next());
  }

  private async _enter(token: number): Promise<void> {
    await TextureCache.preload([...GACHA_PRELOAD_IMAGES]);
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

    this._page.addChild(makeCoverBackground(BACKGROUND_IMAGES.petPool, w, h));

    const back = makeButton({
      label: '返回', width: 120, height: 54, variant: 'ghost',
      onTap: () => SceneManager.switchTo('title'),
    });
    back.position.set(80, Game.safeTop + 36);
    this._page.addChild(back);

    this._buildTitlePlaque(w, Game.safeTop + 36, '灵宠召唤');

    const balance = makeCurrencyLabel('lingyu', PlayerData.lingyu);
    balance.position.set(w / 2 - balance.width / 2, Game.safeTop + 92);
    this._page.addChild(balance);

    this._buildPity(w, Game.safeTop + 134);
    this._buildRatePanel(w, Game.safeTop + 196);
    this._buildElementTabs(w, h - 250);
    this._buildPullButtons(w, h);
  }

  /** 保底进度：进度条 + 文案（距 SSR+ 硬保底还需多少抽） */
  private _buildPity(w: number, y: number): void {
    const pity = ECONOMY.gacha.pitySSR;
    const cur = Math.min(pity, PlayerData.gachaSinceHigh);
    const remain = Math.max(0, pity - cur);

    const barW = 360;
    const bar = makeProgressBar({ width: barW, height: 14, ratio: cur / pity });
    bar.position.set(w / 2 - barW / 2, y);
    this._page.addChild(bar);

    const label = makeText(`距 SSR 保底还需 ${remain} 抽`, {
      size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: 0.5,
    });
    label.position.set(w / 2, y - 16);
    this._page.addChild(label);
  }

  /** 五行召唤池切换（每个属性一个独立池，仅出该属性已收录生物） */
  private _buildElementTabs(w: number, y: number): void {
    const tabW = 104;
    const gap = 10;
    const totalW = GACHA_ELEMENTS.length * tabW + (GACHA_ELEMENTS.length - 1) * gap;
    const left = w / 2 - totalW / 2;

    const hint = makeText('选择五行召唤池', {
      size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: 0.5,
    });
    hint.position.set(w / 2, y - 30);
    this._page.addChild(hint);

    GACHA_ELEMENTS.forEach((el, i) => {
      const x = left + i * (tabW + gap);
      const selected = el === this._element;
      const poolSize = PlayerData.availablePool(el).length;
      const tab = makePanel({
        width: tabW, height: 64, radius: RADIUS.small, centered: false,
        bg: selected ? ELEMENT_TINT[el] : COLORS.panelBg,
        bgAlpha: selected ? 0.92 : 0.85,
        border: selected ? COLORS.textTitle : COLORS.panelBorder,
        borderWidth: selected ? 3 : 1,
      });
      tab.position.set(x, y);
      tab.eventMode = 'static';
      tab.cursor = 'pointer';
      tab.on('pointertap', () => {
        if (this._element === el) return;
        this._element = el;
        this._build();
      });
      this._page.addChild(tab);

      const label = makeText(`${ELEMENT_NAME[el]}\n${poolSize} 种`, {
        size: FONT_SIZE.xs, fill: selected ? COLORS.textInverse : COLORS.textMain,
        bold: true, anchor: 0.5, align: 'center',
      });
      label.position.set(x + tabW / 2, y + 32);
      this._page.addChild(label);
    });
  }

  private _buildTitlePlaque(w: number, centerY: number, label: string): void {
    const tex = TextureCache.get(UI_IMAGES.titlePlaque);
    if (tex) {
      const plaque = new PIXI.Sprite(tex);
      plaque.anchor.set(0.5);
      plaque.scale.set(480 / tex.width);
      plaque.position.set(w / 2, centerY);
      this._page.addChild(plaque);
    }
    const title = makeText(label, {
      size: FONT_SIZE.lg, fill: COLORS.textTitle, bold: true, anchor: 0.5,
    });
    title.position.set(w / 2, centerY);
    this._page.addChild(title);
  }

  /** 概率公示面板 */
  private _buildRatePanel(w: number, y: number): void {
    const panelW = 600;
    const panelH = 200;
    const panel = makePanel({
      width: panelW, height: panelH, radius: RADIUS.card,
      bg: COLORS.panelBg, bgAlpha: 0.95, border: COLORS.panelBorder,
      centered: false,
    });
    panel.position.set(w / 2 - panelW / 2, y);
    this._page.addChild(panel);

    const heading = makeText('出货概率', {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0.5, 0],
    });
    heading.position.set(w / 2, y + 14);
    this._page.addChild(heading);

    const rates = standardGachaRates();
    let lineY = y + 52;
    for (const tier of [...RARITIES].reverse()) {
      const def = getRarity(tier);
      const rate = rates.get(tier) ?? 0;
      const row = makeText(`${def.code}`, {
        size: FONT_SIZE.xs, fill: def.color, bold: true, anchor: [0, 0.5],
      });
      row.position.set(w / 2 - panelW / 2 + 40, lineY);
      this._page.addChild(row);

      const val = makeText(`${(rate * 100).toFixed(1)}%`, {
        size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: [1, 0.5],
      });
      val.position.set(w / 2 + panelW / 2 - 40, lineY);
      this._page.addChild(val);
      lineY += 30;
    }
  }

  private _buildPullButtons(w: number, h: number): void {
    const g = ECONOMY.gacha;
    const btnW = 280;
    const btnH = 88;
    const y = h - 140;

    const single = makeButton({
      label: `单抽\n${g.singleCost} 灵玉`, width: btnW, height: btnH,
      variant: 'primary', fontSize: FONT_SIZE.sm,
      enabled: PlayerData.lingyu >= g.singleCost,
      onTap: () => this._doPull(1),
    });
    single.position.set(w / 2 - btnW / 2 - 16, y);
    this._page.addChild(single);

    const ten = makeButton({
      label: `十连\n${g.tenCost} 灵玉`, width: btnW, height: btnH,
      variant: 'recruit', fontSize: FONT_SIZE.sm,
      enabled: PlayerData.lingyu >= g.tenCost,
      onTap: () => this._doPull(10),
    });
    ten.position.set(w / 2 + btnW / 2 + 16, y);
    this._page.addChild(ten);
  }

  private _doPull(count: 1 | 10): void {
    if (PlayerData.availablePool(this._element).length === 0) {
      Platform.showToast(`${ELEMENT_NAME[this._element]}系暂无可召唤生物，先去历练收录`);
      return;
    }
    let list: PullOutcome[] | null;
    if (count === 1) {
      const o = PlayerData.pullGachaSingle(Math.random, this._element);
      list = o ? [o] : null;
    } else {
      list = PlayerData.pullGachaTen(Math.random, this._element);
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

    const overlay = new PIXI.Container();
    this.container.addChild(overlay);

    const scrim = new PIXI.Graphics();
    scrim.beginFill(COLORS.scrim, 0.82);
    scrim.drawRect(0, 0, w, h);
    scrim.endFill();
    scrim.eventMode = 'static';
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
        this._buildResultButtons(overlay, () => {
          this._teardownResults();
          overlay.destroy({ children: true });
          this._build();
        });
      },
    });
    this._reveal.play();
  }

  /** 结果操作按钮：再抽一次（灵玉足够）+ 确定 */
  private _buildResultButtons(overlay: PIXI.Container, onClose: () => void): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const g = ECONOMY.gacha;
    const cost = this._lastCount === 10 ? g.tenCost : g.singleCost;
    const canRepull = PlayerData.lingyu >= cost
      && PlayerData.availablePool(this._element).length > 0;

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

    const badge = makeRarityBadge({ tier: o.rarity, scale: cardW / 120 });
    badge.position.set(6, 6);
    card.addChild(badge);

    const avatarSize = cardW * 0.66;
    const avatarTex = TextureCache.get(petImage(o.petId));
    if (avatarTex) {
      const avatar = new PIXI.Sprite(avatarTex);
      avatar.width = avatarSize;
      avatar.height = avatarSize;
      avatar.position.set((cardW - avatarSize) / 2, cardH * 0.16);
      card.addChild(avatar);
    }

    const name = pet?.name ?? o.petId;
    const nameText = makeText(name.length > 5 ? `${name.slice(0, 5)}…` : name, {
      size: cardW > 200 ? FONT_SIZE.sm : FONT_SIZE.xxs,
      fill: COLORS.textMain, bold: true, anchor: 0.5,
    });
    nameText.position.set(cardW / 2, cardH * 0.74);
    card.addChild(nameText);

    const tagText = o.duplicate ? `+${o.shards} 碎片` : 'NEW';
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
