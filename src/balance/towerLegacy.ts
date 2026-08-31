/**
 * 通天塔传承树 + 印记兑换（纯数据 + 纯函数，零 UI / 零存档）
 *
 * 塔币的消耗端。设计红线：传承树只买「变化度」与「容错」，不卖战力天花板 ——
 * 一旦永久节点直接加攻防，就会形成「爬得高 → 变更强 → 爬更高」的正反馈螺旋，
 * 几周后老玩家闭眼推塔、新玩家永远追不上，roguelike 的重开价值当场归零。
 *
 * 因此这里的节点只做三件事：让每轮的选择更多（广纳/重掷/窥机）、
 * 让失败更便宜（稳固/续命/初启）、让长线产出更快（回气/印记）。
 */
import { ECONOMY } from './economy';
import type { RewardBundle } from './rewards';
import { TOWER } from './tower';

export type LegacyLine = 'insight' | 'root' | 'legacy';

export interface TowerLegacyNode {
  id: string;
  name: string;
  line: LegacyLine;
  /** 各级消耗的塔币（长度即最大等级） */
  costs: readonly number[];
  /** 按等级生成描述；level 0 表示「未解锁时的下一级效果」由调用方自行 +1 */
  desc: (level: number) => string;
  /** 角标（如「一次买断」「每日」），无则不显示 */
  tag?: string;
}

export const LEGACY_LINE_NAME: Readonly<Record<LegacyLine, string>> = {
  insight: '机变',
  root: '根基',
  legacy: '余荫',
};

/** 三列人话短提示（对齐 docs/ui-redesign/tower/legacy-ui-v1.png） */
export const LEGACY_LINE_HINT: Readonly<Record<LegacyLine, string>> = {
  insight: '每轮选择更多',
  root: '失败少亏 · 开局更稳',
  legacy: '爬得越久 · 赚得越多',
};

/** 面板顶栏教学句：先讲清「买啥」再看条目 */
export const LEGACY_PANEL_INTRO =
  '花印记买永久便利，重置后还在';

export const LEGACY_PANEL_FOOTER =
  '点条目消耗印记升级 · 点满后印记去商店花';

/** 每级「回气」为战斗层追加的回血比例 */
const REGEN_PER_LEVEL = 0.005;
/** 每级「印记·丰」的塔币产出加成 */
const COIN_PER_LEVEL = 0.1;
/** 「窥机」每级为罕有/奇珍提供的额外权重乘区 */
const INSIGHT_PER_LEVEL = 0.35;

export const TOWER_LEGACY_NODES: readonly TowerLegacyNode[] = [
  {
    id: 'legacy_pick_wide', name: '广纳', line: 'insight',
    costs: [600],
    tag: '一次买断',
    desc: () => '选机灵时多看 1 张（四选一）',
  },
  {
    id: 'legacy_reroll', name: '重掷', line: 'insight',
    costs: [200, 450, 800],
    desc: (lv) => `本轮机灵不满意，可重抽 ${lv} 次`,
  },
  {
    id: 'legacy_insight', name: '窥机', line: 'insight',
    costs: [250, 550, 1000],
    desc: (lv) => `罕有 / 奇珍机灵更容易出现（+${Math.round(INSIGHT_PER_LEVEL * lv * 100)}%）`,
  },
  {
    id: 'legacy_start_bless', name: '初启', line: 'root',
    costs: [300, 700, 1300],
    desc: (lv) => `开塔就白送 ${lv} 道随机机灵`,
  },
  {
    id: 'legacy_checkpoint', name: '稳固', line: 'root',
    costs: [500, 1200],
    desc: (lv) => `战败回到更近的层（每 ${Math.max(2, TOWER.checkpointEvery - lv)} 层一个存档）`,
  },
  {
    id: 'legacy_second_wind', name: '续命', line: 'root',
    costs: [1500],
    tag: '每日',
    desc: () => '每天第一次重置不占次数',
  },
  {
    id: 'legacy_regen', name: '回气', line: 'legacy',
    costs: [200, 400, 700, 1100],
    desc: (lv) => `打完战斗层多回一点血（${((TOWER.healPctPerFloor + REGEN_PER_LEVEL * lv) * 100).toFixed(1)}%）`,
  },
  {
    id: 'legacy_coin', name: '印记·丰', line: 'legacy',
    costs: [400, 900, 1600],
    desc: (lv) => `通关拿到的登塔印记 +${Math.round(COIN_PER_LEVEL * lv * 100)}%`,
  },
];

export const TOWER_LEGACY_MAP: ReadonlyMap<string, TowerLegacyNode> = new Map(
  TOWER_LEGACY_NODES.map((n) => [n.id, n]),
);

export function legacyNode(id: string): TowerLegacyNode | null {
  return TOWER_LEGACY_MAP.get(id) ?? null;
}

/** 升到下一级的花费；已满级返回 null */
export function legacyUpgradeCost(id: string, currentLevel: number): number | null {
  const node = TOWER_LEGACY_MAP.get(id);
  if (!node || currentLevel >= node.costs.length) return null;
  return node.costs[currentLevel];
}

/** 传承树聚合出的长期效果 */
export interface TowerLegacyEffects {
  /** 每层机缘候选数 */
  pickCount: number;
  /** 每轮可重掷次数 */
  rerollsPerRun: number;
  /** 罕有/奇珍的额外权重乘区（1 = 无倾斜） */
  tierBoost: number;
  /** 每轮开局额外白给的随机灵机数 */
  startBlesses: number;
  /** 存档点间隔 */
  checkpointEvery: number;
  /** 每日不占次数的免费重置数 */
  bonusFreeResets: number;
  /** 战斗层额外回血比例 */
  healPctBonus: number;
  /** 塔币产出乘区 */
  coinMult: number;
}

export function emptyLegacyEffects(): TowerLegacyEffects {
  return {
    pickCount: 3,
    rerollsPerRun: 0,
    tierBoost: 1,
    startBlesses: 0,
    checkpointEvery: TOWER.checkpointEvery,
    bonusFreeResets: 0,
    healPctBonus: 0,
    coinMult: 1,
  };
}

/**
 * 把「节点 id → 等级」聚合成长期效果。
 *
 * 与灵机聚合同样的口径：未知节点忽略、等级按 costs 长度封顶，
 * 存档被改坏最多是「没生效」，不会把数值带飞。
 */
export function aggregateLegacyEffects(
  owned: Readonly<Record<string, number>>,
): TowerLegacyEffects {
  const fx = emptyLegacyEffects();
  for (const [id, rawLevel] of Object.entries(owned)) {
    const node = TOWER_LEGACY_MAP.get(id);
    if (!node) continue;
    const lv = Math.min(node.costs.length, Math.floor(rawLevel));
    if (lv <= 0) continue;

    switch (id) {
      case 'legacy_pick_wide': fx.pickCount = 4; break;
      case 'legacy_reroll': fx.rerollsPerRun = lv; break;
      case 'legacy_insight': fx.tierBoost = 1 + INSIGHT_PER_LEVEL * lv; break;
      case 'legacy_start_bless': fx.startBlesses = lv; break;
      case 'legacy_checkpoint':
        fx.checkpointEvery = Math.max(2, TOWER.checkpointEvery - lv);
        break;
      case 'legacy_second_wind': fx.bonusFreeResets = 1; break;
      case 'legacy_regen': fx.healPctBonus = REGEN_PER_LEVEL * lv; break;
      case 'legacy_coin': fx.coinMult = 1 + COIN_PER_LEVEL * lv; break;
      default: break;
    }
  }
  return fx;
}

/** 传承树全部点满需要的塔币总量（数值校验与文案用） */
export function legacyTotalCost(): number {
  return TOWER_LEGACY_NODES.reduce(
    (sum, n) => sum + n.costs.reduce((a, b) => a + b, 0),
    0,
  );
}

// ─────────────────────────────────────────────────────────────
// 印记兑换：真正的无限消耗端
// ─────────────────────────────────────────────────────────────

/**
 * 传承树是有限的（点满即止），塔币若只有这一个出口，满级玩家的产出就彻底作废。
 * 兑换挂在商店「印记」页，靠每日次数而非总量限制通胀；塔内不再另开兑换口。
 */
export interface TowerExchangeOption {
  id: string;
  name: string;
  cost: number;
  /** 每日可兑换次数 */
  dailyLimit: number;
  reward: RewardBundle;
}

export const TOWER_EXCHANGES: readonly TowerExchangeOption[] = [
  {
    id: 'tex_coins', name: '灵宠币', cost: 40, dailyLimit: 5,
    reward: { coins: 900 },
  },
  {
    id: 'tex_lingyu', name: '灵玉', cost: 90, dailyLimit: 3,
    reward: { lingyu: 30 },
  },
  {
    id: 'tex_universal', name: '通用碎片', cost: 150, dailyLimit: 2,
    reward: { universal: ECONOMY.universal.towerMilestone },
  },
];

export const TOWER_EXCHANGE_MAP: ReadonlyMap<string, TowerExchangeOption> = new Map(
  TOWER_EXCHANGES.map((e) => [e.id, e]),
);
