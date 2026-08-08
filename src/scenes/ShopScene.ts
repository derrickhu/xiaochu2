/**
 * 商店场景：灵宠币定向兑换碎片
 *
 * 对齐 game_assets/.../prototypes/ui/shop_bg_interior_compact_v1.png / shop_sidebar_compact_v1.png：
 * 短 Tab 栈（无通栏长轨）+ 右区双列商品卡；洞府货架氛围底。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { Platform } from '@/core/PlatformService';
import { SfxManager } from '@/core/SfxManager';
import { TextureCache } from '@/core/TextureCache';
import { bindPetAvatarSprite } from '@/config/petAvatarTexture';
import { shopPreloadImages, shopPetAvatarEntries, ensurePetAvatars } from '@/config/assetPreload';
import { ensureAssets } from '@/config/Subpackages';
import { UI } from '@/balance/ui';
import { PETS, type PetDef } from '@/balance/pets';
import { ECONOMY } from '@/balance/economy';
import { PlayerData } from '@/game/PlayerData';
import {
  BACKGROUND_IMAGES, UI_IMAGES, UI_SHOP_IMAGES, UI_FX_IMAGES,
} from '@/config/Assets';
import {
  COLORS, FONT_SIZE,
  makeBackButton, makeCoverBackground, makeText,
  attachRarityBadge, makeIconLabel, makeElementOrb, makeRoleBadge,
  SceneFx, staggerIn, pulse,
} from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { pressFeedback } from '@/ui/motion';
import { ScrollListController } from '@/ui/ScrollList';
import { SceneEnterSeq } from '@/utils/sceneEnterSeq';
import { ShopInfoPopup } from '@/scenes/shop/ShopInfoPopup';

/** 对齐短 Tab 栈 + 双列卡（750 设计宽） */
const SHOP_UI = {
  sidebarW: 112,
  sidebarInset: 8,
  /** 单层 Tab 芯片（无通栏长轨） */
  tabH: 96,
  tabGap: 12,
  tabIcon: 38,
  contentPadX: 12,
  gridCols: 2,
  cardGapX: 14,
  cardGapY: 14,
  cardH: 268,
  portraitSize: 112,
  nameSize: 22,
  subSize: 16,
  buyH: 46,
  buyMinW: 118,
  buyFont: 18,
  buyCoinIcon: 22,
  coinIconSize: 32,
  coinBarMinW: 156,
  coinBarPadX: 32,
  coinBarH: 48,
  coinCapW: 24,
  headerHintGap: 6,
  headerListGap: 10,
  listBottomPad: 28,
  buySlice: { left: 40, top: 4, right: 40, bottom: 4 },
  cardSlice: { left: 48, top: 48, right: 48, bottom: 48 },
} as const;

type ShopTabId = 'shard' | 'honor' | 'realm' | 'lingyu';

interface ShopTabDef {
  id: ShopTabId;
  label: string;
  iconPath: string;
  enabled: boolean;
}

const SHOP_TABS: readonly ShopTabDef[] = [
  { id: 'shard', label: '碎片', iconPath: UI_SHOP_IMAGES.tabIconShard, enabled: true },
  { id: 'honor', label: '荣誉', iconPath: UI_SHOP_IMAGES.tabIconHonor, enabled: false },
  { id: 'realm', label: '秘境', iconPath: UI_SHOP_IMAGES.tabIconRealm, enabled: false },
  { id: 'lingyu', label: '灵玉', iconPath: UI_SHOP_IMAGES.tabIconLingyu, enabled: false },
];

interface ShopBuyHandle extends PIXI.Container {
  setEnabled(enabled: boolean): void;
}

interface ShopCardRef {
  kind: 'pet' | 'universal';
  petId?: string;
  cost: number;
  packSize: number;
  sub: PIXI.Text;
  buy: ShopBuyHandle;
  centerX: number;
  centerY: number;
}

function shopTexture(path: string): PIXI.Texture | null {
  const tex = TextureCache.get(path);
  return tex?.valid ? tex : null;
}

/** 顶栏无标题匾：币胶囊对齐安全区，列表更靠上 */
function shopHeaderLayout(): {
  coinCenterY: number;
  hintCenterY: number;
  listTop: number;
} {
  const coinCenterY = Game.safeHeaderCenterY;
  const hintCenterY = coinCenterY + SHOP_UI.coinBarH / 2 + SHOP_UI.headerHintGap + 11;
  const listTop = hintCenterY + 12 + SHOP_UI.headerListGap;
  return { coinCenterY, hintCenterY, listTop };
}

function shopCoinSlice(): { left: number; top: number; right: number; bottom: number } {
  const cap = SHOP_UI.coinCapW;
  return { left: cap, top: 0, right: cap, bottom: 0 };
}

/** 九宫格贴图底板；贴图未就绪时不手绘面板，只留空容器 */
function addNineSliceBg(
  parent: PIXI.Container,
  texPath: string,
  w: number,
  h: number,
  slice: { left: number; top: number; right: number; bottom: number },
): boolean {
  const tex = shopTexture(texPath);
  if (!tex) return false;
  const plane = new PIXI.NineSlicePlane(tex, slice.left, slice.top, slice.right, slice.bottom);
  plane.width = w;
  plane.height = h;
  plane.position.set(-w / 2, -h / 2);
  parent.addChild(plane);
  return true;
}

/** 整图缩放铺满（侧栏轨道 / Tab 底板） */
function addScaledSprite(
  parent: PIXI.Container,
  texPath: string,
  w: number,
  h: number,
): boolean {
  const tex = shopTexture(texPath);
  if (!tex) return false;
  const sp = new PIXI.Sprite(tex);
  sp.anchor.set(0.5);
  sp.width = w;
  sp.height = h;
  parent.addChild(sp);
  return true;
}

function centerPivot(cont: PIXI.Container): { w: number; h: number } {
  const b = cont.getLocalBounds();
  cont.pivot.set(b.x + b.width / 2, b.y + b.height / 2);
  return { w: b.width, h: b.height };
}

function makeCardBuyButton(
  cost: number,
  enabled: boolean,
  onTap: () => void,
  blockTap?: () => boolean,
): ShopBuyHandle {
  const { buyH, buyMinW, buyFont, buyCoinIcon } = SHOP_UI;
  const btn = new PIXI.Container() as ShopBuyHandle;
  const priceRow = makeIconLabel({
    iconPath: UI_IMAGES.iconCoin,
    iconSize: buyCoinIcon,
    text: `${cost}`,
    size: buyFont,
    fill: COLORS.textMain,
    bold: true,
    gap: 6,
  });
  const priceSize = centerPivot(priceRow);
  const buyW = Math.max(buyMinW, Math.ceil(priceSize.w + 28));

  addNineSliceBg(btn, UI_SHOP_IMAGES.buyPanel, buyW, buyH, SHOP_UI.buySlice);
  btn.addChild(priceRow);
  priceRow.position.set(0, 0);

  let active = enabled;
  const redraw = (): void => {
    const fill = active ? COLORS.textMain : COLORS.textDisabled;
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

function addShopPetPortrait(
  parent: PIXI.Container,
  petId: string,
  x: number,
  y: number,
  size: number,
): { left: number; right: number; top: number } {
  const top = y - size / 2;
  const left = x - size / 2;
  const right = x + size / 2;
  const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
  spr.anchor.set(0.5);
  spr.position.set(x, y);
  parent.addChild(spr);
  bindPetAvatarSprite(spr, petId, 1, (tex) => {
    spr.scale.set(size / Math.max(tex.width, tex.height));
  });
  return { left, right, top };
}

export class ShopScene implements Scene {
  readonly name = 'shop';
  readonly container = new PIXI.Container();

  private readonly _scroll = new ScrollListController();
  private _content: PIXI.Container | null = null;
  private _listMask: PIXI.Graphics | null = null;
  private _coinsHolder = new PIXI.Container();
  private _fx: SceneFx | null = null;
  private _cards = new Map<string, ShopCardRef>();
  private _tabId: ShopTabId = 'shard';
  private readonly _enterSeq = new SceneEnterSeq();
  private _infoPopup: ShopInfoPopup | null = null;

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    const token = this._enterSeq.next();
    this._fx = new SceneFx();
    this._build({ animate: true });
    void Game.warmScenePresent();
    void this._hydrateShell(token);
  }

  private async _hydrateShell(token: number): Promise<void> {
    await ensureAssets(shopPreloadImages()).catch((e) => {
      console.warn('[Shop] 壳层资源加载失败', e);
    });
    // 头像先预热再重建，减少真机 CDN 空窗；bindPetAvatarSprite 仍会监听补刷
    await ensurePetAvatars(shopPetAvatarEntries()).catch((e) => {
      console.warn('[Shop] 头像预热失败', e);
    });
    if (!this._enterSeq.stillValid(token)) return;
    if (SceneManager.current?.name !== 'shop') return;

    this._fx?.destroy();
    this._fx = new SceneFx();
    this._build({ animate: false });
  }

  onExit(): void {
    this._enterSeq.cancel();
    this._scroll.detach();
    this._content = null;
    this._listMask = null;
    this._cards.clear();
    this._fx?.destroy();
    this._fx = null;
    if (this._infoPopup) {
      this._infoPopup.closeImmediate();
      this._infoPopup.parent?.removeChild(this._infoPopup);
      if (!this._infoPopup.destroyed) this._infoPopup.destroy({ children: true });
      this._infoPopup = null;
    }
    this.container.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });
  }

  update(dt: number): void {
    this._fx?.update(dt);
  }

  private _shopPets(): PetDef[] {
    const ids = new Set(PlayerData.shopPoolIds());
    return PETS.filter((p) => ids.has(p.id)).sort(
      (a, b) => (b.rarity - a.rarity) || a.name.localeCompare(b.name, 'zh-CN'),
    );
  }

  private _contentGeometry(): {
    contentLeft: number;
    contentW: number;
    cardW: number;
  } {
    const w = Game.logicWidth;
    const contentLeft = SHOP_UI.sidebarW + SHOP_UI.contentPadX;
    const contentW = w - contentLeft - SHOP_UI.contentPadX;
    const cardW = Math.floor(
      (contentW - SHOP_UI.cardGapX * (SHOP_UI.gridCols - 1)) / SHOP_UI.gridCols,
    );
    return { contentLeft, contentW, cardW };
  }

  private _build(opts?: { animate?: boolean }): void {
    const animate = opts?.animate !== false;
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._scroll.detach();
    this._cards.clear();
    this._listMask = null;
    this._content = null;
    // 重建时先摘下浮层，避免被 removeChildren 销毁
    if (this._infoPopup?.parent) {
      this._infoPopup.parent.removeChild(this._infoPopup);
      this._infoPopup.closeImmediate();
    }
    this.container.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });

    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.shop, w, h));

    const back = makeBackButton({
      onTap: () => SceneManager.switchTo('title'),
    });
    back.position.set(56, Game.safeHeaderCenterY);
    this.container.addChild(back);

    const header = shopHeaderLayout();
    this._coinsHolder = new PIXI.Container();
    this.container.addChild(this._coinsHolder);
    this._refreshCoins(header.coinCenterY);

    const geo = this._contentGeometry();
    const hint = makeText('◆  灵宠币兑换定向碎片  ◆', {
      size: FONT_SIZE.xs, fill: COLORS.textSub, bold: true, anchor: 0.5,
    });
    hint.position.set(geo.contentLeft + geo.contentW / 2, header.hintCenterY);
    this.container.addChild(hint);

    this._buildSidebar(header.listTop);

    const content = new PIXI.Container();
    content.position.set(0, header.listTop);
    this._content = content;
    this.container.addChild(content);

    const animTargets: PIXI.Container[] = [];
    let contentH = 40;
    if (this._tabId === 'shard') {
      contentH = this._buildShardGrid(content, animTargets, header.listTop);
    } else {
      const empty = makeText('该商店即将开放', {
        size: FONT_SIZE.sm, fill: COLORS.textSub, bold: true, anchor: 0.5,
      });
      empty.position.set(geo.contentLeft + geo.contentW / 2, 120);
      content.addChild(empty);
    }

    const viewportH = h - header.listTop - 24;
    const scrollMin = Math.min(
      header.listTop,
      header.listTop - Math.max(0, contentH + SHOP_UI.listBottomPad - viewportH),
    );

    this._listMask = new PIXI.Graphics();
    this._listMask.beginFill(COLORS.white);
    this._listMask.drawRect(geo.contentLeft, header.listTop, geo.contentW, viewportH);
    this._listMask.endFill();
    this.container.addChild(this._listMask);
    content.mask = this._listMask;

    this._scroll.attach({
      content: () => this._content,
      viewportTop: header.listTop,
      viewportH,
      scrollMin,
      listTop: header.listTop,
      moveThreshold: 6,
    });

    if (animate) {
      staggerIn(animTargets, { stepDelay: 0.03, offsetY: 14, duration: 0.28 });
    }
    if (this._fx) this._fx.build(this.container, w, h);

    if (!this._infoPopup || this._infoPopup.destroyed) {
      this._infoPopup = new ShopInfoPopup();
    }
    this.container.addChild(this._infoPopup);
  }

  /** 卡片上半区（不含购买钮）点击 → 说明浮层 */
  private _attachCardInfoTap(
    card: PIXI.Container,
    cardW: number,
    onInfo: () => void,
  ): void {
    const zone = new PIXI.Container();
    const buyReserve = 20 + SHOP_UI.buyH + 8;
    const zoneH = SHOP_UI.cardH - buyReserve;
    zone.hitArea = new PIXI.Rectangle(
      -cardW / 2,
      -SHOP_UI.cardH / 2,
      cardW,
      zoneH,
    );
    zone.eventMode = 'static';
    zone.cursor = 'pointer';
    bindPointerTap(zone, onInfo, { blockTap: () => this._scroll.moved });
    card.addChild(zone);
  }

  /** 短 Tab 栈：仅 4 枚芯片，无通栏长轨（避免半截悬空） */
  private _buildSidebar(listTop: number): void {
    const stack = new PIXI.Container();
    stack.position.set(0, listTop);
    this.container.addChild(stack);

    let y = 4;
    for (const tab of SHOP_TABS) {
      const selected = tab.id === this._tabId;
      const tabNode = this._makeTab(tab, selected);
      tabNode.position.set(SHOP_UI.sidebarW / 2, y + SHOP_UI.tabH / 2);
      stack.addChild(tabNode);
      y += SHOP_UI.tabH + SHOP_UI.tabGap;
    }
  }

  private _makeTab(tab: ShopTabDef, selected: boolean): PIXI.Container {
    const node = new PIXI.Container();
    const tw = SHOP_UI.sidebarW - 20;
    const th = SHOP_UI.tabH;
    addScaledSprite(
      node,
      selected ? UI_SHOP_IMAGES.tabOn : UI_SHOP_IMAGES.tabOff,
      tw,
      th,
    );

    const iconTex = shopTexture(tab.iconPath);
    if (iconTex) {
      const icon = new PIXI.Sprite(iconTex);
      icon.anchor.set(0.5);
      const s = SHOP_UI.tabIcon / Math.max(iconTex.width, iconTex.height);
      icon.scale.set(s);
      // 单层底板：图标居中偏上，文案贴底，不再给「底栏」留空
      icon.position.set(0, -12);
      icon.alpha = tab.enabled ? 1 : 0.45;
      node.addChild(icon);
    }

    const label = makeText(tab.label, {
      size: FONT_SIZE.xs,
      fill: selected ? COLORS.textMain : (tab.enabled ? COLORS.textSub : COLORS.textDisabled),
      bold: true,
      anchor: 0.5,
      role: 'title',
    });
    label.position.set(0, 28);
    label.alpha = tab.enabled ? 1 : 0.55;
    node.addChild(label);

    bindPointerTap(node, () => {
      if (!tab.enabled) {
        Platform.showToast(`${tab.label}商店即将开放`);
        return;
      }
      if (tab.id === this._tabId) return;
      this._tabId = tab.id;
      this._build({ animate: false });
    });
    node.hitArea = new PIXI.Rectangle(-tw / 2, -th / 2, tw, th);
    node.eventMode = 'static';
    node.cursor = 'pointer';
    pressFeedback(node);
    return node;
  }

  /** 双列平铺：通用碎片 + 全部灵宠，无分段推荐 */
  private _buildShardGrid(
    content: PIXI.Container,
    animTargets: PIXI.Container[],
    absListTop: number,
  ): number {
    const geo = this._contentGeometry();
    const shopPool = this._shopPets();

    type GridItem =
      | { kind: 'universal' }
      | { kind: 'pet'; pet: PetDef };

    const items: GridItem[] = [
      { kind: 'universal' },
      ...shopPool.map((pet) => ({ kind: 'pet' as const, pet })),
    ];

    let y = 0;
    let col = 0;
    for (const item of items) {
      const cardX = geo.contentLeft + col * (geo.cardW + SHOP_UI.cardGapX) + geo.cardW / 2;
      const cardY = y + SHOP_UI.cardH / 2;
      const card = item.kind === 'universal'
        ? this._buildUniversalCard(geo.cardW, absListTop + cardY, cardX)
        : this._buildPetCard(item.pet, geo.cardW, absListTop + cardY, cardX);
      card.position.set(cardX, cardY);
      content.addChild(card);
      animTargets.push(card);

      col += 1;
      if (col >= SHOP_UI.gridCols) {
        col = 0;
        y += SHOP_UI.cardH + SHOP_UI.cardGapY;
      }
    }
    if (col !== 0) y += SHOP_UI.cardH + SHOP_UI.cardGapY;

    if (shopPool.length === 0) {
      const empty = makeText('暂无可兑换碎片\n获得灵宠后即可在此购买', {
        size: FONT_SIZE.sm, fill: COLORS.textSub, anchor: 0.5, align: 'center',
      });
      empty.position.set(geo.contentLeft + geo.contentW / 2, y + 80);
      content.addChild(empty);
      y += 160;
    }
    return y;
  }

  private _cardShell(cardW: number): PIXI.Container {
    const card = new PIXI.Container();
    addNineSliceBg(card, UI_SHOP_IMAGES.cardPanel, cardW, SHOP_UI.cardH, SHOP_UI.cardSlice)
      || addScaledSprite(card, UI_SHOP_IMAGES.cardPanel, cardW, SHOP_UI.cardH);
    return card;
  }

  private _buildUniversalCard(
    cardW: number,
    absCenterY: number,
    absCenterX: number,
  ): PIXI.Container {
    const packSize = ECONOMY.shop.universalPackSize;
    const cost = ECONOMY.shop.universalPackCost;
    const card = this._cardShell(cardW);
    const top = -SHOP_UI.cardH / 2;
    const portraitY = top + 18 + SHOP_UI.portraitSize / 2;

    // 与宠卡立绘一致：锚点居中；勿用 makeIconLabel（空文本会把视觉中心偏右）
    const iconSize = SHOP_UI.portraitSize * 0.85;
    const iconTex = shopTexture(UI_IMAGES.iconShard);
    if (iconTex) {
      const icon = new PIXI.Sprite(iconTex);
      icon.anchor.set(0.5);
      icon.scale.set(iconSize / Math.max(iconTex.width, iconTex.height));
      icon.position.set(0, portraitY);
      card.addChild(icon);
    }

    const name = makeText('通用碎片', {
      size: SHOP_UI.nameSize, fill: COLORS.textMain, bold: true, anchor: 0.5,
      role: 'title',
    });
    name.position.set(0, top + 18 + SHOP_UI.portraitSize + 24);
    card.addChild(name);

    const sub = makeText(this._universalSubText(), {
      size: SHOP_UI.subSize, fill: COLORS.accentDeep, bold: true, anchor: 0.5,
    });
    sub.position.set(0, name.y + 24);
    card.addChild(sub);

    const buy = makeCardBuyButton(
      cost,
      PlayerData.coins >= cost,
      () => this._onBuyUniversal(packSize, cost),
      () => this._scroll.moved,
    );
    buy.position.set(0, SHOP_UI.cardH / 2 - 20 - SHOP_UI.buyH / 2);
    card.addChild(buy);

    this._attachCardInfoTap(card, cardW, () => this._infoPopup?.openUniversal());

    this._cards.set('universal', {
      kind: 'universal', cost, packSize, sub, buy,
      centerX: absCenterX, centerY: absCenterY,
    });
    return card;
  }

  private _buildPetCard(
    pet: PetDef,
    cardW: number,
    absCenterY: number,
    absCenterX: number,
  ): PIXI.Container {
    const cost = ECONOMY.shop.shardPackCost[pet.rarity] ?? 600;
    const packSize = ECONOMY.shop.packSize;
    const card = this._cardShell(cardW);
    const top = -SHOP_UI.cardH / 2;
    const portraitY = top + 18 + SHOP_UI.portraitSize / 2;

    const bounds = addShopPetPortrait(card, pet.id, 0, portraitY, SHOP_UI.portraitSize);
    attachRarityBadge(card, pet.rarity, bounds.left, bounds.top, SHOP_UI.portraitSize);

    const nameRow = new PIXI.Container();
    const orb = makeElementOrb(pet.element, 18);
    orb.anchor.set(0, 0.5);
    orb.position.set(0, 0);
    nameRow.addChild(orb);
    let displayName = pet.name;
    const name = makeText(displayName, {
      size: SHOP_UI.nameSize, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
      role: 'title',
    });
    const maxNameW = cardW - 36;
    while (name.width + 24 > maxNameW && displayName.length > 2) {
      displayName = `${displayName.slice(0, -1)}…`;
      name.text = displayName;
    }
    name.position.set(22, 0);
    nameRow.addChild(name);
    const nb = nameRow.getLocalBounds();
    nameRow.pivot.set(nb.x + nb.width / 2, nb.y + nb.height / 2);
    // 立绘下方：名 → 定位 → 碎片，标识不压宠身
    nameRow.position.set(0, top + 18 + SHOP_UI.portraitSize + 16);
    card.addChild(nameRow);

    const roleBadge = makeRoleBadge({
      role: pet.role,
      scale: 1.35,
      maxWidth: cardW - 28,
      textFill: 0xffffff,
    });
    roleBadge.position.set(-roleBadge.width / 2, nameRow.y + 14);
    card.addChild(roleBadge);

    const sub = makeText(this._petSubText(pet), {
      size: SHOP_UI.subSize, fill: this._petSubFill(pet), bold: true, anchor: 0.5,
    });
    sub.position.set(0, roleBadge.y + roleBadge.height + 8);
    card.addChild(sub);

    const buy = makeCardBuyButton(
      cost,
      PlayerData.coins >= cost,
      () => this._onBuyPet(pet.id),
      () => this._scroll.moved,
    );
    buy.position.set(0, SHOP_UI.cardH / 2 - 20 - SHOP_UI.buyH / 2);
    card.addChild(buy);

    this._attachCardInfoTap(card, cardW, () => this._infoPopup?.openPet(pet));

    this._cards.set(pet.id, {
      kind: 'pet', petId: pet.id, cost, packSize, sub, buy,
      centerX: absCenterX, centerY: absCenterY,
    });
    return card;
  }

  /** 商品卡副文案：持有量 + 购买包（便于估算还差几包升星） */
  private _universalSubText(): string {
    return `持有 ${PlayerData.universalShards} · ×${ECONOMY.shop.universalPackSize}`;
  }

  private _petSubText(pet: PetDef): string {
    const shards = PlayerData.petShards(pet.id);
    const need = PlayerData.starUpCost(pet.id);
    const pack = ECONOMY.shop.packSize;
    if (need === null) return `持有 ${shards} · 满星`;
    return `持有 ${shards}/${need} · ×${pack}`;
  }

  /** 够升星时副文案提色，一眼能看出「可以不用再囤」 */
  private _petSubFill(pet: PetDef): number {
    const plan = PlayerData.starUpPlan(pet.id);
    if (!plan) return COLORS.textSub;
    if (plan.shards >= plan.cost) return COLORS.accentDeep;
    return COLORS.textSub;
  }

  private _refreshAllBuyEnabled(): void {
    for (const c of this._cards.values()) {
      c.buy.setEnabled(PlayerData.coins >= c.cost);
    }
  }

  private _onBuyUniversal(packSize: number, cost: number): void {
    if (!PlayerData.spendCoins(cost)) {
      SfxManager.playDenied();
      Platform.showToast('灵宠币不足');
      return;
    }
    PlayerData.addUniversalShards(packSize);
    Platform.vibrateShort('light');
    SfxManager.playShopPurchase();
    Platform.showToast(`通用碎片 +${packSize}`, 'success');
    const ref = this._cards.get('universal');
    if (ref) ref.sub.text = this._universalSubText();
    this._refreshCoins();
    this._refreshAllBuyEnabled();
    this._playBuyFx('universal');
  }

  private _onBuyPet(petId: string): void {
    const ref = this._cards.get(petId);
    if (!ref || !ref.petId) return;
    if (!PlayerData.spendCoins(ref.cost)) {
      SfxManager.playDenied();
      Platform.showToast('灵宠币不足');
      return;
    }
    const pet = PETS.find((p) => p.id === petId);
    PlayerData.addShards(petId, ref.packSize);
    Platform.vibrateShort('light');
    SfxManager.playShopPurchase();
    Platform.showToast(`${pet?.name ?? '灵宠'} +${ref.packSize} 碎片`);
    if (pet) {
      ref.sub.text = this._petSubText(pet);
      ref.sub.style.fill = this._petSubFill(pet);
    }
    this._refreshCoins();
    this._refreshAllBuyEnabled();
    this._playBuyFx(petId);
  }

  private _playBuyFx(key: string): void {
    const ref = this._cards.get(key);
    if (!ref) return;
    if (this._coinsHolder.children[0]) pulse(this._coinsHolder.children[0] as PIXI.Container);
    this._fx?.flash(COLORS.accent, 0.14, 0.3);
    this._fx?.burst({
      x: ref.centerX, y: ref.centerY, color: COLORS.accent,
      count: 14, speed: 320, life: 0.6, gravity: 260, size: 22, endScale: 0.1,
      texture: TextureCache.get(UI_FX_IMAGES.particleSpark) ?? undefined,
      blendMode: PIXI.BLEND_MODES.ADD,
    });
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
    addNineSliceBg(holder, UI_SHOP_IMAGES.coinPill, pillW, coinBarH, shopCoinSlice());
    holder.addChild(coins);
    const coinBounds = coins.getLocalBounds();
    coins.pivot.set(coinBounds.x + coinBounds.width / 2, coinBounds.y + coinBounds.height / 2);
    coins.position.set(0, 0);

    const header = shopHeaderLayout();
    const centerY = coinCenterY ?? header.coinCenterY;
    const geo = this._contentGeometry();
    holder.position.set(geo.contentLeft + geo.contentW / 2, centerY);
    this._coinsHolder.addChild(holder);
  }
}
