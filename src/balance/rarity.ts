/**
 * 稀有度统一抽象（纯数据 + 纯查询函数）
 *
 * 设计原则：稀有度数字只是“引用键”，所有按稀有度变化的行为集中到 RARITY_PROFILES
 * 这张单一真源表里。任何系统要按稀有度区分行为都读这张表，禁止散落 `if (rarity === 5)`。
 * 未来扩展 = 加字段 + 加读取方，不动既有判断。
 *
 * 已落地作用：
 * - 显示（code/name/color）：主题色 R→绿、SR→蓝、SSR→紫、UR→金、LR→红，逐档递进
 * - 抽卡概率（gachaWeight）
 * - 初始三维面板倍率（statMult）：R = 1.0 基准模板，SR/SSR/UR/LR 逐档明显递增。
 *   数值层口径：同 role + 同 rarity + 同星 + 同等级 → 三维一致；差异来自档位倍率而非手填。
 *
 * 仍为预留（不在本阶段实现）：星级上限联动、养成经济。
 */

export type Rarity = 1 | 2 | 3 | 4 | 5;

export interface RarityDef {
  tier: Rarity;
  /** 简码：R / SR / SSR / UR / LR */
  code: string;
  /** 中文显示名 */
  name: string;
  /** UI 主题色（边框 / 名牌）；全项目只读此字段，禁止散落硬编码 */
  color: number;
  /** 抽卡相对权重；某档概率 = 本档权重 / 池内出现档位的总权重 */
  gachaWeight: number;
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
  1: { tier: 1, code: 'R', name: '普通', color: 0x6fd86a, gachaWeight: 60, statMult: 1.0 },
  2: { tier: 2, code: 'SR', name: '精良', color: 0x4aa3ff, gachaWeight: 25, statMult: 1.2 },
  3: { tier: 3, code: 'SSR', name: '稀有', color: 0xb06bff, gachaWeight: 10, statMult: 1.45 },
  4: { tier: 4, code: 'UR', name: '史诗', color: 0xffb43d, gachaWeight: 4, statMult: 1.75 },
  5: { tier: 5, code: 'LR', name: '传说', color: 0xff5252, gachaWeight: 1, statMult: 2.1 },
};

export const RARITIES: readonly Rarity[] = [1, 2, 3, 4, 5];

/** 取稀有度档案，越界回退到最低档 */
export function getRarity(tier: Rarity): RarityDef {
  return RARITY_PROFILES[tier] ?? RARITY_PROFILES[1];
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
