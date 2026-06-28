/**
 * 标题场景：水墨主视觉 + 灵宠币/经验 + 章节关卡列表 + 底部导航（灵宠/招募/编队）
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { TextureCache } from '@/core/TextureCache';
import { UI, ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import { CHAPTERS, CHAPTER_NAME, stagesOfChapter, stageWaveCount } from '@/balance/stages';
import { getChapterGoal } from '@/balance/chapterGoal';
import { ensurePetAvatars } from '@/config/assetPreload';
import { getStageType } from '@/balance/stageTypes';
import { ECONOMY } from '@/balance/economy';
import { PlayerData } from '@/game/PlayerData';
import { BACKGROUND_IMAGES, UI_IMAGES } from '@/config/Assets';
import {
  COLORS, FONT_SIZE, RADIUS,
  makeText, makePanel, makeIconButton, makeCoverBackground, makeCurrencyRow, staggerIn, popIn,
} from '@/ui';
import { ScrollListController } from '@/ui/ScrollList';
import type { TeamEnterData } from './TeamScene';
import type { PetDetailEnterData } from './PetDetailScene';
import { deferAfterPointerEvent } from '@/utils/deferAfterPointer';
import {
  buildChapterGoalCard, CHAPTER_GOAL_CARD_H, CHAPTER_GOAL_CARD_W,
} from './chapterGoalCard';
import { BootDiag } from '@/core/BootDiag';

export interface TitleEnterData {
  /** 进入时选中的章节（默认最新已解锁章） */
  chapter?: number;
}

export class TitleScene implements Scene {
  readonly name = 'title';
  readonly container = new PIXI.Container();

  /** 底部导航区高度（紫祥云底栏 + 三图标 + 文字标签） */
  private static readonly BOTTOM_RESERVE = 128;
  private static readonly STAGE_ITEM_H = 86;
  private static readonly STAGE_GAP = 12;
  private static readonly GOAL_AFTER_NAV = 28;
  private static readonly GOAL_LIST_GAP = 18;

  private _chapter = 1;
  private _scroll = new ScrollListController();
  private _stageContent: PIXI.Container | null = null;
  private _stageMask: PIXI.Graphics | null = null;

  onEnter(data?: unknown): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    const enter = data as TitleEnterData | undefined;
    this._chapter = enter?.chapter ?? this._latestUnlockedChapter();
    this._rebuild();
  }

  /** 立刻渲染 UI；收录怪头像后台加载，避免分包卡住导致整屏黑 */
  private _rebuild(): void {
    this._scroll.detach();
    this._stageContent = null;
    if (this._stageMask) {
      this._stageMask.destroy();
      this._stageMask = null;
    }
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._build();
    void this._preloadGoalAvatar();
  }

  private async _preloadGoalAvatar(): Promise<void> {
    const goal = getChapterGoal(this._chapter);
    if (!goal) return;
    try {
      await ensurePetAvatars([{ petId: goal.petId, star: 1 }]);
    } catch (e) {
      console.warn('[TitleScene] 章节收录头像加载失败（不影响首屏）:', e);
    }
  }

  private _latestUnlockedChapter(): number {
    let latest = CHAPTERS[0];
    for (const ch of CHAPTERS) {
      if (PlayerData.isChapterUnlocked(ch)) latest = ch;
    }
    return latest;
  }

  onExit(): void {
    this._scroll.detach();
    this._stageContent = null;
    if (this._stageMask) {
      this._stageMask.destroy();
      this._stageMask = null;
    }
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    this._buildBackground(w, h);
    this._buildResourceBar(w, Game.safeTop + 36);

    const logoTex = TextureCache.get(UI_IMAGES.titleLogo);
    const logoY = Game.safeTop + 168;
    if (logoTex) {
      const logo = new PIXI.Sprite(logoTex);
      logo.anchor.set(0.5);
      const logoW = 340;
      logo.scale.set(logoW / logoTex.width);
      logo.position.set(w / 2, logoY);
      this.container.addChild(logo);
    } else {
      const title = makeText('灵宠消消塔', { size: FONT_SIZE.xl, fill: COLORS.textTitle, bold: true, anchor: 0.5 });
      title.position.set(w / 2, logoY);
      this.container.addChild(title);
    }

    const navY = Game.safeTop + 268;
    this._buildChapterNav(w, navY);

    const goalTop = navY + TitleScene.GOAL_AFTER_NAV;
    const goalBottom = this._buildChapterGoal(w, goalTop);
    const listTop = goalBottom + TitleScene.GOAL_LIST_GAP;
    const listBottom = h - TitleScene.BOTTOM_RESERVE - 12;
    this._buildStageList(w, listTop, listBottom);
    this._buildBottomNav(w, h);

    const homeTex = TextureCache.get(BACKGROUND_IMAGES.home);
    BootDiag.log(
      'TitleScene._build',
      `children=${this.container.children.length} `
      + `homeTex=${!!homeTex} logoTex=${!!logoTex} chapter=${this._chapter}`,
    );
  }

  private _buildBackground(w: number, h: number): void {
    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.home, w, h));
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
    const chapterUnlocked = PlayerData.isChapterUnlocked(this._chapter);
    const name = CHAPTER_NAME[this._chapter] ?? `第${this._chapter}章`;
    const idx = CHAPTERS.indexOf(this._chapter);

    const label = makeText(`— ${name} —`, {
      size: FONT_SIZE.md, fill: chapterUnlocked ? COLORS.textTitle : COLORS.textDisabled,
      bold: true, anchor: 0.5,
    });
    label.position.set(w / 2, y);
    this.container.addChild(label);

    const mkArrow = (text: string, x: number, targetChapter: number | null): void => {
      const enabled = targetChapter !== null && PlayerData.isChapterUnlocked(targetChapter);
      const arrow = makeText(text, {
        size: FONT_SIZE.lg, fill: enabled ? COLORS.accent : COLORS.panelBorderSoft,
        bold: true, anchor: 0.5,
      });
      arrow.position.set(x, y);
      if (enabled) {
        arrow.eventMode = 'static';
        arrow.cursor = 'pointer';
        arrow.on('pointertap', () => {
          this._chapter = targetChapter!;
          deferAfterPointerEvent(() => { this._rebuild(); });
        });
      }
      this.container.addChild(arrow);
    };
    mkArrow('◀', w / 2 - 220, idx > 0 ? CHAPTERS[idx - 1] : null);
    mkArrow('▶', w / 2 + 220, idx < CHAPTERS.length - 1 ? CHAPTERS[idx + 1] : null);
  }

  /** @returns 卡片底边 Y（设计坐标） */
  private _buildChapterGoal(w: number, topY: number): number {
    const goal = getChapterGoal(this._chapter);
    if (!goal) return topY;

    const wrap = new PIXI.Container();
    wrap.position.set(w / 2, topY + CHAPTER_GOAL_CARD_H / 2);
    const card = buildChapterGoalCard(goal, {
      width: CHAPTER_GOAL_CARD_W,
      onTap: () => {
        SceneManager.switchTo('petDetail', {
          petId: goal.petId,
          backScene: 'title',
          backData: { chapter: this._chapter } satisfies TitleEnterData,
          preview: true,
        } satisfies PetDetailEnterData);
      },
    });
    wrap.addChild(card);
    this.container.addChild(wrap);
    popIn(wrap, { fromScale: 0.94 });

    return topY + CHAPTER_GOAL_CARD_H;
  }

  private _buildStageList(w: number, listTop: number, listBottom: number): void {
    this._scroll.detach();
    if (this._stageMask) {
      this.container.removeChild(this._stageMask);
      this._stageMask.destroy();
      this._stageMask = null;
    }
    if (this._stageContent) {
      this._stageContent.destroy({ children: true });
      this._stageContent = null;
    }

    const stages = stagesOfChapter(this._chapter);
    const itemW = CHAPTER_GOAL_CARD_W;
    const itemH = TitleScene.STAGE_ITEM_H;
    const gap = TitleScene.STAGE_GAP;
    const content = new PIXI.Container();
    content.position.set(0, listTop);
    this._stageContent = content;
    this.container.addChild(content);

    const items: PIXI.Container[] = [];
    let maxBottom = 0;

    stages.forEach((stage, i) => {
      const unlocked = PlayerData.isUnlocked(stage);
      const stars = PlayerData.starsOf(stage.id);
      const typeDef = getStageType(stage.type);
      const y = i * (itemH + gap);

      const item = new PIXI.Container();
      item.position.set(w / 2, y + itemH / 2);

      const itemBg = makePanel({
        width: itemW, height: itemH, radius: RADIUS.card,
        bg: unlocked ? COLORS.panelBg : COLORS.panelBgAlt,
        bgAlpha: unlocked ? 0.96 : 0.82,
        border: unlocked ? ORB_COLOR[stage.element] : COLORS.panelBorderSoft,
        borderAlpha: unlocked ? 1 : 0.6,
      });
      item.addChild(itemBg);

      const nameText = makeText(`${stage.chapter}-${stage.index}  ${stage.name}`, {
        size: FONT_SIZE.md, fill: unlocked ? COLORS.textMain : COLORS.textDisabled,
        bold: true, anchor: [0, 0.5],
      });
      nameText.position.set(-itemW / 2 + 28, -14);
      item.addChild(nameText);

      if (stage.isBoss) {
        const capBadge = makeText('收录', {
          size: FONT_SIZE.xs, fill: COLORS.accent, bold: true, anchor: [0, 0.5],
        });
        capBadge.position.set(-itemW / 2 + 28 + nameText.width + 14, -14);
        item.addChild(capBadge);
      } else if (stage.type !== 'normal') {
        const badge = makeText(typeDef.name, {
          size: FONT_SIZE.xs, fill: unlocked ? typeDef.color : COLORS.textDisabled, bold: true, anchor: [0, 0.5],
        });
        badge.position.set(-itemW / 2 + 28 + nameText.width + 14, -14);
        item.addChild(badge);
      }

      const tagSuffix = stage.hintTags && stage.hintTags.length > 0
        ? ` · ${stage.hintTags.join('·')}`
        : '';
      const subText = makeText(
        unlocked
          ? `${ELEMENT_NAME[stage.element]} · ${stageWaveCount(stage)}波${tagSuffix}`
          : (stage.index === 1 ? '通关上一章 Boss 解锁' : '通关上一关解锁'),
        { size: FONT_SIZE.xs, fill: unlocked ? COLORS.textSub : COLORS.textDisabled, anchor: [0, 0.5] },
      );
      subText.position.set(-itemW / 2 + 28, 18);
      item.addChild(subText);

      const rightText = makeText(
        unlocked ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '未解锁',
        unlocked
          ? { size: FONT_SIZE.lg, fill: COLORS.accent, anchor: [1, 0.5] }
          : { size: FONT_SIZE.sm, fill: COLORS.textDisabled, anchor: [1, 0.5] },
      );
      rightText.position.set(itemW / 2 - 24, 0);
      item.addChild(rightText);

      if (unlocked) {
        item.eventMode = 'static';
        item.cursor = 'pointer';
        item.on('pointertap', () => {
          if (this._scroll.moved) return;
          SceneManager.switchTo('team', { stageId: stage.id } satisfies TeamEnterData);
        });
      }

      content.addChild(item);
      items.push(item);
      maxBottom = Math.max(maxBottom, y + itemH);
    });

    staggerIn(items, { stepDelay: 0.04, offsetY: 16 });

    const viewportH = listBottom - listTop;
    const contentH = maxBottom + gap;
    const scrollMin = Math.min(listTop, listTop - Math.max(0, contentH - viewportH));

    if (contentH > viewportH) {
      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      mask.drawRect(0, listTop, w, viewportH);
      mask.endFill();
      this.container.addChild(mask);
      this._stageMask = mask;
      content.mask = mask;

      this._scroll.attach({
        content: () => this._stageContent,
        viewportTop: listTop,
        viewportH,
        scrollMin,
        listTop,
        moveThreshold: 2,
      });
    }
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

  private _refresh(): void {
    this._rebuild();
  }
}
