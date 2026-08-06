/**
 * 宠物差异化词条：特攻 / 羁绊 / 抗性配额（纯数据 + 纯函数）
 *
 * 闸门那一层制造「必须换阵容」的需求，这一层提供「换得出花来」的供给。缺了这层，
 * 玩家被逼着开背包，却发现 100 只宠除了数值高低没有第二个区分维度。
 *
 * 三条词条各自负责一种取舍：
 * - **特攻 killerElement**：让一只低星对位宠压过高星错位宠。这是小卡池里
 *   「每只宠都有存在意义」最直接的手段 —— 你不是在找最强的宠，是在找对的宠。
 * - **羁绊 bondTags**：给「同属性抱团」和「同职能抱团」发奖，与反构筑机制
 *   「同源相斥」（属性≥4 敌人增伤 / ≤2 敌人减伤）正面对撞，逼出真实的编队权衡。
 * - **抗性配额 resist**：单宠只有 20%，五只凑满才免疫。于是「为了免疫封技，
 *   我要牺牲一个输出位」变成一个能算清楚的决定，而不是有没有那张卡的运气。
 *
 * 全部由 `{id, element, role}` 确定性派生，不手写 100 份配置；需要钉死的宠走覆写表。
 * 存档安全：这些字段只挂在 balance 侧，OwnedPet 仍只存 {level, star, shards}。
 */
import { ELEMENTS, type Element } from './combat';
import type { PetRole } from './petRoles';

/**
 * 特攻倍率。
 *
 * v0.7 从 2.2 抬到 2.6：纵向成长压平后，横向乘区必须够大才能改变玩家的最优解。
 * 2.6 意味着一只对位的低星宠能压过高一个星级档的错位宠（星级档差约 ×1.2），
 * 「翻背包找对的宠」第一次比「再练十级」划算。
 */
export const KILLER_MULT = 2.6;

/** 单宠抗性配额；5 只同抗性凑满 100% 才免疫 */
export const RESIST_PER_PET = 0.2;

/** 可被抗性配额抵消的敌方骚扰类型（对应 SkillEffectDef 的同名 kind） */
export type ResistKind = 'sealOrbs' | 'healBlock' | 'timeSqueeze' | 'skillSeal';

export const RESIST_NAME: Readonly<Record<ResistKind, string>> = {
  sealOrbs: '封珠抗性',
  healBlock: '禁疗抗性',
  timeSqueeze: '时压抗性',
  skillSeal: '封技抗性',
};

const RESIST_ORDER: readonly ResistKind[] = ['sealOrbs', 'healBlock', 'timeSqueeze', 'skillSeal'];

/** 羁绊标签：每只宠带「属性宗」+「职能宗」各一枚，天然可组合 */
export const ELEMENT_BOND: Readonly<Record<Element, string>> = {
  metal: '金石', wood: '幽林', water: '沧溟', fire: '炽炎', earth: '厚土',
};

export const ROLE_BOND: Readonly<Record<PetRole, string>> = {
  attacker: '锋锐', tank: '磐固', healer: '慈心', support: '玄枢',
};

/**
 * 羁绊档位：2 只小成、3 只大成。只取每个标签的最高档，不叠加。
 *
 * v0.7 整体翻倍（4%/10% → 8%/20%，上限 20% → 45%）。旧值下「凑羁绊」的收益
 * 不到三级经验，玩家理性选择是无视它；抬到 45% 后，抱团编队与「五行齐全」之间
 * 才构成真实取舍——而这正是「同源相斥」机制要撬动的那个决定。
 */
export const BOND_TIER_2 = 0.08;
export const BOND_TIER_3 = 0.20;
/** 羁绊总增伤上限：五宠最多凑 4 个标签达标，不封顶会直接盖过闸门的惩罚 */
export const BOND_BONUS_CAP = 0.45;

export interface PetTags {
  /** 对该属性的敌人伤害 ×KILLER_MULT */
  killerElement: Element;
  /** 羁绊标签（属性宗 + 职能宗） */
  bondTags: readonly string[];
  /** 携带的抗性类型（每只 RESIST_PER_PET） */
  resist: ResistKind;
}

/** 词条派生所需的最小信息（CreatureDef / PetDef 都满足） */
export interface PetTagOwner {
  id: string;
  element: Element;
  role: PetRole;
}

/**
 * 指定宠物的词条覆写。
 *
 * 轮转派生已经能铺开差异度，这张表让策划把标志性宠物钉在特定对位上。
 * 初始三只刻意给了三种不同抗性，好让新手第一次撞上封珠/禁疗时，
 * 从「我这队为什么扛不住」自然走到「原来抗性要凑」。
 */
const TAG_OVERRIDE: Readonly<Record<string, Partial<PetTags>>> = {
  pet_001: { resist: 'sealOrbs' },
  pet_002: { resist: 'healBlock' },
  pet_003: { resist: 'timeSqueeze' },
};

/** 从 pet_037 这类 id 取序号；非数字 id 退化为字符和，保证任何 id 都有稳定分配 */
function seedOf(id: string): number {
  const m = /(\d+)\s*$/.exec(id);
  if (m) return Number(m[1]);
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return sum;
}

export function petTagsOf(owner: PetTagOwner): PetTags {
  const seed = seedOf(owner.id);
  // 特攻排除自身属性：对自己那一色特攻既没有对位含义，也和「专精令」重复
  const others = ELEMENTS.filter((e) => e !== owner.element);
  const derived: PetTags = {
    killerElement: others[seed % others.length],
    bondTags: [ELEMENT_BOND[owner.element], ROLE_BOND[owner.role]],
    resist: RESIST_ORDER[seed % RESIST_ORDER.length],
  };
  const override = TAG_OVERRIDE[owner.id];
  return override ? { ...derived, ...override } : derived;
}

/** 队伍羁绊解析结果（编队页展示 + 战斗结算共用） */
export interface BondSummary {
  /** 达标的标签及其档位加成 */
  active: readonly { tag: string; count: number; bonus: number }[];
  /** 已封顶的全队增伤 */
  damageBonus: number;
}

export function resolveBonds(tags: readonly (readonly string[])[]): BondSummary {
  const counts = new Map<string, number>();
  for (const list of tags) {
    for (const tag of list) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const active: { tag: string; count: number; bonus: number }[] = [];
  let sum = 0;
  for (const [tag, count] of counts) {
    const bonus = count >= 3 ? BOND_TIER_3 : count >= 2 ? BOND_TIER_2 : 0;
    if (bonus <= 0) continue;
    active.push({ tag, count, bonus });
    sum += bonus;
  }
  // 展示顺序按收益降序，让编队页第一眼看到的是最值钱的那条
  active.sort((a, b) => b.bonus - a.bonus || b.count - a.count);
  return { active, damageBonus: Math.min(BOND_BONUS_CAP, Math.round(sum * 10000) / 10000) };
}

/** 队伍抗性配额（0..1，1 = 免疫） */
export type ResistQuota = Readonly<Record<ResistKind, number>>;

export const NO_RESIST: ResistQuota = Object.freeze({
  sealOrbs: 0, healBlock: 0, timeSqueeze: 0, skillSeal: 0,
});

export function resolveResists(kinds: readonly ResistKind[]): ResistQuota {
  const out: Record<ResistKind, number> = { ...NO_RESIST };
  for (const k of kinds) out[k] = Math.min(1, out[k] + RESIST_PER_PET);
  return out;
}

/**
 * 抗性对一次骚扰的削弱：不足 100% 时按比例砍持续回合 / 颗数，满配才彻底免疫。
 *
 * 用「砍时长」而不是「砍概率」，是因为玩家要能在编队页算清收益。随机免疫会让
 * 「我凑了 60% 抗性」这件事在单场战斗里毫无手感。
 */
export function applyResist(amount: number, resist: number): number {
  if (resist >= 1) return 0;
  if (resist <= 0) return amount;
  return Math.max(1, Math.ceil(amount * (1 - resist)));
}
