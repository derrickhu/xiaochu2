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
    enemyHpBarHeight: 22,
    /** 队伍栏头像间距（与棋盘 marginX 一起铺满 750 宽） */
    petGap: 8,
    /** 五行相框相对头像缩放（对齐 xiao_chu frameScale=1.12） */
    petFrameScale: 1.12,
    /** 队伍栏距棋盘顶部距离（含槽位下方「▲技能」标签留白） */
    teamBarOffset: 154,
    /** 拖珠倒计时条 */
    dragBarHeight: 10,
    /** 英雄血条 */
    heroHpBarHeight: 26,
    /** 宠物上滑放技能阈值（设计像素，向上位移） */
    skillSwipeThreshold: 40,
    /** 上滑预览最大位移 */
    skillSwipeLiftMax: 48,
  },

  /** ── 动效时长（秒） ── */
  anim: {
    orbSwap: 4 / 60,
    /** 交换后逻辑锁（秒），对齐 xiao_chu SWAP_LOGIC_LOCK_FRAMES=2，动画后半段可连续换格 */
    orbSwapLogicLock: 2 / 60,
    orbClear: 0.25,
    orbFall: 0.3,
    petDash: 0.20,
    petReturn: 0.24,
    enemyHitFlash: 0.12,
    damageFloat: 0.6,
    /** 多组攻击的间隔节奏 */
    attackGap: 0.30,
    /** 最后一击飘字落定后再出总伤害（秒） */
    turnTotalLeadIn: 0.60,
    /** 波次切换敌人入场 */
    waveEnter: 0.35,
    /** ── 阶段二：手感强化 ── */
    /** 逐组消除之间的节奏间隔 */
    groupClearGap: 0.14,
    /** 消除粒子寿命 */
    orbBurst: 0.45,
    /** Combo 大字弹跳 */
    comboPop: 0.18,
    /** Combo 淡出（延迟 + 时长） */
    comboFadeDelay: 0.5,
    comboFade: 0.4,
    /** 属性弹道飞行（宠物 → 敌人） */
    projectile: 0.24,
    /** 敌人弹道飞行（略慢，便于看清来向） */
    enemyProjectile: 0.26,
    enemyProjectileHeavy: 0.34,
    /** 英雄受击：队伍栏后撤复位 */
    heroHitRecoil: 0.22,
    /** 受击闪白 */
    enemyWhiteFlash: 0.1,
    /** 血条主条补间 */
    hpTween: 0.18,
    /** 损血白条：延迟后收缩 */
    hpWhiteDelay: 0.3,
    hpWhiteTween: 0.3,
    /** 敌人死亡（闪白 + 碎裂） */
    enemyDeath: 0.45,
    /** 技能横幅展示 */
    skillBanner: 0.9,
    /** 敌人蓄力预警脉冲 */
    chargeWarn: 0.5,
  },

  /**
   * 战斗伤害飘字语义色（与五行/珠子色解耦）
   *
   * - normal：单段普通命中（含 minor 多段、槽位飘字）
   * - crit：暴击单段（字号/动效另配，颜色独立）
   * - total：回合总伤害数字
   * - totalCaption：总伤害说明文案
   * - counterMark：克制标记「克」（数字仍用 normal + 加粗描边，不另设主色）
   */
  damageFloat: {
    normal: { fill: '#fff8ca', stroke: '#101010' },
    crit: { fill: '#fffef0', stroke: '#120d08' },
    total: { fill: '#ffd84c', stroke: '#101010' },
    totalCaption: { fill: '#ffe082', stroke: '#101010' },
    counterMark: { fill: '#ffe14d', stroke: '#101010' },
    /** 克制命中时 normal 描边倍率（仅描边，不改 fill） */
    counterStrokeMul: 1.2,
  },

  /** ── Combo 反馈分级（次数下限 → 字号/颜色） ── */
  comboTiers: [
    { from: 10, fontSize: 64, color: 0xff5252 },
    { from: 7, fontSize: 58, color: 0xff9142 },
    { from: 4, fontSize: 52, color: 0xffd75e },
    { from: 1, fontSize: 44, color: 0xffe082 },
  ] as ReadonlyArray<{ from: number; fontSize: number; color: number }>,

  /** ── 帧率 ── */
  fps: {
    battle: 60,
    idle: 30,
  },
} as const;
