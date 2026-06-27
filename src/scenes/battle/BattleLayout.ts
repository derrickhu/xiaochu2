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
  /** 敌人区背景裁剪范围（xiao_chu eAreaTop ~ safeTop+4*S） */
  enemyAreaTop: number;
  enemyAreaBottom: number;
  /** 顶栏 Y（返回 / 关卡名 / 波次，画在敌人区背景之上） */
  headerY: number;
  /** 敌人名字 / 克制标签 / 血条 Y */
  enemyNameY: number;
  enemyTagY: number;
  enemyHpBarY: number;
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
  const heroBarY = boardY - UI.battle.teamBarOffset - 44;
  const enemyAreaTop = Game.safeTop + 4;
  const enemyAreaBottom = heroBarY - 4;

  // 顶栏：关卡名独占一行，怪物名在其下方，避免重叠
  const headerY = enemyAreaTop + 26;
  const enemyNameY = headerY + 38;
  const enemyTagY = enemyNameY + 34;
  // 立绘在标签下方 ~ 血条上方居中，血条紧贴立绘脚底
  const spriteZoneTop = enemyTagY + 28;
  const spriteZoneBottom = enemyAreaBottom - 52;
  const enemyCenterY = (spriteZoneTop + spriteZoneBottom) / 2;
  const enemyHpBarY = enemyCenterY + UI.battle.enemySize / 2 + 6;

  return {
    boardX,
    boardY,
    enemyAreaTop,
    enemyAreaBottom,
    headerY,
    enemyNameY,
    enemyTagY,
    enemyHpBarY,
    enemyCenterX: Game.logicWidth / 2,
    enemyCenterY,
    heroBarY,
  };
}
