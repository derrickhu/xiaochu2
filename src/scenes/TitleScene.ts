/**
 * 标题场景：游戏名 + 灵宠币持有 + 第一章关卡列表（解锁/星数）
 *
 * 每次 onEnter 重建，保证通关后星数与解锁状态即时刷新。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { UI, ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import { STAGES } from '@/balance/stages';
import { PlayerData } from '@/game/PlayerData';
import type { BattleEnterData } from './BattleScene';

export class TitleScene implements Scene {
  readonly name = 'title';
  readonly container = new PIXI.Container();

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    this._build();
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
    title.position.set(w / 2, Game.safeTop + 90);
    this.container.addChild(title);

    // 灵宠币持有
    const coinText = new PIXI.Text(`灵宠币 ${PlayerData.coins}`, {
      fontSize: 30,
      fill: 0xffd75e,
      fontWeight: 'bold',
    });
    coinText.anchor.set(0.5);
    coinText.position.set(w / 2, Game.safeTop + 150);
    this.container.addChild(coinText);

    // 章节标题
    const chapterText = new PIXI.Text('— 第一章 · 灵兽森林 —', {
      fontSize: 32,
      fill: 0x9b8cc4,
    });
    chapterText.anchor.set(0.5);
    chapterText.position.set(w / 2, Game.safeTop + 230);
    this.container.addChild(chapterText);

    // 关卡列表
    const itemW = 600;
    const itemH = 110;
    const gap = 24;
    const startY = Game.safeTop + 310;

    STAGES.forEach((stage, i) => {
      const unlocked = PlayerData.isUnlocked(stage);
      const stars = PlayerData.starsOf(stage.id);

      const item = new PIXI.Container();
      item.position.set(w / 2, startY + i * (itemH + gap) + itemH / 2);

      const itemBg = new PIXI.Graphics();
      itemBg.beginFill(unlocked ? 0x2e2148 : 0x221a33);
      itemBg.lineStyle(3, unlocked ? ORB_COLOR[stage.element] : 0x3a2d58, unlocked ? 1 : 0.5);
      itemBg.drawRoundedRect(-itemW / 2, -itemH / 2, itemW, itemH, 20);
      itemBg.endFill();
      item.addChild(itemBg);

      const nameText = new PIXI.Text(
        `${stage.chapter}-${stage.index}  ${stage.name}${stage.isBoss ? ' · BOSS' : ''}`,
        {
          fontSize: 32,
          fill: unlocked ? 0xffffff : 0x6a5d8a,
          fontWeight: 'bold',
        },
      );
      nameText.anchor.set(0, 0.5);
      nameText.position.set(-itemW / 2 + 30, -16);
      item.addChild(nameText);

      const subText = new PIXI.Text(
        unlocked
          ? `${ELEMENT_NAME[stage.element]}属性关卡 · ${stage.enemies.length} 波敌人`
          : '通关上一关解锁',
        { fontSize: 22, fill: unlocked ? 0x9b8cc4 : 0x5a4d78 },
      );
      subText.anchor.set(0, 0.5);
      subText.position.set(-itemW / 2 + 30, 24);
      item.addChild(subText);

      // 右侧：星数 / 锁
      const rightText = new PIXI.Text(
        unlocked ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '未解锁',
        unlocked
          ? { fontSize: 34, fill: 0xffd75e }
          : { fontSize: 26, fill: 0x5a4d78 },
      );
      rightText.anchor.set(1, 0.5);
      rightText.position.set(itemW / 2 - 26, 0);
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
}
