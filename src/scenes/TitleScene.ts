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
import { CHAPTERS, CHAPTER_NAME, STAGE_MAP, stagesOfChapter } from '@/balance/stages';
import { resolveHomeDisplay } from '@/balance/chapterMap';
import { PlayerData } from '@/game/PlayerData';
import { reportQuest } from '@/game/dailyQuestTracker';
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
import { showStageEntryDialog, type StageEntryDialogHandle } from './StageEntryDialog';
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
  /** 进入时选中的章节（切章 / 返回时带回刚才那一章；缺省用存档落点章） */
  chapter?: number;
  /** 排除法：对齐 L7 手写路径，或逐级加回 TitleScene 特性 */
  minimalStrip?: 'l7like' | 'withAnim' | 'full';
}

/** 所有「返回主页」共用：把刚才点的章带回去，避免被进度章抢走 */
export function titleBackData(): TitleEnterData | undefined {
  return PlayerData.titleEnter();
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
  /** 地图高亮关；切章浏览时为 null，用章内第一未通关 */
  private _focusStageId: string | null = null;
  private _minimalStrip: TitleEnterData['minimalStrip'];
  private _scroll = new ScrollListController();
  private _worldRoot: PIXI.Container | null = null;
  private _dialogLayer: PIXI.Container | null = null;
  private _stageEntry: StageEntryDialogHandle | null = null;
  private _mapEditMode = false;
  private _editorTeardown: (() => void) | null = null;
  private _onMapEditToggle = (): void => {
    if (!GMManager.isEnabled) return;
    this._mapEditMode = !this._mapEditMode;
    this._rebuild();
  };
  /** 签到/任务领奖后回到首页时，货币与左栏红点都要跟着变 */
  private _onHomeRefresh = (): void => {
    if (SceneManager.current?.name !== 'title') return;
    this._rebuild();
  };
  /** GM 跳关后切到目标章并重建地图 */
  private _onFocusChapter = (chapter: unknown): void => {
    if (typeof chapter !== 'number' || !Number.isFinite(chapter)) return;
    if (!CHAPTERS.includes(chapter)) return;
    this._chapter = chapter;
    this._focusStageId = null;
    PlayerData.setHomeChapter(chapter);
    PlayerData.clearHomeStage();
    if (SceneManager.current?.name === 'title') this._rebuild();
  };

  onEnter(data?: unknown): void {
    EventBus.on('gm:mapEditToggle', this._onMapEditToggle);
    EventBus.on('gm:focusChapter', this._onFocusChapter);
    EventBus.on('home:refresh', this._onHomeRefresh);
    const enter = data as TitleEnterData | undefined;
    this._minimalStrip = enter?.minimalStrip;
    if (this._minimalStrip !== 'l7like') {
      Game.setMaxFPS(UI.fps.idle);
    }
    PlayerData.load();
    const display = this._resolveHomeDisplay(enter?.chapter);
    this._chapter = display.chapter;
    this._focusStageId = display.stageId;
    // 只把章写回：高亮关是展示结果，写回会把「已通关→下一关」跨章结果存进档，下次返回就粘在进度章
    PlayerData.setHomeChapter(display.chapter);
    if (SceneManager.current?.name !== 'title') return;
    this._rebuild();
    reportQuest('login');
    void ensurePetAvatars(titleHomePetAvatarEntries(this._chapter));
    void Game.warmScenePresent();
  }

  private _rebuild(): void {
    this._stageEntry?.dismiss();
    this._stageEntry = null;
    this._editorTeardown?.();
    this._editorTeardown = null;
    this._scroll.detach();
    this._worldRoot = null;
    this._dialogLayer = null;
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

  /**
   * 点过的章就停在该章。选过关且已打过，只在该章内高亮下一关，绝不跳到进度章。
   */
  private _resolveHomeDisplay(preferred?: number) {
    return resolveHomeDisplay({
      preferred,
      rememberedChapter: PlayerData.homeChapter,
      rememberedStageId: PlayerData.homeStageId,
      latestUnlocked: this._latestUnlockedChapter(),
      chapters: CHAPTERS,
      isChapterUnlocked: (ch) => PlayerData.isChapterUnlocked(ch),
      stagesOfChapter,
      starsOf: (id) => PlayerData.starsOf(id),
      isUnlocked: (s) => PlayerData.isUnlocked(s),
    });
  }

  onExit(): void {
    EventBus.off('gm:mapEditToggle', this._onMapEditToggle);
    EventBus.off('gm:focusChapter', this._onFocusChapter);
    EventBus.off('home:refresh', this._onHomeRefresh);
    this._stageEntry?.dismiss();
    this._stageEntry = null;
    this._editorTeardown?.();
    this._editorTeardown = null;
    this._mapEditMode = false;
    this._scroll.detach();
    this._worldRoot = null;
    this._dialogLayer = null;
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
        this._openStageEntry(stageId);
      },
      focusStageId: this._focusStageId,
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

    // 弹层置顶：盖住地图与导航
    this._dialogLayer = new PIXI.Container();
    this.container.addChild(this._dialogLayer);
  }

  /** 点关 → 详情弹层 → 确认后再进编队 */
  private _openStageEntry(stageId: string): void {
    const stage = STAGE_MAP.get(stageId);
    if (!stage || !this._dialogLayer) return;
    this._stageEntry?.dismiss();
    this._stageEntry = showStageEntryDialog(this._dialogLayer, stage, {
      onConfirm: (id) => {
        this._stageEntry = null;
        const stage = STAGE_MAP.get(id);
        if (stage) PlayerData.setHomeStage(stage.id);
        SceneManager.switchTo('team', { stageId: id } satisfies TeamEnterData);
      },
      onClose: () => {
        this._stageEntry = null;
      },
    });
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

    const nameLeft = avSize / 2 + 12;
    const name = makeText(HOME_DISPLAY_NAME, {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    });
    try { name.updateText(true); } catch { /* noop */ }
    name.position.set(nameLeft, 0);
    profile.addChild(name);
    this.container.addChild(profile);

    const stamina = makeCurrencyLabel(
      'stamina', PlayerData.stamina, undefined,
      `${PlayerData.stamina}/${PlayerData.staminaMax}`,
    );
    // 体力是消耗最快的资源，点一下直达回体面板（也是主要 IAA 位）
    stamina.eventMode = 'static';
    stamina.cursor = 'pointer';
    bindPointerTap(stamina, () => EventBus.emit('stamina:open', 0));
    const lingyu = makeCurrencyLabel('lingyu', PlayerData.lingyu);
    const coins = makeCurrencyLabel('coin', PlayerData.coins);
    const items = [stamina, lingyu, coins];
    const rightLimit = Game.contentRightX(GMManager.isEnabled ? 72 : 28);
    const nameGap = 18;
    const measureRow = (g: number): number =>
      items.reduce((s, it) => s + it.width, 0) + g * (items.length - 1);

    // 货币不得叠昵称：空间不够先压 gap，再截断昵称；禁止再把整行往左拽到名字上
    let gap = 14;
    while (gap > 6 && padX + nameLeft + name.width + nameGap + measureRow(gap) > rightLimit) {
      gap -= 2;
    }
    const nameMaxW = Math.max(
      64,
      rightLimit - padX - nameLeft - nameGap - measureRow(gap),
    );
    if (name.width > nameMaxW) {
      let t = HOME_DISPLAY_NAME;
      while (t.length > 1) {
        t = t.slice(0, -1);
        name.text = `${t}…`;
        try { name.updateText(true); } catch { /* noop */ }
        if (name.width <= nameMaxW) break;
      }
    }

    let rowX = padX + nameLeft + name.width + nameGap;
    for (const item of items) {
      item.position.set(rowX, centerY);
      this.container.addChild(item);
      rowX += item.width + gap;
    }
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
          this._focusStageId = null;
          PlayerData.setHomeChapter(this._chapter);
          PlayerData.clearHomeStage();
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
