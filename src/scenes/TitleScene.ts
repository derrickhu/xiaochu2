/**
 * 标题场景：全屏修仙背景 + 资源条 + 章节路径节点 + 底部导航
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { TextureCache } from '@/core/TextureCache';
import { UI } from '@/balance/ui';
import { CHAPTERS, CHAPTER_NAME, stagesOfChapter } from '@/balance/stages';
import { ECONOMY } from '@/balance/economy';
import { PlayerData } from '@/game/PlayerData';
import { UI_IMAGES } from '@/config/Assets';
import {
  COLORS, FONT_SIZE,
  makeText, makeIconButton, makeCurrencyRow, makeChapterNavArrow, CURRENCY_ICON_SIZE,
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
  private static readonly BOTTOM_RESERVE = 128;

  /** 资源条底边 + 间距，章节导航紧贴其下，避免挡住路径顶部节点星级 */
  private static chapterNavY(): number {
    return Game.safeTop + 36 + CURRENCY_ICON_SIZE + 10;
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

  /** 抖音添加到桌面入口（广告金政策必接） */
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

    const label = makeText(name, {
      size: FONT_SIZE.md, fill: chapterUnlocked ? COLORS.textTitle : COLORS.textDisabled,
      bold: true, anchor: 0.5,
      strokeColor: 0xfdf3df, strokeWidth: 3,
    });
    label.position.set(w / 2, y);
    if (GMManager.isRuntimeAllowed) {
      label.eventMode = 'static';
      bindPointerTap(label, () => GMManager.onTitleTap());
    }
    this.container.addChild(label);

    const arrowGap = 14;
    const arrowHalf = 28;
    const leftX = w / 2 - label.width / 2 - arrowGap - arrowHalf;
    const rightX = w / 2 + label.width / 2 + arrowGap + arrowHalf;

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

  private _buildBottomNav(w: number, h: number): void {
    const reserve = TitleScene.BOTTOM_RESERVE;
    const navTop = h - reserve;

    const navTex = TextureCache.get(UI_IMAGES.navBar);
    if (navTex) {
      const navBg = new PIXI.Sprite(navTex);
      navBg.anchor.set(0.5, 1);
      const scale = w / navTex.width;
      navBg.scale.set(scale);
      navBg.position.set(w / 2, h);
      this.container.addChild(navBg);
    } else {
      const barBg = new PIXI.Graphics();
      barBg.beginFill(COLORS.navBarFallback, 0.96);
      barBg.drawRect(0, navTop, w, reserve);
      barBg.endFill();
      this.container.addChild(barBg);
    }

    const navIconSize = 64;
    const btnY = navTop + 56;
    const canGacha = PlayerData.lingyu >= ECONOMY.gacha.singleCost;
    const slots: { label: string; icon: string; x: number; onTap: () => void; active?: boolean }[] = [
      { label: '灵宠', icon: UI_IMAGES.navPet, x: w * 0.14, onTap: () => SceneManager.switchTo('codex') },
      { label: '召唤', icon: UI_IMAGES.iconRecruit, x: w * 0.38, active: canGacha, onTap: () => SceneManager.switchTo('gacha') },
      { label: '商店', icon: UI_IMAGES.iconCoin, x: w * 0.62, onTap: () => SceneManager.switchTo('shop') },
      { label: '编队', icon: UI_IMAGES.navTeam, x: w * 0.86, onTap: () => SceneManager.switchTo('team') },
    ];
    for (const s of slots) {
      const btn = makeIconButton({
        iconPath: s.icon, iconSize: navIconSize,
        label: s.label, labelSize: 22,
        labelColor: s.active ? COLORS.navTextActive : COLORS.navText,
        onTap: s.onTap,
      });
      btn.position.set(s.x, btnY);
      this.container.addChild(btn);
    }
  }
}
