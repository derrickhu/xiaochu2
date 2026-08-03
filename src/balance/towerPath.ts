/**
 * 通天塔分支路径与事件层（纯数据 + 纯函数，零 UI / 零存档）
 *
 * 只有机缘还不够：如果每一层都是「打一场 → 选一张」，节奏在第 20 层就会固化。
 * 分支让玩家每层都要做一次取舍 —— 精英层更难但机缘更好，事件层不打架但也不给机缘，
 * 休整层拿回血换掉一次成长。跳过战斗的代价是「到达更高层时更弱」，这个交换本身就是玩法。
 */
import { TOWER } from './tower';

export type TowerFloorKind = 'battle' | 'elite' | 'event' | 'rest' | 'guard';

export interface TowerFloorKindDef {
  kind: TowerFloorKind;
  name: string;
  /**
   * 角标：先回答「交不交手 / 难不难」。
   * 玩家扫一眼就要懂，禁止塞「×1.35」这类开发者语言。
   */
  badge: string;
  /** 一句主文案：这条路会发生什么 */
  summary: string;
  /** 一行回报：换来什么（沿用「机缘」这个已教会的词） */
  payoff: string;
  /** 是否需要进战斗 */
  combat: boolean;
  /** 难度乘区（仅战斗层有意义） */
  difficultyMult: number;
  /** 敌人波数增量 */
  extraWaves: number;
  /** 通关后额外塔币 */
  coinBonus: number;
  /** 机缘高品质倾斜（等同守关层：罕有/奇珍更易出现） */
  richBless: boolean;
}

export const TOWER_FLOOR_KINDS: Readonly<Record<TowerFloorKind, TowerFloorKindDef>> = {
  battle: {
    kind: 'battle', name: '寻常道',
    badge: '常规',
    summary: '打一场普通战',
    payoff: '胜后选 1 张机缘',
    combat: true, difficultyMult: 1, extraWaves: 0, coinBonus: 0, richBless: false,
  },
  elite: {
    kind: 'elite', name: '险径',
    badge: '更难',
    summary: '敌人更强，多打一波',
    payoff: '更容易出罕有/奇珍 · +10 印记',
    combat: true, difficultyMult: 1.35, extraWaves: 1, coinBonus: 10, richBless: true,
  },
  event: {
    kind: 'event', name: '奇遇',
    badge: '不打架',
    summary: '随机好事或坏事',
    payoff: '可能回血、掉血、换机缘、得印记',
    combat: false, difficultyMult: 1, extraWaves: 0, coinBonus: 0, richBless: false,
  },
  rest: {
    kind: 'rest', name: '静室',
    badge: '休整',
    summary: '不战斗，调息养伤',
    payoff: '回复 25% 生命 · 无机缘',
    combat: false, difficultyMult: 1, extraWaves: 0, coinBonus: 0, richBless: false,
  },
  guard: {
    kind: 'guard', name: '守关',
    badge: '守关',
    summary: '镇塔之主当前',
    payoff: '胜后大补给 · 珍稀机缘更易现身',
    combat: true, difficultyMult: 1, extraWaves: 1, coinBonus: 0, richBless: true,
  },
};

/** 休整层的回复比例（与静室 payoff 文案同步） */
export const TOWER_REST_HEAL_PCT = 0.25;

/** 前若干层不给分支：新手先把「打一层选一张」的基本节奏走顺 */
export const TOWER_BRANCH_FROM_FLOOR = 4;

/** 每层给出的路径数 */
export const TOWER_PATH_COUNT = 3;

const BRANCH_WEIGHT: Readonly<Record<Exclude<TowerFloorKind, 'guard'>, number>> = {
  battle: 100,
  elite: 46,
  event: 40,
  rest: 20,
};

/**
 * 抽取某层的可选路径。
 *
 * 守关层不给选择；分支层保证至少有一个战斗选项 —— 否则玩家可以靠连续的
 * 事件层与休整层无伤刷层，塔的损耗战定位当场作废。
 */
export function rollTowerPaths(
  floor: number,
  rng: () => number = Math.random,
): TowerFloorKind[] {
  if (floor > 0 && floor % TOWER.milestoneEvery === 0) return ['guard'];
  if (floor < TOWER_BRANCH_FROM_FLOOR) return ['battle'];

  const pool = (Object.keys(BRANCH_WEIGHT) as Array<Exclude<TowerFloorKind, 'guard'>>).slice();
  const picked: TowerFloorKind[] = [];
  while (picked.length < TOWER_PATH_COUNT && pool.length > 0) {
    const weights = pool.map((k) => BRANCH_WEIGHT[k]);
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        idx = i;
        break;
      }
    }
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }

  if (!picked.some((k) => TOWER_FLOOR_KINDS[k].combat)) {
    picked[picked.length - 1] = rng() < 0.5 ? 'battle' : 'elite';
  }
  return picked;
}

// ─────────────────────────────────────────────────────────────
// 事件层
// ─────────────────────────────────────────────────────────────

export type TowerEventEffect =
  /** 回复最大生命的 pct */
  | { kind: 'heal'; pct: number }
  /** 付出 hpCost 比例的生命换取 count 道机缘 */
  | { kind: 'trade'; count: number; hpCost: number }
  /** winChance 概率得罕有以上机缘，否则损失 hpCost 比例生命 */
  | { kind: 'gamble'; winChance: number; hpCost: number }
  /** 直接得塔币 */
  | { kind: 'coins'; amount: number }
  /** 弃掉一道随机机缘，换取 count 道新机缘 */
  | { kind: 'reforge'; count: number };

export interface TowerEventDef {
  id: string;
  name: string;
  /** 事件描述，展示在确认弹层上 */
  text: string;
  effect: TowerEventEffect;
  /** 抽取权重 */
  weight: number;
}

export const TOWER_EVENTS: readonly TowerEventDef[] = [
  {
    id: 'ev_spring', name: '灵泉',
    text: '崖下有泉，饮之神清气爽。回复 30% 生命。',
    effect: { kind: 'heal', pct: 0.3 }, weight: 100,
  },
  {
    id: 'ev_omen', name: '凶兆',
    text: '壁画中似有目光注视。折损 12% 生命，换来两道机缘。',
    effect: { kind: 'trade', count: 2, hpCost: 0.12 }, weight: 70,
  },
  {
    id: 'ev_gamble', name: '试炼碑',
    text: '碑上刻着一道试题。半数机会得一道珍稀机缘，否则折损 18% 生命。',
    effect: { kind: 'gamble', winChance: 0.5, hpCost: 0.18 }, weight: 60,
  },
  {
    id: 'ev_cache', name: '秘藏',
    text: '砖缝里嵌着前人留下的印记。',
    effect: { kind: 'coins', amount: 40 }, weight: 55,
  },
  {
    id: 'ev_reforge', name: '淬炼炉',
    text: '炉火可熔旧机缘。舍去一道已得机缘，重铸为两道新的。',
    effect: { kind: 'reforge', count: 2 }, weight: 45,
  },
];

export const TOWER_EVENT_MAP: ReadonlyMap<string, TowerEventDef> = new Map(
  TOWER_EVENTS.map((e) => [e.id, e]),
);

export function rollTowerEvent(rng: () => number = Math.random): TowerEventDef {
  const total = TOWER_EVENTS.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng() * total;
  for (const e of TOWER_EVENTS) {
    roll -= e.weight;
    if (roll <= 0) return e;
  }
  return TOWER_EVENTS[TOWER_EVENTS.length - 1];
}
