/**
 * 战斗场景布局：一次性计算的屏幕坐标锚点，供各协作组件（HUD / 队伍栏 / 特效）共享读取。
 * 纯数据 + 纯计算，不持有任何显示对象。
 */
import { Game } from '@/core/Game';
import { UI } from '@/balance/ui';
import { COMBAT } from '@/balance/combat';

export interface BattleLayout {
  /** 珠盘左上角 */
  boardX: number;
  boardY: number;
  /** 敌人立绘中心 */
  enemyCenterX: number;
  enemyCenterY: number;
  /** 英雄血条顶边 Y */
  heroBarY: number;
}

export function computeBattleLayout(): BattleLayout {
  const cell = UI.board.cellSize;
  const boardX = UI.board.marginX;
  const boardY = Game.logicHeight - UI.board.bottomOffset - cell * COMBAT.boardRows;
  return {
    boardX,
    boardY,
    enemyCenterX: Game.logicWidth / 2,
    enemyCenterY: Game.safeTop + 110 + UI.battle.enemySize / 2,
    heroBarY: boardY - UI.battle.teamBarOffset - 44,
  };
}
