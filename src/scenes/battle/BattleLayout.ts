/**
 * 战斗场景布局：一次性计算的屏幕坐标锚点，供各协作组件（HUD / 队伍栏 / 特效）共享读取。
 * 纯数据 + 纯计算，不持有任何显示对象。
 */
import { Game } from '@/core/Game';
import { UI } from '@/balance/ui';
import { COMBAT } from '@/balance/combat';

/**
 * 战斗队伍栏单格尺寸：在 cream 底板内左右留边，5 槽均分。
 * 宠物略小于满宽，露出底板左右边框。
 */
export function computePetBarPetSize(logicWidth: number, teamCount: number): number {
  const panelW = logicWidth - UI.board.marginX * 2 + 12;
  const innerW = panelW - UI.battle.petBarPanelPadX * 2;
  const gap = UI.battle.petGap;
  return Math.floor((innerW - (teamCount - 1) * gap) / teamCount);
}

export interface BattleLayout {
  boardX: number;
  boardY: number;
  enemyAreaTop: number;
  enemyAreaBottom: number;
  /** 关卡匾中心 Y */
  headerY: number;
  /** 敌人名匾中心 Y（关卡匾下方独立板） */
  enemyNameY: number;
  /** 克制标签行中心 Y */
  enemyTagY: number;
  /** 倒计时文字中心 Y */
  enemyCdY: number;
  enemyHpBarY: number;
  enemyCenterX: number;
  enemyCenterY: number;
  heroBarY: number;
  enemyHpBarWidth: number;
  enemyHpBarHeight: number;
  heroHpBarWidth: number;
  heroHpBarHeight: number;
  hpBarWidth: number;
  hpBarHeight: number;
  petSize: number;
  petGap: number;
  petBarSidePad: number;
  petBarCenterY: number;
  petBarPanelX: number;
  petBarPanelY: number;
  petBarPanelW: number;
  petBarPanelH: number;
}

export function computeBattleLayout(): BattleLayout {
  const cell = UI.board.cellSize;
  const boardX = UI.board.marginX;
  const boardY = Game.logicHeight - UI.board.bottomOffset - cell * COMBAT.boardRows;
  const {
    petStarRowH, petBarPanelPadY, petBoardGap, stageBannerH,
    enemyHpBarWidth, enemyHpBarHeight,
    heroHpBarWidth, heroHpBarHeight, heroBarPanelOverlap,
    enemyNamePlaqueH, enemyHpToCdGap, enemyCdToTagGap, enemySize,
  } = UI.battle;
  const petGap = UI.battle.petGap;
  const petSize = computePetBarPetSize(Game.logicWidth, 5);

  const petBarPanelW = Game.logicWidth - UI.board.marginX * 2 + 12;
  const petBarPanelH = petSize * UI.battle.petFrameScale + petStarRowH + petBarPanelPadY * 2 + 8;
  const petBarPanelX = (Game.logicWidth - petBarPanelW) / 2;
  const petBarSidePad = petBarPanelX + UI.battle.petBarPanelPadX;
  const panelBottom = boardY - petBoardGap;
  const petBarPanelY = panelBottom - petBarPanelH / 2;
  const petBarCenterY = petBarPanelY - petStarRowH / 2 + 2;
  const panelTop = petBarPanelY - petBarPanelH / 2;

  // 玩家条略长于敌条；超出宠物板时略收，避免顶到屏边
  const enemyBarW = Math.min(enemyHpBarWidth, petBarPanelW - 80);
  const heroBarW = Math.min(heroHpBarWidth, petBarPanelW - 24);
  const heroBarY = panelTop - heroHpBarHeight + heroBarPanelOverlap;

  // mockup 自下而上：克制标签 → 倒计时 → 血条（互不重叠）
  const tagH = 40;
  const cdH = 28;
  const enemyTagY = heroBarY - 18 - tagH / 2;
  const enemyCdY = enemyTagY - tagH / 2 - enemyCdToTagGap - cdH / 2;
  const enemyHpBarY = enemyCdY - cdH / 2 - enemyHpToCdGap - enemyHpBarHeight;

  const enemyAreaTop = Game.safeTop + 4;
  const enemyAreaBottom = heroBarY - 4;
  const headerY = enemyAreaTop + stageBannerH / 2 + 4;
  // 敌人名独立匾：紧贴关卡匾下方
  const enemyNameY = headerY + stageBannerH / 2 + 8 + enemyNamePlaqueH / 2;

  // 立绘：名匾下沿 ~ 血条上沿
  const spriteZoneTop = enemyNameY + enemyNamePlaqueH / 2 + 8;
  const spriteZoneBottom = enemyHpBarY - 8;
  const enemyCenterY = Math.min(
    (spriteZoneTop + spriteZoneBottom) / 2,
    enemyHpBarY - enemySize / 2 - 4,
  );

  return {
    boardX,
    boardY,
    enemyAreaTop,
    enemyAreaBottom,
    headerY,
    enemyNameY,
    enemyTagY,
    enemyCdY,
    enemyHpBarY,
    enemyCenterX: Game.logicWidth / 2,
    enemyCenterY,
    heroBarY,
    enemyHpBarWidth: enemyBarW,
    enemyHpBarHeight,
    heroHpBarWidth: heroBarW,
    heroHpBarHeight,
    hpBarWidth: heroBarW,
    hpBarHeight: heroHpBarHeight,
    petSize,
    petGap,
    petBarSidePad,
    petBarCenterY,
    petBarPanelX,
    petBarPanelY,
    petBarPanelW,
    petBarPanelH,
  };
}
