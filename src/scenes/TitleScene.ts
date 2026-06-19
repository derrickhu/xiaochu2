/**
 * 标题场景：水墨主视觉 + 灵宠币/经验 + 章节关卡列表 + 底部导航（灵宠/招募/编队）
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { Platform } from '@/core/PlatformService';
import { TextureCache } from '@/core/TextureCache';
import { UI, ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import { CHAPTERS, CHAPTER_NAME, stagesOfChapter } from '@/balance/stages';
import { getStageType } from '@/balance/stageTypes';
import { PET_MAP } from '@/balance/pets';
import { PlayerData } from '@/game/PlayerData';
import { BACKGROUND_IMAGES, UI_IMAGES } from '@/config/Assets';
import {
  COLORS, FONT_SIZE, RADIUS,
  makeText, makePanel, makeIconButton, makeIconLabel, makeCoverBackground,
} from '@/ui';
import type { BattleEnterData } from './BattleScene';

export class TitleScene implements Scene {
  readonly name = 'title';
  readonly container = new PIXI.Container();

  /** 底部导航区高度（紫祥云底栏 + 三图标 + 文字标签） */
  private static readonly BOTTOM_RESERVE = 128;

  /** 当前选中章节（进入时定位到最新已解锁章节） */
  private _chapter = 1;

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    this._chapter = this._latestUnlockedChapter();
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
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    this._buildBackground(w, h);

    // 顶栏：灵宠币 + 经验（资源图标置顶，更符合手游习惯）
    this._buildResourceBar(w, Game.safeTop + 36);

    // 标题 logo（水墨书法「灵宠消消塔」，置于资源条下方，留足间距防重叠）
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

    this._buildChapterNav(w, Game.safeTop + 268);
    this._buildStageList(w, Game.safeTop + 320);
    this._buildBottomNav(w, h);
  }

  /** 主背景：home_bg cover 铺满，缺图回退暖米白 */
  private _buildBackground(w: number, h: number): void {
    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.home, w, h));
  }

  /** 灵宠币 + 经验，左对齐并排 */
  private _buildResourceBar(w: number, y: number): void {
    const padX = 48;
    const coin = makeIconLabel({
      iconPath: UI_IMAGES.iconCoin, iconSize: 38,
      text: `${PlayerData.coins}`, size: FONT_SIZE.md, fill: COLORS.textMain,
    });
    const exp = makeIconLabel({
      iconPath: UI_IMAGES.iconExp, iconSize: 38,
      text: `${PlayerData.exp}`, size: FONT_SIZE.md, fill: COLORS.textMain,
    });
    const gap = 48;
    coin.position.set(padX, y);
    exp.position.set(padX + coin.width + gap, y);
    this.container.addChild(coin, exp);
  }

  /** 章节切换：◀ 章节名 ▶ */
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
        arrow.on('pointertap', () => { this._chapter = targetChapter!; this._refresh(); });
      }
      this.container.addChild(arrow);
    };
    mkArrow('◀', w / 2 - 220, idx > 0 ? CHAPTERS[idx - 1] : null);
    mkArrow('▶', w / 2 + 220, idx < CHAPTERS.length - 1 ? CHAPTERS[idx + 1] : null);
  }

  private _buildStageList(w: number, startY: number): void {
    const stages = stagesOfChapter(this._chapter);
    const itemW = 620;
    const itemH = 86;
    const gap = 12;

    stages.forEach((stage, i) => {
      const unlocked = PlayerData.isUnlocked(stage);
      const stars = PlayerData.starsOf(stage.id);
      const typeDef = getStageType(stage.type);

      const item = new PIXI.Container();
      item.position.set(w / 2, startY + i * (itemH + gap) + itemH / 2);

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

      // 关卡类型徽标（颜色取自 stageTypes 单一真源）
      if (stage.type !== 'normal') {
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
          ? `${ELEMENT_NAME[stage.element]} · ${stage.enemies.length}波${tagSuffix}`
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
          SceneManager.switchTo('battle', { stageId: stage.id } satisfies BattleEnterData);
        });
      }

      this.container.addChild(item);
    });
  }

  /** 底部导航：灵宠 / 招募 / 编队 */
  private _buildBottomNav(w: number, h: number): void {
    const reserve = TitleScene.BOTTOM_RESERVE;
    const navTop = h - reserve;
    const price = PlayerData.nextRecruitPrice();
    const canRecruit = PlayerData.coins >= price;

    // 底栏背景：紫祥云贴图（缺图回退纯色条）
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

    // 三按钮均分底栏（贴图图标 + 文字标签，略上移、略放大）
    const navIconSize = 68;
    const btnY = navTop + 56;
    const slots: { label: string; icon: string; x: number; onTap: () => void; active?: boolean }[] = [
      { label: '灵宠', icon: UI_IMAGES.navPet, x: w * 0.2, onTap: () => SceneManager.switchTo('codex') },
      {
        label: '招募', icon: UI_IMAGES.iconRecruit, x: w * 0.5, active: canRecruit, onTap: () => {
          const result = PlayerData.recruit();
          if (!result) {
            Platform.showToast(`灵宠币不足（需 ${price}）`);
            return;
          }
          Platform.vibrateShort('medium');
          if (result.duplicate) {
            const pet = PET_MAP.get(result.petId);
            Platform.showToast(`已全收集，${pet?.name ?? ''} +${result.shards} 碎片`);
          } else {
            const pet = PET_MAP.get(result.petId);
            Platform.showToast(`招募成功：${pet?.name ?? ''}`);
          }
          this._refresh();
        },
      },
      { label: '编队', icon: UI_IMAGES.navTeam, x: w * 0.8, onTap: () => SceneManager.switchTo('team') },
    ];
    for (const s of slots) {
      const btn = makeIconButton({
        iconPath: s.icon, iconSize: navIconSize,
        label: s.label, labelSize: 23,
        labelColor: s.active ? COLORS.navTextActive : COLORS.navText,
        onTap: s.onTap,
      });
      btn.position.set(s.x, btnY);
      this.container.addChild(btn);
    }
  }

  private _refresh(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._build();
  }
}
