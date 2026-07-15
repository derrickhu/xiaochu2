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
  /** 关卡匾中心 Y（关卡名 + 回合同层） */
  headerY: number;
  /** 敌人名匾中心 Y（叠层：血条正上方） */
  enemyNameY: number;
  /** 立绘区上沿（关卡匾下沿；立绘贴顶，名/血条叠在立绘之上） */
  spriteZoneTop: number;
  /** 立绘区下沿（克制标签下沿：脚在 HUD 后方，真叠层而非上下分离） */
  spriteZoneBottom: number;
  /** 克制标签行中心 Y */
  enemyTagY: number;
  /** 倒计时文字中心 Y */
  enemyCdY: number;
  enemyHpBarY: number;
  /** 敌人持续状态图标：首枚中心 X（名匾右侧；由 HUD 按名匾实宽刷新） */
  enemyStatusIconX: number;
  /** 敌人持续状态图标行中心 Y（与怪物名匾同行） */
  enemyStatusIconY: number;
  /** 我方持续状态图标行中心 Y（英雄血条正上方） */
  teamStatusIconY: number;
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
    enemyNamePlaqueH, enemyNameToHpGap, enemyHpToCdGap, enemyCdToTagGap, enemySize,
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

  // mockup 自下而上叠在立绘上：克制标签 → 倒计时 → 血条 → 名匾（状态图标叠在血条下沿，不再单独占高）
  const tagH = 40;
  const cdH = 28;
  /** 与 BattleStatusIcons.ICON_SIZE 对齐 */
  const statusIconSize = 34;
  const statusIconGap = 6;
  const enemyTagY = heroBarY - 14 - tagH / 2;
  const enemyCdY = enemyTagY - tagH / 2 - enemyCdToTagGap - cdH / 2;
  // 血条直接贴倒计时上方（中间不再插一整行状态图标高度）
  const enemyHpBarY = enemyCdY - cdH / 2 - enemyHpToCdGap - enemyHpBarHeight;
  // 我方状态图标：血条顶上方留足半高 + 间距，避免压住 HP 数字
  const teamStatusIconY = heroBarY - statusIconGap - statusIconSize / 2;

  // 顶栏与全站统一：关卡匾/返回钮对齐胶囊收起区中心（safeHeaderCenterY）
  const headerY = Game.safeHeaderCenterY;
  const enemyAreaTop = headerY - stageBannerH / 2;
  const enemyAreaBottom = heroBarY - 4;
  // 敌人名匾：浮在血条正上方（与立绘重叠，不单独占行）
  const enemyNameY = enemyHpBarY - enemyNameToHpGap - enemyNamePlaqueH / 2;
  // Debuff 与名匾同行，初值按默认名匾宽估；实宽由 BattleHud 刷新
  const enemyStatusIconY = enemyNameY;
  const enemyStatusIconX = Game.logicWidth / 2
    + UI.battle.enemyNamePlaqueW / 2 + 8 + statusIconSize / 2;

  /**
   * 真叠层立绘区（对齐 mockup v3）：
   * - 上沿伸到关卡匾后方，下沿到克制标签下沿
   * - 名匾 / 血条 / 倒计时 / 标签画在立绘之上（同区重叠），禁止「怪在上、UI 在下」分离
   */
  // 上沿贴关卡匾下沿，立绘贴顶上移，避免头顶大块留白
  const spriteZoneTop = headerY + stageBannerH / 2 + 4;
  const spriteZoneBottom = enemyTagY + tagH / 2 + 6;
  // 布局占位：贴顶；实际中心在 refreshEnemy 按贴图重算
  const enemyCenterY = spriteZoneTop + 6 + enemySize / 2;

  return {
    boardX,
    boardY,
    enemyAreaTop,
    enemyAreaBottom,
    headerY,
    enemyNameY,
    spriteZoneTop,
    spriteZoneBottom,
    enemyTagY,
    enemyCdY,
    enemyHpBarY,
    enemyStatusIconX,
    enemyStatusIconY,
    teamStatusIconY,
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
