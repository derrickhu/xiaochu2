/**
 * 通天塔（纯数据 + 关卡构造，零 UI / 零存档）
 *
 * 长线内容。与主线的核心差异：HP 与技能 CD 跨层继承，每层只回一小口血 ——
 * 主线是单场爆发，塔是资源损耗战，同一套战斗内核出两种完全不同的策略。
 */
import type { EncounterRef } from './enemies';
import { ELEMENTS } from './combat';
import { ECONOMY } from './economy';
import { GROWTH } from './growth';
import type { RewardBundle } from './rewards';
import { registerExtraStage, type StageDef } from './stages';
import { resolveTowerAffix, type TowerAffixPath } from './towerAffix';

export const TOWER = {
  /**
   * 战斗层胜利回复的最大 HP 比例。
   *
   * 旧版是每层回 10%，爬 10 层就回满，HP 根本不是资源，塔在数学上不可能难。
   * 压到 2% 之后 HP 才第一次变成稀缺品，「要不要走守关层」也才成为真决策。
   */
  healPctPerFloor: 0.02,
  /** 守关层（里程碑）胜利的回复比例，作为闯关补给 */
  healPctPerGuard: 0.15,
  /** 续战 HP 下限，避免残血锁死无法通过任何一层 */
  minCarryHpPct: 0.08,
  /** 存档点间隔：战败回退到最近存档点而非第 1 层 */
  checkpointEvery: 5,
  /** 里程碑间隔：每 N 层发灵玉 + 碎片包 */
  milestoneEvery: 10,
  /** 每日重置次数上限（含广告） */
  dailyResets: 2,
  /** 其中免费次数，超出部分需看广告 */
  freeResets: 1,
  /**
   * 层数 → 等效章节：每 floorsPerChapter 层等于主线一章。
   * enemyStats 的 chapter 允许小数，因此可以拿到比主线细得多的连续曲线，
   * 同时保持 HP/ATK/DEF 三条成长比例与主线一致。
   */
  floorsPerChapter: 8,
  /**
   * 难度系数 = difficultyBase × difficultyGrowth^floor。
   *
   * v0.8：塔必须比主线硬。旧曲线 0.85×1.012^n 在 F28 只有 ~1.19，
   * Lv1★1 高手单场 9 回合就能过——主线同档已不允许秒推，塔却比主线软。
   * 提到 0.90×1.032^n 后：F1≈0.93（仍可进门）、F15≈1.43、F20≈2.11（守关）、
   * F28≈2.17、F30≈2.89（守关）。具体深度由 difficultyBudget 的塔墙验收钉死。
   *
   * v1.0：主动技改成消珠充能（balance/skillCharge）后放技频率整体上移，
   * 第 4 章锚点中手一路推到 F39，越过塔墙上限 38。塔墙是**相对**护栏
   * （「塔要比同进度主线硬」），所以正确的回应是把塔的曲线跟着抬，而不是放宽护栏。
   * 1.032 → 1.033 是扫出来的最小幅度：ch4 锚点深度回到 F35，其余锚点与 Lv1 墙不变。
   */
  difficultyBase: 0.90,
  difficultyGrowth: 1.033,
  /** 里程碑层（每 milestoneEvery 层）的守关加成 */
  milestoneDifficultyMult: 1.25,
  /** 三星回合上限（塔不看星，仅用于结算公式的星数输入） */
  starTurnLimit: 12,
  /** 每层敌人波数 */
  wavesPerFloor: 2,
  dropTableId: 'dt_trial_normal',
  /**
   * 战斗掉落（灵宠币 / 经验）的折算比例。
   *
   * 塔零体力、又不吃主线的 repeatClearPct，若按精英/Boss 档全额发放，
   * 一天两轮爬到 20 层就能拿到 2200 币 / 1.8 万经验 —— 约为同期主线日产目标的
   * 2~3 倍，且是叠在主线与秘境之上的增量，等于开了一条无限刷通道。
   * 量级对齐主线重复通关的 repeatClearPct。
   */
  battleDropPct: 0.2,
  /**
   * 塔战斗不产通用碎片。
   *
   * 精英层 4 / 守关层 6 的固定量与章节无关，2 轮 ×20 层就是 168 枚，
   * 而日产目标只有 54。塔侧的碎片供给改由里程碑（每 10 层一次性 12 枚）
   * 与印记兑换承担，两者都有天然次数限制。
   */
  battleUniversalPct: 0,
} as const;

/**
 * 塔币（登塔印记）：唯一跨 run 保留的产出，用于永久传承解锁。
 *
 * 结算按「本次 run 到达的最高层」而非累计层数 —— 否则反复刷最安全的前 10 层
 * 也能稳定产币，塔币获取动机就和「爬得更高」脱钩了。
 */
export const TOWER_COIN = {
  /**
   * 本 run 每首次抵达一层 +N（累计即等于最高层）。
   *
   * 印记的日用出口在商店，最便宜一档 40。1/层时两轮爬到 20 层只有 40，
   * 卡在日限边缘；2/层后 F15 日限 45、F20 日限 60，都能换到一档灵宠币。
   */
  perFloor: 2,
  /** 超过历史最高纪录的层，每层额外 +N（一次性） */
  perBreakthrough: 3,
  /** 每个守关层首次通过一次性 +N */
  perGuardFirstClear: 30,
  /** 每日基础结算上限倍率：上限 = 历史最高层 × N（突破与守关奖励不受此限） */
  dailyBaseCapMult: 3,
  /** 历史最高层为 0 时的每日基础保底额度 */
  dailyBaseCapFloor: 30,
} as const;

export const TOWER_MILESTONE_REWARD: RewardBundle = {
  lingyu: 60,
  shards: 12,
  universal: ECONOMY.universal.towerMilestone,
};

/**
 * 塔内循环用的杂兵池，按属性轮换保证玩家不能只带一种属性。
 *
 * v0.8 去掉炽炎蝠群 / 藤蔓妖泥 / 铁鳞蝎兵这类低防软怪——旧池按层号取模时，
 * 第 28 层正好落到「蝠群 + 藤泥」，合计血量只有相邻层的六成，形成「软段」，
 * 1 级队在这里被放过去。塔的池子一律用精英档，软硬差压在 1.3 倍以内。
 */
const TOWER_MOBS: readonly string[] = [
  'enemy_golem_earth',
  'enemy_serpent_water',
  'enemy_scorpion_metal',
  'enemy_toad_water',
  'enemy_thorn_scorpion_metal',
  'enemy_wither_bat_fire',
  'enemy_golem_bulwark_earth',
  'enemy_blunt_scorpion_metal',
  'enemy_sealward_toad_water',
  'enemy_devour_serpent_water',
];

const TOWER_GUARDS: readonly string[] = [
  'enemy_bamboo_tyrant_wood',
  'enemy_crystal_boss_earth',
  'enemy_thunderlord_boss_wood',
  'enemy_scorpion_king_metal',
  'enemy_bat_king_fire',
  'enemy_serpent_king_water',
  'enemy_crystal_warden_earth',
];

export function isMilestoneFloor(floor: number): boolean {
  return floor > 0 && floor % TOWER.milestoneEvery === 0;
}

/**
 * 战败回退到的层：最近一个存档点。
 * @param every 存档点间隔，传承「稳固」会把它压到更小
 */
export function checkpointFloorOf(floor: number, every: number = TOWER.checkpointEvery): number {
  const step = Math.max(1, Math.floor(every));
  return Math.floor(Math.max(0, floor - 1) / step) * step + 1;
}

export function towerStageId(floor: number): string {
  return `tower_f${floor}`;
}

/**
 * 层数 → 等效章节。绝对刻度，**不随玩家变强而上浮**。
 *
 * 曾经试过给它加一条「跟随主线进度」的地板来消灭空气层，那是隐性 level scaling，
 * 也是 Oblivion 留下的著名反面案例：玩家升级后敌人同步变强，成长感被直接抵消，
 * 甚至反向激励「别练级」。塔里的成长感必须来自「同一条曲线上我能站得更高」，
 * 所以这条曲线一个字都不能动，空气层由 towerEntryFloor 的直登来解决。
 */
function towerChapter(floor: number): number {
  return 1 + (floor - 1) / TOWER.floorsPerChapter;
}

/** 难度主曲线，不含守关层加成 */
function towerBaseDifficulty(floor: number): number {
  return TOWER.difficultyBase * Math.pow(TOWER.difficultyGrowth, floor);
}

/** 指定层的难度系数（守关层已含加成） */
export function towerDifficulty(floor: number): number {
  const base = towerBaseDifficulty(floor);
  return isMilestoneFloor(floor) ? base * TOWER.milestoneDifficultyMult : base;
}

/**
 * 通关该层后回复的最大 HP 比例。
 * @param bonus 传承「回气」追加的战斗层回复（守关层不叠，避免补给点被拉爆）
 */
export function towerHealPctFor(floor: number, bonus = 0): number {
  return isMilestoneFloor(floor)
    ? TOWER.healPctPerGuard
    : TOWER.healPctPerFloor + Math.max(0, bonus);
}

/**
 * 某层敌人的强度，折算成「相当于主线第几章」。
 *
 * 直接读 towerChapter 会漏掉难度系数（第 50 层的 1.54 相当于多出一章半），
 * 拿它跟主线进度比会严重低估塔的实际压力，直登层就会给高。
 *
 * 走主曲线、不含守关层加成：守关的 ×1.25 是「这一层特别硬」的局部尖峰，
 * 算进来会让曲线在每 10 层处回落一次，「等效强度随层递增」这个前提就不成立了。
 */
export function towerEquivalentChapter(floor: number): number {
  const g = GROWTH.enemy.chapterGrowthHp;
  const scale = Math.pow(g, towerChapter(floor) - 1) * towerBaseDifficulty(floor);
  return 1 + Math.log(scale) / Math.log(g);
}

/** 直登搜索上限，纯粹防止配置写错时把循环拉爆 */
const ENTRY_FLOOR_MAX = 300;

/**
 * 按主线进度可以「直登」到的层。
 *
 * 塔的曲线是绝对的，于是推到第 8 章才第一次进塔的玩家，前 40 层全是空气 ——
 * 这是一次性的入场摩擦，业界（DNF 极限之塔的跳层、领主之塔的直登起步）
 * 一律用跳层解决，而不是把敌人拉到玩家头上。跳过的层不发奖，只让玩家
 * 少点 40 次「一刀秒」，成长感反而更强：变强的体现就是起步层数变高。
 *
 * 留一章缓冲（target = 已通关章数 - 1），直登点应当稳过，真正的挑战在它上面。
 */
export function towerEntryFloor(clearedChapters: number): number {
  // 一章未通就谈不上「把底层甩在后面」，塔的开头本来就是配着他走的
  if (clearedChapters < 2) return 1;
  const target = clearedChapters - 1;
  let floor = 1;
  while (floor < ENTRY_FLOOR_MAX && towerEquivalentChapter(floor + 1) <= target) floor++;
  return floor;
}

/** 每日基础塔币结算上限（突破与守关奖励不受限） */
export function towerDailyBaseCap(bestFloor: number): number {
  return Math.max(
    TOWER_COIN.dailyBaseCapFloor,
    Math.floor(bestFloor * TOWER_COIN.dailyBaseCapMult),
  );
}

/**
 * 构造并注册指定层关卡（层数无上限，按需生成）。
 *
 * 难度与波数由调用方按所选路径传入（见 balance/towerPath.ts）。
 * 本层试炼规则见 towerAffix：险径 / 守关必带可见规则，寻常道后期才上轻规则。
 */
export function buildTowerStage(
  floor: number,
  opts: { difficultyMult?: number; extraWaves?: number; kind?: TowerAffixPath } = {},
): StageDef {
  const milestone = isMilestoneFloor(floor);
  const kind: TowerAffixPath = opts.kind ?? (milestone ? 'guard' : 'battle');
  const extraWaves = Math.max(0, Math.floor(opts.extraWaves ?? 0));
  const waves = TOWER.wavesPerFloor + extraWaves;
  const encounters: EncounterRef[] = [];
  for (let i = 0; i < waves; i++) {
    const id = TOWER_MOBS[(floor - 1 + i) % TOWER_MOBS.length];
    encounters.push({ kind: 'mob', id });
  }
  if (milestone) {
    const guard = TOWER_GUARDS[(floor / TOWER.milestoneEvery - 1) % TOWER_GUARDS.length];
    encounters.push({ kind: 'mob', id: guard });
  }

  const affix = resolveTowerAffix(floor, kind);
  if (affix?.extraMob) {
    const carrier: EncounterRef = { kind: 'mob', id: affix.extraMob };
    if (milestone) {
      const boss = encounters.pop();
      encounters.push(carrier);
      if (boss) encounters.push(boss);
    } else if (extraWaves > 0) {
      encounters[encounters.length - 1] = carrier;
    } else {
      encounters.push(carrier);
    }
  }

  return registerExtraStage({
    id: towerStageId(floor),
    chapter: towerChapter(floor),
    index: floor,
    name: `通天塔 第 ${floor} 层`,
    // 背景按层轮换五行，避免长时间爬塔视觉疲劳
    element: ELEMENTS[(floor - 1) % ELEMENTS.length],
    type: milestone ? 'boss' : 'elite',
    dropTableId: TOWER.dropTableId,
    encounters,
    difficulty: towerDifficulty(floor) * Math.max(0.1, opts.difficultyMult ?? 1),
    isBoss: milestone,
    starTurnLimit: TOWER.starTurnLimit,
    displayLabel: `通天塔 第 ${floor} 层`,
    mechanics: affix?.mechanics,
    hintTags: affix ? [affix.name] : undefined,
    hintText: affix?.hint,
  });
}
