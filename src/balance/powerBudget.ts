/**
 * 功率预算引擎（纯数据 + 纯函数，零依赖）——数值体系唯一真源
 *
 * 把「敌人成长曲线 / 经济产出曲线 / 章节养成锚点 / 关卡 TTK 目标 / 波次预算分配」
 * 收敛到这一张表：
 * - 敌人数值（enemies.ts 基值 × GROWTH.enemy 复利 × stages.ts difficulty）围绕本表校准；
 * - 经济产出（economy.ts coin.chapterGrowth）与敌人曲线在此统一管理，避免双曲线漂移；
 * - simulation.test.ts 的「预算符合性 / 跨章单调性」契约测试据此断言。
 *
 * 调参守则：任何“加强敌人 / 加快产出”的需求先改这里的锚点，再让数据表跟随，
 * 禁止在 stages/enemies 里绕开预算直接堆数值（那正是 1-5 Boss 5000 血断崖的来源）。
 */

/** ── 复利曲线（唯一真源；growth.ts / economy.ts 从此读取）── */
export const POWER_CURVE = {
  /**
   * 敌人章节成长（复利）：数值 = 基值 × growth^(章-1) × 关卡 difficulty
   *
   * v0.4 配平依据：锚点玩家面板每章约 ×1.2~1.5（等级 3%/级 复利 + 星级档位跳升，
   * 见 CHAPTER_POWER），敌人曲线与之同速——
   * - HP 复利略高于玩家 ATK 增速：制造「不养成则 TTK 逐章变长」的压力；
   * - ATK 复利略低于玩家 HP 增速：铺垫关掉血但不劝退，Boss 蓄力技才是生存考验。
   * 旧值 1.40/1.38 是按旧版宠物 5~6%/级 膨胀曲线配的，压平成长后须同步下调。
   *
   * v0.4.2：玩家 1 天可推至 8-8，后期偏软。HP 1.32→1.36（第 8 章约 +20%）、
   * ATK 1.26→1.29（约 +18%）、DEF 1.20→1.22；前 3 章复利差小，教学手感基本不变。
   */
  enemy: {
    chapterGrowthHp: 1.36,
    /** 攻压曲线：铺垫关靠 ATK + 出手频率制造掉血感，不靠堆 HP 磨人 */
    chapterGrowthAtk: 1.29,
    chapterGrowthDef: 1.22,
    /** 入场攻击倒计时（1 = 首个敌人回合更快出刀；满 interval 则过慢） */
    initialAttackCountdown: 1,
  },
  /**
   * 经济产出章节成长（复利）：灵宠币 / 经验产出按此放大，与敌人曲线成对校准。
   * v0.4.2：1.25→1.22，略放缓后期养成，配合敌人加难拉长推进天数。
   */
  economyChapterGrowth: 1.22,
} as const;

/**
 * ── 章节战力锚点（1~8 章，唯一真源）──
 *
 * 定义「进入第 N 章时期望的主队养成水平」与「通关该章后期望水平」。
 * 敌人曲线、经验产出与升星节奏都围绕这条预算曲线校准：
 * - 达标队伍（enterLevel/enterStar）中手应能通关本章全部关卡；
 * - 欠养成（停留在更早锚点）则在新章 Boss 处卡住；铺垫关仍应有明显攻压（会掉血），但不形成「不升级过不去」的劝退墙。
 *
 * 星级档等级上限（growth.ts STAR_PROFILES.maxLevel）：
 * 1★=50 / 2★=60 / 3★=70 / 4★=85 / 5★=99，锚点等级不越当期星级上限。
 *
 * v0.4 重校准：旧锚点（8 章 L82/5★）与首通经验产出（8 章约 L44）脱节 13 倍，
 * 契约测试拿锚点队验关却拦不住真实玩家碾压。新锚点 = 首通产出均分等级 + 少量重复刷关余量，
 * 保证「按正常节奏推进 ≈ 达标」，欠一章锚点则 Boss 卡关。
 * 星级锚点对应现实碎片可达性（Boss 掉落 + 护航包 + 商店，5★/300 碎片是长线目标不进锚点）。
 */
export interface ChapterPowerAnchor {
  chapter: number;
  /** 进入该章期望主队平均等级 */
  enterLevel: number;
  /** 进入该章期望主力星级 */
  enterStar: number;
  /** 通关该章后期望主队平均等级 */
  clearLevel: number;
}

export const CHAPTER_POWER: Readonly<Record<number, ChapterPowerAnchor>> = {
  1: { chapter: 1, enterLevel: 1, enterStar: 1, clearLevel: 10 },
  2: { chapter: 2, enterLevel: 10, enterStar: 2, clearLevel: 17 },
  3: { chapter: 3, enterLevel: 17, enterStar: 2, clearLevel: 24 },
  4: { chapter: 4, enterLevel: 24, enterStar: 3, clearLevel: 29 },
  5: { chapter: 5, enterLevel: 29, enterStar: 3, clearLevel: 34 },
  6: { chapter: 6, enterLevel: 34, enterStar: 3, clearLevel: 39 },
  7: { chapter: 7, enterLevel: 39, enterStar: 3, clearLevel: 44 },
  8: { chapter: 8, enterLevel: 44, enterStar: 4, clearLevel: 48 },
};

/** 取章节战力锚点：低越界回退第 1 章，高越界取最后一章（长线运营向上外推用） */
export function getChapterPower(chapter: number): ChapterPowerAnchor {
  if (CHAPTER_POWER[chapter]) return CHAPTER_POWER[chapter];
  const keys = Object.keys(CHAPTER_POWER).map(Number);
  const max = Math.max(...keys);
  return chapter > max ? CHAPTER_POWER[max] : CHAPTER_POWER[1];
}

/**
 * ── 关卡 TTK 目标（中手模型口径：COMBO_MODELS.mid，达标队伍）──
 *
 * 普通关快节奏刷图、精英关略有压力、Boss 关是章末大战但不是隔天的墙。
 */
export interface TtkBand {
  min: number;
  max: number;
}

export type TtkStageKind = 'normal' | 'elite' | 'boss';

export const STAGE_TTK: Readonly<Record<TtkStageKind, TtkBand>> = {
  normal: { min: 2, max: 6 },
  elite: { min: 3, max: 8 },
  boss: { min: 6, max: 14 },
};

/** 取关卡类型的 TTK 目标（未知类型按普通关） */
export function stageTtk(kind: string): TtkBand {
  return STAGE_TTK[kind as TtkStageKind] ?? STAGE_TTK.normal;
}

/**
 * 关卡总 HP 预算区间 = 预算队每回合期望输出 × TTK 区间。
 * teamDamagePerTurn 由调用方按中手模型估算（如 simulation 模拟器实测）。
 */
export function stageHpBudget(teamDamagePerTurn: number, kind: string): TtkBand {
  const ttk = stageTtk(kind);
  return {
    min: Math.floor(teamDamagePerTurn * ttk.min),
    max: Math.ceil(teamDamagePerTurn * ttk.max),
  };
}

/**
 * ── 波次预算分配 ──
 *
 * 多波关按比例分配总 HP 预算：前波偏轻（进入节奏）、末波最重（收尾高潮）。
 */
const WAVE_SPLIT: Readonly<Record<number, readonly number[]>> = {
  1: [1],
  2: [0.45, 0.55],
  3: [0.30, 0.30, 0.40],
};

/** 波次预算占比（和为 1）；超过 3 波按均分兜底 */
export function waveSplit(waveCount: number): readonly number[] {
  const known = WAVE_SPLIT[waveCount];
  if (known) return known;
  const n = Math.max(1, Math.floor(waveCount));
  return Array.from({ length: n }, () => 1 / n);
}

/**
 * ── 平滑性护栏（契约测试断言口径）──
 *
 * - Boss 首波 ≤ 前一关最大单波 × bossFirstWaveMaxRatio（消灭 1-5 首波 7 倍断崖）
 * - Boss 三波总量在前一关总量的 [bossTotalMinRatio, bossTotalMaxRatio] 倍之间
 * - 关卡实际敌方总 HP 允许偏离预算 ±budgetTolerance
 */
export const BUDGET_GUARDRAIL = {
  bossFirstWaveMaxRatio: 2.5,
  bossTotalMinRatio: 2.0,
  bossTotalMaxRatio: 4.2,
  /** Boss 总量目标 = 前关总量 × 该倍数；实际值允许 ±budgetTolerance */
  bossTotalTargetRatio: 3.5,
  budgetTolerance: 0.15,
} as const;
