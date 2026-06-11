/**
 * UI / 表现层常量（与数值平衡隔离，调表现不影响平衡）
 */

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

  /** ── 动效时长（秒） ── */
  anim: {
    orbSwap: 0.08,
    orbClear: 0.25,
    orbFall: 0.3,
    petDash: 0.18,
    petReturn: 0.22,
    enemyHitFlash: 0.12,
    damageFloat: 0.6,
  },

  /** ── 帧率 ── */
  fps: {
    battle: 60,
    idle: 30,
  },
} as const;
