/**
 * 灵宠详情场景：对齐 pet_detail_ui_prototype_v3_swipe
 * 顶栏名匾 → 左立绘 + 右说明白底 → 左右滑切宠 → 中部可滚属性/技能 → 底栏「升星 | 升级」
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { TweenManager, Ease } from '@/core/TweenManager';
import { TextureCache } from '@/core/TextureCache';
import { getPetAvatarTexture } from '@/config/petAvatarTexture';
import { ensurePetAvatars, petDetailPreloadImages, petDetailAvatarEntry } from '@/config/assetPreload';
import { ensureAssets } from '@/config/Subpackages';
import { Platform } from '@/core/PlatformService';
import { UI, ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import { PET_MAP, type PetDef, INITIAL_PET_LEVEL, INITIAL_PET_STAR } from '@/balance/pets';
import { getStarProfile, MAX_PET_STAR } from '@/balance/growth';
import { getPetRole, getStatUi, type StatKey } from '@/balance/petRoles';
import { getRarity } from '@/balance/rarity';
import { petAtk, petHp, petRcv } from '@/formulas/growth';
import { resolvePetAbilities, diffAbilityUnlocks, type PetProgress } from '@/game/petAbilities';
import { EventBus } from '@/core/EventBus';
import {
  petFrameImage, BACKGROUND_IMAGES, UI_FX_IMAGES,
} from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import {
  COLORS, FONT_SIZE, RADIUS,
  makeButton, makeCoverBackground, makePanel, makeText, makeProgressBar, makeTopBar,
  makeStarRow, SceneFx, fadeIn, countUp, pulse, makeSkillIcon, makeStatIcon,
  makeActionButton, attachPetFrameOrb,
  type ProgressBarHandle,
} from '@/ui';
import { ScrollListController } from '@/ui/ScrollList';
import { SceneEnterSeq, deferSceneBuild } from '@/utils/sceneEnterSeq';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { clientEventToDesign } from '@/utils/clientEventToDesign';
import { getTouchCanvas } from '@/utils/touchCanvas';

export interface PetDetailEnterData {
  petId: string;
  /** 返回目标场景，默认 codex */
  backScene?: string;
  /** 返回时传给 backScene 的 onEnter 数据 */
  backData?: unknown;
  /** 仅查看属性（隐藏升级/上阵），章节目标卡等入口使用 */
  preview?: boolean;
}

interface StatRow {
  bar: ProgressBarHandle;
  value: PIXI.Text;
}

export class PetDetailScene implements Scene {
  readonly name = 'petDetail';
  readonly container = new PIXI.Container();

  /** 页面内容层（操作后只重建这层，特效层常驻） */
  private _content = new PIXI.Container();
  /** 横滑轨道：当前页 + 邻宠页并排，跟手平移做到无缝切换 */
  private _track: PIXI.Container | null = null;
  /** 当前页：顶栏+英雄区+属性技能+底栏（背景固定在 _content） */
  private _slideLayer: PIXI.Container | null = null;
  /** 邻宠预构建页（拖动/切页时出现在左右） */
  private _incomingLayer: PIXI.Container | null = null;
  private _incomingPetId = '';
  private _incomingDelta = 0;
  private _incomingGen = 0;
  private _fx: SceneFx | null = null;
  private readonly _scroll = new ScrollListController();
  private _sheetMask: PIXI.Graphics | null = null;
  private _sheet: PIXI.Container | null = null;

  private _petId = '';
  private _backScene = 'codex';
  private _backData: unknown;
  private _preview = false;

  private _avatar: PIXI.Container | null = null;
  private _starRow: PIXI.Container | null = null;
  private _statRows: Partial<Record<StatKey, StatRow>> = {};
  private _avatarCenter = new PIXI.Point();
  private _statPotential: Record<StatKey, number> = { atk: 1, hp: 1, rcv: 1 };
  private readonly _enterSeq = new SceneEnterSeq();

  /** 英雄区容器（立绘+说明） */
  private _heroBand: PIXI.Container | null = null;
  /** 切宠进行中，防连滑 */
  private _switching = false;
  /** 构建页时的临时根节点 / 是否写入交互引用 */
  private _pageRoot: PIXI.Container | null = null;
  private _buildLive = true;
  /** 切宠落位重建时跳过立绘淡入，避免无缝滑入后再闪一下 */
  private _skipAvatarFade = false;
  private _swipeDragging = false;
  private _swipeMoved = false;
  private _swipeAxis: 'none' | 'h' | 'v' = 'none';
  private _swipeDelta = 0;
  private _swipeStartX = 0;
  private _swipeStartY = 0;
  private _swipeLastX = 0;
  private _rawSwipeDown: ((e: unknown) => void) | null = null;
  private _rawSwipeMove: ((e: unknown) => void) | null = null;
  private _rawSwipeUp: ((e: unknown) => void) | null = null;

  onEnter(data?: unknown): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    const enter = data as PetDetailEnterData | undefined;
    this._petId = enter?.petId ?? PlayerData.ownedPets[0] ?? '';
    this._backScene = enter?.backScene ?? 'codex';
    this._backData = enter?.backData;
    this._preview = enter?.preview ?? false;
    this._fx?.destroy();
    this._fx = null;
    this._mountEnterShell();
    const token = this._enterSeq.next();
    deferSceneBuild(token, this._enterSeq, 'petDetail', () => this._buildSafe());
    void this._enter(token);
  }

  private _mountEnterShell(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    const base = new PIXI.Graphics();
    base.beginFill(0x1a1126);
    base.drawRect(0, 0, w, h);
    base.endFill();
    this.container.addChild(base);
    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.home, w, h));
    if (this._content.destroyed) this._content = new PIXI.Container();
    this.container.addChild(this._content);
    const hint = makeText('加载中…', {
      size: FONT_SIZE.sm, fill: COLORS.textInverse, anchor: 0.5,
    });
    hint.name = 'petDetailLoading';
    hint.position.set(w / 2, h / 2);
    this.container.addChild(hint);
  }

  private _prepareContentLayer(): void {
    if (this._content.destroyed) this._content = new PIXI.Container();
    if (this._content.parent !== this.container) {
      this.container.addChild(this._content);
    }
    this.container.getChildByName('petDetailLoading')?.destroy();
  }

  private _buildSafe(): void {
    try {
      this._prepareContentLayer();
      this._build();
      this._ensureSceneFx();
    } catch (e) {
      console.error('[PetDetailScene] _build 失败:', e);
      this._buildErrorFallback();
    }
  }

  private _buildErrorFallback(): void {
    this._prepareContentLayer();
    this._scroll.detach();
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._content.removeChildren().forEach((c) => c.destroy({ children: true }));
    const msg = makeText('页面加载异常', {
      size: FONT_SIZE.md, fill: COLORS.textMain, anchor: 0.5,
    });
    msg.position.set(w / 2, h / 2 - 40);
    this._content.addChild(msg);
    const back = makeButton({
      label: '返回', width: 220, height: 60, variant: 'primary',
      onTap: () => SceneManager.switchTo(this._backScene, this._backData),
    });
    back.position.set(w / 2, h / 2 + 40);
    this._content.addChild(back);
  }

  private _ensureSceneFx(): void {
    // 切宠重建时不销毁重挂特效层，避免整屏闪一下
    if (this._fx) return;
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._fx = new SceneFx();
    this._fx.build(this.container, w, h);
  }

  private async _enter(token: number): Promise<void> {
    try {
      await ensureAssets(petDetailPreloadImages(this._petId));
    } catch (e) {
      console.warn('[PetDetailScene] 资源预加载部分失败:', e);
    }
    const avatarEntry = this._preview
      ? { petId: this._petId, star: 1 as const }
      : petDetailAvatarEntry(this._petId);
    if (avatarEntry) {
      try {
        await ensurePetAvatars([avatarEntry]);
      } catch (e) {
        console.warn('[PetDetailScene] 头像加载失败:', e);
      }
    }
    if (!this._enterSeq.stillValid(token)) return;
    deferSceneBuild(token, this._enterSeq, 'petDetail', () => this._buildSafe());
  }

  onExit(): void {
    this._enterSeq.cancel();
    this._incomingGen++;
    this._detachPageSwipe();
    this._scroll.detach();
    this._sheetMask = null;
    this._sheet = null;
    this._heroBand = null;
    this._slideLayer = null;
    this._incomingLayer = null;
    this._track = null;
    this._switching = false;
    this._fx?.destroy();
    this._fx = null;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._content = new PIXI.Container();
  }

  update(dt: number): void {
    this._fx?.update(dt);
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._incomingGen++;
    this._detachPageSwipe();
    this._scroll.detach();
    this._sheetMask = null;
    this._sheet = null;
    this._heroBand = null;
    this._slideLayer = null;
    this._incomingLayer = null;
    this._incomingPetId = '';
    this._incomingDelta = 0;
    this._track = null;
    this._content.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._statRows = {};
    this._avatar = null;
    this._starRow = null;

    // 背景固定；可滑内容放进轨道上的页面
    this._content.addChild(makeCoverBackground(BACKGROUND_IMAGES.petPool, w, h));
    const track = new PIXI.Container();
    this._track = track;
    this._content.addChild(track);

    const slide = new PIXI.Container();
    this._slideLayer = slide;
    track.addChild(slide);

    this._populatePage(this._petId, slide, true);
    this._preloadNeighbors();
    this._switching = false;
  }

  /** 把一只宠的详情填进页面容器；live=false 时仅作邻页预览，不挂滚动/滑动/交互引用 */
  private _populatePage(petId: string, slide: PIXI.Container, live: boolean): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._pageRoot = slide;
    this._buildLive = live;

    const pet = PET_MAP.get(petId);
    if (!pet) {
      if (live) this._switching = false;
      const back = makeButton({
        label: '返回灵宠', width: 220, height: 60, variant: 'primary',
        onTap: () => SceneManager.switchTo('codex'),
      });
      back.position.set(w / 2, h / 2);
      if (!live) back.eventMode = 'none';
      slide.addChild(back);
      this._pageRoot = null;
      this._buildLive = true;
      return;
    }

    const lv = this._preview ? INITIAL_PET_LEVEL : PlayerData.petLevel(petId);
    const star = this._preview ? INITIAL_PET_STAR : PlayerData.petStar(petId);

    slide.addChild(makeTopBar({
      title: pet.name, width: w, centerY: Game.safeTop + 36,
      onBack: () => SceneManager.switchTo(this._backScene, this._backData),
    }));
    if (!live) {
      // 邻页顶栏不可点，避免拖动中误触返回
      for (const child of slide.children) child.eventMode = 'none';
    }

    const marginX = 28;
    const heroTop = Game.safeTop + 88;
    const heroGap = 16;
    const halfAvail = Math.floor((w - marginX * 2 - heroGap) / 2);
    const portraitSize = Math.min(268, Math.floor(halfAvail * 0.78));
    const heroBottom = this._buildHeroRow(petId, pet, lv, star, marginX, heroTop, portraitSize, heroGap, w);

    const dockH = this._preview ? 0 : 168;
    const dockGap = 12;
    const sheetTop = heroBottom + 16;
    const sheetBottom = h - dockH - (this._preview ? 24 : dockGap);
    const sheetH = Math.max(120, sheetBottom - sheetTop);

    this._buildScrollSheet(pet, lv, star, marginX, sheetTop, sheetH, w);

    if (this._preview) {
      this._buildPreviewHint(w, sheetBottom + 8);
    } else {
      this._buildActionDock(petId, w, h, dockH);
    }

    if (!live) {
      slide.eventMode = 'none';
      slide.interactiveChildren = false;
    }

    this._pageRoot = null;
    this._buildLive = true;
  }

  /** 可左右切换的灵宠列表（预览仅当前一只） */
  private _browseIds(): string[] {
    if (this._preview) return this._petId ? [this._petId] : [];
    const owned = [...PlayerData.ownedPets];
    if (owned.length === 0 && this._petId) return [this._petId];
    return owned;
  }

  private _neighborId(delta: number): string | null {
    const ids = this._browseIds();
    if (ids.length <= 1) return null;
    let idx = ids.indexOf(this._petId);
    if (idx < 0) idx = 0;
    return ids[(idx + delta + ids.length) % ids.length];
  }

  /** UI 根：构建中的页 / 当前滑动页 */
  private _uiRoot(): PIXI.Container {
    return this._pageRoot ?? this._slideLayer ?? this._content;
  }

  private _preloadNeighbors(): void {
    for (const d of [-1, 1] as const) {
      const id = this._neighborId(d);
      if (!id) continue;
      const entry = petDetailAvatarEntry(id);
      if (entry) void ensurePetAvatars([entry]).catch(() => {});
      void ensureAssets(petDetailPreloadImages(id)).catch(() => {});
    }
  }

  private _clearIncoming(): void {
    this._incomingGen++;
    if (this._incomingLayer && !this._incomingLayer.destroyed) {
      this._incomingLayer.destroy({ children: true });
    }
    this._incomingLayer = null;
    this._incomingPetId = '';
    this._incomingDelta = 0;
  }

  private _trackX(x: number): void {
    if (this._track && !this._track.destroyed) this._track.x = x;
  }

  private _snapTrackHome(clearIncoming = true): void {
    const track = this._track;
    if (!track || track.destroyed) {
      if (clearIncoming) this._clearIncoming();
      return;
    }
    TweenManager.cancelTarget(track);
    TweenManager.to({
      target: track,
      props: { x: 0 },
      duration: 0.18,
      ease: Ease.easeOutCubic,
      onComplete: () => {
        if (clearIncoming) this._clearIncoming();
      },
    });
  }

  /** 预构建邻宠整页，放在轨道左右，跟手时从侧边滑入 */
  private async _ensureIncoming(delta: number): Promise<boolean> {
    const petId = this._neighborId(delta);
    const track = this._track;
    if (!petId || !track || track.destroyed) return false;
    if (
      this._incomingLayer && !this._incomingLayer.destroyed
      && this._incomingDelta === delta
      && this._incomingPetId === petId
    ) {
      return true;
    }

    // 换向时清掉旧邻页
    if (this._incomingLayer && this._incomingDelta !== delta) {
      this._incomingLayer.destroy({ children: true });
      this._incomingLayer = null;
    }

    const gen = ++this._incomingGen;
    this._incomingDelta = delta;
    this._incomingPetId = petId;

    const entry = petDetailAvatarEntry(petId);
    if (entry) {
      try { await ensurePetAvatars([entry]); } catch { /* */ }
    }
    try { await ensureAssets(petDetailPreloadImages(petId)); } catch { /* */ }
    if (gen !== this._incomingGen || !this._track || this._track.destroyed) return false;

    if (this._incomingLayer && !this._incomingLayer.destroyed) {
      this._incomingLayer.destroy({ children: true });
    }
    const slide = new PIXI.Container();
    // delta>0 下一只从右侧进入；delta<0 上一只从左侧进入
    slide.x = delta * Game.logicWidth;
    this._populatePage(petId, slide, false);
    this._track.addChild(slide);
    this._incomingLayer = slide;
    return true;
  }

  private _commitIncoming(delta: number): void {
    this._switching = true;
    const track = this._track;
    const w = Game.logicWidth;

    void (async () => {
      const ok = await this._ensureIncoming(delta);
      if (!ok || !track || track.destroyed) {
        this._snapTrackHome(true);
        this._switching = false;
        return;
      }
      const nextId = this._incomingPetId;
      TweenManager.cancelTarget(track);
      TweenManager.to({
        target: track,
        props: { x: -delta * w },
        duration: 0.24,
        ease: Ease.easeOutCubic,
        onComplete: () => {
          this._petId = nextId;
          this._incomingGen++;
          this._incomingLayer = null;
          this._skipAvatarFade = true;
          this._buildSafe();
        },
      });
    })();
  }

  private _switchPet(delta: number): void {
    const next = this._neighborId(delta);
    if (!next || this._switching) return;
    // 箭头切宠：同样走双页滑入，避免「假切」
    if (this._track && !this._track.destroyed) {
      this._trackX(0);
    }
    this._commitIncoming(delta);
  }

  /** 左立绘 + 右说明白底（等宽居中）；下阵贴说明区右下；支持左右滑切宠 */
  private _buildHeroRow(
    petId: string,
    pet: PetDef,
    lv: number,
    star: number,
    marginX: number,
    top: number,
    portraitSize: number,
    heroGap: number,
    w: number,
  ): number {
    // 左右等宽，整体居中
    const side = portraitSize;
    const bandW = side * 2 + heroGap;
    const left = Math.max(marginX, Math.floor((w - bandW) / 2));
    const rightX = left + side + heroGap;
    const rightW = side;
    const platePad = 12;
    const teamBtnH = this._preview ? 0 : 48;
    const teamBtnW = Math.min(120, Math.max(96, rightW - platePad * 2));

    // 说明区高度对齐立绘
    const plateH = side;
    const band = new PIXI.Container();
    if (this._buildLive) this._heroBand = band;
    this._uiRoot().addChild(band);

    // —— 左：立绘 ——
    const portraitCX = left + side / 2;
    const portraitCY = top + side / 2;
    this._buildAvatar(pet, star, portraitCX, portraitCY, side, band);

    // —— 右：说明白底 ——
    const plate = makePanel({
      width: rightW,
      height: plateH,
      radius: 20,
      centered: false,
      bg: 0xffffff,
      bgAlpha: 0.78,
      border: COLORS.panelBorderSoft,
      borderWidth: 2,
    });
    plate.position.set(rightX, top);
    band.addChild(plate);

    const contentX = rightX + platePad;
    const contentW = rightW - platePad * 2;
    let y = top + platePad + 6;

    const rarity = getRarity(pet.rarity);
    const role = getPetRole(pet.role);
    const meta = new PIXI.Container();
    const parts: { text: string; fill: number }[] = [
      { text: rarity.code, fill: rarity.color },
      { text: ' · ', fill: COLORS.textSub },
      { text: ELEMENT_NAME[pet.element], fill: ORB_COLOR[pet.element] },
      { text: ' · ', fill: COLORS.textSub },
      { text: role.name, fill: role.color },
    ];
    let mx = 0;
    for (const p of parts) {
      const t = makeText(p.text, { size: FONT_SIZE.sm, fill: p.fill, bold: true, anchor: [0, 0] });
      t.position.set(mx, 0);
      meta.addChild(t);
      mx += t.width;
    }
    meta.position.set(contentX, y);
    band.addChild(meta);
    y += meta.height + 14;

    const maxLv = getStarProfile(star).maxLevel;
    const lvText = makeText(`Lv.${lv} / ${maxLv}`, {
      size: FONT_SIZE.md, fill: COLORS.textMain, bold: true, anchor: [0, 0],
    });
    lvText.position.set(contentX, y);
    band.addChild(lvText);
    y += lvText.height + 10;

    const lvCost = this._preview ? null : PlayerData.levelUpCost(petId);
    const expRatio = lvCost && lvCost > 0
      ? Math.min(1, PlayerData.exp / lvCost)
      : (lv >= maxLv ? 1 : 0);
    const expBar = makeProgressBar({
      width: Math.max(90, contentW), height: 18, ratio: expRatio, fill: COLORS.btnSuccessBg,
    });
    expBar.position.set(contentX, y);
    band.addChild(expBar);
    y += 18 + 12;

    const starSize = Math.min(34, Math.max(28, Math.floor(contentW / 6.5)));
    const starRow = makeStarRow({
      star,
      style: 'sprite',
      starSize,
      gap: 5,
      anchor: 'left',
    });
    starRow.position.set(contentX, y + starSize / 2);
    band.addChild(starRow);
    if (this._buildLive) this._starRow = starRow;

    // 上阵 / 下阵：说明区右下角（绿描边空心，对齐原型）
    if (!this._preview) {
      const inTeam = PlayerData.isInTeam(petId);
      const teamBtn = this._makeOutlineTeamButton({
        label: inTeam ? '下阵' : '上阵',
        width: teamBtnW,
        height: teamBtnH,
        onTap: () => this._onToggleTeam(inTeam),
      });
      teamBtn.position.set(
        rightX + rightW - platePad - teamBtnW / 2,
        top + plateH - platePad - teamBtnH / 2,
      );
      if (!this._buildLive) teamBtn.eventMode = 'none';
      band.addChild(teamBtn);
    }

    const plateBottom = top + plateH;

    // 左右切宠箭头（仍保留，滑动为主）
    const ids = this._browseIds();
    if (ids.length > 1) {
      const midY = top + plateH / 2;
      const prev = this._makeHeroArrow('prev', () => this._switchPet(-1));
      prev.position.set(marginX + 4, midY);
      if (!this._buildLive) prev.eventMode = 'none';
      this._uiRoot().addChild(prev);
      const next = this._makeHeroArrow('next', () => this._switchPet(1));
      next.position.set(w - marginX - 4, midY);
      if (!this._buildLive) next.eventMode = 'none';
      this._uiRoot().addChild(next);

      const idx = Math.max(0, ids.indexOf(petId));
      const dotsY = plateBottom + 18;
      const dots = new PIXI.Container();
      const gap = 14;
      const n = Math.min(ids.length, 8);
      const start = ids.length <= 8 ? 0 : Math.max(0, Math.min(idx - 3, ids.length - 8));
      for (let i = 0; i < n; i++) {
        const real = start + i;
        const g = new PIXI.Graphics();
        const active = real === idx;
        g.beginFill(active ? COLORS.accent : COLORS.panelBorderSoft, active ? 1 : 0.85);
        g.drawCircle(0, 0, active ? 6 : 5);
        g.endFill();
        g.position.set(i * gap, 0);
        dots.addChild(g);
      }
      dots.position.set(w / 2 - ((n - 1) * gap) / 2 - 70, dotsY);
      this._uiRoot().addChild(dots);

      const hint = makeText('左右滑动切换灵宠', {
        size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: [0, 0.5],
      });
      hint.position.set(w / 2 + 20, dotsY);
      this._uiRoot().addChild(hint);

      // 整页左右滑切宠（属性区纵向滚动通过轴判定互让）
      if (this._buildLive) this._attachPageSwipe();
      return dotsY + 22;
    }

    return plateBottom + 8;
  }

  /** 整页左右滑切换灵宠；邻宠页跟手从侧边滑入 */
  private _attachPageSwipe(): void {
    this._detachPageSwipe();
    if (this._browseIds().length <= 1) return;

    const threshold = 48;
    const lock = 12;
    this._rawSwipeDown = (e: unknown) => {
      if (this._switching) return;
      const p = clientEventToDesign(e);
      this._swipeDragging = true;
      this._swipeMoved = false;
      this._swipeAxis = 'none';
      this._swipeDelta = 0;
      this._swipeStartX = p.x;
      this._swipeStartY = p.y;
      this._swipeLastX = p.x;
    };
    this._rawSwipeMove = (e: unknown) => {
      if (!this._swipeDragging || this._switching) return;
      const p = clientEventToDesign(e);
      const dx = p.x - this._swipeStartX;
      const dy = p.y - this._swipeStartY;

      if (this._swipeAxis === 'none') {
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (adx > lock || ady > lock) {
          this._swipeAxis = adx > ady ? 'h' : 'v';
          if (this._swipeAxis === 'v') {
            this._swipeDragging = false;
            this._snapTrackHome(true);
            return;
          }
        } else {
          return;
        }
      }
      if (this._swipeAxis === 'v') return;

      this._swipeMoved = true;
      (e as { preventDefault?: () => void }).preventDefault?.();

      const w = Game.logicWidth;
      // 左滑 → 下一只(delta+1)，右滑 → 上一只(delta-1)
      const delta = dx < 0 ? 1 : -1;
      if (delta !== this._swipeDelta) {
        this._swipeDelta = delta;
        void this._ensureIncoming(delta);
      } else if (!this._incomingLayer) {
        void this._ensureIncoming(delta);
      }

      const track = this._track;
      if (track && !track.destroyed) {
        TweenManager.cancelTarget(track);
        // 1:1 跟手，轻微封顶避免拖飞
        track.x = Math.max(-w * 0.95, Math.min(w * 0.95, dx));
      }
      this._swipeLastX = p.x;
    };
    this._rawSwipeUp = () => {
      if (!this._swipeDragging) return;
      const dx = this._swipeLastX - this._swipeStartX;
      const moved = this._swipeMoved && this._swipeAxis === 'h';
      const delta = this._swipeDelta || (dx < 0 ? 1 : -1);
      this._swipeDragging = false;
      this._swipeMoved = false;
      this._swipeAxis = 'none';
      this._swipeDelta = 0;

      if (!moved || Math.abs(dx) < threshold) {
        this._snapTrackHome(true);
        return;
      }
      this._commitIncoming(delta);
    };

    const canvas = getTouchCanvas();
    if (Platform.isMinigame) {
      canvas.addEventListener('touchstart', this._rawSwipeDown as EventListener, { passive: true });
      canvas.addEventListener('touchmove', this._rawSwipeMove as EventListener, { passive: false });
      canvas.addEventListener('touchend', this._rawSwipeUp as EventListener);
      canvas.addEventListener('touchcancel', this._rawSwipeUp as EventListener);
    } else {
      canvas.addEventListener('pointerdown', this._rawSwipeDown as EventListener);
      canvas.addEventListener('pointermove', this._rawSwipeMove as EventListener);
      canvas.addEventListener('pointerup', this._rawSwipeUp as EventListener);
      canvas.addEventListener('pointercancel', this._rawSwipeUp as EventListener);
    }
  }

  private _detachPageSwipe(): void {
    const canvas = getTouchCanvas();
    if (canvas && this._rawSwipeDown) {
      canvas.removeEventListener('touchstart', this._rawSwipeDown as EventListener);
      canvas.removeEventListener('pointerdown', this._rawSwipeDown as EventListener);
    }
    if (canvas && this._rawSwipeMove) {
      canvas.removeEventListener('touchmove', this._rawSwipeMove as EventListener);
      canvas.removeEventListener('pointermove', this._rawSwipeMove as EventListener);
    }
    if (canvas && this._rawSwipeUp) {
      canvas.removeEventListener('touchend', this._rawSwipeUp as EventListener);
      canvas.removeEventListener('touchcancel', this._rawSwipeUp as EventListener);
      canvas.removeEventListener('pointerup', this._rawSwipeUp as EventListener);
      canvas.removeEventListener('pointercancel', this._rawSwipeUp as EventListener);
    }
    this._rawSwipeDown = null;
    this._rawSwipeMove = null;
    this._rawSwipeUp = null;
    this._swipeDragging = false;
    this._swipeMoved = false;
    this._swipeAxis = 'none';
  }

  /** 原型：白底圆钮 + 金色箭头 */
  private _makeHeroArrow(dir: 'prev' | 'next', onTap: () => void): PIXI.Container {
    const r = 28;
    const c = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.beginFill(0xffffff, 0.92);
    g.lineStyle(3, COLORS.panelBorder, 1);
    g.drawCircle(0, 0, r);
    g.endFill();
    // 箭头
    g.lineStyle(0);
    g.beginFill(COLORS.accentDeep, 1);
    const s = 10;
    if (dir === 'prev') {
      g.moveTo(s * 0.4, -s);
      g.lineTo(-s * 0.7, 0);
      g.lineTo(s * 0.4, s);
    } else {
      g.moveTo(-s * 0.4, -s);
      g.lineTo(s * 0.7, 0);
      g.lineTo(-s * 0.4, s);
    }
    g.closePath();
    g.endFill();
    c.addChild(g);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.hitArea = new PIXI.Circle(0, 0, r + 8);
    bindPointerTap(c, onTap);
    return c;
  }

  /** 原型：绿描边 + 绿字空心「下阵/上阵」 */
  private _makeOutlineTeamButton(opts: {
    label: string;
    width: number;
    height: number;
    onTap: () => void;
  }): PIXI.Container {
    const { label, width, height, onTap } = opts;
    const btn = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.beginFill(0xffffff, 0.85);
    g.lineStyle(3, COLORS.btnSuccessBorder, 1);
    g.drawRoundedRect(-width / 2, -height / 2, width, height, Math.min(RADIUS.button, height / 2));
    g.endFill();
    const t = makeText(label, {
      size: FONT_SIZE.md, fill: COLORS.btnSuccessBorder, bold: true, anchor: 0.5,
    });
    btn.addChild(g, t);
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    bindPointerTap(btn, onTap);
    return btn;
  }

  private _buildAvatar(
    pet: PetDef,
    star: number,
    cx: number,
    cy: number,
    size: number,
    parent: PIXI.Container = this._content,
  ): void {
    if (this._buildLive) this._avatarCenter.set(cx, cy);
    const holder = new PIXI.Container();
    holder.position.set(cx, cy);

    // 仅用五行相框 + 立绘，不再叠稀有度卡底板（会在框内露出奶油底显得突兀）
    const frameTex = TextureCache.get(petFrameImage(pet.element));
    if (frameTex) {
      const frame = new PIXI.Sprite(frameTex);
      frame.anchor.set(0.5);
      frame.scale.set(size / Math.max(frame.width, frame.height));
      holder.addChild(frame);
    } else {
      const fallback = makePanel({
        width: size + 16, height: size + 16, radius: 22, centered: true,
        bg: COLORS.panelBg, border: COLORS.panelBorder, borderWidth: 4,
      });
      holder.addChild(fallback);
    }

    const tex = getPetAvatarTexture(pet.id, star);
    if (tex) {
      const avatar = new PIXI.Sprite(tex);
      avatar.anchor.set(0.5);
      avatar.scale.set((size * 0.78) / Math.max(avatar.width, avatar.height));
      holder.addChild(avatar);
    }
    // 棋盘同源属性珠（略缩小，避免大头像上角标显贴图感）
    attachPetFrameOrb(holder, pet.element, size, { scale: 0.72 });

    parent.addChild(holder);
    if (this._buildLive) {
      this._avatar = holder;
      if (!this._skipAvatarFade) fadeIn(holder, { duration: 0.18 });
      this._skipAvatarFade = false;
    }
  }

  private _buildScrollSheet(
    pet: PetDef,
    lv: number,
    star: number,
    marginX: number,
    sheetTop: number,
    sheetH: number,
    w: number,
  ): void {
    const sheetW = w - marginX * 2;
    const sheet = new PIXI.Container();
    sheet.position.set(0, sheetTop);
    if (this._buildLive) this._sheet = sheet;
    this._uiRoot().addChild(sheet);

    const pad = 22;
    let y = 10;

    // 底板：对齐原型奶油面板（略浅于 panelBgAlt，近白奶油）
    // 先铺内容再按真实高度铺底板，避免预估偏矮把末行图标裁半截
    const sheetBg = 0xfff8ec;
    const panelPlaceholder = new PIXI.Container();
    panelPlaceholder.position.set(marginX, 0);
    sheet.addChild(panelPlaceholder);

    // 属性
    y = this._fillStatSection(sheet, pet, lv, star, marginX + pad, y + 8, sheetW - pad * 2);
    y += 18;
    // 技能（行高随文案自适应；返回值已含末行底部）
    y = this._fillSkillSection(sheet, pet, lv, star, marginX + pad, y, sheetW - pad * 2);

    // 底部留白：避免末行图标贴着裁切边/圆角被「咬」掉半截
    const bottomPad = Math.max(pad, 36);
    const contentH = Math.max(sheetH - 8, y + bottomPad);
    const panel = makePanel({
      width: sheetW, height: contentH, radius: 28, centered: false,
      bg: sheetBg, bgAlpha: 0.98, border: COLORS.panelBorderSoft, borderWidth: 3,
    });
    panel.position.set(marginX, 0);
    sheet.removeChild(panelPlaceholder);
    panelPlaceholder.destroy({ children: true });
    sheet.addChildAt(panel, 0);

    // 视口遮罩 + 滚动（内容高于视口时必须可滑，否则末行会被裁半截）
    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawRect(0, sheetTop, w, sheetH);
    mask.endFill();
    this._uiRoot().addChild(mask);
    sheet.mask = mask;
    if (this._buildLive) {
      this._sheetMask = mask;
      if (contentH > sheetH + 2) {
        const scrollMin = sheetTop - (contentH - sheetH);
        this._scroll.attach({
          content: () => this._sheet,
          viewportTop: sheetTop,
          viewportH: sheetH,
          scrollMin,
          listTop: sheetTop,
          moveThreshold: 6,
        });
      }
    }
  }

  private _sectionTitle(parent: PIXI.Container, label: string, x: number, y: number): number {
    const diamond = new PIXI.Graphics();
    diamond.beginFill(COLORS.accent);
    diamond.moveTo(0, -9);
    diamond.lineTo(9, 0);
    diamond.lineTo(0, 9);
    diamond.lineTo(-9, 0);
    diamond.closePath();
    diamond.endFill();
    diamond.position.set(x + 10, y + 16);
    parent.addChild(diamond);

    const t = makeText(label, {
      size: FONT_SIZE.md, fill: COLORS.textTitle, bold: true, anchor: [0, 0.5],
    });
    t.position.set(x + 28, y + 16);
    parent.addChild(t);
    return y + 44;
  }

  private _fillStatSection(
    parent: PIXI.Container,
    pet: PetDef,
    lv: number,
    star: number,
    x: number,
    y: number,
    innerW: number,
  ): number {
    y = this._sectionTitle(parent, '属性', x, y);

    const maxStarLv = getStarProfile(MAX_PET_STAR).maxLevel;
    const potential: Record<StatKey, number> = {
      atk: petAtk(pet, maxStarLv, MAX_PET_STAR),
      hp: petHp(pet, maxStarLv, MAX_PET_STAR),
      rcv: petRcv(pet, maxStarLv, MAX_PET_STAR),
    };
    if (this._buildLive) this._statPotential = potential;
    const current: Record<StatKey, number> = {
      atk: petAtk(pet, lv, star),
      hp: petHp(pet, lv, star),
      rcv: petRcv(pet, lv, star),
    };

    const order: StatKey[] = ['hp', 'atk', 'rcv'];
    const rowH = 58;
    const iconSz = 34;
    const labelW = 100;
    const valW = 72;
    const barW = Math.max(140, innerW - labelW - valW - iconSz - 20);

    order.forEach((stat, i) => {
      const rowY = y + i * rowH + 18;
      const def = getStatUi(stat);

      const icon = makeStatIcon(stat, iconSz);
      icon.position.set(x + iconSz / 2, rowY);
      parent.addChild(icon);

      const label = makeText(def.longLabel, {
        size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
      });
      label.position.set(x + iconSz + 10, rowY);
      parent.addChild(label);

      const ratio = Math.min(1, current[stat] / Math.max(1, potential[stat]));
      const bar = makeProgressBar({
        width: barW, height: 20, ratio, fill: def.color, track: 0xe8dcc4,
      });
      bar.position.set(x + labelW + iconSz, rowY - 10);
      parent.addChild(bar);

      const value = makeText(`${current[stat]}`, {
        size: FONT_SIZE.md, fill: COLORS.textMain, bold: true, anchor: [1, 0.5],
      });
      value.position.set(x + innerW, rowY);
      parent.addChild(value);

      if (this._buildLive) this._statRows[stat] = { bar, value };
    });

    return y + order.length * rowH + 12;
  }

  private _fillSkillSection(
    parent: PIXI.Container,
    pet: PetDef,
    lv: number,
    star: number,
    x: number,
    y: number,
    innerW: number,
  ): number {
    y = this._sectionTitle(parent, '技能', x, y);
    const abilities = resolvePetAbilities(pet, { level: lv, star });
    const skill = abilities.active.skill;
    // 略小于旧版 72，保证常见 1 主动 + 4 被动在首屏更易完整露出
    const iconSz = 60;
    const gap = 12;
    const textX = x + iconSz + gap;
    const textW = Math.max(80, innerW - iconSz - gap);
    const rowGap = 16;

    // —— 主动技 ——
    // 图标与「标题行」（标签+技能名）同一水平中线；描述/下一档提示在标题下自适应增高
    const activeIcon = makeSkillIcon({
      skillId: skill.id,
      size: iconSz,
      fallbackFill: COLORS.accentDeep,
      fallbackGlyph: skill.name,
    });
    parent.addChild(activeIcon);

    const activeTag = this._makeTag('主动', 0xd86a4a, 0xfff0e8);
    const masteryTag = this._makeTag(`技Lv.${abilities.active.masteryRank}`, 0xd9a008, 0xfffbe8);
    const skillName = makeText(skill.name, {
      size: FONT_SIZE.md, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    });
    const cd = makeText(`CD ${skill.cd}`, {
      size: FONT_SIZE.sm, fill: COLORS.accentDeep, bold: true, anchor: [1, 0.5],
    });
    const desc = makeText(skill.desc, {
      size: FONT_SIZE.sm, fill: COLORS.textMain, anchor: [0, 0],
      wordWrapWidth: textW,
    });
    // 强制刷新排版，避免 wordWrap 高度尚未计算导致行高偏矮
    desc.updateText(true);

    const next = abilities.active.nextMilestone;
    const hint = next && next.requirement.kind === 'level'
      ? makeText(
        `Lv.${next.requirement.level} 解锁 技Lv.${next.rank}（效果 +${Math.round(next.effectPct * 100)}%）`,
        { size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: [0, 0] },
      )
      : null;

    const titleH = Math.max(activeTag.height, masteryTag.height, 34);
    const belowH = desc.height + (hint ? hint.height + 6 : 0);
    // 行高 = max(图标, 标题行) + 下方文案；整行随描述变长向下扩展
    const headH = Math.max(iconSz, titleH);
    const rowH = headH + (belowH > 0 ? 8 + belowH : 0);

    const titleMidY = y + headH / 2;
    activeIcon.position.set(x + iconSz / 2, titleMidY);
    activeTag.position.set(textX, titleMidY - activeTag.height / 2);
    masteryTag.position.set(textX + activeTag.width + 8, titleMidY - masteryTag.height / 2);
    skillName.position.set(
      textX + activeTag.width + masteryTag.width + 18,
      titleMidY,
    );
    cd.position.set(x + innerW, titleMidY);
    parent.addChild(activeTag, masteryTag, skillName, cd);

    let ty = y + headH + 8;
    desc.position.set(textX, ty);
    parent.addChild(desc);
    ty += desc.height;
    if (hint) {
      hint.position.set(textX, ty + 6);
      parent.addChild(hint);
    }

    y += rowH + rowGap;

    // —— 被动：图标与「被动」标签+说明同一水平中线；文案换行时行高自适应 ——
    for (const line of abilities.passiveLines) {
      const unlocked = line.unlocked !== false;
      const nearUnlock = !unlocked
        && line.requirement?.kind === 'level'
        && line.requirement.level - lv <= 5;

      const pIcon = makeSkillIcon({
        iconId: line.iconKey,
        size: iconSz,
        locked: !unlocked,
        fallbackFill: unlocked ? 0x6a8aad : 0x8a8a8a,
        fallbackGlyph: '被',
      });
      const tag = this._makeTag(
        '被动',
        unlocked ? 0x6a8aad : 0x9a9a9a,
        unlocked ? 0xf0f4f8 : 0xffffff,
      );
      const body = makeText(line.text, {
        size: FONT_SIZE.sm,
        fill: unlocked
          ? (line.color ?? COLORS.textSub)
          : (nearUnlock ? COLORS.accentDeep : COLORS.textSub),
        anchor: [0, 0],
        wordWrapWidth: Math.max(60, textW - tag.width - 12),
      });
      body.updateText(true);
      body.alpha = unlocked ? 1 : (nearUnlock ? 0.85 : 0.5);

      const textH = Math.max(tag.height, body.height);
      const pRowH = Math.max(iconSz, textH);
      const midY = y + pRowH / 2;

      pIcon.position.set(x + iconSz / 2, midY);
      tag.position.set(textX, midY - tag.height / 2);
      body.position.set(textX + tag.width + 10, midY - body.height / 2);
      parent.addChild(pIcon, tag, body);

      y += pRowH + rowGap;
    }

    return y;
  }

  private _makeTag(label: string, bg: number, textFill: number): PIXI.Container {
    const padX = 14;
    const h = 34;
    const t = makeText(label, { size: FONT_SIZE.xs, fill: textFill, bold: true, anchor: 0.5 });
    const w = Math.ceil(t.width) + padX * 2;
    const c = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.beginFill(bg, 0.95);
    g.drawRoundedRect(0, 0, w, h, h / 2);
    g.endFill();
    t.position.set(w / 2, h / 2);
    c.addChild(g, t);
    return c;
  }

  private _buildPreviewHint(w: number, y: number): void {
    const hint = makeText('章节 Boss 掉落预览 · 以 ★1 初始属性展示', {
      size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: 0.5,
    });
    hint.position.set(w / 2, y);
    this._uiRoot().addChild(hint);
  }

  /** 底栏固定坞：左升星 · 右升级（主按钮） */
  private _buildActionDock(petId: string, w: number, h: number, dockH: number): void {
    const dockTop = h - dockH;
    const dock = makePanel({
      width: w, height: dockH + 20, radius: 0, centered: false,
      bg: COLORS.panelBg, bgAlpha: 0.98, border: COLORS.panelBorderSoft, borderWidth: 2,
    });
    dock.position.set(0, dockTop);
    this._uiRoot().addChild(dock);

    const marginX = 28;
    const gap = 16;
    // 略增高，贴近底板 2:1 比例，避免九宫竖向压出「上下两截色」
    const btnH = 104;
    const cy = dockTop + dockH / 2 - 2;
    const innerW = w - marginX * 2 - gap;
    const starW = Math.floor(innerW * 0.42);
    const lvW = innerW - starW;

    const starCost = PlayerData.starUpCost(petId);
    const canStar = PlayerData.canStarUp(petId);
    const shards = PlayerData.petShards(petId);
    const starSub = starCost === null ? '已满星' : `碎片 ${shards}/${starCost}`;
    const starBtn = makeActionButton({
      width: starW, height: btnH,
      title: starCost === null ? '已满星' : '升星',
      subtitle: starSub,
      variant: 'cream',
      enabled: this._buildLive && canStar,
      onTap: () => this._onStarUp(),
    });
    starBtn.position.set(marginX + starW / 2, cy);
    this._uiRoot().addChild(starBtn);

    const lvCost = PlayerData.levelUpCost(petId);
    const canLv = PlayerData.canLevelUp(petId);
    const lvSub = lvCost === null ? '已满级' : `经验 ${PlayerData.exp}/${lvCost}`;
    const lvBtn = makeActionButton({
      width: lvW, height: btnH,
      title: lvCost === null ? '已满级' : '升级',
      subtitle: lvSub,
      variant: 'success',
      enabled: this._buildLive && canLv,
      onTap: () => this._onLevelUp(),
    });
    lvBtn.position.set(marginX + starW + gap + lvW / 2, cy);
    this._uiRoot().addChild(lvBtn);
  }

  // ── 操作 + 反馈 ──

  private _onLevelUp(): void {
    const before = this._currentStats();
    const beforeProgress = this._currentProgress();
    if (!PlayerData.levelUp(this._petId)) {
      Platform.showToast(PlayerData.levelUpCost(this._petId) === null ? '已满级' : '经验不足');
      return;
    }
    Platform.vibrateShort('light');
    this._build();
    this._playGrowthFeedback(before, false);
    this._notifyAbilityUnlocks(beforeProgress);
  }

  private _onStarUp(): void {
    const before = this._currentStats();
    const beforeProgress = this._currentProgress();
    if (!PlayerData.starUp(this._petId)) {
      Platform.showToast(PlayerData.starUpCost(this._petId) === null ? '已满星' : '碎片不足');
      return;
    }
    Platform.vibrateShort('medium');
    this._build();
    this._playGrowthFeedback(before, true);
    if (this._starRow) pulse(this._starRow, { peak: 1.22 });
    this._notifyAbilityUnlocks(beforeProgress);
  }

  private _currentProgress(): PetProgress {
    return {
      level: PlayerData.petLevel(this._petId),
      star: PlayerData.petStar(this._petId),
    };
  }

  /** 升级/升星跨过里程碑时：Toast + 特效 + 全局事件（红点/成就/引导可订阅） */
  private _notifyAbilityUnlocks(before: PetProgress): void {
    const pet = PET_MAP.get(this._petId);
    if (!pet) return;
    const after = this._currentProgress();
    const diff = diffAbilityUnlocks(pet, before, after);
    if (diff.newPassives.length === 0 && !diff.masteryUp) return;

    if (diff.newPassives.length > 0) {
      const extra = diff.newPassives.length > 1 ? ` 等${diff.newPassives.length}项` : '';
      Platform.showToast(`解锁新被动：${diff.newPassives[0]}${extra}`);
    } else if (diff.masteryUp) {
      Platform.showToast(`技能升级：技Lv.${diff.masteryUp.to}`);
    }
    this._burstAtAvatar(COLORS.accent, true);
    EventBus.emit('pet:abilityUnlocked', {
      petId: this._petId,
      newPassives: diff.newPassives,
      masteryUp: diff.masteryUp,
    });
  }

  private _onToggleTeam(inTeam: boolean): void {
    if (inTeam) {
      if (!PlayerData.removeFromTeam(this._petId)) {
        Platform.showToast('至少保留 1 只灵宠');
        return;
      }
    } else if (!PlayerData.addToTeam(this._petId)) {
      Platform.showToast('队伍已满 5 只');
      return;
    }
    Platform.vibrateShort('light');
    this._build();
    if (this._avatar) pulse(this._avatar);
    this._burstAtAvatar(inTeam ? COLORS.textSub : COLORS.accentDeep, false);
  }

  private _currentStats(): Record<StatKey, number> {
    const pet = PET_MAP.get(this._petId);
    if (!pet) return { atk: 0, hp: 0, rcv: 0 };
    const lv = PlayerData.petLevel(this._petId);
    const star = PlayerData.petStar(this._petId);
    return { atk: petAtk(pet, lv, star), hp: petHp(pet, lv, star), rcv: petRcv(pet, lv, star) };
  }

  private _playGrowthFeedback(before: Record<StatKey, number>, strong: boolean): void {
    const after = this._currentStats();
    (['hp', 'atk', 'rcv'] as StatKey[]).forEach((stat) => {
      const row = this._statRows[stat];
      if (!row) return;
      const from = before[stat];
      const to = after[stat];
      if (from !== to) {
        countUp({
          from, to, duration: 0.5,
          onUpdate: (v) => { row.value.text = `${v}`; },
        });
      }
      const cap = Math.max(1, this._statPotential[stat]);
      const fromR = Math.min(1, from / cap);
      const toR = Math.min(1, to / cap);
      const dummy = { r: fromR };
      row.bar.setRatio(fromR);
      TweenManager.to({
        target: dummy, props: { r: toR }, duration: 0.5, ease: Ease.easeOutCubic,
        onUpdate: () => row.bar.setRatio(dummy.r),
      });
    });

    if (this._avatar) pulse(this._avatar, { peak: strong ? 1.2 : 1.12 });
    const color = strong ? getRarity(PET_MAP.get(this._petId)?.rarity ?? 1).color : COLORS.accent;
    this._fx?.flash(color, strong ? 0.32 : 0.18, 0.4);
    this._burstAtAvatar(color, strong);
  }

  private _burstAtAvatar(color: number, strong: boolean): void {
    this._fx?.burst({
      x: this._avatarCenter.x, y: this._avatarCenter.y, color,
      count: strong ? 22 : 12, speed: strong ? 420 : 280, life: strong ? 0.85 : 0.6,
      gravity: 280, size: strong ? 30 : 20, endScale: 0.1,
      texture: TextureCache.get(UI_FX_IMAGES.particleSpark) ?? undefined,
      blendMode: PIXI.BLEND_MODES.ADD,
    });
  }
}
