/**
 * 通天塔（纯数据 + 关卡构造，零 UI / 零存档）
 *
 * 长线内容。与主线的核心差异：HP 与技能 CD 跨层继承，每层只回一小口血 ——
 * 主线是单场爆发，塔是资源损耗战，同一套战斗内核出两种完全不同的策略。
 */
import type { EncounterRef } from './enemies';
import { ELEMENTS } from './combat';
import { ECONOMY } from './economy';
import type { RewardBundle } from './rewards';
import { registerExtraStage, type StageDef } from './stages';

export const TOWER = {
  /** 每层结束回复的最大 HP 比例（不回满是塔的立身之本） */
  healPctPerFloor: 0.10,
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
  /** 基础难度系数 */
  difficultyBase: 0.92,
  /** 里程碑层（每 milestoneEvery 层）的守关加成 */
  milestoneDifficultyMult: 1.25,
  /** 三星回合上限（塔不看星，仅用于结算公式的星数输入） */
  starTurnLimit: 12,
  /** 每层敌人波数 */
  wavesPerFloor: 2,
  dropTableId: 'dt_trial_normal',
} as const;

export const TOWER_MILESTONE_REWARD: RewardBundle = {
  lingyu: 60,
  shards: 12,
  universal: ECONOMY.universal.towerMilestone,
};

/**
 * 塔内循环用的杂兵池，按属性轮换保证玩家不能只带一种属性。
 *
 * 取法是「按层号前移一位」，因此池长决定循环周期：6 条时每 6 层就回到同一对，
 * 扩到 10 条后要 10 层才重复，属性轮换也跟着变长。
 */
const TOWER_MOBS: readonly string[] = [
  'enemy_slime_wood',
  'enemy_bat_fire',
  'enemy_golem_earth',
  'enemy_serpent_water',
  'enemy_scorpion_metal',
  'enemy_toad_water',
  'enemy_scorpion_swarm_metal',
  'enemy_bat_swarm_fire',
  'enemy_vine_slime_wood',
  'enemy_pebble_earth',
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

/** 战败回退到的层：最近一个存档点 */
export function checkpointFloorOf(floor: number): number {
  return Math.floor(Math.max(0, floor - 1) / TOWER.checkpointEvery) * TOWER.checkpointEvery + 1;
}

export function towerStageId(floor: number): string {
  return `tower_f${floor}`;
}

function towerChapter(floor: number): number {
  return 1 + (floor - 1) / TOWER.floorsPerChapter;
}

/** 构造并注册指定层关卡（层数无上限，按需生成） */
export function buildTowerStage(floor: number): StageDef {
  const milestone = isMilestoneFloor(floor);
  const encounters: EncounterRef[] = [];
  for (let i = 0; i < TOWER.wavesPerFloor; i++) {
    const id = TOWER_MOBS[(floor - 1 + i) % TOWER_MOBS.length];
    encounters.push({ kind: 'mob', id });
  }
  if (milestone) {
    const guard = TOWER_GUARDS[(floor / TOWER.milestoneEvery - 1) % TOWER_GUARDS.length];
    encounters.push({ kind: 'mob', id: guard });
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
    difficulty: TOWER.difficultyBase * (milestone ? TOWER.milestoneDifficultyMult : 1),
    isBoss: milestone,
    starTurnLimit: TOWER.starTurnLimit,
    displayLabel: `通天塔 第 ${floor} 层`,
  });
}
