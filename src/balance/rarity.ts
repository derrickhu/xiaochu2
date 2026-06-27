/**
 * 稀有度统一抽象（纯数据 + 纯查询函数）
 *
 * 设计原则：稀有度数字只是“引用键”，所有按稀有度变化的行为集中到 RARITY_PROFILES
 * 这张单一真源表里。任何系统要按稀有度区分行为都读这张表，禁止散落 `if (rarity === 5)`。
 * 未来扩展 = 加字段 + 加读取方，不动既有判断。
 *
 * 已落地作用：
 * - 显示（code/name/color + ui.badge*）：R→绿、SR→蓝、SSR→紫、UR→金
 * - 卡边框 / 稀有度码 / 印章均读 RARITY_PROFILES，场景用 @/ui/RarityVisual 组件
 * - 抽卡概率（gachaWeight）
 * - 初始三维面板倍率（statMult）：R = 1.0 基准模板，SR/SSR/UR 逐档明显递增。
 *   数值层口径：同 role + 同 rarity + 同星 + 同等级 → 三维一致；差异来自档位倍率而非手填。
 *
 * 阶段十一：前期精简为四档（R/SR/SSR/UR），去除 LR。后续要扩 LR 只需把 Rarity 加回 5、
 * 各表加回一行、补新宠即可，不动既有判断。
 *
 * 仍为预留（不在本阶段实现）：星级上限联动、养成经济。
 */

export type Rarity = 1 | 2 | 3 | 4;

/** 稀有度在 UI 上的配色（卡边框读 accent/color，印章读 badge*） */
export interface RarityUi {
  /** 品质印章底色 */
  badgeBg: number;
  /** 品质印章文字 */
  badgeText: number;
  /** 品质印章描边 */
  badgeBorder: number;
}

export interface RarityDef {
  tier: Rarity;
  /** 简码：R / SR / SSR / UR */
  code: string;
  /** 中文显示名 */
  name: string;
  /** UI 主强调色（边框 / 稀有度码文字）；全项目只读此字段，禁止散落硬编码 */
  color: number;
  /** 卡面印章等次级配色 */
  ui: RarityUi;
  /** 抽卡相对权重；某档概率 = 本档权重 / 池内出现档位的总权重（两段式抽卡用） */
  gachaWeight: number;
  /**
   * 标准卡池单抽出该档的绝对概率（与 statMult 解耦，四档之和 = 1）。
   * 抽卡系统按此出货；gachaWeight 仅用于「池内动态档位」归一化。
   */
  gachaRate: number;
  /** 初始三维面板倍率：乘在 role 模板基础值上。R = 1.0，越高稀有越强 */
  statMult: number;

  // ── 以下为扩展预留字段，本阶段不实现，仅占位供后续系统读取 ──
  /** 星级上限（升星系统） */
  maxStar?: number;
  /** 初始星级（抽到时的起始 star） */
  initialStar?: number;
  /** 分解返还（养成经济） */
  dismantleReward?: number;
  /** 等级上限加成（觉醒 / 天花板） */
  levelCapBonus?: number;
}

export const RARITY_PROFILES: Readonly<Record<Rarity, RarityDef>> = {
  1: {
    tier: 1, code: 'R', name: '普通', color: 0x6fd86a, gachaWeight: 60, gachaRate: 0.60, statMult: 1.0,
    ui: { badgeBg: 0x234a22, badgeText: 0x9ef098, badgeBorder: 0x6fd86a },
  },
  2: {
    tier: 2, code: 'SR', name: '精良', color: 0x4aa3ff, gachaWeight: 25, gachaRate: 0.265, statMult: 1.2,
    ui: { badgeBg: 0x1a3560, badgeText: 0x8ec5ff, badgeBorder: 0x4aa3ff },
  },
  3: {
    tier: 3, code: 'SSR', name: '稀有', color: 0xb06bff, gachaWeight: 10, gachaRate: 0.10, statMult: 1.45,
    ui: { badgeBg: 0x3c1860, badgeText: 0xd4a8ff, badgeBorder: 0xb06bff },
  },
  4: {
    tier: 4, code: 'UR', name: '史诗', color: 0xffb43d, gachaWeight: 4, gachaRate: 0.035, statMult: 1.75,
    ui: { badgeBg: 0x5a4010, badgeText: 0xffe68c, badgeBorder: 0xffb43d },
  },
};

export const RARITIES: readonly Rarity[] = [1, 2, 3, 4];

/** 取稀有度档案，越界回退到最低档 */
export function getRarity(tier: Rarity): RarityDef {
  return RARITY_PROFILES[tier] ?? RARITY_PROFILES[1];
}

/**
 * 稀有度 → 主动技能效果倍率（单一真源，策划调表）。
 *
 * 锚点 R(1) = 1.0：R 宠技能 = 蓝图基线数值不变；SR..UR 一律 ≥ 1.0 向上缩放，
 * 由 SkillEngine.applyPetSkillModifiers 按「施法宠稀有度」叠乘到 effectMult，
 * 与星级 tier 加成相互独立、可叠乘。保证同一 skillId 被不同稀有度引用时天然单调。
 */
export const RARITY_SKILL_POWER: Readonly<Record<Rarity, number>> = {
  1: 1.0,
  2: 1.12,
  3: 1.28,
  4: 1.48,
};

export function getRaritySkillPower(tier: Rarity): number {
  return RARITY_SKILL_POWER[tier] ?? RARITY_SKILL_POWER[1];
}

/**
 * 稀有度 → 被动效果强度倍率（单一真源，策划调表）。
 *
 * 锚点 R(1) = 1.0；缩放 passives.ts 蓝图的基线数值（护盾%/回血%/增伤%/面板% 等），
 * 由 passiveForPet() 统一应用。保证「同 role 基础被动，高稀有必不弱于低稀有」。
 */
export const RARITY_PASSIVE_POWER: Readonly<Record<Rarity, number>> = {
  1: 1.0,
  2: 1.25,
  3: 1.55,
  4: 1.9,
};

export function getRarityPassivePower(tier: Rarity): number {
  return RARITY_PASSIVE_POWER[tier] ?? RARITY_PASSIVE_POWER[1];
}

/**
 * 稀有度 → 战斗属性强度倍率（阶段十二，单一真源，策划调表）。
 *
 * 锚点 R(1) = 1.0；缩放 petRoles 的 attribBase 与 talents 的星级特性基线
 * （暴击率/暴击伤害/减伤），由 formulas/attribs.ts 统一应用。
 * 保证「同 role 高稀有的战斗属性必不弱于低稀有」。
 */
export const RARITY_ATTRIB_POWER: Readonly<Record<Rarity, number>> = {
  1: 1.0,
  2: 1.2,
  3: 1.45,
  4: 1.7,
};

export function getRarityAttribPower(tier: Rarity): number {
  return RARITY_ATTRIB_POWER[tier] ?? RARITY_ATTRIB_POWER[1];
}

/** 标准卡池单抽各档绝对概率（gachaRate，和为 1） */
export function standardGachaRates(): Map<Rarity, number> {
  return new Map(RARITIES.map((t) => [t, getRarity(t).gachaRate]));
}

/**
 * 两段式抽卡的第一段：按池内出现的稀有度档位计算各档命中概率。
 * - 输入为卡池内宠物的稀有度集合（可重复，内部去重）
 * - 输出 Map<档位, 概率>，概率之和为 1（池非空时）
 * - 解耦“档稀有度”与“档内宠数量”：新增同档宠不稀释总出货率
 */
export function rarityProbabilities(pool: readonly Rarity[]): Map<Rarity, number> {
  const tiers = [...new Set(pool)];
  const total = tiers.reduce((sum, t) => sum + getRarity(t).gachaWeight, 0);
  const map = new Map<Rarity, number>();
  if (total <= 0) return map;
  for (const t of tiers) {
    map.set(t, getRarity(t).gachaWeight / total);
  }
  return map;
}
