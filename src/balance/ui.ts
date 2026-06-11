/**
 * UI / 表现层常量（与数值平衡隔离，调表现不影响平衡）
 */
import type { Element, OrbType } from './combat';

/** 属性中文名 */
export const ELEMENT_NAME: Readonly<Record<Element, string>> = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
};

/** 属性主题色（含心珠） */
export const ORB_COLOR: Readonly<Record<OrbType, number>> = {
  metal: 0xffd75e,
  wood: 0x6fd86a,
  water: 0x5db9ff,
  fire: 0xff7a5c,
  earth: 0xc98e5a,
  heart: 0xff8fc4,
};

export const UI = {
  /** ── 棋盘布局（设计坐标，宽 750） ── */
  board: {
    /** 棋盘左右边距 */
    marginX: 25,
    /** 格子尺寸 = (750 - marginX*2) / 6 */
    cellSize: Math.floor((750 - 25 * 2) / 6),
    /** 珠子直径占格子比例 */
    orbScale: 0.92,
    /** 棋盘距屏幕底部距离 */
    bottomOffset: 40,
  },

  /** ── 战斗布局（设计坐标） ── */
  battle: {
    /** 敌人立绘尺寸 */
    enemySize: 260,
    /** 敌人血条 */
    enemyHpBarWidth: 360,
    enemyHpBarHeight: 14,
    /** 队伍栏头像尺寸与间距 */
    petSize: 110,
    petGap: 16,
    /** 队伍栏距棋盘顶部距离 */
    teamBarOffset: 130,
    /** 拖珠倒计时条 */
    dragBarHeight: 10,
    /** 英雄血条 */
    heroHpBarHeight: 18,
  },

  /** ── 动效时长（秒） ── */
  anim: {
    orbSwap: 0.08,
    orbClear: 0.25,
    orbFall: 0.3,
    petDash: 0.18,
    petReturn: 0.22,
    enemyHitFlash: 0.12,
    damageFloat: 0.6,
    /** 多组攻击的间隔节奏 */
    attackGap: 0.12,
    /** 波次切换敌人入场 */
    waveEnter: 0.35,
  },

  /** ── 帧率 ── */
  fps: {
    battle: 60,
    idle: 30,
  },
} as const;
