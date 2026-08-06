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
 *
 * 唯一的对外依赖是 difficultyBudget 的 TTK 下限；那侧只 `import type` 回本文件，
 * 运行期不成环。
 */
import { TTK_FLOOR } from './difficultyBudget';

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
   * v0.4.2：曾 1 天可推至 8-8，后期偏软。HP 1.32→1.36（第 8 章约 +20%）、
   * ATK 1.26→1.29（约 +18%）、DEF 1.20→1.22；前 3 章复利差小，教学手感基本不变。
   * v0.5：经济侧再收紧（产出/升级/刷关），目标约 4–5 天到第 7 章；敌人曲线本期不动。
   */
  enemy: {
    /**
     * v0.7：玩家纵向跨度从 ×100 压到 ×45（见 petRoles.ts / growth.ts），敌人 HP 曲线
     * 必须同步下调，否则后期直接打不动。
     *
     * 定在 1.25（1.25^15 ≈ ×28）而非与玩家 ATK 的 ×45 等齐：本期同时抬了杂兵基础血量、
     * 各章 difficultyBase，还让同色宠全员出手，这三项都已经在改变实际 TTK。
     * 复利只负责「章与章之间的坡度」，绝对压力交给基值和机制——难度审计的 TTK 上限
     * （后期 Boss 一度要打 40 回合）就是按等齐口径外推时顶穿的。
     */
    chapterGrowthHp: 1.22,
    /**
     * 攻压曲线：铺垫关靠 ATK + 出手频率制造掉血感，不靠堆 HP 磨人。
     *
     * v0.7 刻意**不**与 HP 等比下调（1.29→1.26 而非 1.22）：玩家 HP 跨度压到 ×50 后，
     * 敌人 ATK/玩家 HP 的相对压迫从 0.41 抬到 0.64（约 ×1.5）。这是「中度难度」里
     * 生存压力的主要来源——铺垫关会真的掉血，Boss 蓄力技必须处理，而不是站着换血。
     */
    chapterGrowthAtk: 1.26,
    chapterGrowthDef: 1.20,
    /**
     * 全局血量基准（乘在所有敌人 HP 上，不分章节）。
     *
     * v0.8 新增。与 chapterGrowthHp 的分工：复利只管「章与章的坡度」，这个只管
     * 「整体厚度」。此前没有这层，想整体加压就只能去动复利，结果前期没变化、
     * 后期直接顶穿 TTK 上限——两件事被绑在一个旋钮上。
     *
     * 定在 1.45 是配合本期压平技巧曲线（COMBAT.matchCountMultiplier / comboTiers）
     * 反推的：曲线压平后高手输出降约 35%，若血量不动，中手会被推到 TTK 上限之外。
     */
    hpScale: 1.58,
    /** 入场攻击倒计时（1 = 首个敌人回合更快出刀；满 interval 则过慢） */
    initialAttackCountdown: 1,
  },
  /**
   * 经济产出章节成长（复利）：灵宠币 / 经验产出按此放大，与敌人曲线成对校准。
   * v0.5：1.22→1.18，放缓后期日产暴涨，配合升级涨价拉长推进天数。
   */
  economyChapterGrowth: 1.18,
} as const;

/**
 * ── 章节战力锚点（1~16 章，唯一真源）──
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
 *
 * v0.5 扩容到 16 章：9~13 章沿用 +5 级/章 的平滑段（星级停在 4★），
 * 14 章设第二道升星门槛（4★→5★）后回到 +6 级/章，16 章通关锚点 L92 留 7 级余量给长线。
 * 升星门槛章仅 8（3★→4★）与 14（4★→5★）两处，其余章靠等级与操作推进。
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
  9: { chapter: 9, enterLevel: 48, enterStar: 4, clearLevel: 53 },
  10: { chapter: 10, enterLevel: 53, enterStar: 4, clearLevel: 58 },
  11: { chapter: 11, enterLevel: 58, enterStar: 4, clearLevel: 63 },
  12: { chapter: 12, enterLevel: 63, enterStar: 4, clearLevel: 68 },
  13: { chapter: 13, enterLevel: 68, enterStar: 4, clearLevel: 73 },
  14: { chapter: 14, enterLevel: 73, enterStar: 5, clearLevel: 79 },
  15: { chapter: 15, enterLevel: 79, enterStar: 5, clearLevel: 85 },
  16: { chapter: 16, enterLevel: 85, enterStar: 5, clearLevel: 92 },
};

const ANCHOR_CHAPTERS: readonly number[] = Object.keys(CHAPTER_POWER)
  .map(Number)
  .sort((a, b) => a - b);

/** 锚点等级不越 5★ 上限（growth.ts STAR_PROFILES[5].maxLevel） */
const ANCHOR_LEVEL_CAP = 99;
const ANCHOR_STAR_CAP = 5;

/**
 * 在两个锚点间线性求值；t > 1 时即为向上外推。
 * 等级四舍五入并夹到 [1, 99]，星级夹到 [1, 5]。
 */
function lerpAnchor(
  a: ChapterPowerAnchor,
  b: ChapterPowerAnchor,
  chapter: number,
): ChapterPowerAnchor {
  const t = (chapter - a.chapter) / (b.chapter - a.chapter);
  const level = (from: number, to: number): number =>
    Math.min(ANCHOR_LEVEL_CAP, Math.max(1, Math.round(from + (to - from) * t)));
  return {
    chapter,
    enterLevel: level(a.enterLevel, b.enterLevel),
    enterStar: Math.min(
      ANCHOR_STAR_CAP,
      Math.max(1, Math.round(a.enterStar + (b.enterStar - a.enterStar) * t)),
    ),
    clearLevel: level(a.clearLevel, b.clearLevel),
  };
}

/**
 * 取章节战力锚点。
 *
 * - 命中锚点：直接返回；
 * - 低于首章：回退第 1 章；
 * - 小数章（通天塔 towerChapterFor / 秘境 scaleChapter 会传 8.5 这类值）：相邻锚点间插值；
 * - 超出末章：按末两章斜率**线性外推**。
 *
 * 注意：这里禁止退化成「钳在末章锚点」。钳住会让模拟器认为「末章达标队能过任意后续章节」，
 * 契约测试随之静默失效（v0.4 的实际教训），扩章时必先在 CHAPTER_POWER 补锚点。
 */
export function getChapterPower(chapter: number): ChapterPowerAnchor {
  const exact = CHAPTER_POWER[chapter];
  if (exact) return exact;

  const first = ANCHOR_CHAPTERS[0];
  const last = ANCHOR_CHAPTERS[ANCHOR_CHAPTERS.length - 1];
  if (chapter <= first) return CHAPTER_POWER[first];

  if (chapter > last) {
    const prev = CHAPTER_POWER[ANCHOR_CHAPTERS[ANCHOR_CHAPTERS.length - 2]];
    return lerpAnchor(prev, CHAPTER_POWER[last], chapter);
  }

  const hiIdx = ANCHOR_CHAPTERS.findIndex((c) => c > chapter);
  const hi = ANCHOR_CHAPTERS[hiIdx];
  const lo = ANCHOR_CHAPTERS[hiIdx - 1];
  return lerpAnchor(CHAPTER_POWER[lo], CHAPTER_POWER[hi], chapter);
}

/**
 * ── 每日产出目标（经济侧的预算锚点，契约测试断言口径）──
 *
 * 在此之前经济是「算得出但没人校准」：`coin.stageBase × chapterGrowth` 能算出任意一关的产出，
 * 但全项目没有一处声明「第 N 章玩家一天应该拿到多少」，于是产出偏高还是偏低无从判断。
 *
 * 口径（与 economy.test.ts 的估算一致，改这里必须同步改那边）：
 * 一名达标玩家一天的体力预算 = 满瓶 ×2 次登录 + 广告回体 ×3，按普通关单价折算场次，
 * 场次分布取 8 成普通 + 2 成精英，币与经验均按 `coin.repeatClearPct` 记为重复通关
 * （稳态刷关，不吃首通；v0.5 起经验与币同衰减）。
 *
 * 曲线形状是刻意的：**日产主要靠场次成长，不靠单关暴涨**。
 * 灵宠币出口是按稀有度定价的固定档（招募封顶 5000 / 碎片包 300~2400 / 通用包 1800），
 * 不随章节膨胀，所以币产复利压到 1.12（见 economy.ts coin.chapterGrowth 注释）；
 * 经验则必须追敌人强度，仍走 economyChapterGrowth(1.18)，故 exp 曲线陡得多。
 *
 * v0.5 目标节奏：约 4–5 天到第 7 章（非一日通关）。日产锚点已按产出下调同步下修。
 *
 * 调经济的顺序：先改这里的目标，再让 coin/exp 的 stageBase 与 chapterGrowth 跟随。
 */
export interface DailyTargetAnchor {
  chapter: number;
  /** 一天期望灵宠币产出 */
  coins: number;
  /** 一天期望经验产出（全队合计，非单宠） */
  exp: number;
  /** 一天期望通用碎片产出（精英关掉落 + 日常全清） */
  universal: number;
}

/** 每日产出目标的锚点章（其余章线性插值，见 getDailyTarget） */
/** v0.5：与 estimateDaily（重复通关币/经验同 ×0.25）对齐后的锚点 */
export const DAILY_TARGET: Readonly<Record<number, DailyTargetAnchor>> = {
  1: { chapter: 1, coins: 520, exp: 4200, universal: 50 },
  4: { chapter: 4, coins: 760, exp: 7100, universal: 54 },
  8: { chapter: 8, coins: 1260, exp: 14_500, universal: 56 },
  12: { chapter: 12, coins: 2040, exp: 29_100, universal: 58 },
  16: { chapter: 16, coins: 3360, exp: 59_000, universal: 60 },
};

const DAILY_TARGET_CHAPTERS: readonly number[] = Object.keys(DAILY_TARGET)
  .map(Number)
  .sort((a, b) => a - b);

/**
 * 每日产出目标：锚点间线性插值，超出末章按末两锚点斜率外推。
 * 与 getChapterPower 同口径，禁止钳在末章（钳住则扩章后校验静默失效）。
 */
export function getDailyTarget(chapter: number): DailyTargetAnchor {
  const exact = DAILY_TARGET[chapter];
  if (exact) return exact;
  const first = DAILY_TARGET_CHAPTERS[0];
  const last = DAILY_TARGET_CHAPTERS[DAILY_TARGET_CHAPTERS.length - 1];
  if (chapter <= first) return DAILY_TARGET[first];
  const [lo, hi] = chapter > last
    ? [DAILY_TARGET_CHAPTERS[DAILY_TARGET_CHAPTERS.length - 2], last]
    : [
      DAILY_TARGET_CHAPTERS[DAILY_TARGET_CHAPTERS.findIndex((c) => c > chapter) - 1],
      DAILY_TARGET_CHAPTERS[DAILY_TARGET_CHAPTERS.findIndex((c) => c > chapter)],
    ];
  const a = DAILY_TARGET[lo];
  const b = DAILY_TARGET[hi];
  const t = (chapter - a.chapter) / (b.chapter - a.chapter);
  const at = (from: number, to: number): number => Math.round(from + (to - from) * t);
  return {
    chapter,
    coins: at(a.coins, b.coins),
    exp: at(a.exp, b.exp),
    universal: at(a.universal, b.universal),
  };
}

/**
 * 日产目标校验容差：锚点是刻意取的整数，插值章还会有折算误差，
 * 但 ±15% 已经足够卡住「改了 stageBase 或 chapterGrowth 忘了同步目标」这类漂移。
 */
export const DAILY_TARGET_TOLERANCE = 0.15;

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

/**
 * v0.5：TTK 上限略放宽——「达标」改按真实首通阵容（非爆发队）验关后，
 * 中手清关会比旧爆发队口径多 2~4 回合，上限跟着挪，避免契约倒逼虚高战力。
 *
 * v0.7：min 不再在这里写死。它原本是个从未被断言过的死字段（normal 2 / boss 6），
 * 两处各写一份必然漂移，所以统一从难度契约 difficultyBudget.TTK_FLOOR 取——
 * 那边是「不许秒推」这条护栏的真源，这里只负责上限「不许磨人」。
 */
export const STAGE_TTK: Readonly<Record<TtkStageKind, TtkBand>> = {
  normal: { min: TTK_FLOOR.normal, max: 8 },
  elite: { min: TTK_FLOOR.elite, max: 10 },
  boss: { min: TTK_FLOOR.boss, max: 20 },
};

/** 取关卡类型的 TTK 目标（未知类型按普通关） */
export function stageTtk(kind: string): TtkBand {
  return STAGE_TTK[kind as TtkStageKind] ?? STAGE_TTK.normal;
}

/**
 * 硬闸门关卡的 TTK 上限加成。
 *
 * 闸门按设计就是要吃掉若干回合的输出（条件不满足时整回合伤害压到 1），
 * 外加闸门怪本身多占一波。这部分时长是机制的一部分，不是配平失控，
 * 所以给带闸门的关卡一个显式加成，而不是把全局 TTK 带整体放宽 ——
 * 后者会让不带闸门的关卡也悄悄变松，护栏就失去了意义。
 */
export const GATED_TTK_EXTRA = 6;

/**
 * 超出基准波数的每一波给的 TTK 上限加成。
 *
 * TTK 带是按「一场遭遇」写的，但后期 Boss 关实际是四波（铺垫杂兵 + 闸门怪 + Boss 两形态）。
 * 不按波数折算的话，四波关会仅仅因为波多就判超标，逼着去砍本该有的关卡结构。
 */
export const BASE_WAVE_COUNT = 2;
export const PER_EXTRA_WAVE_TTK_EXTRA = 4;

/** 关卡 TTK 目标：带闸门放宽 GATED_TTK_EXTRA，多波按波数折算 */
export function stageTtkFor(kind: string, hasGate: boolean, waveCount = BASE_WAVE_COUNT): TtkBand {
  const band = stageTtk(kind);
  const extraWaves = Math.max(0, waveCount - BASE_WAVE_COUNT);
  return {
    min: band.min,
    max: band.max + (hasGate ? GATED_TTK_EXTRA : 0) + extraWaves * PER_EXTRA_WAVE_TTK_EXTRA,
  };
}

/**
 * 三星线：从关卡自己的 TTK 目标带推出来，而不是逐关手写。
 *
 * v0.8 重定义。旧的 starTurnLimit 是一批手填常量（2-8 关填了 24 回合），
 * 远高于实际通关回合，结果是**128 关全部满三星**——星级不再携带任何信息，
 * 玩家无论打得好坏都看到三颗星，「随便打」的手感有一半来自这里。
 *
 * 现在二星线 = 目标带上限（正常水平该有的回合数），三星线由 formulas/stars.ts
 * 按固定比例从二星线折出（打得好才够得到）。星线因此自动跟着波数、闸门与关卡类型走，
 * 改难度时不会再出现「TTK 调了、星线忘了跟」这种两张表打架的情况。
 */
export function starTurnLimitFor(kind: string, hasGate: boolean, waveCount = BASE_WAVE_COUNT): number {
  return stageTtkFor(kind, hasGate, waveCount).max;
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
 * - Boss 三波总量 = **本章铺垫关总量均值** × bossTotalTargetRatio ± budgetTolerance
 * - Boss 三波总量对**前一关**总量另有 [bossTotalMinRatio, bossTotalMaxRatio] 的宽区间兜底
 *
 * 为什么主契约用「本章均值」而不是「前一关」：铺垫关的波数由挑战 archetype 决定
 * （boardSeal / boardRock / selfHeal 是单波，multiWave / noHeart 是双波），前一关总量
 * 因此在 5418~19475 间随配方跳动，拿它当分母等于在量噪声——v0.4.2 实测同一批数值下
 * 前关口径的比值散布 2.73~4.35，均值口径只散布 3.58~4.54。
 */
export const BUDGET_GUARDRAIL = {
  bossFirstWaveMaxRatio: 2.5,
  /**
   * v0.6 从 2.0 下调到 1.8：闸门层把每章 index 7 的「临门验队关」额外加了一波闸门怪，
   * 这一关按设计就该是全章最重的铺垫关，Boss 相对它的比值自然被压低。
   * 主契约仍是「Boss 总量 ≈ 本章铺垫均值 × 4.0」，这条只兜「临门断崖」的底。
   */
  bossTotalMinRatio: 1.8,
  bossTotalMaxRatio: 4.2,
  /** Boss 总量目标 = 本章铺垫关总量均值 × 该倍数；实际值允许 ±budgetTolerance */
  bossTotalTargetRatio: 4.0,
  budgetTolerance: 0.15,
} as const;
