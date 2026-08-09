/**
 * 每日任务（纯数据 + 选题，零状态）
 *
 * 固定 8 条清单 + 活跃度宝箱（25/50/75/100）。
 * 进度由 EventBus/业务侧 reportQuest 驱动，状态存 SaveData.daily。
 */
import { ECONOMY } from './economy';
import type { RewardBundle } from './rewards';

/** 任务触发源：与 EventBus / reportQuest 一一对应 */
export type QuestTrigger =
  | 'login'
  | 'stageClear'
  | 'staminaSpend'
  | 'comboReach'
  | 'gachaPull'
  | 'realmClear'
  | 'petLevelUp'
  | 'shopBuy'
  | 'towerFloor';

export interface DailyQuestDef {
  id: string;
  name: string;
  trigger: QuestTrigger;
  /** 完成所需累计进度 */
  target: number;
  /** comboReach 专用：单场需达到的 Combo 数 */
  threshold?: number;
  /** 领取后计入的活跃度 */
  activity: number;
  reward: RewardBundle;
}

export interface ActivityChestDef {
  id: string;
  /** 领取门槛（活跃度） */
  need: number;
  reward: RewardBundle;
}

/**
 * 固定 8 条：覆盖登录 / 主线 / 体力 / 养成 / 召唤 / 秘境 / 塔 / 技巧。
 * 单题灵宠币保持克制；大头放活跃宝箱。
 */
export const DAILY_QUEST_POOL: readonly DailyQuestDef[] = [
  {
    id: 'dq_login', name: '登录游戏', trigger: 'login', target: 1, activity: 10,
    reward: { lingyu: 10 },
  },
  {
    id: 'dq_clear3', name: '通关 3 个关卡', trigger: 'stageClear', target: 3, activity: 20,
    reward: { coins: 60, exp: 150 },
  },
  {
    id: 'dq_stamina30', name: '消耗体力 30 点', trigger: 'staminaSpend', target: 30, activity: 15,
    reward: { coins: 50, exp: 100 },
  },
  {
    id: 'dq_levelup1', name: '升级灵宠 1 次', trigger: 'petLevelUp', target: 1, activity: 10,
    reward: { coins: 50 },
  },
  {
    id: 'dq_gacha1', name: '召唤 1 次', trigger: 'gachaPull', target: 1, activity: 15,
    reward: { coins: 80 },
  },
  {
    id: 'dq_realm1', name: '完成 1 次五行秘境', trigger: 'realmClear', target: 1, activity: 15,
    reward: { lingyu: 20, exp: 200 },
  },
  {
    id: 'dq_tower3', name: '通天塔攀爬 3 层', trigger: 'towerFloor', target: 3, activity: 15,
    reward: { lingyu: 20 },
  },
  {
    id: 'dq_combo8', name: '单场达成 8 连击', trigger: 'comboReach', target: 1, threshold: 8, activity: 10,
    reward: { lingyu: 15 },
  },
];

export const QUEST_MAP: ReadonlyMap<string, DailyQuestDef> =
  new Map(DAILY_QUEST_POOL.map((q) => [q.id, q]));

/** 活跃度上限展示（任务合计 110，宝箱封顶 100） */
export const DAILY_ACTIVITY_CAP = 100;

/**
 * 活跃宝箱：可超额做任务，但领奖只看 100 档。
 * 替代旧「全清横幅」，跳过 1～2 条也能拿终奖。
 */
export const DAILY_ACTIVITY_CHESTS: readonly ActivityChestDef[] = [
  {
    id: 'dq_act_25', need: 25,
    reward: { coins: 80, stamina: 20 },
  },
  {
    id: 'dq_act_50', need: 50,
    reward: { lingyu: 30, exp: 300 },
  },
  {
    id: 'dq_act_75', need: 75,
    reward: { lingyu: 40, universal: 4 },
  },
  {
    id: 'dq_act_100', need: 100,
    reward: {
      lingyu: 50,
      coins: 100,
      universal: ECONOMY.universal.dailyAllClear,
      stamina: ECONOMY.stamina.checkinBonus,
    },
  },
];

/** @deprecated 兼容旧全清 id：等同活跃 100 档 */
export const QUEST_ALL_CLEAR_ID = 'dq_act_100';
/** @deprecated 见 DAILY_ACTIVITY_CHESTS[3] */
export const QUEST_ALL_CLEAR_REWARD: RewardBundle = DAILY_ACTIVITY_CHESTS[3].reward;

/** 每日出题数（固定清单） */
export const DAILY_QUEST_COUNT = DAILY_QUEST_POOL.length;

/** 每日首胜奖励倍率（灵宠币与经验）；v0.5 收紧 2→1.5 */
export const DAILY_FIRST_WIN_MULT = 1.5;

/** 当日任务：固定 8 条（dateKey 保留签名，便于日后做轮换变体） */
export function dailyQuestsOf(_dateKey: string): readonly DailyQuestDef[] {
  return DAILY_QUEST_POOL;
}

/** 领取任务后的活跃度合计（只计已领奖任务） */
export function activityFromClaimed(claimedIds: readonly string[]): number {
  let sum = 0;
  for (const q of DAILY_QUEST_POOL) {
    if (claimedIds.includes(q.id)) sum += q.activity;
  }
  return sum;
}
