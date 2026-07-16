/**
 * 商店场景：灵宠币定向兑换碎片，作为随机抽卡的「卡关突破」兜底。
 *
 * 布局对齐 docs/shop_ui_mockup.png（750 设计宽）。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { Platform } from '@/core/PlatformService';
import { TextureCache } from '@/core/TextureCache';
import { bindPetAvatarSprite } from '@/config/petAvatarTexture';
import { shopPreloadImages, shopPetAvatarEntries, ensurePetAvatars } from '@/config/assetPreload';
import { ensureAssets } from '@/config/Subpackages';
import { UI, ELEMENT_NAME } from '@/balance/ui';
import { PETS, type PetDef } from '@/balance/pets';
import { type Element } from '@/balance/combat';
import { counterElementOf } from '@/balance/combat';
import { CHAPTERS, stagesOfChapter } from '@/balance/stages';
import { ECONOMY } from '@/balance/economy';
import { PlayerData } from '@/game/PlayerData';
import {
  BACKGROUND_IMAGES, UI_IMAGES, UI_SHOP_IMAGES, UI_FX_IMAGES,
} from '@/config/Assets';
import {
  COLORS, FONT_SIZE,
  makeBackButton, makeButton, makeCoverBackground, makePanel, makeText,
  attachRarityBadge, makeIconLabel, makeElementOrb,
  SceneFx, staggerIn, pulse,
  buildBottomNav, BOTTOM_NAV_RESERVE,
} from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { pressFeedback } from '@/ui/motion';
import { ScrollListController } from '@/ui/ScrollList';
import { SceneEnterSeq } from '@/utils/sceneEnterSeq';

/** 对齐 shop_ui_mockup.png（750 设计宽） */
const SHOP_UI = {
  rowH: 130,
  rowGap: 12,
  padX: 20,
  innerPad: 6,
  buyPanelH: 60,
  buyPadX: 22,
  buyPadY: 10,
  buyLineGap: 8,
  buyMinW: 148,
  buyPad: 8,
  nameSize: 26,
  subSize: 18,
  infoLineGap: 22,
  elIconSize: 22,
  buyFontTop: 16,
  buyFontPrice: 16,
  buyCoinIcon: 20,
  coinIconSize: 32,
  coinBarMinW: 156,
  coinBarPadX: 32,
  coinBarH: 48,
  /** 灵宠币胶囊端帽 = 高度一半（semicircle 圆角） */
  coinCapW: 24,
  /** 顶栏灵宠币胶囊、行内购买按钮整体左移 */
  coinBarOffsetX: -14,
  buyOffsetX: -28,
  titleW: 400,
  titleY: 56,
  titleCoinGap: 24,
  headerListGap: 14,
  listTop: 0, // 由标题实际高度动态推算
  /** 列表底部留白，保证最后一行可滚到视口内 */
  listBottomPad: 24,
  sectionBarH: 34,
  /** 行面板 9-slice 边距（对齐 shop_row_panel.png 1032×200） */
  rowSlice: { left: 96, top: 48, right: 96, bottom: 48 },
  /** 购买按钮 9-slice（202×60 透明底贴图） */
  buySlice: { left: 40, top: 4, right: 40, bottom: 4 },
} as const;

/** 标题匾按宽度等比缩放后的显示高度（保证横向完整、不裁切） */
function shopTitleDisplayH(tex: PIXI.Texture | null): number {
  if (!tex) return 88;
  return tex.height * (SHOP_UI.titleW / tex.width);
}

/** 顶栏布局：标题匾 + 灵宠币间距（基于标题真实高度，避免重叠） */
function shopHeaderLayout(tex: PIXI.Texture | null): {
  titleCenterY: number;
  coinCenterY: number;
  listTop: number;
} {
  const titleH = shopTitleDisplayH(tex);
  const titleCenterY = Game.safeHeaderCenterY;
  const titleBottom = titleCenterY + titleH / 2;
  const coinCenterY = titleBottom + SHOP_UI.titleCoinGap + SHOP_UI.coinBarH / 2;
  const listTop = coinCenterY + SHOP_UI.coinBarH / 2 + SHOP_UI.headerListGap;
  return { titleCenterY, coinCenterY, listTop };
}

/** 灵宠币胶囊九宫格：贴图已归一化到 48px 高，左右圆角端帽固定 24px */
function shopCoinSlice(): { left: number; top: number; right: number; bottom: number } {
  const cap = SHOP_UI.coinCapW;
  return { left: cap, top: 0, right: cap, bottom: 0 };
}

interface ShopBuyHandle extends PIXI.Container {
  setEnabled(enabled: boolean): void;
}

interface ShopRowRef {
  pet: PetDef;
  cost: number;
  sub: PIXI.Text;
  buy: ShopBuyHandle;
  centerX: number;
  centerY: number;
}

function shopTexture(path: string): PIXI.Texture | null {
  const tex = TextureCache.get(path);
  return tex?.valid ? tex : null;
}

function addStretchBg(
  parent: PIXI.Container,
  texPath: string,
  w: number,
  h: number,
  fallback: () => PIXI.Graphics,
): void {
  const tex = shopTexture(texPath);
  if (tex) {
    const sp = new PIXI.Sprite(tex);
    sp.width = w;
    sp.height = h;
    sp.anchor.set(0.5);
    parent.addChild(sp);
    return;
  }
  parent.addChild(fallback());
}

function addNineSliceBg(
  parent: PIXI.Container,
  texPath: string,
  w: number,
  h: number,
  slice: { left: number; top: number; right: number; bottom: number },
  fallback: () => PIXI.Graphics,
): void {
  const tex = shopTexture(texPath);
  if (tex) {
    const plane = new PIXI.NineSlicePlane(tex, slice.left, slice.top, slice.right, slice.bottom);
    plane.width = w;
    plane.height = h;
    plane.position.set(-w / 2, -h / 2);
    parent.addChild(plane);
    return;
  }
  parent.addChild(fallback());
}

/** 将容器 pivot 设到内容几何中心，便于在父级 x=0 处水平居中 */
function centerPivot(cont: PIXI.Container): { w: number; h: number } {
  const b = cont.getLocalBounds();
  cont.pivot.set(b.x + b.width / 2, b.y + b.height / 2);
  return { w: b.width, h: b.height };
}

function shopBuyButtonSize(packSize: number, cost: number): { w: number; h: number } {
  const { buyFontTop, buyFontPrice, buyCoinIcon, buyPadX, buyLineGap, buyPanelH, buyMinW } = SHOP_UI;
  const line1 = makeText(`碎片×${packSize}`, {
    size: buyFontTop, fill: COLORS.textMain, bold: true, anchor: 0.5,
  });
  const priceText = makeText(`${cost} 币`, {
    size: buyFontPrice, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
  });
  const contentW = Math.max(line1.width, buyCoinIcon + 5 + priceText.width);
  const contentH = line1.height + buyLineGap + Math.max(buyCoinIcon, priceText.height);
  line1.destroy();
  priceText.destroy();
  return {
    w: Math.max(buyMinW, Math.ceil(contentW + buyPadX * 2)),
    h: buyPanelH,
  };
}

function makeShopBuyButton(
  packSize: number,
  cost: number,
  enabled: boolean,
  onTap: () => void,
  blockTap?: () => boolean,
): ShopBuyHandle {
  const { buyFontTop, buyFontPrice, buyCoinIcon, buyLineGap, buyPadX } = SHOP_UI;
  const { w: buyW, h: buyH } = shopBuyButtonSize(packSize, cost);
  const btn = new PIXI.Container() as ShopBuyHandle;

  const line1 = makeText(`碎片×${packSize}`, {
    size: buyFontTop, fill: COLORS.textMain, bold: true, anchor: 0.5,
  });
  const priceRow = makeIconLabel({
    iconPath: UI_IMAGES.iconCoin,
    iconSize: buyCoinIcon,
    text: `${cost} 币`,
    size: buyFontPrice,
    fill: COLORS.textMain,
    bold: true,
    gap: 5,
  });
  const priceSize = centerPivot(priceRow);

  const contentH = line1.height + buyLineGap + priceSize.h;
  const blockTop = -contentH / 2;
  line1.position.set(0, blockTop + line1.height / 2);
  priceRow.position.set(0, blockTop + line1.height + buyLineGap + priceSize.h / 2);

  addNineSliceBg(btn, UI_SHOP_IMAGES.buyPanel, buyW, buyH, SHOP_UI.buySlice, () => {
    const g = new PIXI.Graphics();
    g.beginFill(0xf5c842, 1);
    g.lineStyle(2, 0xc8960a, 1);
    g.drawRoundedRect(-buyW / 2, -buyH / 2, buyW, buyH, buyH / 2);
    g.endFill();
    return g;
  });
  btn.addChild(line1, priceRow);

  let active = enabled;
  const redraw = (): void => {
    const fill = active ? COLORS.textMain : COLORS.textDisabled;
    line1.style.fill = fill;
    priceRow.children.forEach((ch) => {
      if (ch instanceof PIXI.Text) ch.style.fill = fill;
    });
    btn.alpha = active ? 1 : 0.55;
  };

  btn.setEnabled = (v: boolean): void => {
    active = v;
    btn.eventMode = v ? 'static' : 'none';
    btn.cursor = v ? 'pointer' : 'default';
    redraw();
  };

  bindPointerTap(btn, onTap, { guard: () => active, blockTap });
  btn.hitArea = new PIXI.Rectangle(-buyW / 2, -buyH / 2, buyW, buyH);
  btn.interactiveChildren = false;
  pressFeedback(btn);
  btn.setEnabled(enabled);
  redraw();
  return btn;
}

/** 透明底宠物立绘；有缓存立刻画，否则占位并 CDN 到货后补上（不挡首屏） */
function addShopPetPortrait(
  parent: PIXI.Container,
  petId: string,
  x: number,
  y: number,
  size: number,
): { left: number; right: number; top: number } {
  const top = y - size / 2;
  const left = x;
  const right = x + size;
  const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
  spr.anchor.set(0.5);
  spr.position.set(x + size / 2, y);
  parent.addChild(spr);
  bindPetAvatarSprite(spr, petId, 1, (tex) => {
    spr.scale.set(size / Math.max(tex.width, tex.height));
  });
  return { left, right, top };
}

function buildCenteredInfoBlock(
  parent: PIXI.Container,
  pet: PetDef,
  centerX: number,
  maxW: number,
  subText: string,
): PIXI.Text {
  const { nameSize, subSize, elIconSize, infoLineGap } = SHOP_UI;
  const info = new PIXI.Container();
  info.position.set(centerX, 0);
  parent.addChild(info);

  const nameRow = new PIXI.Container();
  let nx = 0;
  const elIcon = makeElementOrb(pet.element, elIconSize);
  elIcon.anchor.set(0, 0.5);
  elIcon.position.set(0, 0);
  nameRow.addChild(elIcon);
  nx = elIconSize + 6;

  let displayName = pet.name;
  const name = makeText(displayName, {
    size: nameSize, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
  });
  while (name.width + nx > maxW && displayName.length > 2) {
    displayName = `${displayName.slice(0, -1)}…`;
    name.text = displayName;
  }
  name.position.set(nx, 0);
  nameRow.addChild(name);

  let subDisplay = subText;
  const sub = makeText(subDisplay, {
    size: subSize, fill: COLORS.accentDeep, anchor: 0.5,
  });
  while (sub.width > maxW && subDisplay.length > 6) {
    subDisplay = `${subDisplay.slice(0, -2)}…`;
    sub.text = subDisplay;
  }

  info.addChild(nameRow, sub);
  const nameW = Math.min(nameRow.width, maxW);
  const nameH = nameRow.height;
  const subH = sub.height;
  const totalH = nameH + infoLineGap + subH;
  const blockTop = -totalH / 2;
  nameRow.position.set(-nameW / 2, blockTop + nameH / 2);
  sub.position.set(0, blockTop + nameH + infoLineGap + subH / 2);
  return sub;
}

export class ShopScene implements Scene {
  readonly name = 'shop';
  readonly container = new PIXI.Container();

  private readonly _scroll = new ScrollListController();
  private _content: PIXI.Container | null = null;
  private _listMask: PIXI.Graphics | null = null;
  private _coinsHolder = new PIXI.Container();
  private _fx: SceneFx | null = null;
  private _rows = new Map<string, ShopRowRef>();
  private readonly _enterSeq = new SceneEnterSeq();

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    // 同步出壳，与 Title 一致；资源后台 hydrate，避免首点黑屏
    const token = this._enterSeq.next();
    this._fx = new SceneFx();
    this._build({ animate: true });
    void Game.warmScenePresent();
    void this._hydrateShell(token);
  }

  /** 壳层贴图与头像后台补齐；壳图到位后静默重建一次换真贴图 */
  private async _hydrateShell(token: number): Promise<void> {
    await ensureAssets(shopPreloadImages()).catch((e) => {
      console.warn('[Shop] 壳层资源加载失败', e);
    });
    if (!this._enterSeq.stillValid(token)) return;
    if (SceneManager.current?.name !== 'shop') return;

    this._fx?.destroy();
    this._fx = new SceneFx();
    this._build({ animate: false });

    void ensurePetAvatars(shopPetAvatarEntries()).catch((e) => {
      console.warn('[Shop] 头像预热失败', e);
    });
  }

  onExit(): void {
    this._enterSeq.cancel();
    this._scroll.detach();
    this._content = null;
    this._listMask = null;
    this._rows.clear();
    this._fx?.destroy();
    this._fx = null;
    this.container.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });
  }

  update(dt: number): void {
    this._fx?.update(dt);
  }

  private _focusChapter(): number {
    let latest = CHAPTERS[0];
    for (const ch of CHAPTERS) {
      if (PlayerData.isChapterUnlocked(ch)) latest = ch;
    }
    return latest;
  }

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

  private _shopPets(): PetDef[] {
    const ids = new Set(PlayerData.shopPoolIds());
    return PETS.filter((p) => ids.has(p.id));
  }

  private _sortShopPets(pets: PetDef[]): PetDef[] {
    return [...pets].sort(
      (a, b) => (b.rarity - a.rarity) || a.name.localeCompare(b.name, 'zh-CN'),
    );
  }

  private _build(opts?: { animate?: boolean }): void {
    const animate = opts?.animate !== false;
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._scroll.detach();
    this._rows.clear();
    this._listMask = null;
    this._content = null;
    this.container.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });

    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.shop, w, h));

    const back = makeBackButton({
      onTap: () => SceneManager.switchTo('title'),
    });
    back.position.set(80, Game.safeHeaderCenterY);
    this.container.addChild(back);

    const titleTex = shopTexture(UI_SHOP_IMAGES.titlePlaque) ?? shopTexture(UI_IMAGES.titlePlaque);
    const header = shopHeaderLayout(titleTex);
    this._buildTitlePlaque(w, header.titleCenterY, titleTex);

    this._coinsHolder = new PIXI.Container();
    this.container.addChild(this._coinsHolder);
    this._refreshCoins(header.coinCenterY);

    const chapter = this._focusChapter();
    const dominant = this._chapterDominantElement(chapter);
    const recommendEl = counterElementOf(dominant);
    const shopPool = this._sortShopPets(this._shopPets());
    const recommended = this._sortShopPets(
      shopPool.filter((p) => p.element === recommendEl),
    ).slice(0, ECONOMY.shop.recommendCount);
    const recommendedIds = new Set(recommended.map((p) => p.id));
    const allOwned = shopPool.filter((p) => !recommendedIds.has(p.id));

    const startY = header.listTop;
    const content = new PIXI.Container();
    content.position.set(0, startY);
    this._content = content;
    this.container.addChild(content);

    const animTargets: PIXI.Container[] = [];
    let y = 0;
    if (recommended.length > 0) {
      y = this._section(
        content, animTargets,
        `推荐：克制第${chapter}章·${ELEMENT_NAME[recommendEl]}灵宠`,
        recommended, startY, y,
      );
      y += 8;
    }
    if (allOwned.length > 0) {
      y = this._section(content, animTargets, '全部灵宠', allOwned, startY, y);
    } else if (shopPool.length === 0) {
      const empty = makeText('暂无可兑换碎片\n获得灵宠后即可在此购买碎片', {
        size: FONT_SIZE.sm, fill: COLORS.textSub, anchor: 0.5, align: 'center',
      });
      empty.position.set(w / 2, (h - startY - BOTTOM_NAV_RESERVE) / 2);
      content.addChild(empty);
    }

    const viewportH = h - startY - BOTTOM_NAV_RESERVE;
    const contentH = y + SHOP_UI.listBottomPad;
    const scrollMin = Math.min(startY, startY - Math.max(0, contentH - viewportH));

    this._listMask = new PIXI.Graphics();
    this._listMask.beginFill(COLORS.white);
    this._listMask.drawRect(0, startY, w, viewportH);
    this._listMask.endFill();
    this.container.addChild(this._listMask);
    content.mask = this._listMask;

    this._scroll.attach({
      content: () => this._content,
      viewportTop: startY,
      viewportH,
      scrollMin,
      listTop: startY,
      moveThreshold: 6,
    });

    if (animate) {
      staggerIn(animTargets, { stepDelay: 0.04, offsetY: 16, duration: 0.3 });
    }
    buildBottomNav(this.container, w, h, 'shop');
    if (this._fx) this._fx.build(this.container, w, h);
  }

  private _refreshCoins(coinCenterY?: number): void {
    this._coinsHolder.removeChildren().forEach((c) => c.destroy({ children: true }));
    const { coinIconSize, coinBarH, coinBarMinW, coinBarPadX } = SHOP_UI;
    const holder = new PIXI.Container();

    const coins = makeIconLabel({
      iconPath: UI_IMAGES.iconCoin,
      iconSize: coinIconSize,
      text: `${PlayerData.coins}`,
      size: 26,
      fill: COLORS.textMain,
      bold: true,
      gap: 10,
    });

    const pillW = Math.max(coinBarMinW, Math.ceil(coins.width + coinBarPadX * 2));
    addNineSliceBg(holder, UI_SHOP_IMAGES.coinPill, pillW, coinBarH, shopCoinSlice(), () => {
      const g = new PIXI.Graphics();
      g.beginFill(0xffffff, 0.96);
      g.lineStyle(2, COLORS.panelBorder, 1);
      g.drawRoundedRect(-pillW / 2, -coinBarH / 2, pillW, coinBarH, coinBarH / 2);
      g.endFill();
      return g;
    });

    holder.addChild(coins);
    const coinBounds = coins.getLocalBounds();
    coins.pivot.set(coinBounds.x + coinBounds.width / 2, coinBounds.y + coinBounds.height / 2);
    coins.position.set(0, 0);

    const titleTex = shopTexture(UI_SHOP_IMAGES.titlePlaque) ?? shopTexture(UI_IMAGES.titlePlaque);
    const centerY = coinCenterY ?? shopHeaderLayout(titleTex).coinCenterY;
    holder.position.set(Game.logicWidth / 2 + SHOP_UI.coinBarOffsetX, centerY);
    this._coinsHolder.addChild(holder);
  }

  private _buildTitlePlaque(w: number, centerY: number, tex?: PIXI.Texture | null): void {
    const plaqueTex = tex
      ?? shopTexture(UI_SHOP_IMAGES.titlePlaque)
      ?? shopTexture(UI_IMAGES.titlePlaque);
    if (plaqueTex) {
      const plaque = new PIXI.Sprite(plaqueTex);
      plaque.anchor.set(0.5);
      plaque.scale.set(SHOP_UI.titleW / plaqueTex.width);
      plaque.position.set(w / 2, centerY);
      this.container.addChild(plaque);
    }
  }

  private _section(
    content: PIXI.Container, animTargets: PIXI.Container[],
    heading: string, pets: PetDef[], absStartY: number, contentY: number,
  ): number {
    const w = Game.logicWidth;
    const barW = w - SHOP_UI.padX * 2;
    const headY = contentY + 18;
    const barTex = shopTexture(UI_SHOP_IMAGES.sectionBar);
    if (barTex) {
      const bar = new PIXI.Sprite(barTex);
      bar.width = barW;
      bar.height = SHOP_UI.sectionBarH;
      bar.anchor.set(0.5, 0.5);
      bar.position.set(w / 2, headY);
      content.addChild(bar);
    }

    const head = makeText(heading, {
      size: FONT_SIZE.xxs, fill: COLORS.accentDeep, bold: true, anchor: 0.5,
    });
    head.position.set(w / 2, headY);
    content.addChild(head);
    animTargets.push(head);

    let y = headY + 28;
    for (const pet of pets) {
      const row = this._buildRow(pet, y, absStartY);
      content.addChild(row);
      animTargets.push(row);
      y += SHOP_UI.rowH + SHOP_UI.rowGap;
    }
    return y;
  }

  private _buildRow(pet: PetDef, contentY: number, absStartY: number): PIXI.Container {
    const w = Game.logicWidth;
    const { rowH, innerPad, buyPad } = SHOP_UI;
    const rowW = w - SHOP_UI.padX * 2;
    const cost = ECONOMY.shop.shardPackCost[pet.rarity] ?? 600;
    const packSize = ECONOMY.shop.packSize;
    const { w: buyW } = shopBuyButtonSize(packSize, cost);

    const row = new PIXI.Container();
    row.position.set(w / 2, contentY + rowH / 2);

    addNineSliceBg(row, UI_SHOP_IMAGES.rowPanel, rowW, rowH, SHOP_UI.rowSlice, () => {
      const g = new PIXI.Graphics();
      g.beginFill(COLORS.panelBg, 0.98);
      g.lineStyle(2.5, COLORS.panelBorder, 1);
      g.drawRoundedRect(-rowW / 2, -rowH / 2, rowW, rowH, 14);
      g.endFill();
      return g;
    });

    const avatarSize = rowH - innerPad * 2;
    const avatarX = -rowW / 2 + innerPad;
    const avatarBounds = addShopPetPortrait(row, pet.id, avatarX, 0, avatarSize);
    attachRarityBadge(row, pet.rarity, avatarBounds.left, avatarBounds.top, avatarSize);

    const buyCenterX = rowW / 2 - buyPad - buyW / 2 + SHOP_UI.buyOffsetX;
    const infoCenterX = (avatarBounds.right + (buyCenterX - buyW / 2)) / 2;
    const infoMaxW = (buyCenterX - buyW / 2) - avatarBounds.right - 20;
    const sub = buildCenteredInfoBlock(
      row, pet, infoCenterX, Math.max(80, infoMaxW), this._rowSubText(pet),
    );

    const buy = makeShopBuyButton(
      packSize, cost, PlayerData.coins >= cost,
      () => this._onBuy(pet.id),
      () => this._scroll.moved,
    );
    buy.position.set(buyCenterX, 0);
    row.addChild(buy);

    this._rows.set(pet.id, {
      pet, cost, sub, buy,
      centerX: w / 2, centerY: absStartY + contentY + rowH / 2,
    });
    return row;
  }

  private _rowSubText(pet: PetDef): string {
    const owned = PlayerData.isOwned(pet.id);
    const suffix = owned ? '' : '·未拥有';
    return `当前碎片 ${PlayerData.petShards(pet.id)}${suffix}`;
  }

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
