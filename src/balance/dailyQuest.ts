/**
 * 每日任务（纯数据 + 选题，零状态）
 *
 * 每天从任务池按日期轮换出 4 条，全清额外奖励。进度由 EventBus 事件驱动，
 * 状态存 SaveData.daily.questProgress，跨日整体重置。
 */
import { ECONOMY } from './economy';
import type { RewardBundle } from './rewards';

/** 任务触发源：与 EventBus 事件一一对应 */
export type QuestTrigger =
  | 'stageClear'
  | 'comboReach'
  | 'gachaPull'
  | 'realmClear'
  | 'petLevelUp'
  | 'petStarUp'
  | 'towerFloor';

export interface DailyQuestDef {
  id: string;
  name: string;
  trigger: QuestTrigger;
  /** 完成所需累计进度 */
  target: number;
  /** comboReach 专用：单场需达到的 Combo 数 */
  threshold?: number;
  reward: RewardBundle;
}

export const DAILY_QUEST_POOL: readonly DailyQuestDef[] = [
  {
    id: 'dq_clear3', name: '通关 3 个关卡', trigger: 'stageClear', target: 3,
    reward: { coins: 200, exp: 200 },
  },
  {
    id: 'dq_combo8', name: '单场达成 8 连击', trigger: 'comboReach', target: 1, threshold: 8,
    reward: { lingyu: 20 },
  },
  {
    id: 'dq_gacha1', name: '召唤 1 次', trigger: 'gachaPull', target: 1,
    reward: { coins: 300 },
  },
  {
    id: 'dq_realm1', name: '完成 1 次五行秘境', trigger: 'realmClear', target: 1,
    reward: { lingyu: 25, exp: 300 },
  },
  {
    id: 'dq_levelup1', name: '升级灵宠 1 次', trigger: 'petLevelUp', target: 1,
    reward: { coins: 250 },
  },
  {
    id: 'dq_tower3', name: '通天塔攀爬 3 层', trigger: 'towerFloor', target: 3,
    reward: { lingyu: 25 },
  },
  {
    id: 'dq_starup1', name: '升星灵宠 1 次', trigger: 'petStarUp', target: 1,
    reward: { lingyu: 40 },
  },
];

export const QUEST_MAP: ReadonlyMap<string, DailyQuestDef> =
  new Map(DAILY_QUEST_POOL.map((q) => [q.id, q]));

/** 全清奖励占位 id（与任务 id 同一命名空间，共用 questClaimed 列表） */
export const QUEST_ALL_CLEAR_ID = 'dq_all_clear';

/**
 * 全清额外奖励：只发可直接花的货币（灵玉 + 灵宠币 + 通用碎片），不发随机碎片。
 * 通用碎片走这里而非随机碎片，是为了让「每天全清」成为可规划的定向升星来源。
 */
export const QUEST_ALL_CLEAR_REWARD: RewardBundle = {
  lingyu: 50,
  coins: 500,
  universal: ECONOMY.universal.dailyAllClear,
  stamina: ECONOMY.stamina.checkinBonus,
};

/** 每日出题数 */
export const DAILY_QUEST_COUNT = 4;

/** 每日首胜奖励倍率（灵宠币与经验） */
export const DAILY_FIRST_WIN_MULT = 2;

/** YYYY-MM-DD → 稳定整数，保证同一天全端选出同一组任务 */
function dateSeed(dateKey: string): number {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) {
    h = (h * 31 + dateKey.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** 当日 4 条任务：按日期在池内滑窗轮换，保证每天题面不同且可复现 */
export function dailyQuestsOf(dateKey: string): readonly DailyQuestDef[] {
  const pool = DAILY_QUEST_POOL;
  const start = dateSeed(dateKey) % pool.length;
  const picked: DailyQuestDef[] = [];
  for (let i = 0; i < Math.min(DAILY_QUEST_COUNT, pool.length); i++) {
    picked.push(pool[(start + i) % pool.length]);
  }
  return picked;
}
