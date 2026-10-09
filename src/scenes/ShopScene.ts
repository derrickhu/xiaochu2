/**
 * 商店场景：灵宠币兑碎片 + 登塔印记兑资源 + 灵玉兑外观
 *
 * 对齐 game_assets/.../prototypes/ui/shop_bg_interior_compact_v1.png / shop_sidebar_compact_v1.png：
 * 短 Tab 栈（无通栏长轨）+ 右区双列商品卡；外观页用同一块货架底板铺一张通栏皮肤卡。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { Platform } from '@/core/PlatformService';
import { SfxManager } from '@/core/SfxManager';
import { TextureCache } from '@/core/TextureCache';
import { bindPetAvatarSprite } from '@/config/petAvatarTexture';
import { bindLazySprite } from '@/ui/bindLazySprite';
import { shopPreloadImages } from '@/config/assetPreload';
import { ensureAssets } from '@/config/Subpackages';
import { UI } from '@/balance/ui';
import { PETS, PET_MAP, type PetDef } from '@/balance/pets';
import { PET_SKINS, SKIN_AD_COST, skinAdLabel, type PetSkinDef } from '@/balance/petSkins';
import { petSkinArt } from '@/config/petSkinArt';
import { ECONOMY } from '@/balance/economy';
import { formatReward } from '@/balance/rewards';
import { TOWER_EXCHANGES } from '@/balance/towerLegacy';
import { watchAd } from '@/game/adGate';
import { PlayerData } from '@/game/PlayerData';
import { grantReward } from '@/game/rewardGrant';
import { reportQuest } from '@/game/dailyQuestTracker';
import { analytics } from '@/analytics';
import {
  BACKGROUND_IMAGES, UI_IMAGES, UI_SHOP_IMAGES, UI_FX_IMAGES,
  petBaseAvatarPath,
} from '@/config/Assets';
import {
  SKIN_UI, SkinPreviewOverlay, fillStageArt, makeAdIcon, makeLimitedTag, makeLookCompare, makeMoonStage,
  makeSkinPayButton,
} from '@/scenes/shop/skinShowcase';
import {
  COLORS, FONT_SIZE,
  makeBackButton, makeCoverBackground, makeText,
  attachRarityBadge, makeIconLabel, makeElementOrb, makeRoleBadge,
  SceneFx, staggerIn, pulse,
} from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { pressFeedback } from '@/ui/motion';
import { ScrollListController } from '@/ui/ScrollList';
import { ShopInfoPopup } from '@/scenes/shop/ShopInfoPopup';
import { sortPetsByGrowthOrder } from './codexSort';

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

const SKIN_CARD_H = 420;

export type ShopTabId = 'shard' | 'honor' | 'realm' | 'lingyu';

export interface ShopEnterData {
  tab?: ShopTabId;
  from?: string;
  /** 从灵宠详情来兑换时，返回按钮回到这只灵宠 */
  petId?: string;
  petBackScene?: string;
  petBackData?: unknown;
}

interface ShopTabDef {
  id: ShopTabId;
  label: string;
  iconPath: string;
  enabled: boolean;
}

const SHOP_TABS: readonly ShopTabDef[] = [
  { id: 'shard', label: '碎片', iconPath: UI_SHOP_IMAGES.tabIconShard, enabled: true },
  { id: 'honor', label: '印记', iconPath: UI_SHOP_IMAGES.tabIconHonor, enabled: true },
  { id: 'realm', label: '秘境', iconPath: UI_SHOP_IMAGES.tabIconRealm, enabled: false },
  { id: 'lingyu', label: '外观', iconPath: UI_SHOP_IMAGES.tabIconLingyu, enabled: true },
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

function shopHint(tab: ShopTabId): string {
  if (tab === 'honor') return '◆  登塔印记兑换资源  ◆';
  if (tab === 'lingyu') return '◆  限定外观 · 点立绘看大图  ◆';
  return '◆  灵宠币兑换定向碎片  ◆';
}

function skinBuyToast(result: string, skin: PetSkinDef): string {
  if (result === 'poor') return `灵玉不足，还差 ${Math.max(0, skin.priceLingyu - PlayerData.lingyu)}`;
  if (result === 'need_pet') return '先获得这只灵宠';
  if (result === 'already') return '已经拥有这套外观';
  return '现在不能购买';
}

function shopCoinSlice(): { left: number; top: number; right: number; bottom: number } {
  const cap = SHOP_UI.coinCapW;
  return { left: cap, top: 0, right: cap, bottom: 0 };
}

/** 贴图到位再挂上。分包图 get() 不会自己开拉，这里补一次 load。 */
function whenShopTex(
  parent: PIXI.Container,
  path: string,
  apply: (tex: PIXI.Texture) => void,
): void {
  const ready = shopTexture(path);
  if (ready) {
    apply(ready);
    return;
  }
  const unsub = TextureCache.onTextureLoaded((loaded) => {
    if (loaded !== path) return;
    unsub();
    if (parent.destroyed) return;
    const tex = shopTexture(path);
    if (tex) apply(tex);
  });
  parent.once('destroyed', unsub);
  void TextureCache.load(path).catch(() => null);
}

/** 九宫格贴图底板；未就绪时先空着，到图后垫到最底层 */
function addNineSliceBg(
  parent: PIXI.Container,
  texPath: string,
  w: number,
  h: number,
  slice: { left: number; top: number; right: number; bottom: number },
): boolean {
  whenShopTex(parent, texPath, (tex) => {
    const plane = new PIXI.NineSlicePlane(tex, slice.left, slice.top, slice.right, slice.bottom);
    plane.width = w;
    plane.height = h;
    plane.position.set(-w / 2, -h / 2);
    parent.addChildAt(plane, 0);
  });
  return true;
}

/** 整图缩放铺满（侧栏轨道 / Tab 底板） */
function addScaledSprite(
  parent: PIXI.Container,
  texPath: string,
  w: number,
  h: number,
): boolean {
  whenShopTex(parent, texPath, (tex) => {
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5);
    sp.width = w;
    sp.height = h;
    parent.addChildAt(sp, 0);
  });
  return true;
}

function addShopIcon(
  parent: PIXI.Container,
  path: string,
  size: number,
  x: number,
  y: number,
): void {
  const icon = new PIXI.Sprite(PIXI.Texture.EMPTY);
  icon.anchor.set(0.5);
  icon.position.set(x, y);
  parent.addChild(icon);
  whenShopTex(parent, path, (tex) => {
    if (icon.destroyed || !tex.width) return;
    icon.texture = tex;
    icon.scale.set(size / Math.max(tex.width, tex.height));
  });
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
  iconPath: string = UI_IMAGES.iconCoin,
  label?: string,
): ShopBuyHandle {
  const { buyH, buyMinW, buyFont, buyCoinIcon } = SHOP_UI;
  const btn = new PIXI.Container() as ShopBuyHandle;
  const priceRow: PIXI.Container = label
    ? makeText(label, {
      size: buyFont, fill: COLORS.textMain, bold: true, anchor: 0.5,
    })
    : makeIconLabel({
      iconPath,
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
    if (priceRow instanceof PIXI.Text) priceRow.style.fill = fill;
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

/** 和灵玉价签同一块底板，图标换成小电视，文案是广告进度 */
function makeCardAdButton(watched: number, onTap: () => void, blockTap?: () => boolean): PIXI.Container {
  const { buyH, buyMinW, buyFont, buyCoinIcon } = SHOP_UI;
  const btn = new PIXI.Container();
  const row = new PIXI.Container();
  const icon = makeAdIcon(buyCoinIcon, SKIN_UI.ink, SKIN_UI.ribbonEdge);
  icon.position.set(buyCoinIcon / 2, 0);
  const done = Math.max(0, Math.min(SKIN_AD_COST, watched));
  const label = makeText(`广告 ${done}/${SKIN_AD_COST}`, {
    size: buyFont, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
  });
  label.position.set(buyCoinIcon + 6, 0);
  row.addChild(icon, label);
  const size = centerPivot(row);
  const buyW = Math.max(buyMinW, Math.ceil(size.w + 28));
  addNineSliceBg(btn, UI_SHOP_IMAGES.buyPanel, buyW, buyH, SHOP_UI.buySlice);
  btn.addChild(row);
  bindPointerTap(btn, onTap, { blockTap });
  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.hitArea = new PIXI.Rectangle(-buyW / 2, -buyH / 2, buyW, buyH);
  btn.interactiveChildren = false;
  pressFeedback(btn);
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
  private _from: string | null = null;
  private _skinPreview: SkinPreviewOverlay | null = null;
  private _skinAdBusy = false;
  /** 货架上的月夜舞台；只推视口内的那几张 */
  private _skinStages: { tick: (dt: number) => void; centerY: number }[] = [];
  private _skinShelfY = 0;
  private _viewTop = 0;
  private _viewBottom = 0;
  private _skinCardCenters = new Map<string, { x: number; y: number }>();
  private _returnPetId: string | null = null;
  private _petBackScene = 'codex';
  private _petBackData: unknown;
  private _infoPopup: ShopInfoPopup | null = null;

  onEnter(data?: unknown): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    const enter = data as ShopEnterData | undefined;
    this._from = typeof enter?.from === 'string' ? enter.from : null;
    this._returnPetId = typeof enter?.petId === 'string' ? enter.petId : null;
    this._petBackScene = typeof enter?.petBackScene === 'string' ? enter.petBackScene : 'codex';
    this._petBackData = enter?.petBackData;
    if (enter?.tab === 'honor' || enter?.tab === 'shard' || enter?.tab === 'lingyu') {
      this._tabId = enter.tab;
    } else this._tabId = 'shard';
    this._fx = new SceneFx();
    this._build({ animate: true });
    void Game.warmScenePresent();
    // 壳图后台解码后由 whenShopTex 补上，不要等全部已拥有头像再整页重建。
    void ensureAssets(shopPreloadImages()).catch((e) => {
      console.warn('[Shop] 壳层资源加载失败', e);
    });
  }

  onExit(): void {
    this._skinStages = [];
    this._skinCardCenters.clear();
    this._closeSkinPreview();
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
    if (this._skinPreview) {
      this._skinPreview.tick(dt);
      return;
    }
    const content = this._content;
    if (!content || this._skinStages.length === 0) return;
    const half = SKIN_CARD_H / 2;
    for (const s of this._skinStages) {
      const cy = content.y + s.centerY;
      if (cy + half < this._viewTop || cy - half > this._viewBottom) continue;
      s.tick(dt);
    }
  }

  private _shopPets(): PetDef[] {
    const ids = new Set(PlayerData.shopPoolIds());
    return sortPetsByGrowthOrder(PETS.filter((p) => ids.has(p.id)));
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
    this._skinStages = [];
    this._skinCardCenters.clear();
    this._closeSkinPreview();
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
      onTap: () => {
        if (this._from === 'tower') SceneManager.switchTo('tower');
        else if (this._from === 'petDetail' && this._returnPetId) {
          SceneManager.switchTo('petDetail', {
            petId: this._returnPetId,
            backScene: this._petBackScene,
            backData: this._petBackData,
          });
        } else SceneManager.switchTo('title', PlayerData.titleEnter());
      },
    });
    back.position.set(56, Game.safeHeaderCenterY);
    this.container.addChild(back);

    const header = shopHeaderLayout();
    this._coinsHolder = new PIXI.Container();
    this.container.addChild(this._coinsHolder);
    this._refreshCoins(header.coinCenterY);

    const geo = this._contentGeometry();
    const hint = makeText(shopHint(this._tabId), {
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
    } else if (this._tabId === 'honor') {
      contentH = this._buildHonorList(content, animTargets);
    } else if (this._tabId === 'lingyu') {
      contentH = this._buildSkinShelf(content, animTargets);
    } else {
      const empty = makeText('该商店即将开放', {
        size: FONT_SIZE.sm, fill: COLORS.textSub, bold: true, anchor: 0.5,
      });
      empty.position.set(geo.contentLeft + geo.contentW / 2, 120);
      content.addChild(empty);
    }

    const viewportH = h - header.listTop - 24;
    this._viewTop = header.listTop;
    this._viewBottom = header.listTop + viewportH;
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

  /**
   * 短 Tab 栈：只列已开放页，无通栏长轨（避免半截悬空）。
   * 未开放的页不占位 —— 灰着摆在那只是让玩家反复点、反复吃「即将开放」toast。
   * 开放时把 SHOP_TABS 里对应项的 enabled 改 true 即可。
   */
  private _buildSidebar(listTop: number): void {
    const stack = new PIXI.Container();
    stack.position.set(0, listTop);
    this.container.addChild(stack);

    let y = 4;
    for (const tab of SHOP_TABS) {
      if (!tab.enabled) continue;
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

    addShopIcon(node, tab.iconPath, SHOP_UI.tabIcon, 0, -12);

    const label = makeText(tab.label, {
      size: FONT_SIZE.xs,
      fill: selected ? COLORS.textMain : COLORS.textSub,
      bold: true,
      anchor: 0.5,
      role: 'title',
    });
    label.position.set(0, 28);
    node.addChild(label);

    bindPointerTap(node, () => {
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

  /** 印记兑换：三档日限货，单列卡，和碎片页同一套底板 */
  private _buildHonorList(content: PIXI.Container, animTargets: PIXI.Container[]): number {
    const geo = this._contentGeometry();
    const rowH = 148;
    let y = 0;
    for (const opt of TOWER_EXCHANGES) {
      const cardX = geo.contentLeft + geo.contentW / 2;
      const cardY = y + rowH / 2;
      const card = this._buildHonorCard(opt.id, geo.contentW, rowH);
      card.position.set(cardX, cardY);
      content.addChild(card);
      animTargets.push(card);
      y += rowH + SHOP_UI.cardGapY;
    }
    return y;
  }

  private _buildHonorCard(optionId: string, cardW: number, cardH: number): PIXI.Container {
    const opt = TOWER_EXCHANGES.find((e) => e.id === optionId);
    const card = new PIXI.Container();
    if (!opt) return card;
    addNineSliceBg(card, UI_SHOP_IMAGES.cardPanel, cardW, cardH, SHOP_UI.cardSlice)
      || addScaledSprite(card, UI_SHOP_IMAGES.cardPanel, cardW, cardH);

    const left = PlayerData.towerExchangeLeft(opt.id);
    const affordable = PlayerData.towerCoins >= opt.cost;
    const enabled = left > 0 && affordable;

    const name = makeText(formatReward(opt.reward), {
      size: SHOP_UI.nameSize, fill: COLORS.textMain, bold: true, anchor: [0, 0.5], role: 'title',
    });
    name.position.set(-cardW / 2 + 28, -22);
    card.addChild(name);

    const limit = makeText(`今日剩余 ${left}/${opt.dailyLimit}`, {
      size: SHOP_UI.subSize, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
    });
    limit.position.set(-cardW / 2 + 28, 8);
    card.addChild(limit);

    const buy = makeCardBuyButton(
      opt.cost,
      enabled,
      () => this._onBuyHonor(opt.id),
      () => this._scroll.moved,
      UI_IMAGES.towerCurrencySeal,
    );
    buy.position.set(cardW / 2 - 86, 0);
    card.addChild(buy);
    return card;
  }

  private _onBuyHonor(optionId: string): void {
    const left = PlayerData.towerExchangeLeft(optionId);
    const done = PlayerData.consumeTowerExchange(optionId);
    if (!done) {
      SfxManager.playDenied();
      Platform.showToast(left <= 0 ? '今日兑换次数已用完' : '登塔印记不足');
      return;
    }
    grantReward(done.reward);
    Platform.vibrateShort('light');
    SfxManager.playShopPurchase();
    analytics.track('tower_exchange', { option_id: optionId, cost: done.cost });
    Platform.showToast(`兑换成功 · ${formatReward(done.reward)}`, 'success');
    reportQuest('shopBuy');
    this._build({ animate: false });
  }

  /** 外观页：通栏限定卡，左月夜舞台立绘，右对比与价签 */
  private _buildSkinShelf(content: PIXI.Container, animTargets: PIXI.Container[]): number {
    const geo = this._contentGeometry();
    let y = 0;
    for (const skin of PET_SKINS) {
      this._skinShelfY = y;
      const card = this._buildSkinCard(skin, geo.contentW);
      card.position.set(geo.contentLeft + geo.contentW / 2, y + SKIN_CARD_H / 2);
      content.addChild(card);
      animTargets.push(card);
      this._skinCardCenters.set(skin.id, {
        x: geo.contentLeft + geo.contentW / 2,
        y: y + SKIN_CARD_H / 2,
      });
      y += SKIN_CARD_H + SHOP_UI.cardGapY;
    }
    return y;
  }

  private _buildSkinCard(skin: PetSkinDef, cardW: number): PIXI.Container {
    const cardH = SKIN_CARD_H;
    const card = new PIXI.Container();
    addNineSliceBg(card, UI_SHOP_IMAGES.cardPanel, cardW, cardH, SHOP_UI.cardSlice)
      || addScaledSprite(card, UI_SHOP_IMAGES.cardPanel, cardW, cardH);

    const pad = 18;
    const stageW = 236;
    const stageH = cardH - pad * 2;
    const stageX = -cardW / 2 + pad + stageW / 2;
    const stage = makeMoonStage(stageW, stageH, 22);
    stage.root.position.set(stageX, 0);
    card.addChild(stage.root);
    this._skinStages.push({ tick: stage.tick, centerY: this._skinShelfY + cardH / 2 });
    card.hitArea = new PIXI.Rectangle(-cardW / 2, -cardH / 2, cardW, cardH);
    const art = petSkinArt(skin.id);
    if (art) fillStageArt(stage, art.body, stageW * 0.96, stageH * 0.9, stageH * 0.02);

    const tag = makeLimitedTag();
    tag.position.set(-cardW / 2 + pad + 10, -cardH / 2 + pad + 10);
    card.addChild(tag);

    const peek = makeText('点击看大图', {
      size: FONT_SIZE.xxs, fill: SKIN_UI.moon, bold: true, anchor: 0.5,
    });
    const peekW = Math.ceil(peek.width + 28);
    const peekBg = new PIXI.Graphics();
    peekBg.beginFill(SKIN_UI.dim, 0.62);
    peekBg.drawRoundedRect(-peekW / 2, -14, peekW, 28, 14);
    peekBg.endFill();
    peekBg.position.set(stageX, stageH / 2 - 22);
    card.addChild(peekBg);
    peek.position.set(stageX, stageH / 2 - 22);
    card.addChild(peek);

    const stageHit = new PIXI.Container();
    stageHit.hitArea = new PIXI.Rectangle(-stageW / 2, -stageH / 2, stageW, stageH);
    stageHit.eventMode = 'static';
    stageHit.cursor = 'pointer';
    stageHit.position.set(stageX, 0);
    bindPointerTap(stageHit, () => this._openSkinPreview(skin), { blockTap: () => this._scroll.moved });
    card.addChild(stageHit);

    const textX = -cardW / 2 + pad + stageW + 22;
    const colW = cardW / 2 - 22 - textX;
    const pet = PET_MAP.get(skin.petId);
    const owned = PlayerData.ownsPetSkin(skin.id);
    const equipped = PlayerData.petSkinEquipped(skin.petId) === skin.id;

    const name = makeText(skin.name, {
      size: 34, fill: SKIN_UI.ink, anchor: [0, 0.5], role: 'title',
    });
    name.position.set(textX, -cardH / 2 + 46);
    card.addChild(name);

    const who = new PIXI.Container();
    who.position.set(textX, -cardH / 2 + 86);
    card.addChild(who);
    if (pet) {
      const orb = makeElementOrb(pet.element, 22);
      orb.position.set(11, 0);
      who.addChild(orb);
    }
    const whoName = makeText(pet?.name ?? '', {
      size: SHOP_UI.nameSize, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
    });
    whoName.position.set(pet ? 28 : 0, 0);
    who.addChild(whoName);

    const tagline = makeText(skin.tagline, {
      size: SHOP_UI.subSize, fill: COLORS.accentDeep, bold: true, anchor: [0, 0.5],
    });
    tagline.position.set(textX, -cardH / 2 + 118);
    card.addChild(tagline);

    if (art && pet) {
      const star = PlayerData.petStar(pet.id);
      const compare = makeLookCompare(petBaseAvatarPath(pet.id, star), art.portrait, 76);
      compare.position.set(textX + Math.max(0, (colW - compare.width) / 2), -cardH / 2 + 142);
      card.addChild(compare);
    }

    const perks = makeText(
      owned
        ? (equipped ? '穿戴中 · 到灵宠页可换回原貌' : '已拥有 · 到灵宠页穿上')
        : `${skin.priceLingyu} 灵玉，或看 ${SKIN_AD_COST} 次广告\n只换外观，不影响战力`,
      {
        size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: [0, 0], wordWrapWidth: colW,
      },
    );
    perks.position.set(textX, cardH / 2 - 130);
    card.addChild(perks);

    const buy = this._makeSkinPayRow(skin);
    buy.position.set(textX + colW / 2, cardH / 2 - 44);
    card.addChild(buy);
    return card;
  }

  /** 未拥有：灵玉和广告并排。已拥有：去更换 */
  private _makeSkinPayRow(skin: PetSkinDef): PIXI.Container {
    const row = new PIXI.Container();
    const owned = PlayerData.ownsPetSkin(skin.id);
    const blockTap = () => this._scroll.moved;
    if (owned) {
      row.addChild(makeCardBuyButton(
        skin.priceLingyu,
        true,
        () => this._onSkinAction(skin),
        blockTap,
        UI_IMAGES.iconLingyu,
        '去更换',
      ));
      return row;
    }
    const lingyu = makeCardBuyButton(
      skin.priceLingyu,
      true,
      () => this._onSkinAction(skin),
      blockTap,
      UI_IMAGES.iconLingyu,
    );
    const ad = makeCardAdButton(
      PlayerData.skinAdWatched(skin.id),
      () => { void this._onSkinAd(skin); },
      blockTap,
    );
    const gap = 12;
    const lingyuW = lingyu.getLocalBounds().width;
    const adW = ad.getLocalBounds().width;
    lingyu.position.set(-(gap + adW) / 2, 0);
    ad.position.set((gap + lingyuW) / 2, 0);
    row.addChild(lingyu, ad);
    row.scale.set(1.12);
    return row;
  }

  private _makePreviewPay(skin: PetSkinDef): { action: () => PIXI.Container; alt?: () => PIXI.Container } {
    const owned = PlayerData.ownsPetSkin(skin.id);
    if (owned) {
      return {
        action: () => makeCardBuyButton(
          skin.priceLingyu,
          true,
          () => this._onSkinAction(skin),
          undefined,
          UI_IMAGES.iconLingyu,
          '去更换',
        ),
      };
    }
    return {
      action: () => makeSkinPayButton({
        kind: 'lingyu',
        text: `${skin.priceLingyu}`,
        width: 230,
        height: 72,
        onTap: () => this._onSkinAction(skin),
      }),
      alt: () => makeSkinPayButton({
        kind: 'ad',
        text: skinAdLabel(PlayerData.skinAdWatched(skin.id)),
        width: 230,
        height: 72,
        onTap: () => { void this._onSkinAd(skin); },
      }),
    };
  }

  private _openSkinPreview(skin: PetSkinDef): void {
    const art = petSkinArt(skin.id);
    const pet = PET_MAP.get(skin.petId);
    if (!art || !pet) return;
    this._closeSkinPreview();
    this._scroll.detach();
    const owned = PlayerData.ownsPetSkin(skin.id);
    const equipped = PlayerData.petSkinEquipped(skin.petId) === skin.id;
    const pay = this._makePreviewPay(skin);
    const overlay = new SkinPreviewOverlay({
      skinName: skin.name,
      petName: pet.name,
      skinBody: art.body,
      ownedNote: owned
        ? (equipped ? '穿戴中 · 点「去更换」可换回原貌' : '已拥有 · 点「去更换」穿上')
        : `${skin.priceLingyu} 灵玉，或看 ${SKIN_AD_COST} 次广告`,
      makeAction: pay.action,
      makeAlt: pay.alt,
      onClose: () => {
        this._closeSkinPreview();
        this._build({ animate: false });
      },
    });
    this._skinPreview = overlay;
    this.container.addChild(overlay);
    SfxManager.playUiClick();
    analytics.track('skin_preview', { skin_id: skin.id, pet_id: skin.petId, owned: owned ? 1 : 0 });
  }

  private _closeSkinPreview(): void {
    const overlay = this._skinPreview;
    this._skinPreview = null;
    if (overlay && !overlay.destroyed) {
      overlay.parent?.removeChild(overlay);
      overlay.destroy({ children: true });
    }
  }

  /** 买到后：月光闪 + 星屑，再把大图以「已拥有」状态弹回来 */
  private _celebrateSkin(skin: PetSkinDef): void {
    const content = this._content;
    const spot = this._skinCardCenters.get(skin.id);
    const cx = spot?.x ?? Game.logicWidth / 2;
    const cy = (spot?.y ?? 0) + (content?.y ?? 0);
    this._fx?.flash(SKIN_UI.glow, 0.32, 0.45);
    const spark = TextureCache.get(UI_FX_IMAGES.particleSpark) ?? undefined;
    for (const color of [SKIN_UI.glow, SKIN_UI.moon, COLORS.accent]) {
      this._fx?.burst({
        x: cx, y: cy, color,
        count: 16, speed: 380, life: 0.8, gravity: 180, size: 24, endScale: 0.1,
        texture: spark,
        blendMode: PIXI.BLEND_MODES.ADD,
      });
    }
    Platform.vibrateShort('heavy');
    setTimeout(() => {
      if (SceneManager.current?.name !== 'shop' || this._tabId !== 'lingyu') return;
      this._openSkinPreview(skin);
    }, 520);
  }

  /** 看完一次广告记 1 次；凑够 SKIN_AD_COST 次才入账，和灵玉购买同一套到手表现 */
  private async _onSkinAd(skin: PetSkinDef): Promise<void> {
    if (this._skinAdBusy || PlayerData.ownsPetSkin(skin.id)) return;
    if (!PlayerData.isOwned(skin.petId)) {
      SfxManager.playDenied();
      Platform.showToast('先获得这只灵宠');
      return;
    }
    this._skinAdBusy = true;
    const fromPreview = !!this._skinPreview;
    try {
      const ok = await watchAd('skin_unlock', { skin_id: skin.id, pet_id: skin.petId });
      if (!ok || SceneManager.current?.name !== 'shop') return;
      const result = PlayerData.noteSkinAdWatch(skin.id);
      if (result === 'progress') {
        const done = PlayerData.skinAdWatched(skin.id);
        Platform.showToast(`已看 ${done}/${SKIN_AD_COST}，再看 ${SKIN_AD_COST - done} 次就获得`, 'success');
        this._closeSkinPreview();
        this._build({ animate: false });
        if (fromPreview) this._openSkinPreview(skin);
        return;
      }
      if (result !== 'owned') {
        SfxManager.playDenied();
        Platform.showToast(result === 'need_pet' ? '先获得这只灵宠' : '现在不能兑换');
        return;
      }
      SfxManager.playShopPurchase();
      analytics.track('skin_buy', {
        skin_id: skin.id,
        cost: 0,
        pay: 'ad',
        pet_id: skin.petId,
        from_preview: fromPreview ? 1 : 0,
      });
      Platform.showToast(`获得外观 · ${skin.name}，已穿上`, 'success');
      reportQuest('shopBuy');
      this._closeSkinPreview();
      this._build({ animate: false });
      this._celebrateSkin(skin);
    } finally {
      this._skinAdBusy = false;
    }
  }

  private _onSkinAction(skin: PetSkinDef): void {
    const owned = PlayerData.ownsPetSkin(skin.id);
    if (!owned) {
      const result = PlayerData.buyPetSkin(skin.id);
      if (result !== 'ok') {
        SfxManager.playDenied();
        Platform.showToast(skinBuyToast(result, skin));
        return;
      }
      SfxManager.playShopPurchase();
      analytics.track('skin_buy', {
        skin_id: skin.id,
        cost: skin.priceLingyu,
        pay: 'lingyu',
        pet_id: skin.petId,
        from_preview: this._skinPreview ? 1 : 0,
      });
      Platform.showToast(`获得外观 · ${skin.name}，已穿上`, 'success');
      reportQuest('shopBuy');
      this._closeSkinPreview();
      this._build({ animate: false });
      this._celebrateSkin(skin);
      return;
    }
    if (!PlayerData.isOwned(skin.petId)) {
      SfxManager.playDenied();
      Platform.showToast('先获得这只灵宠');
      return;
    }
    this._closeSkinPreview();
    SceneManager.switchTo('petDetail', {
      petId: skin.petId,
      backScene: 'shop',
      backData: {
        tab: 'lingyu',
        from: this._from ?? undefined,
      } satisfies ShopEnterData,
    });
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
    addShopIcon(card, UI_IMAGES.iconShard, iconSize, 0, portraitY);

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
    reportQuest('shopBuy');
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
    reportQuest('shopBuy');
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

    const honor = this._tabId === 'honor';
    const skin = this._tabId === 'lingyu';
    const coins = makeIconLabel({
      iconPath: honor
        ? UI_IMAGES.towerCurrencySeal
        : skin
          ? UI_IMAGES.iconLingyu
          : UI_IMAGES.iconCoin,
      iconSize: coinIconSize,
      text: honor
        ? `${PlayerData.towerCoins}`
        : skin
          ? `${PlayerData.lingyu}`
          : `${PlayerData.coins}`,
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
