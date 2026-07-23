/**
 * 标题场景：主线章节地图首页 + 左侧分组栏 + 五格底栏
 *
 * IA：底栏「主线」= 本页；
 * 左栏上组 = 副玩法；分隔线下 = 侧边栏/桌面（抖音必接，对齐 home_layout_demo_b）。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { UI } from '@/balance/ui';
import { CHAPTERS, CHAPTER_NAME, stagesOfChapter } from '@/balance/stages';
import { PlayerData } from '@/game/PlayerData';
import {
  makeCurrencyLabel, makeChapterNavArrow, NAV_ARROW_SIZE,
  makeChapterTitlePlaque, namePlaqueOuterHalf,
  buildBottomNav, BOTTOM_NAV_RESERVE,
  buildHomeLeftRail, homeLeftRailHeight, DEFAULT_HOME_RAIL,
  COLORS, FONT_SIZE, makeText,
} from '@/ui';
import { ScrollListController } from '@/ui/ScrollList';
import { GMManager } from '@/core/GMManager';
import { EventBus } from '@/core/EventBus';
import type { TeamEnterData } from './TeamScene';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { buildTitleScreenWorld } from './chapterMapView';
import { attachChapterMapEditor } from './chapterMapEditor';
import { ensurePetAvatars, titleHomePetAvatarEntries } from '@/config/assetPreload';
import { UI_IMAGES } from '@/config/Assets';
import { TextureCache } from '@/core/TextureCache';
import { Platform } from '@/core/PlatformService';

declare const GameGlobal: any;

/** 首页展示昵称（暂无账号系统） */
const HOME_DISPLAY_NAME = '仙灵小萌新';

export interface TitleEnterData {
  /** 进入时选中的章节（默认最新已解锁章） */
  chapter?: number;
  /** 排除法：对齐 L7 手写路径，或逐级加回 TitleScene 特性 */
  minimalStrip?: 'l7like' | 'withAnim' | 'full';
}

export class TitleScene implements Scene {
  readonly name = 'title';
  readonly container = new PIXI.Container();

  private static readonly BOTTOM_RESERVE = BOTTOM_NAV_RESERVE;

  /** 章节导航贴在顶栏下方 */
  private static chapterNavY(): number {
    return Game.safeTop + 28;
  }

  private _chapter = 1;
  private _minimalStrip: TitleEnterData['minimalStrip'];
  private _scroll = new ScrollListController();
  private _worldRoot: PIXI.Container | null = null;
  private _mapEditMode = false;
  private _editorTeardown: (() => void) | null = null;
  private _onMapEditToggle = (): void => {
    if (!GMManager.isEnabled) return;
    this._mapEditMode = !this._mapEditMode;
    this._rebuild();
  };

  onEnter(data?: unknown): void {
    EventBus.on('gm:mapEditToggle', this._onMapEditToggle);
    const enter = data as TitleEnterData | undefined;
    this._minimalStrip = enter?.minimalStrip;
    if (this._minimalStrip !== 'l7like') {
      Game.setMaxFPS(UI.fps.idle);
    }
    PlayerData.load();
    this._chapter = enter?.chapter ?? this._latestUnlockedChapter();
    if (SceneManager.current?.name !== 'title') return;
    this._rebuild();
    void ensurePetAvatars(titleHomePetAvatarEntries(this._chapter));
    void Game.warmScenePresent();
  }

  private _rebuild(): void {
    this._editorTeardown?.();
    this._editorTeardown = null;
    this._scroll.detach();
    this._worldRoot = null;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._build();
    void ensurePetAvatars(titleHomePetAvatarEntries(this._chapter));
  }

  private _latestUnlockedChapter(): number {
    let latest = CHAPTERS[0];
    for (const ch of CHAPTERS) {
      if (PlayerData.isChapterUnlocked(ch)) latest = ch;
    }
    return latest;
  }

  onExit(): void {
    EventBus.off('gm:mapEditToggle', this._onMapEditToggle);
    this._editorTeardown?.();
    this._editorTeardown = null;
    this._mapEditMode = false;
    this._scroll.detach();
    this._worldRoot = null;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    const stages = stagesOfChapter(this._chapter);
    const mapEditMode = GMManager.isEnabled && this._mapEditMode;
    const mapWorld = buildTitleScreenWorld({
      chapter: this._chapter,
      stages,
      screenW: w,
      screenH: h,
      scroll: this._scroll,
      mapEditMode,
      onStageTap: (stageId) => {
        if (mapEditMode) return;
        SceneManager.switchTo('team', { stageId } satisfies TeamEnterData);
      },
    });
    this._worldRoot = mapWorld.world;
    this.container.addChild(mapWorld.world);

    if (mapEditMode) {
      const editor = attachChapterMapEditor({
        screenW: w,
        chapter: this._chapter,
        designLayer: mapWorld.designLayer,
        nodes: mapWorld.nodes,
        marker: mapWorld.marker,
        activeIndex: mapWorld.activeIndex,
        stageCount: stages.length,
        onEditingChange: (editing) => {
          this._mapEditMode = editing;
        },
        onRefresh: () => this._rebuild(),
      });
      this._editorTeardown = editor.teardown;
      this.container.addChild(editor.toolbar);
    }

    this._buildTopBar(w, Game.safeHeaderCenterY);
    this._buildChapterNav(w, TitleScene.chapterNavY());
    this._buildLeftRail(h);
    this._buildBottomNav(w, h);
  }

  private _buildBottomNav(w: number, h: number): void {
    buildBottomNav(this.container, w, h, 'home');
  }

  private _buildLeftRail(h: number): void {
    const showWelfare = Platform.isDouyin || Platform.isDevtools;
    const top = TitleScene.chapterNavY() + 64;
    const bottomLimit = h - TitleScene.BOTTOM_RESERVE - 24;
    const railH = homeLeftRailHeight(
      DEFAULT_HOME_RAIL.length,
      showWelfare ? 2 : 0,
    );
    buildHomeLeftRail(this.container, {
      x: 48,
      y: Math.min(top, bottomLimit - railH),
      showWelfare,
    });
  }

  /** 顶栏：默认玩家头像+昵称；货币紧随昵称右侧排布，躲开右上角胶囊/收起 */
  private _buildTopBar(w: number, centerY: number): void {
    const padX = 28;
    const profile = new PIXI.Container();
    profile.position.set(padX, centerY);

    const avSize = 56;
    // 外环金边 + 内圈奶油底，突出「仙灵小萌新」默认头像
    const ring = new PIXI.Graphics();
    ring.beginFill(COLORS.accent, 1);
    ring.drawCircle(0, 0, avSize / 2 + 3);
    ring.endFill();
    ring.beginFill(COLORS.panelBorder, 1);
    ring.drawCircle(0, 0, avSize / 2 + 1);
    ring.endFill();
    ring.beginFill(COLORS.panelBg, 1);
    ring.drawCircle(0, 0, avSize / 2 - 1);
    ring.endFill();
    profile.addChild(ring);

    const avatarSlot = new PIXI.Container();
    profile.addChild(avatarSlot);
    const mountAvatar = (tex: PIXI.Texture) => {
      avatarSlot.removeChildren().forEach((c) => c.destroy());
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      sp.scale.set((avSize - 6) / Math.max(tex.width, tex.height));
      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      mask.drawCircle(0, 0, (avSize - 6) / 2);
      mask.endFill();
      sp.mask = mask;
      avatarSlot.addChild(sp, mask);
    };
    const cached = TextureCache.get(UI_IMAGES.playerAvatarDefault);
    if (cached) {
      mountAvatar(cached);
    } else {
      void TextureCache.load(UI_IMAGES.playerAvatarDefault).then((tex) => {
        if (!avatarSlot.destroyed) mountAvatar(tex);
      }).catch(() => null);
    }

    const name = makeText(HOME_DISPLAY_NAME, {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    });
    try { name.updateText(true); } catch { /* noop */ }
    name.position.set(avSize / 2 + 12, 0);
    profile.addChild(name);
    this.container.addChild(profile);

    const lingyu = makeCurrencyLabel('lingyu', PlayerData.lingyu);
    const coins = makeCurrencyLabel('coin', PlayerData.coins);
    const gap = 14;
    // 真正左对齐：跟在头像昵称右侧，不再右贴胶囊（真机右贴必叠「收起」）
    const afterNameX = padX + avSize / 2 + 12 + name.width + 20;
    const rightLimit = Game.contentRightX(GMManager.isEnabled ? 72 : 28);
    const totalW = lingyu.width + gap + coins.width;
    // 若昵称过长挤到右限，整体再左收，优先保证不进胶囊
    let rowX = afterNameX;
    if (rowX + totalW > rightLimit) {
      rowX = Math.max(padX + avSize + 8, rightLimit - totalW);
    }
    lingyu.position.set(rowX, centerY);
    coins.position.set(rowX + lingyu.width + gap, centerY);
    this.container.addChild(lingyu, coins);
  }

  private _buildChapterNav(w: number, y: number): void {
    const gmEditAll = GMManager.isEnabled && this._mapEditMode;
    const chapterUnlocked = gmEditAll || PlayerData.isChapterUnlocked(this._chapter);
    const name = CHAPTER_NAME[this._chapter] ?? `第${this._chapter}章`;
    const idx = CHAPTERS.indexOf(this._chapter);

    // 对齐 home_hub_v4：战斗同源横匾 + 箭头紧贴尖角外侧
    const plaque = makeChapterTitlePlaque({
      text: name,
      screenWidth: w,
      disabled: !chapterUnlocked,
    });
    plaque.position.set(w / 2, y);
    if (GMManager.isRuntimeAllowed) {
      plaque.eventMode = 'static';
      plaque.cursor = 'pointer';
      bindPointerTap(plaque, () => GMManager.onTitleTap());
    }
    this.container.addChild(plaque);

    const arrowGap = 4;
    const arrowHalf = NAV_ARROW_SIZE / 2;
    const tipHalf = namePlaqueOuterHalf(plaque);
    // 紧贴匾尖角；下限避开左侧玩法栏（x≈48, 宽 84 → 右缘 ~90）
    const leftX = Math.max(100, w / 2 - tipHalf - arrowGap - arrowHalf);
    const rightX = Math.min(w - 52, w / 2 + tipHalf + arrowGap + arrowHalf);

    const mkArrow = (direction: 'left' | 'right', x: number, targetChapter: number | null): void => {
      const enabled = targetChapter !== null
        && (gmEditAll || PlayerData.isChapterUnlocked(targetChapter));
      const arrow = makeChapterNavArrow({
        direction,
        enabled,
        onTap: () => {
          this._chapter = targetChapter!;
          this._rebuild();
        },
      });
      arrow.position.set(x, y);
      this.container.addChild(arrow);
    };
    mkArrow('left', leftX, idx > 0 ? CHAPTERS[idx - 1] : null);
    mkArrow('right', rightX, idx < CHAPTERS.length - 1 ? CHAPTERS[idx + 1] : null);
  }
}
