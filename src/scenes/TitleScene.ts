/**
 * 标题场景：游戏名 + 灵宠币 + 章节关卡列表 + 底部导航（图鉴 / 招募 / 编队）
 *
 * 每次 onEnter 重建，保证通关后星数与解锁状态即时刷新。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { Platform } from '@/core/PlatformService';
import { UI, ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import { CHAPTERS, CHAPTER_NAME, stagesOfChapter } from '@/balance/stages';
import { getStageType } from '@/balance/stageTypes';
import { PET_MAP } from '@/balance/pets';
import { getRarity } from '@/balance/rarity';
import { PlayerData } from '@/game/PlayerData';
import type { BattleEnterData } from './BattleScene';

export class TitleScene implements Scene {
  readonly name = 'title';
  readonly container = new PIXI.Container();

  /** 底部导航区高度（含招募提示一行） */
  private static readonly BOTTOM_RESERVE = 138;

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

    const bg = new PIXI.Graphics();
    bg.beginFill(0x1a1126);
    bg.drawRect(0, 0, w, h);
    bg.endFill();
    this.container.addChild(bg);

    const title = new PIXI.Text('灵宠消消塔 2', {
      fontSize: 64,
      fill: 0xffe9a6,
      fontWeight: 'bold',
    });
    title.anchor.set(0.5);
    title.position.set(w / 2, Game.safeTop + 72);
    this.container.addChild(title);

    // 资源：灵宠币 + 经验池（升级材料，通关掉落）
    const resText = new PIXI.Text(
      `灵宠币 ${PlayerData.coins}    经验 ${PlayerData.exp}`,
      { fontSize: 26, fill: 0xffd75e, fontWeight: 'bold' },
    );
    resText.anchor.set(0.5);
    resText.position.set(w / 2, Game.safeTop + 124);
    this.container.addChild(resText);

    const resHint = new PIXI.Text('通关获经验/碎片 · 「编队」点灵宠升级升星', {
      fontSize: 18, fill: 0x9b8cc4,
    });
    resHint.anchor.set(0.5);
    resHint.position.set(w / 2, Game.safeTop + 152);
    this.container.addChild(resHint);

    // 中部：章节 + 关卡（底部留给导航，不再被按钮遮挡）
    this._buildChapterNav(w, Game.safeTop + 188);
    this._buildStageList(w, Game.safeTop + 240);
    this._buildBottomNav(w, h);
  }

  /** 章节切换：◀ 章节名 ▶（未解锁章节灰显不可切） */
  private _buildChapterNav(w: number, y: number): void {
    const chapterUnlocked = PlayerData.isChapterUnlocked(this._chapter);
    const name = CHAPTER_NAME[this._chapter] ?? `第${this._chapter}章`;
    const idx = CHAPTERS.indexOf(this._chapter);

    const label = new PIXI.Text(`— ${name} —`, { fontSize: 30, fill: chapterUnlocked ? 0xffe9a6 : 0x6a5d8a });
    label.anchor.set(0.5);
    label.position.set(w / 2, y);
    this.container.addChild(label);

    const mkArrow = (text: string, x: number, targetChapter: number | null): void => {
      const enabled = targetChapter !== null && PlayerData.isChapterUnlocked(targetChapter);
      const arrow = new PIXI.Text(text, { fontSize: 40, fill: enabled ? 0xffd75e : 0x4a3a72, fontWeight: 'bold' });
      arrow.anchor.set(0.5);
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

      const itemBg = new PIXI.Graphics();
      itemBg.beginFill(unlocked ? 0x2e2148 : 0x221a33);
      itemBg.lineStyle(3, unlocked ? ORB_COLOR[stage.element] : 0x3a2d58, unlocked ? 1 : 0.5);
      itemBg.drawRoundedRect(-itemW / 2, -itemH / 2, itemW, itemH, 18);
      itemBg.endFill();
      item.addChild(itemBg);

      const nameText = new PIXI.Text(
        `${stage.chapter}-${stage.index}  ${stage.name}`,
        { fontSize: 27, fill: unlocked ? 0xffffff : 0x6a5d8a, fontWeight: 'bold' },
      );
      nameText.anchor.set(0, 0.5);
      nameText.position.set(-itemW / 2 + 28, -14);
      item.addChild(nameText);

      // 关卡类型徽标（颜色取自 stageTypes 单一真源）
      if (stage.type !== 'normal') {
        const badge = new PIXI.Text(typeDef.name, {
          fontSize: 18, fill: unlocked ? typeDef.color : 0x5a4d78, fontWeight: 'bold',
        });
        badge.anchor.set(0, 0.5);
        badge.position.set(-itemW / 2 + 28 + nameText.width + 14, -14);
        item.addChild(badge);
      }

      const tagSuffix = stage.hintTags && stage.hintTags.length > 0
        ? ` · ${stage.hintTags.join('·')}`
        : '';
      const subText = new PIXI.Text(
        unlocked
          ? `${ELEMENT_NAME[stage.element]} · ${stage.enemies.length}波${tagSuffix}`
          : (stage.index === 1 ? '通关上一章 Boss 解锁' : '通关上一关解锁'),
        { fontSize: 19, fill: unlocked ? 0x9b8cc4 : 0x5a4d78 },
      );
      subText.anchor.set(0, 0.5);
      subText.position.set(-itemW / 2 + 28, 18);
      item.addChild(subText);

      const rightText = new PIXI.Text(
        unlocked ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '未解锁',
        unlocked ? { fontSize: 32, fill: 0xffd75e } : { fontSize: 24, fill: 0x5a4d78 },
      );
      rightText.anchor.set(1, 0.5);
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

  /** 底部导航：招募进度 + 图鉴 / 招募 / 编队 */
  private _buildBottomNav(w: number, h: number): void {
    const reserve = TitleScene.BOTTOM_RESERVE;
    const navTop = h - reserve;
    const next = PlayerData.nextRecruit();
    const price = PlayerData.nextRecruitPrice();
    const coins = PlayerData.coins;
    const ratio = Math.min(1, coins / price);
    const canRecruit = coins >= price;

    // 底栏背景
    const barBg = new PIXI.Graphics();
    barBg.beginFill(0x120e1c, 0.96);
    barBg.lineStyle(2, 0x3a2d58, 0.8);
    barBg.drawRect(0, navTop, w, reserve);
    barBg.endFill();
    this.container.addChild(barBg);

    // 招募进度（单行 + 细进度条，不占中部空间）
    let hint: string;
    if (next) {
      const pet = PET_MAP.get(next);
      const rd = pet ? getRarity(pet.rarity) : null;
      const who = pet ? `${rd?.code} ${pet.name}` : '神秘灵宠';
      hint = coins >= price ? `可招募 ${who}（${price} 币）` : `${who} 还差 ${price - coins} 币`;
    } else {
      hint = coins >= price
        ? `已全收集 · 招募转碎片（${price} 币）`
        : `已全收集 · 转碎片还差 ${price - coins} 币`;
    }
    const hintText = new PIXI.Text(hint, { fontSize: 18, fill: 0x9b8cc4 });
    hintText.anchor.set(0.5);
    hintText.position.set(w / 2, navTop + 22);
    this.container.addChild(hintText);

    const barW = 480;
    const barH = 8;
    const barX = w / 2 - barW / 2;
    const barY = navTop + 42;
    const track = new PIXI.Graphics();
    track.beginFill(0x2e2148);
    track.drawRoundedRect(barX, barY, barW, barH, barH / 2);
    track.endFill();
    this.container.addChild(track);
    const fill = new PIXI.Graphics();
    fill.beginFill(ratio >= 1 ? 0x6fd86a : 0xffd75e);
    fill.drawRoundedRect(barX, barY, Math.max(barH, barW * ratio), barH, barH / 2);
    fill.endFill();
    this.container.addChild(fill);

    // 三按钮均分底栏
    const btnY = navTop + 92;
    const slots = [
      { label: '图鉴', color: 0x3a5a8c, x: w * 0.2, onTap: () => SceneManager.switchTo('codex') },
      {
        label: '招募', color: canRecruit ? 0x8c5ad6 : 0x35303f, x: w * 0.5, onTap: () => {
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
      { label: '编队', color: 0x4a3a72, x: w * 0.8, onTap: () => SceneManager.switchTo('team') },
    ];
    for (const s of slots) {
      const btn = this._makeNavButton(s.label, s.color, s.onTap);
      btn.position.set(s.x, btnY);
      this.container.addChild(btn);
    }
  }

  private _refresh(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._build();
  }

  private _makeNavButton(label: string, color: number, onTap: () => void): PIXI.Container {
    const btnW = 128;
    const btnH = 50;
    const btn = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.beginFill(color);
    bg.lineStyle(2, 0xffe082);
    bg.drawRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
    bg.endFill();
    btn.addChild(bg);
    const text = new PIXI.Text(label, { fontSize: 26, fill: 0xffffff, fontWeight: 'bold' });
    text.anchor.set(0.5);
    btn.addChild(text);
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', onTap);
    return btn;
  }
}
