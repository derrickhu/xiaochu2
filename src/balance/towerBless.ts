/**
 * 通天塔灵机（纯数据 + 纯函数，零 UI / 零存档）
 *
 * 一次登塔 Run 内临时构筑：每层胜利三选一，run 结束清零。
 * 设计红线是「词条不能只是攻击 +10%」—— 数值类只占一半用来滚雪球，
 * 其余必须改变行为（触发类），否则爬塔只是换了皮的重复点击。
 *
 * 效果不走 if 散落各处：所有灵机聚合成一份 TowerRunModifiers，
 * 由 BattleController 在构造时一次性吃进去，战斗内不再感知「灵机」这个概念。
 */
import type { Element } from './combat';
import { ELEMENTS } from './combat';
import { ELEMENT_NAME } from './ui';

export type BlessCategory = 'stat' | 'trigger';
export type BlessTier = 'common' | 'rare' | 'epic';

export interface TowerBlessDef {
  id: string;
  name: string;
  category: BlessCategory;
  tier: BlessTier;
  /** 最大叠加层数（同名可叠，叠满后不再进入候选池） */
  maxStacks: number;
  /** 按当前叠加层数生成描述 */
  desc: (stacks: number) => string;
  /** 五行真意专用 */
  element?: Element;
}

/** 抽取权重：品质越高越稀有 */
export const BLESS_TIER_WEIGHT: Readonly<Record<BlessTier, number>> = {
  common: 100,
  rare: 42,
  epic: 14,
};

/** 守关层的高品质倾斜（权重乘区） */
export const BLESS_GUARD_TIER_BOOST: Readonly<Record<BlessTier, number>> = {
  common: 0.45,
  rare: 1.6,
  epic: 3.0,
};

/** 每次三选一的候选数 */
export const BLESS_PICK_COUNT = 3;

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// ─────────────────────────────────────────────────────────────
// 数值类：复用现有乘区，负责让 build 滚起来
// ─────────────────────────────────────────────────────────────

const STAT_BLESSES: TowerBlessDef[] = [
  {
    id: 'bless_atk', name: '破军', category: 'stat', tier: 'common', maxStacks: 3,
    desc: (s) => `全队攻击 +${pct(0.12 * s)}`,
  },
  {
    id: 'bless_hp', name: '磐石', category: 'stat', tier: 'common', maxStacks: 3,
    desc: (s) => `最大生命 +${pct(0.15 * s)}`,
  },
  {
    id: 'bless_heal', name: '灵泉', category: 'stat', tier: 'common', maxStacks: 3,
    desc: (s) => `心珠回复 +${pct(0.25 * s)}`,
  },
  {
    id: 'bless_crit_rate', name: '锐意', category: 'stat', tier: 'common', maxStacks: 3,
    desc: (s) => `暴击率 +${pct(0.08 * s)}`,
  },
  {
    id: 'bless_crit_dmg', name: '血刃', category: 'stat', tier: 'common', maxStacks: 3,
    desc: (s) => `暴击伤害 +${pct(0.25 * s)}`,
  },
  {
    id: 'bless_drag_time', name: '疾风', category: 'stat', tier: 'common', maxStacks: 2,
    desc: (s) => `转珠时限 +${2 * s} 秒`,
  },
  {
    id: 'bless_dr', name: '坚壁', category: 'stat', tier: 'common', maxStacks: 3,
    desc: (s) => `受到伤害 -${pct(0.12 * s)}`,
  },
  {
    id: 'bless_def_break', name: '破甲', category: 'stat', tier: 'rare', maxStacks: 2,
    desc: (s) => `敌人防御 -${pct(0.2 * s)}`,
  },
  {
    id: 'bless_cd', name: '速咏', category: 'stat', tier: 'rare', maxStacks: 2,
    desc: (s) => `全队技能冷却 -${s} 回合`,
  },
  ...ELEMENTS.map((el): TowerBlessDef => ({
    id: `bless_element_${el}`,
    name: `${ELEMENT_NAME[el]}·真意`,
    category: 'stat',
    tier: 'rare',
    maxStacks: 3,
    element: el,
    desc: (s) => `${ELEMENT_NAME[el]}属性伤害 +${pct(0.3 * s)}`,
  })),
];

// ─────────────────────────────────────────────────────────────
// 触发类：产生玩法的那一半
// ─────────────────────────────────────────────────────────────

/** 连锁大师的 Combo 门槛 */
export const COMBO_MASTER_THRESHOLD = 8;
/** 背水的生命门槛 */
export const LAST_STAND_HP_PCT = 0.3;
/** 雷霆的消除数门槛 */
export const BIG_MATCH_COUNT = 5;
/** 猎手的敌人生命门槛 */
export const HUNTER_HP_PCT = 0.5;
/** 收割的敌人生命门槛 */
export const REAPER_HP_PCT = 0.3;
/** 复仇最大叠加层数（战斗内，与灵机叠加层数无关） */
export const REVENGE_MAX_STACK = 3;

const TRIGGER_BLESSES: TowerBlessDef[] = [
  {
    id: 'bless_combo_master', name: '连锁大师', category: 'trigger', tier: 'rare', maxStacks: 2,
    desc: (s) => `Combo 达 ${COMBO_MASTER_THRESHOLD} 时全体伤害 ×${(1 + 0.4 * s).toFixed(1)}`,
  },
  {
    id: 'bless_first_crit', name: '一击必杀', category: 'trigger', tier: 'rare', maxStacks: 1,
    desc: () => '每回合首次消除必定暴击',
  },
  {
    id: 'bless_last_stand', name: '背水', category: 'trigger', tier: 'rare', maxStacks: 2,
    desc: (s) => `生命低于 ${pct(LAST_STAND_HP_PCT)} 时伤害 ×${(1 + 0.6 * s).toFixed(1)}`,
  },
  {
    id: 'bless_ember', name: '余烬', category: 'trigger', tier: 'common', maxStacks: 3,
    desc: (s) => `击败敌人回复 ${pct(0.05 * s)} 最大生命`,
  },
  {
    id: 'bless_rush', name: '势如破竹', category: 'trigger', tier: 'common', maxStacks: 2,
    desc: (s) => `每层首回合全队冷却 -${2 * s}`,
  },
  {
    id: 'bless_thunder', name: '雷霆', category: 'trigger', tier: 'epic', maxStacks: 2,
    desc: (s) => `${BIG_MATCH_COUNT} 连以上额外造成队伍攻击 ${pct(0.3 * s)} 的真实伤害`,
  },
  {
    id: 'bless_heart_fire', name: '心火', category: 'trigger', tier: 'common', maxStacks: 3,
    desc: (s) => `每消除 1 颗心珠，本回合伤害 +${pct(0.06 * s)}`,
  },
  {
    id: 'bless_revenge', name: '复仇', category: 'trigger', tier: 'rare', maxStacks: 2,
    desc: (s) => `每受一次攻击，下回合伤害 +${pct(0.2 * s)}（最多叠 ${REVENGE_MAX_STACK} 层）`,
  },
  {
    id: 'bless_hunter', name: '猎手', category: 'trigger', tier: 'common', maxStacks: 2,
    desc: (s) => `对生命高于 ${pct(HUNTER_HP_PCT)} 的敌人伤害 ×${(1 + 0.25 * s).toFixed(2)}`,
  },
  {
    id: 'bless_reaper', name: '收割', category: 'trigger', tier: 'common', maxStacks: 2,
    desc: (s) => `对生命低于 ${pct(REAPER_HP_PCT)} 的敌人伤害 ×${(1 + 0.5 * s).toFixed(2)}`,
  },
];

export const TOWER_BLESSES: readonly TowerBlessDef[] = [...STAT_BLESSES, ...TRIGGER_BLESSES];

export const TOWER_BLESS_MAP: ReadonlyMap<string, TowerBlessDef> = new Map(
  TOWER_BLESSES.map((b) => [b.id, b]),
);

export function getBless(id: string): TowerBlessDef | null {
  return TOWER_BLESS_MAP.get(id) ?? null;
}

// ─────────────────────────────────────────────────────────────
// 聚合：灵机 → 战斗修正
// ─────────────────────────────────────────────────────────────

/** run 内灵机聚合出的战斗修正，BattleController 构造时一次性吃进去 */
export interface TowerRunModifiers {
  /** 全队攻击乘区 */
  atkMult: number;
  /** 最大生命乘区 */
  hpMult: number;
  /** 心珠回复加成（叠加在 teamHealBonus 上） */
  healBonusAdd: number;
  /** 暴击率加值 */
  critRateAdd: number;
  /** 暴击伤害加值 */
  critDamageAdd: number;
  /** 转珠时限加值（秒） */
  dragTimeAdd: number;
  /** 受到伤害减免加值 */
  damageReductionAdd: number;
  /** 敌人防御削减比例 */
  enemyDefBreak: number;
  /** 全队技能冷却减免（回合） */
  skillCdReduce: number;
  /** 指定属性伤害乘区（缺省 1） */
  elementMult: Readonly<Partial<Record<Element, number>>>;
  /** Combo 达门槛后的伤害乘区（1 = 未持有） */
  comboMasterMult: number;
  /** 每回合首次消除必暴击 */
  firstMatchCrit: boolean;
  /** 残血时的伤害乘区（1 = 未持有） */
  lastStandMult: number;
  /** 击杀回复的最大生命比例 */
  killHealPct: number;
  /** 每层首回合的冷却减免 */
  floorStartCdReduce: number;
  /** 大消除额外真伤占队伍攻击的比例 */
  thunderTrueDamagePct: number;
  /** 每颗心珠为本回合提供的伤害加成 */
  heartFirePerOrb: number;
  /** 每层复仇栈提供的伤害加成 */
  revengePerStack: number;
  /** 对高血量敌人的伤害乘区 */
  hunterMult: number;
  /** 对低血量敌人的伤害乘区 */
  reaperMult: number;
}

export function emptyRunModifiers(): TowerRunModifiers {
  return {
    atkMult: 1,
    hpMult: 1,
    healBonusAdd: 0,
    critRateAdd: 0,
    critDamageAdd: 0,
    dragTimeAdd: 0,
    damageReductionAdd: 0,
    enemyDefBreak: 0,
    skillCdReduce: 0,
    elementMult: {},
    comboMasterMult: 1,
    firstMatchCrit: false,
    lastStandMult: 1,
    killHealPct: 0,
    floorStartCdReduce: 0,
    thunderTrueDamagePct: 0,
    heartFirePerOrb: 0,
    revengePerStack: 0,
    hunterMult: 1,
    reaperMult: 1,
  };
}

/**
 * 把「灵机 id → 叠加层数」聚合成战斗修正。
 *
 * 未知 id 与非正层数一律忽略，叠加层数按定义封顶 —— 存档被改坏也不会
 * 把战斗数值带飞。
 */
export function aggregateBlessModifiers(
  owned: Readonly<Record<string, number>>,
): TowerRunModifiers {
  const mod = emptyRunModifiers();
  const elementMult: Partial<Record<Element, number>> = {};

  for (const [id, rawStacks] of Object.entries(owned)) {
    const def = TOWER_BLESS_MAP.get(id);
    if (!def) continue;
    const s = Math.min(def.maxStacks, Math.floor(rawStacks));
    if (s <= 0) continue;

    if (def.element) {
      elementMult[def.element] = (elementMult[def.element] ?? 1) * (1 + 0.3 * s);
      continue;
    }

    switch (id) {
      case 'bless_atk': mod.atkMult *= 1 + 0.12 * s; break;
      case 'bless_hp': mod.hpMult *= 1 + 0.15 * s; break;
      case 'bless_heal': mod.healBonusAdd += 0.25 * s; break;
      case 'bless_crit_rate': mod.critRateAdd += 0.08 * s; break;
      case 'bless_crit_dmg': mod.critDamageAdd += 0.25 * s; break;
      case 'bless_drag_time': mod.dragTimeAdd += 2 * s; break;
      case 'bless_dr': mod.damageReductionAdd += 0.12 * s; break;
      case 'bless_def_break': mod.enemyDefBreak += 0.2 * s; break;
      case 'bless_cd': mod.skillCdReduce += s; break;
      case 'bless_combo_master': mod.comboMasterMult *= 1 + 0.4 * s; break;
      case 'bless_first_crit': mod.firstMatchCrit = true; break;
      case 'bless_last_stand': mod.lastStandMult *= 1 + 0.6 * s; break;
      case 'bless_ember': mod.killHealPct += 0.05 * s; break;
      case 'bless_rush': mod.floorStartCdReduce += 2 * s; break;
      case 'bless_thunder': mod.thunderTrueDamagePct += 0.3 * s; break;
      case 'bless_heart_fire': mod.heartFirePerOrb += 0.06 * s; break;
      case 'bless_revenge': mod.revengePerStack += 0.2 * s; break;
      case 'bless_hunter': mod.hunterMult *= 1 + 0.25 * s; break;
      case 'bless_reaper': mod.reaperMult *= 1 + 0.5 * s; break;
      default: break;
    }
  }

  mod.elementMult = elementMult;
  mod.enemyDefBreak = Math.min(0.8, mod.enemyDefBreak);
  return mod;
}

// ─────────────────────────────────────────────────────────────
// 三选一抽取
// ─────────────────────────────────────────────────────────────

/**
 * 抽取本层的灵机候选。
 *
 * 已叠满的灵机不再进池，因此后期候选自然收窄到未成型的方向 ——
 * 这比「随机给三个」更容易让玩家把某条线走到底。
 *
 * @param owned 当前已持有的「灵机 id → 层数」
 * @param guardFloor 守关层：高品质权重倾斜
 * @param tierBoost 传承「窥机」对罕有/奇珍的额外权重乘区
 */
export function rollBlessChoices(
  owned: Readonly<Record<string, number>>,
  rng: () => number = Math.random,
  opts: { count?: number; guardFloor?: boolean; tierBoost?: number } = {},
): TowerBlessDef[] {
  const count = opts.count ?? BLESS_PICK_COUNT;
  const tierBoost = Math.max(1, opts.tierBoost ?? 1);
  const pool = TOWER_BLESSES.filter((b) => (owned[b.id] ?? 0) < b.maxStacks);
  const picked: TowerBlessDef[] = [];
  const remaining = [...pool];

  while (picked.length < count && remaining.length > 0) {
    const weights = remaining.map((b) => {
      let w = BLESS_TIER_WEIGHT[b.tier];
      if (opts.guardFloor) w *= BLESS_GUARD_TIER_BOOST[b.tier];
      if (b.tier !== 'common') w *= tierBoost;
      return w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng() * total;
    let idx = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        idx = i;
        break;
      }
    }
    picked.push(remaining[idx]);
    remaining.splice(idx, 1);
  }

  return picked;
}

/** 已持有灵机的展示行（塔首页 / 战斗内查看用） */
export function describeOwnedBlesses(
  owned: Readonly<Record<string, number>>,
): Array<{ def: TowerBlessDef; stacks: number; text: string }> {
  const out: Array<{ def: TowerBlessDef; stacks: number; text: string }> = [];
  for (const def of TOWER_BLESSES) {
    const stacks = Math.min(def.maxStacks, Math.floor(owned[def.id] ?? 0));
    if (stacks <= 0) continue;
    out.push({ def, stacks, text: def.desc(stacks) });
  }
  return out;
}
