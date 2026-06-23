/**
 * 商店场景：灵宠币定向兑换碎片，作为随机抽卡的「卡关突破」兜底。
 *
 * - 推荐属性：按当前章节敌人主属性，推荐其克制属性的灵宠碎片。
 * - 每日轮换：按日期确定性轮换一批灵宠碎片。
 * 碎片直接进 PlayerData（未拥有宠走暂存账本，解锁即并入）。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { Platform } from '@/core/PlatformService';
import { TextureCache } from '@/core/TextureCache';
import { UI, ELEMENT_NAME } from '@/balance/ui';
import { PETS, PET_MAP, type PetDef } from '@/balance/pets';
import { getRarity } from '@/balance/rarity';
import { type Element } from '@/balance/combat';
import { counterElementOf } from '@/balance/combat';
import { CHAPTERS, stagesOfChapter } from '@/balance/stages';
import { ECONOMY } from '@/balance/economy';
import { PlayerData } from '@/game/PlayerData';
import { BACKGROUND_IMAGES, UI_IMAGES, petImage } from '@/config/Assets';
import {
  COLORS, FONT_SIZE, RADIUS,
  makeButton, makeCoverBackground, makePanel, makeText,
  makeRarityBadge, makeCurrencyLabel,
} from '@/ui';

export class ShopScene implements Scene {
  readonly name = 'shop';
  readonly container = new PIXI.Container();

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    this._build();
  }

  onExit(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
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
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));

    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.petPool, w, h));

    const back = makeButton({
      label: '返回', width: 120, height: 54, variant: 'ghost',
      onTap: () => SceneManager.switchTo('title'),
    });
    back.position.set(80, Game.safeTop + 36);
    this.container.addChild(back);

    const title = makeText('碎片商店', {
      size: FONT_SIZE.lg, fill: COLORS.textTitle, bold: true, anchor: 0.5,
    });
    title.position.set(w / 2, Game.safeTop + 40);
    this.container.addChild(title);

    const coins = makeCurrencyLabel('coin', PlayerData.coins);
    coins.position.set(w / 2 - coins.width / 2, Game.safeTop + 92);
    this.container.addChild(coins);

    const chapter = this._focusChapter();
    const dominant = this._chapterDominantElement(chapter);
    const recommendEl = counterElementOf(dominant);
    const discovered = this._discoveredPets();
    const recommended = discovered
      .filter((p) => p.element === recommendEl)
      .slice(0, ECONOMY.shop.recommendCount);
    const daily = this._dailyPets(ECONOMY.shop.dailyRotationCount);

    let y = Game.safeTop + 140;
    if (recommended.length > 0) {
      y = this._section(
        `推荐：克制第${chapter}章（${ELEMENT_NAME[dominant]}敌）· ${ELEMENT_NAME[recommendEl]}灵宠`,
        recommended, y,
      );
      y += 12;
    }
    if (daily.length > 0) {
      this._section('每日轮换', daily, y);
    } else if (recommended.length === 0) {
      const empty = makeText('暂无可兑换碎片\n先在历练关击败高级形态以收录生物', {
        size: FONT_SIZE.sm, fill: COLORS.textSub, anchor: 0.5, align: 'center',
      });
      empty.position.set(w / 2, h / 2);
      this.container.addChild(empty);
    }
  }

  /** 一个分区：标题 + 若干兑换行；返回下一段起始 y */
  private _section(heading: string, pets: PetDef[], startY: number): number {
    const w = Game.logicWidth;
    const head = makeText(heading, {
      size: FONT_SIZE.sm, fill: COLORS.accentDeep, bold: true, anchor: [0, 0.5],
    });
    head.position.set(w / 2 - 340, startY);
    this.container.addChild(head);

    let y = startY + 28;
    const rowH = 92;
    for (const pet of pets) {
      this._buildRow(pet, y);
      y += rowH + 10;
    }
    return y;
  }

  private _buildRow(pet: PetDef, y: number): void {
    const w = Game.logicWidth;
    const rowW = 680;
    const rowH = 92;
    const def = getRarity(pet.rarity);
    const cost = ECONOMY.shop.shardPackCost[pet.rarity] ?? 600;
    const packSize = ECONOMY.shop.packSize;

    const row = new PIXI.Container();
    row.position.set(w / 2, y + rowH / 2);

    row.addChild(makePanel({
      width: rowW, height: rowH, radius: RADIUS.card,
      bg: COLORS.panelBg, bgAlpha: 0.96, border: def.color, borderWidth: 2,
    }));

    // 头像
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

    const owned = PlayerData.isOwned(pet.id);
    const sub = makeText(
      `${ELEMENT_NAME[pet.element]} · 当前碎片 ${PlayerData.petShards(pet.id)}${owned ? '' : '（未拥有）'}`,
      { size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: [0, 0.5] },
    );
    sub.position.set(-rowW / 2 + 100, 16);
    row.addChild(sub);

    const buy = makeButton({
      label: `碎片×${packSize}\n${cost} 币`, width: 180, height: 68,
      variant: 'primary', fontSize: FONT_SIZE.xs,
      enabled: PlayerData.coins >= cost,
      onTap: () => {
        if (!PlayerData.spendCoins(cost)) {
          Platform.showToast('灵宠币不足');
          return;
        }
        PlayerData.addShards(pet.id, packSize);
        Platform.vibrateShort('light');
        Platform.showToast(`${pet.name} +${packSize} 碎片`);
        this._build();
      },
    });
    buy.position.set(rowW / 2 - 110, 0);
    row.addChild(buy);

    this.container.addChild(row);
  }
}
