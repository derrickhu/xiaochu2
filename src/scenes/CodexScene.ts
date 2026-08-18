/**
 * 灵宠图鉴页 —— 严格对齐 game_assets/.../prototypes/ui/codex_panel_proto_v3_ring_entry.png
 *
 * 壳层优先贴图（祥云顶栏 / 奖励圆环 / 领钮 / 筛选 Tab / 奖励弹层），
 * 禁止用 Graphics 硬画顶栏与进度环。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { TextureCache } from '@/core/TextureCache';
import {
  CODEX_SHELL_IMAGES,
  codexPetAvatarEntries,
  ensurePetAvatars,
  petDetailPreloadImages,
} from '@/config/assetPreload';
import { ensureAssets } from '@/config/Subpackages';
import type { ScrollListConfig } from '@/ui/ScrollList';
import { UI } from '@/balance/ui';
import { ECONOMY } from '@/balance/economy';
import { PETS, PET_MAP, PET_ROLE_NAME, type PetDef } from '@/balance/pets';
import { STAGES, CHAPTER_NAME } from '@/balance/stages';
import {
  BACKGROUND_IMAGES, UI_IMAGES, UI_CODEX_IMAGES, petCardPortraitImage,
} from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import {
  COLORS, FONT_SIZE,
  makeBackButton, makeButton, makeCoverBackground, makeIconLabel, makePanel, makeText,
  makeCloseButton, staggerIn,
} from '@/ui';
import { ScrollListController } from '@/ui/ScrollList';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { pressFeedback } from '@/ui/motion';
import { Platform } from '@/core/PlatformService';
import { SfxManager } from '@/core/SfxManager';
import { RADIUS } from '@/ui/theme';
import type { PetDetailEnterData } from './PetDetailScene';
import { buildLockedCodexCard, buildOwnedCodexCard } from './codexCards';
import { SceneEnterSeq } from '@/utils/sceneEnterSeq';

function designScale(w: number): number {
  return w / 375;
}

type CodexState = 'owned' | 'locked';
type CodexFilter = 'all' | 'owned' | 'locked';

const FILTER_TABS: readonly { id: CodexFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'owned', label: '已有' },
  { id: 'locked', label: '未获' },
];

const BOSS_DROP_STAGE: ReadonlyMap<string, { name: string; chapter: number }> = (() => {
  const m = new Map<string, { name: string; chapter: number }>();
  for (const s of STAGES) {
    for (const e of s.encounters) {
      if (e.kind === 'creature' && e.tier === 'tier2' && e.bossDrop && !m.has(e.id)) {
        m.set(e.id, { name: s.name, chapter: s.chapter });
      }
    }
  }
  return m;
})();

function petPoolGrid(w: number) {
  const S = designScale(w);
  const cols = 3;
  const cardGap = 8 * S;
  const cardW = (w - 24 * S - cardGap * (cols - 1)) / cols;
  const cardH = cardW * 1.28;
  const marginX = 12 * S;
  return { S, cols, cardGap, cardW, cardH, marginX };
}

function codexTex(path: string): PIXI.Texture | null {
  const t = TextureCache.get(path);
  return t?.valid ? t : null;
}

export class CodexScene implements Scene {
  readonly name = 'codex';
  readonly container = new PIXI.Container();

  private _content: PIXI.Container | null = null;
  private _listMask: PIXI.Graphics | null = null;
  private _scroll = new ScrollListController();
  private readonly _enterSeq = new SceneEnterSeq();
  private _filter: CodexFilter = 'all';
  private _listTop = 280;
  private _rewardOverlay: PIXI.Container | null = null;
  /**
   * 进详情时暂存整页（约 100 卡），避免真机同帧销毁+重建导致「卡住」。
   * 仅 `_parkForDetail` 路径启用；底栏切走仍走完整销毁。
   */
  private _parkForDetail = false;
  private _parked = false;
  private _parkFingerprint = '';
  private _parkContentY = 0;
  private _scrollCfg: ScrollListConfig | null = null;

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    // 从详情返回：树还在，尽量秒开；养成有变才轻量重建
    if (this._parked) {
      this._resumeFromPark();
      void Game.warmScenePresent();
      return;
    }
    // 不再进页静默发奖；待领显示「领」钮，点领或弹层领取
    this._filter = 'all';
    const token = this._enterSeq.next();
    this._buildShell();
    this._buildPetList({ animate: true });
    void Game.warmScenePresent();
    void this._hydrateShell(token);
  }

  private async _hydrateShell(token: number): Promise<void> {
    await ensureAssets(CODEX_SHELL_IMAGES).catch((e) => {
      console.warn('[Codex] 壳层资源加载失败', e);
    });
    await ensurePetAvatars(codexPetAvatarEntries()).catch((e) => {
      console.warn('[Codex] 头像预热失败', e);
    });
    if (!this._enterSeq.stillValid(token)) return;
    if (SceneManager.current?.name !== 'codex') return;
    this._buildShell();
    this._buildPetList({ animate: false });
    // 后台预热第一只已拥有宠的详情壳/秀场，减轻「点第一个就卡」
    const firstOwned = PlayerData.ownedPets[0];
    if (firstOwned) {
      void ensureAssets(petDetailPreloadImages(firstOwned)).catch(() => {});
    }
  }

  onExit(): void {
    this._enterSeq.cancel();
    if (this._parkForDetail) {
      this._parkForDetail = false;
      this._parked = true;
      this._parkFingerprint = this._listFingerprint();
      this._parkContentY = this._content && !this._content.destroyed
        ? this._content.y
        : this._listTop;
      this._scroll.detach();
      this._closeRewardPanel();
      return;
    }
    this._disposeTree();
  }

  /** SceneManager：切到非图鉴/详情时丢掉暂存树 */
  discardParked(): void {
    if (!this._parked && !this._parkForDetail) return;
    this._parkForDetail = false;
    this._parked = false;
    this._disposeTree();
  }

  private _disposeTree(): void {
    this._scroll.detach();
    this._scrollCfg = null;
    this._content = null;
    this._listMask = null;
    this._rewardOverlay = null;
    this._parkFingerprint = '';
    this.container.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });
  }

  private _resumeFromPark(): void {
    this._parked = false;
    this.container.interactiveChildren = true;
    this.container.eventMode = 'passive';
    const fingerprint = this._listFingerprint();
    if (fingerprint === this._parkFingerprint
      && this._content
      && !this._content.destroyed
      && this.container.children.length > 0) {
      // 养成未变：只挂回滚动，保留滚动位置
      if (this._scrollCfg) {
        this._scroll.attach(this._scrollCfg);
        this._content.y = this._parkContentY;
      }
      return;
    }
    // 升级/升星/碎片有变：重建一趟（仍跳过 hydrate 二次重建）
    const savedY = this._parkContentY;
    this._rebuild();
    if (this._content && !this._content.destroyed && this._scrollCfg) {
      const min = this._scrollCfg.scrollMin;
      const max = this._scrollCfg.listTop;
      this._content.y = Math.max(min, Math.min(max, savedY));
    }
  }

  /** 拥有/等级/星/碎片/货币/筛选 — 任一变都要刷新列表或顶栏 */
  private _listFingerprint(): string {
    const pets = PlayerData.ownedPets
      .map((id) => `${id}:${PlayerData.petLevel(id)}:${PlayerData.petStar(id)}:${PlayerData.petShards(id)}`)
      .join(',');
    return `${this._filter}|${PlayerData.coins}|${PlayerData.lingyu}|${pets}`;
  }

  private _rebuild(): void {
    this._buildShell();
    this._buildPetList({ animate: false });
  }

  private _buildShell(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._scroll.detach();
    this._listMask = null;
    this._content = null;
    this._rewardOverlay = null;
    this.container.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });

    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.codex, w, h));

    // 祥云从屏顶 y=0 满铺向上区域（对齐原型顶栏云雾，勿从 safeTop 起留缝）
    const canopyTex = codexTex(UI_CODEX_IMAGES.headerCanopy);
    const canopyTop = 0;
    const canopyH = canopyTex
      ? Math.max(240, Math.min(320, w * (canopyTex.height / canopyTex.width) * 1.05))
      : 260;
    if (canopyTex) {
      const canopy = new PIXI.Sprite(canopyTex);
      canopy.width = w + 40;
      canopy.height = canopyH;
      canopy.position.set(-20, canopyTop);
      this.container.addChild(canopy);
    }

    // 顶栏同一水平中线：返回 → 灵宠标题贴图 → 币/灵玉（避抖音胶囊）
    const headerY = Game.safeHeaderCenterY;
    const back = makeBackButton({
      onTap: () => SceneManager.switchTo('title', PlayerData.titleEnter()),
    });
    back.position.set(64, headerY);
    this.container.addChild(back);

    const titleX = 64 + 48;
    const titleTex = codexTex(UI_CODEX_IMAGES.titleLingchong);
    let titleRight = titleX + 96;
    if (titleTex) {
      const title = new PIXI.Sprite(titleTex);
      title.anchor.set(0, 0.5);
      const titleH = 48;
      title.height = titleH;
      title.width = titleTex.width * (titleH / titleTex.height);
      title.position.set(titleX, headerY);
      this.container.addChild(title);
      titleRight = titleX + title.width + 14;
    } else {
      const title = makeText('灵宠', {
        size: 48,
        fill: 0x2b2118,
        bold: true,
        anchor: [0, 0.5],
        role: 'title',
      });
      title.position.set(titleX, headerY);
      this.container.addChild(title);
      titleRight = titleX + title.width + 14;
    }

    this._buildResourcePills(titleRight, headerY);

    const ringSize = Math.round(126 * (w / 750));
    const ringCenterY = Math.max(headerY + 88, canopyH * 0.56);
    this._buildRewardRing(w / 2, ringCenterY, ringSize);

    // 轨放在圆环下沿之外，略下移避免贴环
    const tabY = ringCenterY + ringSize * 0.52 + 28;
    this._buildFilterTabs(w, tabY);

    this._listTop = tabY + 48;
  }

  /** 灵宠币、灵玉横排；IconLabel 原点即视觉中线，与标题同 Y */
  private _buildResourcePills(x: number, centerY: number): void {
    const gap = 16;
    const iconSize = 34;
    const coin = makeIconLabel({
      iconPath: UI_IMAGES.iconCoin, iconSize,
      text: `${PlayerData.coins}`,
      size: FONT_SIZE.sm, fill: 0x2b2118, bold: true, gap: 6,
    });
    const lingyu = makeIconLabel({
      iconPath: UI_IMAGES.iconLingyu, iconSize,
      text: `${PlayerData.lingyu}`,
      size: FONT_SIZE.sm, fill: 0x2b2118, bold: true, gap: 6,
    });
    const holder = new PIXI.Container();
    coin.position.set(0, 0);
    lingyu.position.set(coin.width + gap, 0);
    holder.addChild(coin, lingyu);
    const maxRight = Game.contentRightX(8);
    const rowW = coin.width + gap + lingyu.width;
    let left = x;
    if (left + rowW > maxRight) left = Math.max(8, maxRight - rowW);
    holder.position.set(left, centerY);
    this.container.addChild(holder);
  }

  /** 圆环贴图 + 居中进度文案；待领时显示「领」贴图钮 */
  private _buildRewardRing(cx: number, cy: number, ringSize: number): void {
    const progress = PlayerData.codexMilestoneProgress;
    const owned = PlayerData.ownedPets.length;
    const total = PETS.length;
    const pending = progress.pendingLingyu > 0;

    const ringTex = codexTex(UI_CODEX_IMAGES.rewardRing);
    const ringRoot = new PIXI.Container();
    ringRoot.position.set(cx, cy);
    this.container.addChild(ringRoot);

    if (ringTex) {
      const ring = new PIXI.Sprite(ringTex);
      ring.anchor.set(0.5);
      ring.width = ringSize;
      ring.height = ringSize * (ringTex.height / ringTex.width);
      ringRoot.addChild(ring);
    }

    const count = makeText(`${owned}/${total}`, {
      size: 24, fill: COLORS.textMain, bold: true, anchor: 0.5,
      role: 'title',
      strokeColor: 0xfff8ec,
      strokeWidth: 3,
    });
    count.position.set(0, -8);
    ringRoot.addChild(count);

    const label = makeText('奖励', {
      size: 18, fill: COLORS.accentDeep, bold: true, anchor: 0.5,
    });
    label.position.set(0, 18);
    ringRoot.addChild(label);

    ringRoot.eventMode = 'static';
    ringRoot.cursor = 'pointer';
    ringRoot.hitArea = new PIXI.Circle(0, 0, ringSize * 0.55);
    pressFeedback(ringRoot);
    bindPointerTap(ringRoot, () => this._openRewardPanel());

    if (pending) {
      const claimTex = codexTex(UI_CODEX_IMAGES.claimBtn);
      const claim = new PIXI.Container();
      if (claimTex) {
        const spr = new PIXI.Sprite(claimTex);
        spr.anchor.set(0.5);
        spr.width = 44;
        spr.height = 44;
        claim.addChild(spr);
      } else {
        const fallback = makeText('领', {
          size: 18, fill: COLORS.textMain, bold: true, anchor: 0.5,
        });
        claim.addChild(fallback);
      }
      claim.position.set(ringSize * 0.42, -ringSize * 0.38);
      claim.eventMode = 'static';
      claim.cursor = 'pointer';
      claim.hitArea = new PIXI.Circle(0, 0, 28);
      pressFeedback(claim);
      bindPointerTap(claim, () => this._claimRewards());
      ringRoot.addChild(claim);
    }
  }

  /**
   * 连排底板 + 选中段贴图：左对齐；宽度略收、高度略增
   */
  private _buildFilterTabs(w: number, y: number): void {
    const S = designScale(w);
    const railW = Math.min(340, w - 80);
    const railH = 42;
    const railX = 12 * S; // 与三列卡左边距对齐
    const rail = new PIXI.Container();
    rail.position.set(railX, y - railH / 2);

    const railTex = codexTex(UI_CODEX_IMAGES.filterRail);
    if (railTex) {
      const spr = new PIXI.Sprite(railTex);
      spr.width = railW;
      spr.height = railH;
      rail.addChild(spr);
    } else {
      rail.addChild(makePanel({
        width: railW, height: railH, radius: railH / 2, centered: false,
        bg: 0xeef4f0, border: 0xc4b49a, borderWidth: 2,
      }));
    }

    const segW = railW / FILTER_TABS.length;
    const selTex = codexTex(UI_CODEX_IMAGES.filterSelected);
    const selPadX = 6;
    const selPadY = 4;
    const selW = segW - selPadX * 2;
    const selH = railH - selPadY * 2;

    FILTER_TABS.forEach((tab, i) => {
      const selected = tab.id === this._filter;
      const cx = segW * i + segW / 2;

      if (selected) {
        if (selTex) {
          const sel = new PIXI.Sprite(selTex);
          sel.width = selW;
          sel.height = selH;
          sel.position.set(segW * i + selPadX, selPadY);
          rail.addChild(sel);
        } else {
          const g = new PIXI.Graphics();
          g.beginFill(0x2a9b8f, 1);
          g.drawRoundedRect(segW * i + selPadX, selPadY, selW, selH, selH / 2);
          g.endFill();
          rail.addChild(g);
        }
      }

      const label = makeText(tab.label, {
        size: FONT_SIZE.sm,
        fill: selected ? 0xffffff : 0x2b2118,
        bold: true,
        anchor: 0.5,
      });
      label.position.set(cx, railH / 2);
      rail.addChild(label);

      const hit = new PIXI.Container();
      hit.hitArea = new PIXI.Rectangle(segW * i, 0, segW, railH);
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      bindPointerTap(hit, () => {
        if (this._filter === tab.id) return;
        this._filter = tab.id;
        this._rebuild();
      });
      rail.addChild(hit);
    });

    this.container.addChild(rail);
  }

  private _buildPetList(opts?: { animate?: boolean }): void {
    const animate = opts?.animate !== false;
    this._scroll.detach();
    if (this._listMask && !this._listMask.destroyed) this._listMask.destroy();
    this._listMask = null;
    if (this._content && !this._content.destroyed) this._content.destroy({ children: true });
    this._content = null;

    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const startY = this._listTop;
    const { S, cols, cardGap, cardW, cardH, marginX } = petPoolGrid(w);

    const stateOf = (p: PetDef): CodexState =>
      PlayerData.isOwned(p.id) ? 'owned' : 'locked';

    let pool = [...PETS];
    if (this._filter === 'owned') pool = pool.filter((p) => stateOf(p) === 'owned');
    else if (this._filter === 'locked') pool = pool.filter((p) => stateOf(p) === 'locked');
    else {
      pool = [
        ...PETS.filter((p) => stateOf(p) === 'owned'),
        ...PETS.filter((p) => stateOf(p) === 'locked'),
      ];
    }

    const content = new PIXI.Container();
    content.position.set(0, startY);
    this._content = content;
    this.container.addChild(content);

    const recruitId = PlayerData.nextRecruit();
    const recruitCost = PlayerData.nextRecruitPrice();
    const items: PIXI.Container[] = [];
    let maxBottom = 0;

    pool.forEach((pet, i) => {
      const state = stateOf(pet);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = marginX + col * (cardW + cardGap);
      const y = cardGap + row * (cardH + cardGap);
      maxBottom = Math.max(maxBottom, y + cardH);

      const item = new PIXI.Container();
      item.position.set(x, y);
      const cardBgTex = TextureCache.get(petCardPortraitImage(pet.rarity));
      if (state === 'owned') {
        buildOwnedCodexCard(item, pet, cardW, cardH, S, cardBgTex);
      } else {
        buildLockedCodexCard(
          item, pet, cardW, cardH, S, cardBgTex,
          pet.id === recruitId
            ? { price: recruitCost, affordable: PlayerData.coins >= recruitCost }
            : undefined,
        );
      }

      item.eventMode = 'static';
      item.interactiveChildren = false;
      item.cursor = 'pointer';
      item.hitArea = new PIXI.Rectangle(0, 0, cardW, cardH);
      bindPointerTap(item, () => this._onPetTap(pet, state), {
        blockTap: () => this._scroll.moved,
      });
      content.addChild(item);
      items.push(item);
    });

    if (pool.length === 0) {
      const empty = makeText('暂无灵宠', {
        size: FONT_SIZE.sm, fill: COLORS.textSub, bold: true, anchor: 0.5,
      });
      empty.position.set(w / 2, 80);
      content.addChild(empty);
      maxBottom = 120;
    }

    if (animate) {
      staggerIn(items, { stepDelay: 0.022, offsetY: 14, duration: 0.28 });
    }

    const viewportH = h - startY - 16;
    const contentH = maxBottom + cardGap;
    const scrollMin = Math.min(startY, startY - Math.max(0, contentH - viewportH));

    if (contentH > viewportH) {
      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      mask.drawRect(0, startY, w, viewportH);
      mask.endFill();
      this.container.addChild(mask);
      this._listMask = mask;
      content.mask = mask;
      const cfg: ScrollListConfig = {
        content: () => this._content,
        viewportTop: startY,
        viewportH,
        scrollMin,
        listTop: startY,
        moveThreshold: 2,
      };
      this._scrollCfg = cfg;
      this._scroll.attach(cfg);
    } else {
      this._scrollCfg = null;
    }
  }

  private _claimRewards(): void {
    const granted = PlayerData.claimCodexMilestones();
    if (granted <= 0) {
      Platform.showToast('暂无可领奖励');
      this._openRewardPanel();
      return;
    }
    SfxManager.playRewardGet();
    Platform.showToast(`收集奖励 · 灵玉 +${granted}`, 'success');
    this._rebuild();
  }

  /** 收集奖励详情弹层（贴图底板） */
  private _openRewardPanel(): void {
    if (this._rewardOverlay && !this._rewardOverlay.destroyed) {
      this._rewardOverlay.destroy({ children: true });
      this._rewardOverlay = null;
    }
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const overlay = new PIXI.Container();
    overlay.eventMode = 'static';
    overlay.hitArea = new PIXI.Rectangle(0, 0, w, h);
    this._rewardOverlay = overlay;

    const dimHit = new PIXI.Container();
    dimHit.hitArea = new PIXI.Rectangle(0, 0, w, h);
    dimHit.eventMode = 'static';
    const dim = new PIXI.Graphics();
    dim.beginFill(0x000000, 0.55);
    dim.drawRect(0, 0, w, h);
    dim.endFill();
    dimHit.addChild(dim);
    bindPointerTap(dimHit, () => this._closeRewardPanel());
    overlay.addChild(dimHit);

    const panelW = Math.min(560, w * 0.86);
    const panelH = Math.min(780, h * 0.72);
    const panelX = (w - panelW) / 2;
    const panelY = (h - panelH) / 2;
    const panelHost = new PIXI.Container();
    panelHost.position.set(panelX, panelY);
    panelHost.eventMode = 'static';
    panelHost.hitArea = new PIXI.Rectangle(0, 0, panelW, panelH);
    bindPointerTap(panelHost, () => { /* 吞点击，避免点面板关闭 */ });
    overlay.addChild(panelHost);

    const panelTex = codexTex(UI_CODEX_IMAGES.rewardPanel);
    if (panelTex) {
      const panel = new PIXI.Sprite(panelTex);
      panel.width = panelW;
      panel.height = panelH;
      panelHost.addChild(panel);
    } else {
      panelHost.addChild(makePanel({
        width: panelW, height: panelH, radius: 22, centered: false,
        bg: COLORS.panelBg, border: COLORS.panelBorder,
      }));
    }

    const title = makeText('收集奖励', {
      size: FONT_SIZE.lg, fill: COLORS.textMain, bold: true, anchor: 0.5,
      role: 'title',
    });
    title.position.set(panelW / 2, 48);
    panelHost.addChild(title);

    const every = ECONOMY.milestone.codexEvery;
    const owned = PlayerData.ownedPets.length;
    const prog = PlayerData.codexMilestoneProgress;
    const nowFloor = Math.floor(owned / every);
    const pendingTiers = prog.lingyu > 0 ? Math.round(prog.pendingLingyu / prog.lingyu) : 0;
    const claimedFloor = Math.max(0, nowFloor - pendingTiers);
    // 初始 5 只不计档：列表从 10 只起（跳过第 1 档）
    const firstTier = 2;
    const lastTier = Math.min(Math.max(firstTier + 5, Math.ceil(PETS.length / every)), firstTier + 7);
    // 三列同一行中线：条件 | 奖励 | 状态钮（Button 以中心定位，须预留描边内边距）
    const padX = 56; // 贴图金框内侧留白，左右对称
    const btnW = 120;
    const colNeedX = padX;
    const colRewardX = Math.round(panelW * 0.38);
    const colBtnX = panelW - padX - btnW / 2;
    const rowH = 64;
    let rowCenterY = 108;
    for (let i = firstTier; i <= lastTier; i++) {
      const need = i * every;
      const reached = owned >= need;
      const claimed = i <= claimedFloor;
      const claimable = reached && !claimed;

      const row = new PIXI.Container();
      row.position.set(0, rowCenterY);

      const state: 'claimed' | 'claimable' | 'locked' = claimed
        ? 'claimed'
        : (claimable ? 'claimable' : 'locked');
      const needLabel = makeText(`集齐 ${need} 只`, {
        size: FONT_SIZE.sm,
        fill: state === 'claimable' ? COLORS.textMain : COLORS.textDisabled,
        bold: true, anchor: [0, 0.5],
      });
      needLabel.position.set(colNeedX, 0);
      row.addChild(needLabel);

      const reward = makeIconLabel({
        iconPath: UI_IMAGES.iconLingyu, iconSize: 28,
        text: `×${prog.lingyu}`,
        size: FONT_SIZE.sm,
        fill: state === 'claimable' ? COLORS.accentDeep : COLORS.textDisabled,
        bold: true, gap: 4,
      });
      // IconLabel 子节点锚在 y=0 中线，勿再减 height/2
      reward.alpha = state === 'claimable' ? 1 : 0.5;
      reward.position.set(colRewardX, 0);
      row.addChild(reward);

      const status = this._makeRewardStatusChip(state, btnW, () => {
        this._closeRewardPanel();
        this._claimRewards();
      });
      status.position.set(colBtnX, 0);
      row.addChild(status);

      panelHost.addChild(row);
      rowCenterY += rowH;
    }

    const tip = makeText('初始阵容不计 · 每再集齐 5 只可领 · 点条目领取', {
      size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: 0.5,
    });
    tip.position.set(panelW / 2, panelH - 56);
    panelHost.addChild(tip);

    const close = makeCloseButton({
      onTap: () => this._closeRewardPanel(),
      size: 48,
    });
    close.position.set(w / 2, panelY + panelH + 36);
    overlay.addChild(close);

    this.container.addChild(overlay);
  }

  /**
   * 收集奖励三态（对齐签到/日常/爬塔业界口径）：
   * 可领=亮色 CTA；已领=绿勾印章（非按钮）；未达=灰锁胶囊。
   */
  private _makeRewardStatusChip(
    state: 'claimed' | 'claimable' | 'locked',
    width: number,
    onClaim: () => void,
  ): PIXI.Container {
    const height = 44;
    if (state === 'claimable') {
      return makeButton({
        label: '领取',
        width,
        height,
        variant: 'success',
        onTap: onClaim,
      });
    }

    const chip = new PIXI.Container();
    const g = new PIXI.Graphics();
    const radius = Math.min(RADIUS.button, height / 2);
    if (state === 'claimed') {
      g.beginFill(COLORS.trackFillFull, 0.18);
      g.lineStyle(2, COLORS.btnSuccessBorder, 0.85);
      g.drawRoundedRect(-width / 2, -height / 2, width, height, radius);
      g.endFill();
      chip.addChild(g);
      this._drawCodexCheck(chip, -width / 2 + 18, 0, 10);
      const claimedLabel = makeText('已领取', {
        size: FONT_SIZE.xs, fill: COLORS.textPositive, bold: true, anchor: 0.5,
      });
      claimedLabel.position.set(10, 0);
      chip.addChild(claimedLabel);
    } else {
      g.beginFill(COLORS.btnDisabledBg, 0.72);
      g.lineStyle(2, COLORS.btnDisabledBorder, 0.8);
      g.drawRoundedRect(-width / 2, -height / 2, width, height, radius);
      g.endFill();
      chip.addChild(g);
      this._drawCodexLock(chip, -width / 2 + 18, 0);
      const lockedLabel = makeText('未达成', {
        size: FONT_SIZE.xs, fill: COLORS.textDisabled, bold: true, anchor: 0.5,
      });
      lockedLabel.position.set(10, 0);
      chip.addChild(lockedLabel);
    }
    chip.eventMode = 'none';
    return chip;
  }

  private _drawCodexCheck(parent: PIXI.Container, x: number, y: number, size: number): void {
    const g = new PIXI.Graphics();
    g.lineStyle(3.2, COLORS.textPositive, 1);
    g.moveTo(x - size * 0.45, y);
    g.lineTo(x - size * 0.08, y + size * 0.38);
    g.lineTo(x + size * 0.5, y - size * 0.36);
    parent.addChild(g);
  }

  private _drawCodexLock(parent: PIXI.Container, x: number, y: number): void {
    const g = new PIXI.Graphics();
    g.lineStyle(2, COLORS.textDisabled, 1);
    g.arc(x, y - 3.2, 3.4, Math.PI * 1.05, -0.05);
    g.beginFill(COLORS.textDisabled, 0.95);
    g.drawRoundedRect(x - 4.4, y - 1.4, 8.8, 6.8, 1.6);
    g.endFill();
    parent.addChild(g);
  }

  private _closeRewardPanel(): void {
    if (this._rewardOverlay && !this._rewardOverlay.destroyed) {
      this._rewardOverlay.destroy({ children: true });
    }
    this._rewardOverlay = null;
  }

  private _onPetTap(pet: PetDef, state: CodexState): void {
    if (state === 'owned') {
      // 暂存图鉴树，避免真机同帧拆 100 卡；并抢先拉详情立绘
      this._parkForDetail = true;
      void ensureAssets(petDetailPreloadImages(pet.id)).catch(() => {});
      SceneManager.switchTo('petDetail', { petId: pet.id } satisfies PetDetailEnterData);
      // switchTo 失败时勿留下 park 标记，否则下次底栏切走会误暂存
      if (SceneManager.current?.name === 'codex') this._parkForDetail = false;
      return;
    }
    if (pet.id === PlayerData.nextRecruit()) {
      this._showRecruitConfirm(pet);
      return;
    }
    const drop = BOSS_DROP_STAGE.get(pet.id);
    const where = drop
      ? `${CHAPTER_NAME[drop.chapter] ?? `第${drop.chapter}章`} · ${drop.name}`
      : null;
    if (where) {
      Platform.showToast(`未获得 · 通关「${where}」Boss 直得`);
      return;
    }
    Platform.showToast('未获得 · 可通过召唤获取（UR 仅召唤）');
  }

  private _showRecruitConfirm(pet: PetDef): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const price = PlayerData.nextRecruitPrice();
    const affordable = PlayerData.coins >= price;

    const overlay = new PIXI.Container();
    overlay.eventMode = 'static';
    overlay.hitArea = new PIXI.Rectangle(0, 0, w, h);
    const dim = new PIXI.Graphics();
    dim.beginFill(0x000000, 0.6);
    dim.drawRect(0, 0, w, h);
    dim.endFill();
    overlay.addChild(dim);
    this.container.addChild(overlay);

    const close = (): void => {
      if (!overlay.destroyed) overlay.destroy({ children: true });
    };

    const panelW = Math.min(560, w * 0.82);
    const panelH = 340;
    const panel = makePanel({
      width: panelW, height: panelH, radius: 18, centered: false,
      bg: COLORS.panelBg, border: COLORS.panelBorderSoft,
    });
    panel.position.set((w - panelW) / 2, (h - panelH) / 2);
    overlay.addChild(panel);

    const cx = w / 2;
    const top = (h - panelH) / 2;

    const title = makeText('招募灵宠', {
      size: FONT_SIZE.md, fill: COLORS.textMain, bold: true, anchor: 0.5,
    });
    title.position.set(cx, top + 40);
    overlay.addChild(title);

    const petLine = makeText(`${pet.name} · ${PET_ROLE_NAME[pet.role]}`, {
      size: FONT_SIZE.sm, fill: COLORS.accent, bold: true, anchor: 0.5,
    });
    petLine.position.set(cx, top + 100);
    overlay.addChild(petLine);

    const costRow = makeIconLabel({
      iconPath: UI_IMAGES.iconCoin, iconSize: 34,
      text: `${price}   （持有 ${PlayerData.coins}）`,
      size: FONT_SIZE.sm, fill: affordable ? COLORS.textMain : COLORS.textDisabled,
    });
    costRow.position.set(cx - costRow.width / 2, top + 150);
    overlay.addChild(costRow);

    const tip = makeText(
      affordable ? '招募按稀有度顺序解锁下一只' : '灵宠币不足 · 通关主线与日常可获得',
      { size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: 0.5 },
    );
    tip.position.set(cx, top + 210);
    overlay.addChild(tip);

    const btnW = panelW * 0.4;
    const btnY = top + panelH - 70;

    const cancel = makeButton({
      label: '取消', width: btnW, height: 64, variant: 'ghost',
      onTap: close,
    });
    cancel.position.set(cx - btnW / 2 - 12, btnY);
    overlay.addChild(cancel);

    const ok = makeButton({
      label: '招募', width: btnW, height: 64, variant: 'recruit', enabled: affordable,
      onTap: () => {
        close();
        this._doRecruit();
      },
    });
    ok.position.set(cx + btnW / 2 + 12, btnY);
    overlay.addChild(ok);
  }

  private _doRecruit(): void {
    const result = PlayerData.recruit();
    if (!result) {
      Platform.showToast('灵宠币不足');
      return;
    }
    const name = PET_MAP.get(result.petId)?.name ?? '灵宠';
    Platform.showToast(
      result.duplicate
        ? `重复招募 · ${name}碎片 +${result.shards ?? 0}`
        : `招募成功 · ${name} 已加入`,
    );
    this._rebuild();
  }
}
