/**
 * 标题场景：主线章节地图首页 + 可扩展左侧玩法栏 + 五格底栏
 *
 * IA：底栏「主线」= 本页；左侧签到/通天塔/日常/活动 = 副玩法（可继续扩展）。
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
  buildHomeLeftRail,
  COLORS, FONT_SIZE, makePanel, makeText,
} from '@/ui';
import { ScrollListController } from '@/ui/ScrollList';
import { GMManager } from '@/core/GMManager';
import { EventBus } from '@/core/EventBus';
import type { TeamEnterData } from './TeamScene';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { buildTitleScreenWorld } from './chapterMapView';
import { attachChapterMapEditor } from './chapterMapEditor';
import { ensurePetAvatars, titleHomePetAvatarEntries } from '@/config/assetPreload';
import { getPetAvatarTexture } from '@/config/petAvatarTexture';
import { SidebarEntryButton } from '@/ui/SidebarEntryButton';
import { DesktopShortcutEntryButton } from '@/ui/DesktopShortcutEntryButton';
import { DesktopShortcutService } from '@/core/DesktopShortcutService';
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
    this._buildSidebarEntry(w, h);
    this._buildDesktopShortcutEntry(w, h);
    this._buildBottomNav(w, h);
  }

  private _buildBottomNav(w: number, h: number): void {
    buildBottomNav(this.container, w, h, 'home');
  }

  private _buildLeftRail(h: number): void {
    const top = TitleScene.chapterNavY() + 56;
    const bottomLimit = h - TitleScene.BOTTOM_RESERVE - 24;
    buildHomeLeftRail(this.container, {
      x: 48,
      y: Math.min(top, bottomLimit - 280),
    });
  }

  private _buildDesktopShortcutEntry(w: number, h: number): void {
    if (!DesktopShortcutService.isAvailable) return;
    const reserve = TitleScene.BOTTOM_RESERVE;
    const btn = new DesktopShortcutEntryButton(w - 130, h - reserve - 72);
    this.container.addChild(btn);
  }

  private _buildSidebarEntry(w: number, h: number): void {
    if (!Platform.isDouyin) return;
    const reserve = TitleScene.BOTTOM_RESERVE;
    const btn = new SidebarEntryButton(w - 56, h - reserve - 72);
    this.container.addChild(btn);
  }

  /** 顶栏：左头像+昵称；右货币（避开胶囊，垂直对齐收起按钮） */
  private _buildTopBar(w: number, centerY: number): void {
    const padX = 28;
    const profile = new PIXI.Container();
    profile.position.set(padX, centerY);

    const avSize = 52;
    profile.addChild(makePanel({
      width: avSize, height: avSize, radius: avSize / 2,
      bg: COLORS.panelBg, bgAlpha: 0.95,
      border: COLORS.panelBorder, borderWidth: 2,
      centered: true,
    }));

    const lead = PlayerData.team[0];
    const tex = lead ? getPetAvatarTexture(lead, PlayerData.petStar(lead)) : null;
    if (tex) {
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      sp.scale.set((avSize - 8) / Math.max(tex.width, tex.height));
      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      mask.drawCircle(0, 0, (avSize - 6) / 2);
      mask.endFill();
      sp.mask = mask;
      profile.addChild(sp, mask);
    }

    const name = makeText(HOME_DISPLAY_NAME, {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    });
    name.position.set(avSize / 2 + 12, 0);
    profile.addChild(name);
    this.container.addChild(profile);

    const lingyu = makeCurrencyLabel('lingyu', PlayerData.lingyu);
    const coins = makeCurrencyLabel('coin', PlayerData.coins);
    const gap = 16;
    const totalW = lingyu.width + gap + coins.width;
    // 右缘避开「··· / 收起」胶囊；GM 开启时再让出 GM 按钮，避免灵宠币叠上去
    const gmReserve = GMManager.isEnabled ? 56 + 14 : 0;
    const rightLimit = Game.contentRightX(28 + gmReserve);
    const rowRight = Math.min(w - padX, rightLimit);
    const rowX = Math.max(padX + 200, rowRight - totalW);
    // IconLabel 原点在图标垂直中心，与头像/昵称共用 centerY
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
