/**
 * 战斗场景（骨架）：6x6 珠盘静态渲染
 *
 * 珠子 Sprite 走对象池（ObjectPool），为后续消除/下落复用打底。
 * 本骨架验收：能看到 6x6 珠盘 + 返回标题。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { ObjectPool } from '@/core/ObjectPool';
import { TextureCache } from '@/core/TextureCache';
import { UI } from '@/balance/ui';
import { COMBAT, type OrbType } from '@/balance/combat';
import { ORB_IMAGES } from '@/config/Assets';
import { BoardModel } from '@/game/board/BoardModel';

export class BattleScene implements Scene {
  readonly name = 'battle';
  readonly container = new PIXI.Container();

  private _board: BoardModel | null = null;
  private _cellsLayer = new PIXI.Container();
  private _orbsLayer = new PIXI.Container();
  private _orbPool: ObjectPool<PIXI.Sprite>;
  private _activeOrbs: PIXI.Sprite[] = [];
  private _built = false;

  constructor() {
    this._orbPool = new ObjectPool<PIXI.Sprite>({
      create: () => {
        const sp = new PIXI.Sprite();
        sp.anchor.set(0.5);
        return sp;
      },
      onGet: (sp) => { sp.visible = true; },
      onRelease: (sp) => {
        sp.visible = false;
        if (sp.parent) sp.parent.removeChild(sp);
      },
      preallocate: COMBAT.boardCols * COMBAT.boardRows,
      maxSize: COMBAT.boardCols * COMBAT.boardRows * 2,
      onDiscard: (sp) => sp.destroy(),
    });
  }

  onEnter(): void {
    Game.setMaxFPS(UI.fps.battle);
    if (!this._built) {
      this._buildStatic();
      this._built = true;
    }
    this._board = new BoardModel();
    this._renderBoard();
  }

  onExit(): void {
    // 珠子全部归还池中
    for (const sp of this._activeOrbs) this._orbPool.release(sp);
    this._activeOrbs.length = 0;
  }

  /** 棋盘左上角原点（设计坐标） */
  private _boardOrigin(): { x: number; y: number } {
    const cell = UI.board.cellSize;
    const x = UI.board.marginX;
    const y = Game.logicHeight - UI.board.bottomOffset - cell * COMBAT.boardRows;
    return { x, y };
  }

  private _buildStatic(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const cell = UI.board.cellSize;
    const origin = this._boardOrigin();

    // 背景
    const bg = new PIXI.Graphics();
    bg.beginFill(0x241a38);
    bg.drawRect(0, 0, w, h);
    bg.endFill();
    this.container.addChild(bg);

    // 顶部信息条（骨架占位）
    const topText = new PIXI.Text('第 1 章 · 青苔林边（骨架）', {
      fontSize: 32,
      fill: 0xd9cdf5,
    });
    topText.anchor.set(0.5, 0);
    topText.position.set(w / 2, Game.safeTop + 10);
    this.container.addChild(topText);

    // 敌人占位区
    const enemyZone = new PIXI.Graphics();
    enemyZone.lineStyle(2, 0x5a4a82, 0.8);
    enemyZone.beginFill(0x2e2148, 0.6);
    enemyZone.drawRoundedRect(w / 2 - 180, Game.safeTop + 90, 360, 220, 24);
    enemyZone.endFill();
    this.container.addChild(enemyZone);
    const enemyText = new PIXI.Text('敌人区（待实现）', { fontSize: 28, fill: 0x9b8cc4 });
    enemyText.anchor.set(0.5);
    enemyText.position.set(w / 2, Game.safeTop + 200);
    this.container.addChild(enemyText);

    // 格底：棋盘交错底色（一次性绘制，不参与每帧重绘）
    const cellsBg = new PIXI.Graphics();
    for (let r = 0; r < COMBAT.boardRows; r++) {
      for (let c = 0; c < COMBAT.boardCols; c++) {
        cellsBg.beginFill((r + c) % 2 === 0 ? 0x342752 : 0x2c2147);
        cellsBg.drawRect(origin.x + c * cell, origin.y + r * cell, cell, cell);
        cellsBg.endFill();
      }
    }
    this._cellsLayer.addChild(cellsBg);
    this.container.addChild(this._cellsLayer);
    this.container.addChild(this._orbsLayer);

    // 返回标题按钮
    const backBtn = new PIXI.Container();
    const backBg = new PIXI.Graphics();
    backBg.beginFill(0x4a3a72);
    backBg.drawRoundedRect(-70, -30, 140, 60, 30);
    backBg.endFill();
    backBtn.addChild(backBg);
    const backText = new PIXI.Text('返回', { fontSize: 30, fill: 0xffffff });
    backText.anchor.set(0.5);
    backBtn.addChild(backText);
    backBtn.position.set(90, Game.safeTop + 30);
    backBtn.eventMode = 'static';
    backBtn.on('pointertap', () => SceneManager.switchTo('title'));
    this.container.addChild(backBtn);
  }

  /** 按 BoardModel 数据渲染珠盘（骨架：静态摆放） */
  private _renderBoard(): void {
    if (!this._board) return;

    for (const sp of this._activeOrbs) this._orbPool.release(sp);
    this._activeOrbs.length = 0;

    const cell = UI.board.cellSize;
    const origin = this._boardOrigin();

    for (let r = 0; r < this._board.rows; r++) {
      for (let c = 0; c < this._board.cols; c++) {
        const orbType: OrbType = this._board.get(r, c);
        const sp = this._orbPool.get();

        const tex = TextureCache.get(ORB_IMAGES[orbType]);
        if (tex) {
          sp.texture = tex;
          const size = cell * UI.board.orbScale;
          sp.width = size;
          sp.height = size;
        }

        sp.position.set(
          origin.x + c * cell + cell / 2,
          origin.y + r * cell + cell / 2,
        );
        this._orbsLayer.addChild(sp);
        this._activeOrbs.push(sp);
      }
    }
  }
}
