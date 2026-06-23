/**
 * 抽卡场景：灵玉单抽 / 十连，按 gachaRate 出货，保底进度可见，结果揭示。
 *
 * 数值与落库全部走 PlayerData（单一真源）；本场景只负责演出与交互。
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
import { BACKGROUND_IMAGES, UI_IMAGES, petImage } from '@/config/Assets';
import {
  COLORS, FONT_SIZE, RADIUS,
  makeButton, makeCoverBackground, makePanel, makeText,
  makeRarityBadge, makeCurrencyLabel,
} from '@/ui';

const GACHA_ELEMENTS: readonly Element[] = ['metal', 'wood', 'water', 'fire', 'earth'];

const ELEMENT_TINT: Readonly<Record<Element, number>> = {
  metal: 0xe6c84f, wood: 0x6fcf5f, water: 0x4f9fe6, fire: 0xe6634f, earth: 0xc9925f,
};

export class GachaScene implements Scene {
  readonly name = 'gacha';
  readonly container = new PIXI.Container();

  /** 当前选中的五行召唤池 */
  private _element: Element = 'metal';

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    this._build();
  }

  onExit(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));

    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.petPool, w, h));

    const back = makeButton({
      label: '返回', width: 120, height: 54, variant: 'ghost',
      onTap: () => SceneManager.switchTo('title'),
    });
    back.position.set(80, Game.safeTop + 36);
    this.container.addChild(back);

    this._buildTitlePlaque(w, Game.safeTop + 36, '灵宠召唤');

    const balance = makeCurrencyLabel('lingyu', PlayerData.lingyu);
    balance.position.set(w / 2 - balance.width / 2, Game.safeTop + 92);
    this.container.addChild(balance);

    // 保底进度
    const remain = ECONOMY.gacha.pitySSR - PlayerData.gachaSinceHigh;
    const pity = makeText(`距 SSR+ 保底还需 ${Math.max(0, remain)} 抽`, {
      size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: 0.5,
    });
    pity.position.set(w / 2, Game.safeTop + 128);
    this.container.addChild(pity);

    this._buildRatePanel(w, Game.safeTop + 168);
    this._buildElementTabs(w, h - 250);
    this._buildPullButtons(w, h);
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
    this.container.addChild(hint);

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
      this.container.addChild(tab);

      const label = makeText(`${ELEMENT_NAME[el]}\n${poolSize} 种`, {
        size: FONT_SIZE.xs, fill: selected ? COLORS.textInverse : COLORS.textMain,
        bold: true, anchor: 0.5, align: 'center',
      });
      label.position.set(x + tabW / 2, y + 32);
      this.container.addChild(label);
    });
  }

  private _buildTitlePlaque(w: number, centerY: number, label: string): void {
    const tex = TextureCache.get(UI_IMAGES.titlePlaque);
    if (tex) {
      const plaque = new PIXI.Sprite(tex);
      plaque.anchor.set(0.5);
      plaque.scale.set(480 / tex.width);
      plaque.position.set(w / 2, centerY);
      this.container.addChild(plaque);
    }
    const title = makeText(label, {
      size: FONT_SIZE.lg, fill: COLORS.textTitle, bold: true, anchor: 0.5,
    });
    title.position.set(w / 2, centerY);
    this.container.addChild(title);
  }

  /** 概率公示面板 */
  private _buildRatePanel(w: number, y: number): void {
    const panelW = 600;
    const panelH = 220;
    const panel = makePanel({
      width: panelW, height: panelH, radius: RADIUS.card,
      bg: COLORS.panelBg, bgAlpha: 0.95, border: COLORS.panelBorder,
      centered: false,
    });
    panel.position.set(w / 2 - panelW / 2, y);
    this.container.addChild(panel);

    const heading = makeText('出货概率', {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0.5, 0],
    });
    heading.position.set(w / 2, y + 16);
    this.container.addChild(heading);

    const rates = standardGachaRates();
    let lineY = y + 56;
    for (const tier of [...RARITIES].reverse()) {
      const def = getRarity(tier);
      const rate = rates.get(tier) ?? 0;
      const row = makeText(`${def.code}`, {
        size: FONT_SIZE.xs, fill: def.color, bold: true, anchor: [0, 0.5],
      });
      row.position.set(w / 2 - panelW / 2 + 40, lineY);
      this.container.addChild(row);

      const val = makeText(`${(rate * 100).toFixed(1)}%`, {
        size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: [1, 0.5],
      });
      val.position.set(w / 2 + panelW / 2 - 40, lineY);
      this.container.addChild(val);
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
    this.container.addChild(single);

    const ten = makeButton({
      label: `十连\n${g.tenCost} 灵玉`, width: btnW, height: btnH,
      variant: 'recruit', fontSize: FONT_SIZE.sm,
      enabled: PlayerData.lingyu >= g.tenCost,
      onTap: () => this._doPull(10),
    });
    ten.position.set(w / 2 + btnW / 2 + 16, y);
    this.container.addChild(ten);
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
    Platform.vibrateShort('medium');
    this._showResults(list);
  }

  private _showResults(outcomes: PullOutcome[]): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    const overlay = new PIXI.Container();
    this.container.addChild(overlay);

    const scrim = new PIXI.Graphics();
    scrim.beginFill(COLORS.scrim, 0.78);
    scrim.drawRect(0, 0, w, h);
    scrim.endFill();
    scrim.eventMode = 'static';
    overlay.addChild(scrim);

    const heading = makeText(outcomes.length > 1 ? '十连结果' : '召唤结果', {
      size: FONT_SIZE.lg, fill: COLORS.textInverse, bold: true, anchor: 0.5,
    });
    heading.position.set(w / 2, Game.safeTop + 80);
    overlay.addChild(heading);

    this._buildResultGrid(overlay, outcomes, Game.safeTop + 130);

    const confirm = makeButton({
      label: '确定', width: 300, height: 72, variant: 'success',
      onTap: () => {
        overlay.destroy({ children: true });
        this._build();
      },
    });
    confirm.position.set(w / 2, h - 110);
    overlay.addChild(confirm);

    // 弹入动画
    overlay.alpha = 0;
    const t0 = performance.now();
    const tick = (): void => {
      const k = Math.min(1, (performance.now() - t0) / 220);
      overlay.alpha = k;
      if (k < 1) requestAnimationFrame(tick);
    };
    tick();
  }

  private _buildResultGrid(overlay: PIXI.Container, outcomes: PullOutcome[], startY: number): void {
    const w = Game.logicWidth;
    const cols = outcomes.length > 1 ? 5 : 1;
    const cardW = outcomes.length > 1 ? 120 : 280;
    const cardH = cardW * 1.3;
    const gap = 16;
    const rowW = cols * cardW + (cols - 1) * gap;
    const left = w / 2 - rowW / 2;

    outcomes.forEach((o, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = left + col * (cardW + gap);
      const y = startY + row * (cardH + gap);
      const card = this._buildResultCard(o, cardW, cardH);
      card.position.set(x, y);
      overlay.addChild(card);
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
