/**
 * 标题场景：全屏修仙背景 + 资源条 + 章节路径节点 + 底部导航
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { UI } from '@/balance/ui';
import { CHAPTERS, CHAPTER_NAME, stagesOfChapter } from '@/balance/stages';
import { PlayerData } from '@/game/PlayerData';
import {
  makeCurrencyRow, makeChapterNavArrow, CURRENCY_ICON_SIZE,
  makeNamePlaque, namePlaqueWidth,
  buildBottomNav, BOTTOM_NAV_RESERVE,
} from '@/ui';
import { ScrollListController } from '@/ui/ScrollList';
import { GMManager } from '@/core/GMManager';
import { EventBus } from '@/core/EventBus';
import type { TeamEnterData } from './TeamScene';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { buildTitleScreenWorld } from './chapterMapView';
import { attachChapterMapEditor } from './chapterMapEditor';
import { ensurePetAvatars, titleLeadPetAvatarEntry } from '@/config/assetPreload';
import { SidebarEntryButton } from '@/ui/SidebarEntryButton';
import { DesktopShortcutEntryButton } from '@/ui/DesktopShortcutEntryButton';
import { DesktopShortcutService } from '@/core/DesktopShortcutService';
import { Platform } from '@/core/PlatformService';

declare const GameGlobal: any;

export interface TitleEnterData {
  /** 进入时选中的章节（默认最新已解锁章） */
  chapter?: number;
  /** 排除法：对齐 L7 手写路径，或逐级加回 TitleScene 特性 */
  minimalStrip?: 'l7like' | 'withAnim' | 'full';
}

export class TitleScene implements Scene {
  readonly name = 'title';
  readonly container = new PIXI.Container();

  /** 底部导航区高度（紫祥云底栏 + 三图标 + 文字标签） */
  private static readonly BOTTOM_RESERVE = BOTTOM_NAV_RESERVE;

  /** 资源条底边 + 间距，章节导航紧贴其下，避免挡住路径顶部节点星级 */
  private static chapterNavY(): number {
    return Game.safeTop + 36 + CURRENCY_ICON_SIZE + 20;
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
    const leadEntry = titleLeadPetAvatarEntry();
    if (leadEntry) void ensurePetAvatars([leadEntry]);
    void Game.warmScenePresent();
  }

  private _rebuild(): void {
    this._editorTeardown?.();
    this._editorTeardown = null;
    this._scroll.detach();
    this._worldRoot = null;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._build();
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

    this._buildResourceBar(w, Game.safeTop + 36);
    this._buildChapterNav(w, TitleScene.chapterNavY());
    this._buildSidebarEntry(w, h);
    this._buildDesktopShortcutEntry(w, h);
    this._buildBottomNav(w, h);
  }

  private _buildBottomNav(w: number, h: number): void {
    buildBottomNav(this.container, w, h);
  }
  private _buildDesktopShortcutEntry(w: number, h: number): void {
    if (!DesktopShortcutService.isAvailable) return;
    const reserve = TitleScene.BOTTOM_RESERVE;
    const btn = new DesktopShortcutEntryButton(w - 130, h - reserve - 72);
    this.container.addChild(btn);
  }

  /** 抖音侧边栏复访入口（平台必接） */
  private _buildSidebarEntry(w: number, h: number): void {
    if (!Platform.isDouyin) return;
    const reserve = TitleScene.BOTTOM_RESERVE;
    const btn = new SidebarEntryButton(w - 56, h - reserve - 72);
    this.container.addChild(btn);
  }

  private _buildResourceBar(w: number, y: number): void {
    const padX = 48;
    this.container.addChild(makeCurrencyRow({
      x: padX, y,
      coins: PlayerData.coins,
      exp: PlayerData.exp,
      lingyu: PlayerData.lingyu,
    }));
  }

  private _buildChapterNav(w: number, y: number): void {
    const gmEditAll = GMManager.isEnabled && this._mapEditMode;
    const chapterUnlocked = gmEditAll || PlayerData.isChapterUnlocked(this._chapter);
    const name = CHAPTER_NAME[this._chapter] ?? `第${this._chapter}章`;
    const idx = CHAPTERS.indexOf(this._chapter);

    const plaque = makeNamePlaque({
      text: name,
      size: 'md',
      disabled: !chapterUnlocked,
      minWidth: 240,
      maxWidth: Math.min(420, w - 160),
    });
    plaque.position.set(w / 2, y);
    if (GMManager.isRuntimeAllowed) {
      plaque.eventMode = 'static';
      plaque.cursor = 'pointer';
      bindPointerTap(plaque, () => GMManager.onTitleTap());
    }
    this.container.addChild(plaque);

    const arrowGap = 10;
    const arrowHalf = 28;
    const halfW = namePlaqueWidth(plaque) / 2;
    const leftX = w / 2 - halfW - arrowGap - arrowHalf;
    const rightX = w / 2 + halfW + arrowGap + arrowHalf;

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
