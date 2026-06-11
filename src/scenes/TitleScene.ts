/**
 * 标题场景（骨架）：游戏名 + 开始按钮 → BattleScene
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { TweenManager, Ease } from '@/core/TweenManager';
import { UI } from '@/balance/ui';

export class TitleScene implements Scene {
  readonly name = 'title';
  readonly container = new PIXI.Container();

  private _built = false;

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    if (!this._built) {
      this._build();
      this._built = true;
    }
  }

  onExit(): void {
    // 骨架阶段保留显示对象，后续资源量大时改为销毁重建
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
      fontSize: 72,
      fill: 0xffe9a6,
      fontWeight: 'bold',
    });
    title.anchor.set(0.5);
    title.position.set(w / 2, h * 0.32);
    this.container.addChild(title);

    const subtitle = new PIXI.Text('PixiJS 7 重制版', {
      fontSize: 28,
      fill: 0x9b8cc4,
    });
    subtitle.anchor.set(0.5);
    subtitle.position.set(w / 2, h * 0.32 + 70);
    this.container.addChild(subtitle);

    // 开始按钮
    const btn = new PIXI.Container();
    const btnBg = new PIXI.Graphics();
    btnBg.beginFill(0xe8554d);
    btnBg.drawRoundedRect(-140, -44, 280, 88, 44);
    btnBg.endFill();
    btn.addChild(btnBg);

    const btnText = new PIXI.Text('开始战斗', {
      fontSize: 40,
      fill: 0xffffff,
      fontWeight: 'bold',
    });
    btnText.anchor.set(0.5);
    btn.addChild(btnText);

    btn.position.set(w / 2, h * 0.62);
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', () => {
      SceneManager.switchTo('battle');
    });
    this.container.addChild(btn);

    // 呼吸动画提示可点击
    const pulse = (): void => {
      TweenManager.to({
        target: btn.scale, props: { x: 1.06, y: 1.06 },
        duration: 0.8, ease: Ease.easeInOutQuad,
        onComplete: () => {
          TweenManager.to({
            target: btn.scale, props: { x: 1.0, y: 1.0 },
            duration: 0.8, ease: Ease.easeInOutQuad,
            onComplete: pulse,
          });
        },
      });
    };
    pulse();
  }
}
