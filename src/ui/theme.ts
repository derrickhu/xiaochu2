/**
 * UI 主题（单一真源）—— 改一处，所有引用处全局生效
 *
 * 约束：
 * - 颜色/字号/字体/圆角/间距只在此定义一次，导出语义化 token（按用途命名，非具象颜色名）。
 * - 场景与组件禁止裸写 0x... / 魔法字号，一律引用这里的 token。
 * - 切换皮肤（如明亮 ↔ 暗色）只需改本文件 token 取值，调用方不动。
 *
 * 阶段七：配合 xiao_chu「明亮国风水墨」美术，文字主色由原暗底亮字翻转为浅底深墨。
 */

/** 统一字体族（修复跨端默认字体不一致） */
export const FONT_FAMILY = '"PingFang SC", "Heiti SC", "Microsoft YaHei", sans-serif';

/**
 * 语义化颜色 token。命名按「用途」而非颜色本身。
 */
export const COLORS = {
  // ── 背景 ──
  /** 背景图加载失败时的兜底底色（暖米白） */
  bgFallback: 0xf3e6c8,
  /** 半透明遮罩（弹窗背景压暗） */
  scrim: 0x2a1f14,

  // ── 文字 ──
  /** 正文主色（浅底深墨） */
  textMain: 0x3a2e22,
  /** 次要说明文字 */
  textSub: 0x7a6a52,
  /** 深底（如紫色导航栏）上的浅色文字 */
  textInverse: 0xfdf3df,
  /** 不可用态文字 */
  textDisabled: 0x9c8c70,
  /** 标题强调金（用于浅底上的标题点缀） */
  textTitle: 0xb5701f,
  /** 战斗关卡匾正文（mockup 深棕墨） */
  battlePlaqueText: 0x3f2408,
  /** 敌人名匾底板（截图采样浅金奶油 #eddbac） */
  battleEnemyNameBg: 0xeddbac,
  /** 敌人名匾描边（截图采样） */
  battleEnemyNameBorder: 0xb9a075,
  /** 敌人名匾文字（截图采样深棕 #452605） */
  battleEnemyNameText: 0x452605,
  /** 战斗克制标签底板（截图采样深棕金 #6f5a2a） */
  battleTagBg: 0x6f5a2a,
  /** 战斗克制标签描边（截图采样浅金边 #decea1） */
  battleTagBorder: 0xdecea1,
  /** 战斗克制标签文字（截图采样奶油白 #eddfb4） */
  battleTagText: 0xeddfb4,
  /** 战斗克制标签文字描边（深棕） */
  battleTagTextStroke: 0x3a2c10,

  // ── 强调 ──
  accent: 0xe8a33d,
  accentDeep: 0xc9822a,

  // ── 面板 / 卡片 ──
  /** 面板主底（宣纸米白） */
  panelBg: 0xfdf3df,
  /** 面板次底（略深，用于分区/未解锁） */
  panelBgAlt: 0xead8b4,
  /** 面板描边（金棕） */
  panelBorder: 0xc9a063,
  /** 面板浅描边 */
  panelBorderSoft: 0xddbf8e,
  /** 卡面名字（深墨棕，写在浅色卡底上） */
  cardNameText: 0x3b2414,
  /** 卡面名字描边（浅米，提升浅底可读性） */
  cardNameStroke: 0xfff0cd,

  // ── 按钮配色（variant → 一组 token，改这里全局按钮生效） ──
  btnPrimaryBg: 0xe8a33d,
  btnPrimaryBorder: 0xb5701f,
  btnSuccessBg: 0x6aa84f,
  btnSuccessBorder: 0x4e8a36,
  btnDangerBg: 0xd86a4a,
  btnDangerBorder: 0xb04a2e,
  btnRecruitBg: 0x9a6ad6,
  btnRecruitBorder: 0x7345ad,
  btnGhostBg: 0xf3e3c2,
  btnGhostBorder: 0xc9a063,
  btnDisabledBg: 0xcabfa4,
  btnDisabledBorder: 0xb0a488,
  /** 实色按钮上的文字 */
  btnText: 0xfffaf0,
  /** 幽灵按钮（浅底）上的文字 */
  btnGhostText: 0x5a4632,

  // ── 进度条 ──
  trackBg: 0xd8c4a0,
  trackFill: 0xe8a33d,
  trackFillFull: 0x6aa84f,

  // ── 战斗：转珠倒计时 / 技能 CD（对齐 battle_ui_mockup_v2 采样） ──
  /** 转珠倒计时轨道底（截图深棕灰，衬托亮填充） */
  battleDragTrack: 0x5f4b3a,
  /** 转珠倒计时填充左端（截图暖橙 #e3a250） */
  battleDragFill: 0xe3a250,
  /** 转珠倒计时填充右端高光（截图亮黄 #f6d16e） */
  battleDragFillBright: 0xf6d16e,
  /** 转珠倒计时将尽（深橙） */
  battleDragFillLow: 0xd86a4a,
  /** 转珠倒计时描边（截图深棕） */
  battleDragBorder: 0x6c5011,
  /** 宠物技能 CD 圆标底（深棕） */
  battleCdBadgeBg: 0x3e2812,
  /** 宠物技能 CD 圆标外环（奶油） */
  battleCdBadgeRing: 0xf2e3c5,

  // ── 导航栏（紫祥云底，浅字） ──
  navText: 0xfdf3df,
  navTextActive: 0xffe9a6,
  /** 导航栏贴图缺失时的回退底色（祥云紫） */
  navBarFallback: 0x5a3f7a,

  // ── 通用 ──
  white: 0xffffff,
} as const;

/** 字号档位（设计坐标，宽 750） */
export const FONT_SIZE = {
  /** 主标题 */
  xl: 44,
  /** 子页标题 */
  lg: 34,
  /** 强调正文 / 按钮 */
  md: 28,
  /** 正文 */
  sm: 24,
  /** 说明文字 */
  xs: 19,
  /** 角标 / 次说明 */
  xxs: 15,
} as const;

/** 圆角档位 */
export const RADIUS = {
  card: 18,
  button: 28,
  chip: 12,
  small: 8,
} as const;

/** 间距档位 */
export const SPACING = {
  xs: 6,
  sm: 12,
  md: 20,
  lg: 32,
} as const;

export type ColorToken = keyof typeof COLORS;
export type FontSizeToken = keyof typeof FONT_SIZE;
