/**
 * 商店场景：灵宠币定向兑换碎片，作为随机抽卡的「卡关突破」兜底。
 *
 * - 推荐属性：按当前章节敌人主属性，推荐其克制属性的灵宠碎片。
 * - 每日轮换：按日期确定性轮换一批灵宠碎片。
 * 碎片直接进 PlayerData（未拥有宠走暂存账本，解锁即并入）。
 * 购买后局部刷新（货币 + 当前行），不再整页重建；带粒子反馈。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { Platform } from '@/core/PlatformService';
import { TextureCache } from '@/core/TextureCache';
import { UI, ELEMENT_NAME } from '@/balance/ui';
import { PETS, type PetDef } from '@/balance/pets';
import { getRarity } from '@/balance/rarity';
import { type Element } from '@/balance/combat';
import { counterElementOf } from '@/balance/combat';
import { CHAPTERS, stagesOfChapter } from '@/balance/stages';
import { ECONOMY } from '@/balance/economy';
import { PlayerData } from '@/game/PlayerData';
import {
  BACKGROUND_IMAGES, SHOP_PRELOAD_IMAGES, UI_IMAGES, UI_FX_IMAGES, petImage,
} from '@/config/Assets';
import {
  COLORS, FONT_SIZE, RADIUS,
  makeButton, makeCoverBackground, makePanel, makeText,
  makeRarityBadge, makeCurrencyLabel,
  SceneFx, staggerIn, pulse,
  type ButtonHandle,
} from '@/ui';
import { ScrollListController } from '@/ui/ScrollList';
import { SceneEnterSeq, deferSceneBuild } from '@/utils/sceneEnterSeq';

interface ShopRowRef {
  pet: PetDef;
  cost: number;
  sub: PIXI.Text;
  buy: ButtonHandle;
  /** 行中心（用于购买粒子反馈，绝对屏幕坐标） */
  centerX: number;
  centerY: number;
}

export class ShopScene implements Scene {
  readonly name = 'shop';
  readonly container = new PIXI.Container();

  private readonly _scroll = new ScrollListController();
  private _content: PIXI.Container | null = null;
  private _coinsHolder = new PIXI.Container();
  private _fx: SceneFx | null = null;
  private _rows = new Map<string, ShopRowRef>();
  private readonly _enterSeq = new SceneEnterSeq();

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    void this._enter(this._enterSeq.next());
  }

  private async _enter(token: number): Promise<void> {
    await TextureCache.preload([...SHOP_PRELOAD_IMAGES]);
    if (!this._enterSeq.stillValid(token)) return;
    deferSceneBuild(token, this._enterSeq, 'shop', () => {
      this._fx = new SceneFx();
      this._build();
    });
  }

  onExit(): void {
    this._enterSeq.cancel();
    this._scroll.detach();
    this._content = null;
    this._rows.clear();
    this._fx?.destroy();
    this._fx = null;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  update(dt: number): void {
    this._fx?.update(dt);
  }

  /** 当前重点章节：最新已解锁章节 */
  private _focusChapter(): number {
    let latest = CHAPTERS[0];
    for (const ch of CHAPTERS) {
      if (PlayerData.isChapterUnlocked(ch)) latest = ch;
    }
    return latest;
  }

  /** 章节敌人主属性（出现最多的关卡属性） */
  private _chapterDominantElement(chapter: number): Element {
    const tally: Partial<Record<Element, number>> = {};
    for (const s of stagesOfChapter(chapter)) {
      tally[s.element] = (tally[s.element] ?? 0) + 1;
    }
    let best: Element = 'wood';
    let bestN = -1;
    for (const [el, n] of Object.entries(tally) as [Element, number][]) {
      if (n > bestN) { best = el; bestN = n; }
    }
    return best;
  }

  /** 可获取池（已收录生物）对应的 PetDef 列表 */
  private _discoveredPets(): PetDef[] {
    const ids = new Set(PlayerData.availablePool());
    return PETS.filter((p) => ids.has(p.id));
  }

  /** 每日轮换：按日期在「已收录生物」中确定性洗牌取前 N 只 */
  private _dailyPets(count: number): PetDef[] {
    const day = Math.floor(Date.now() / 86_400_000);
    let seed = day * 2654435761 % 2147483647;
    const rng = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pool = this._discoveredPets();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._scroll.detach();
    this._rows.clear();
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));

    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.petPool, w, h));

    const back = makeButton({
      label: '返回', width: 120, height: 54, variant: 'ghost',
      onTap: () => SceneManager.switchTo('title'),
    });
    back.position.set(80, Game.safeTop + 36);
    this.container.addChild(back);

    this._buildTitlePlaque(w, Game.safeTop + 36, '碎片商店');

    this._coinsHolder = new PIXI.Container();
    this.container.addChild(this._coinsHolder);
    this._refreshCoins();

    const chapter = this._focusChapter();
    const dominant = this._chapterDominantElement(chapter);
    const recommendEl = counterElementOf(dominant);
    const discovered = this._discoveredPets();
    const recommended = discovered
      .filter((p) => p.element === recommendEl)
      .slice(0, ECONOMY.shop.recommendCount);
    const daily = this._dailyPets(ECONOMY.shop.dailyRotationCount);

    const startY = Game.safeTop + 140;
    const content = new PIXI.Container();
    content.position.set(0, startY);
    this._content = content;
    this.container.addChild(content);

    const animTargets: PIXI.Container[] = [];
    let y = 0;
    if (recommended.length > 0) {
      y = this._section(
        content, animTargets,
        `推荐：克制第${chapter}章（${ELEMENT_NAME[dominant]}敌）· ${ELEMENT_NAME[recommendEl]}灵宠`,
        recommended, startY, y,
      );
      y += 12;
    }
    if (daily.length > 0) {
      y = this._section(content, animTargets, '每日轮换', daily, startY, y);
    } else if (recommended.length === 0) {
      const empty = makeText('暂无可兑换碎片\n先在历练关击败高级形态以收录生物', {
        size: FONT_SIZE.sm, fill: COLORS.textSub, anchor: 0.5, align: 'center',
      });
      empty.position.set(w / 2, h / 2 - startY);
      content.addChild(empty);
    }

    // 溢出时挂滚动
    const viewportH = h - startY - 16;
    const contentH = y + 16;
    if (contentH > viewportH) {
      const mask = new PIXI.Graphics();
      mask.beginFill(COLORS.white);
      mask.drawRect(0, startY, w, viewportH);
      mask.endFill();
      this.container.addChild(mask);
      content.mask = mask;
      this._scroll.attach({
        content: () => this._content,
        viewportTop: startY,
        viewportH,
        scrollMin: Math.min(startY, startY - (contentH - viewportH)),
        listTop: startY,
        moveThreshold: 8,
      });
    }

    staggerIn(animTargets, { stepDelay: 0.04, offsetY: 16, duration: 0.3 });

    // 特效层最后挂载，保证粒子/闪光在内容之上
    if (this._fx) this._fx.build(this.container, w, h);
  }

  private _refreshCoins(): void {
    this._coinsHolder.removeChildren().forEach((c) => c.destroy({ children: true }));
    const coins = makeCurrencyLabel('coin', PlayerData.coins);
    coins.position.set(Game.logicWidth / 2 - coins.width / 2, Game.safeTop + 92);
    this._coinsHolder.addChild(coins);
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

  /** 一个分区：标题 + 若干兑换行（相对 content 容器）；返回下一段 contentY */
  private _section(
    content: PIXI.Container, animTargets: PIXI.Container[],
    heading: string, pets: PetDef[], absStartY: number, contentY: number,
  ): number {
    const w = Game.logicWidth;
    const head = makeText(heading, {
      size: FONT_SIZE.sm, fill: COLORS.accentDeep, bold: true, anchor: [0, 0.5],
    });
    head.position.set(w / 2 - 340, contentY);
    content.addChild(head);
    animTargets.push(head);

    let y = contentY + 28;
    const rowH = 92;
    for (const pet of pets) {
      const row = this._buildRow(pet, y, absStartY);
      content.addChild(row);
      animTargets.push(row);
      y += rowH + 10;
    }
    return y;
  }

  private _buildRow(pet: PetDef, contentY: number, absStartY: number): PIXI.Container {
    const w = Game.logicWidth;
    const rowW = 680;
    const rowH = 92;
    const def = getRarity(pet.rarity);
    const cost = ECONOMY.shop.shardPackCost[pet.rarity] ?? 600;
    const packSize = ECONOMY.shop.packSize;

    const row = new PIXI.Container();
    row.position.set(w / 2, contentY + rowH / 2);

    row.addChild(makePanel({
      width: rowW, height: rowH, radius: RADIUS.card,
      bg: COLORS.panelBg, bgAlpha: 0.96, border: def.color, borderWidth: 2,
    }));

    const avatarTex = TextureCache.get(petImage(pet.id));
    if (avatarTex) {
      const sz = rowH - 20;
      const avatar = new PIXI.Sprite(avatarTex);
      avatar.width = sz;
      avatar.height = sz;
      avatar.position.set(-rowW / 2 + 14, -sz / 2);
      row.addChild(avatar);
    }

    const badge = makeRarityBadge({ tier: pet.rarity, scale: 1.4 });
    badge.position.set(-rowW / 2 + 14, -rowH / 2 + 6);
    row.addChild(badge);

    const name = makeText(pet.name, {
      size: FONT_SIZE.md, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    });
    name.position.set(-rowW / 2 + 100, -16);
    row.addChild(name);

    const sub = makeText(this._rowSubText(pet), {
      size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: [0, 0.5],
    });
    sub.position.set(-rowW / 2 + 100, 16);
    row.addChild(sub);

    const buy = makeButton({
      label: `碎片×${packSize}\n${cost} 币`, width: 180, height: 68,
      variant: 'primary', fontSize: FONT_SIZE.xs,
      enabled: PlayerData.coins >= cost,
      onTap: () => this._onBuy(pet.id),
    });
    buy.position.set(rowW / 2 - 110, 0);
    row.addChild(buy);

    this._rows.set(pet.id, {
      pet, cost, sub, buy,
      centerX: w / 2, centerY: absStartY + contentY + rowH / 2,
    });
    return row;
  }

  private _rowSubText(pet: PetDef): string {
    const owned = PlayerData.isOwned(pet.id);
    return `${ELEMENT_NAME[pet.element]} · 当前碎片 ${PlayerData.petShards(pet.id)}${owned ? '' : '（未拥有）'}`;
  }

  /** 购买：局部刷新货币 + 当前行 + 全行按钮可用态，粒子反馈，不整页重建 */
  private _onBuy(petId: string): void {
    const ref = this._rows.get(petId);
    if (!ref) return;
    if (!PlayerData.spendCoins(ref.cost)) {
      Platform.showToast('灵宠币不足');
      return;
    }
    PlayerData.addShards(petId, ECONOMY.shop.packSize);
    Platform.vibrateShort('light');
    Platform.showToast(`${ref.pet.name} +${ECONOMY.shop.packSize} 碎片`);

    this._refreshCoins();
    if (this._coinsHolder.children[0]) pulse(this._coinsHolder.children[0] as PIXI.Container);
    ref.sub.text = this._rowSubText(ref.pet);
    // 余额变化后，所有行按钮可用态需同步
    for (const r of this._rows.values()) r.buy.setEnabled(PlayerData.coins >= r.cost);

    this._fx?.flash(COLORS.accent, 0.14, 0.3);
    this._fx?.burst({
      x: ref.centerX, y: ref.centerY, color: COLORS.accent,
      count: 14, speed: 320, life: 0.6, gravity: 260, size: 22, endScale: 0.1,
      texture: TextureCache.get(UI_FX_IMAGES.particleSpark) ?? undefined,
      blendMode: PIXI.BLEND_MODES.ADD,
    });
  }
}
