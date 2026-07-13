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

/** 属性主题色（含心珠）— 单独加深后的 Q 实心珠配色 */
export const ORB_COLOR: Readonly<Record<OrbType, number>> = {
  metal: 0xd9a008,
  wood: 0x0d8a22,
  water: 0x0a5ef0,
  fire: 0xd6453a,
  earth: 0x8f5a36,
  heart: 0xff8fb8,
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
    /** 敌人立绘尺寸（布局占位；实际显示尺寸见 enemyDisplaySize） */
    enemySize: 280,
    /**
     * 血条尺寸（对齐 mockup）：偏厚；玩家条略长于敌条
     * 贴宠物板顶，勿铺满屏宽
     */
    enemyHpBarWidth: 480,
    enemyHpBarHeight: 44,
    heroHpBarWidth: 580,
    heroHpBarHeight: 44,
    /** 兼容旧字段 */
    hpBarWidth: 580,
    hpBarHeight: 44,
    /** mockup 填充色：敌鲜红 / 我翠绿 */
    enemyHpFill: 0xe74c3c,
    enemyHpFillLow: 0xff5a4a,
    heroHpFill: 0x5cb85c,
    heroHpFillLow: 0xe8a33d,
    /** 队伍栏头像间距 */
    petGap: 10,
    /** 五行相框相对头像缩放（对齐 xiao_chu frameScale=1.12） */
    petFrameScale: 1.12,
    /** 宠物栏底板底边与棋盘顶边的间距（含厚 cream 框，对齐 mockup） */
    petBoardGap: 42,
    /** 宠物栏 cream 底板左右内边距（宠物略小，露出底板边框） */
    petBarPanelPadX: 18,
    /** 宠物栏 cream 底板上下内边距 */
    petBarPanelPadY: 14,
    /** 相框下方星级行高度 */
    petStarRowH: 28,
    /** Q 版星标边长兜底；实际按 5 星铺满宠物格宽计算 */
    petStarSize: 20,
    /** 英雄血条压入宠物板顶边的重叠量（连体感） */
    heroBarPanelOverlap: 10,
    /** 拖珠倒计时条高度（对齐截图加厚） */
    dragBarHeight: 22,
    /** 倒计时条相对棋盘左右各缩进（比棋盘短，对齐截图） */
    dragBarInset: 58,
    /** 倒计时左侧时钟图标边长 */
    dragClockSize: 40,
    /** 棋盘 cream 外框内边距（对齐 mockup 厚框） */
    boardFramePad: 24,
    /** 宠物技能 CD 圆标直径相对头像宽 */
    petCdBadgeRatio: 0.28,
    /** 英雄血条右侧护盾徽章（大于血条高度，底边与血条底对齐） */
    shieldBadgeSize: 76,
    /** 顶栏关卡匾宽度 / 高度（仅关卡名） */
    stageBannerW: 520,
    stageBannerH: 88,
    /** 敌人名独立匾（关卡匾下方） */
    enemyNamePlaqueW: 320,
    enemyNamePlaqueH: 44,
    /** 血条 → 倒计时 → 克制标签 的垂直间距 */
    enemyHpToCdGap: 10,
    enemyCdToTagGap: 14,
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
    /** 消珠动画（v0.4.1 放慢：0.25→0.32，玩家反馈消除节奏太赶） */
    orbClear: 0.32,
    orbFall: 0.34,
    /** 宠物冲刺 / 回位（略放慢，便于看清出手与弹道） */
    petDash: 0.26,
    petReturn: 0.30,
    enemyHitFlash: 0.12,
    damageFloat: 0.6,
    /** 英雄受击飘字（专用动效，比通用 damageFloat 停更久） */
    heroHitFloat: 1.8,
    /** 英雄回血飘字（心珠 / 治疗技） */
    heroHealFloat: 1.7,
    /** 多组攻击的间隔节奏（旧串行完整出手间隔；错峰起飞后作兜底） */
    attackGap: 0.38,
    /** 刃命中爆炸总时长；多宠错峰起飞间隔与此对齐 */
    bladeImpact: 0.24,
    /** 多宠错峰起飞间隔（略长于爆炸，出手层次更清晰） */
    petAttackStagger: 0.32,
    /** 最后一击后稍停再出总伤害（秒）；不阻塞操作，仅错开弹出节奏 */
    turnTotalLeadIn: 0.30,
    /** 击杀后等待单段伤害飘字的上限（秒）；正常约 0.8–1.1s，超时兜底避免卡死 */
    victoryFloatHold: 1.4,
    /**
     * 击杀后「总伤害」可读停留（秒）：覆盖弹出+回落+短 hold，不必等淡出（完整约 2.8s）。
     * 超时后仍可继续播完，结算蒙层盖住即可。
     */
    victoryTotalHold: 1.6,
    /** 全部伤害表现结束后、弹出结算前的反应停顿（秒） */
    victoryReactionHold: 0.55,
    /** 波次切换敌人入场 */
    waveEnter: 0.35,
    /** ── 阶段二：手感强化 ── */
    /** 连组消除音画节拍（v0.4.1 放慢：16→22 帧 @60fps，每组连击留出辨识时间） */
    comboElimBeat: 22 / 60,
    /** 逐组消除之间的节奏间隔（与 comboElimBeat 同构，保留别名） */
    groupClearGap: 22 / 60,
    /** 消除粒子寿命 */
    orbBurst: 0.45,
    /** Combo 大字弹跳 */
    comboPop: 0.18,
    /** Combo 淡出（延迟 + 时长） */
    comboFadeDelay: 0.5,
    comboFade: 0.4,
    /** 属性弹道飞行（宠物 → 敌人） */
    projectile: 0.30,
    /** 敌人弹道飞行（略慢，便于看清来向） */
    enemyProjectile: 0.32,
    enemyProjectileHeavy: 0.42,
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
