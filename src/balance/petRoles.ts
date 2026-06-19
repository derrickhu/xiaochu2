/**
 * 宠物定位模板与轻量特性系统（纯数据）
 *
 * 通用调参改 PET_ROLE_PROFILES；单只宠物差异通过 traits（及后续星级）覆盖。
 * UI 配色（color + ui.badge*）为单一真源，场景用 @/ui/RoleVisual 组件，禁止散落硬编码。
 */
import type { Element } from './combat';

export type PetRole = 'attacker' | 'healer' | 'tank' | 'support';

/** 定位在 UI 上的配色（胶囊标签读 badge*，行内文字读 color） */
export interface RoleUi {
  badgeBg: number;
  badgeText: number;
  badgeBorder: number;
}

export interface StatBlock {
  atk: number;
  hp: number;
  rcv: number;
}

/** 三维键（攻 / 血 / 复） */
export type StatKey = keyof StatBlock;

/** 三维 UI 档案：标签色与文案 */
export interface StatUiDef {
  key: StatKey;
  /** 短标签：攻 / 血 / 复 */
  shortLabel: string;
  /** 长标签：攻击 / 生命 / 回复 */
  longLabel: string;
  /** 标签强调色；数值默认用 COLORS.textMain */
  color: number;
}

/** 三维 UI 单一真源；场景用 @/ui/StatVisual，禁止散落硬编码 */
export const STAT_UI: Readonly<Record<StatKey, StatUiDef>> = {
  atk: { key: 'atk', shortLabel: '攻', longLabel: '攻击', color: 0xff6b4a },
  hp: { key: 'hp', shortLabel: '血', longLabel: '生命', color: 0x5a9fd4 },
  rcv: { key: 'rcv', shortLabel: '复', longLabel: '回复', color: 0x52c97a },
};

export function getStatUi(stat: StatKey): StatUiDef {
  return STAT_UI[stat] ?? STAT_UI.atk;
}

export interface GrowthBlock {
  atk: number;
  hp: number;
  rcv: number;
}

export interface PetRoleProfile {
  role: PetRole;
  /** 中文显示名：输出 / 治疗 / 坦克 / 辅助 */
  name: string;
  /** UI 主强调色（行内定位文字）；全项目只读此字段 */
  color: number;
  /** 定位胶囊等次级配色 */
  ui: RoleUi;
  base: StatBlock;
  growth: GrowthBlock;
  /** 伤害/回复/承伤定位权重，供后续推荐编队和 UI 展示使用 */
  weights: StatBlock;
}

export type PetTraitDef =
  | { type: 'statBonus'; stat: keyof StatBlock; pct: number; scope: 'self' | 'team'; element?: Element; role?: PetRole }
  | { type: 'elementDamageBonus'; element: Element; vs: Element; pct: number }
  | { type: 'skillModifier'; skillId: string; cdDelta?: number; effectPctBonus?: number; convertCountBonus?: number }
  | { type: 'teamAura'; requireRole?: PetRole; requireElement?: Element; count: number; stat: keyof StatBlock; pct: number };

/**
 * 首版模板以现有 10 只宠均值为锚点，先保证迁移后数值接近；
 * 后续要强化定位时优先调整这里。
 */
export const PET_ROLE_PROFILES: Readonly<Record<PetRole, PetRoleProfile>> = {
  attacker: {
    role: 'attacker', name: '输出', color: 0xff6b4a,
    ui: { badgeBg: 0x5a2010, badgeText: 0xffc4b0, badgeBorder: 0xff6b4a },
    base: { atk: 53, hp: 185, rcv: 11 },
    growth: { atk: 0.061, hp: 0.05, rcv: 0.045 },
    weights: { atk: 1.35, hp: 0.75, rcv: 0.55 },
  },
  healer: {
    role: 'healer', name: '治疗', color: 0x52c97a,
    ui: { badgeBg: 0x1a4a2a, badgeText: 0xb8f0c8, badgeBorder: 0x52c97a },
    base: { atk: 34, hp: 190, rcv: 45 },
    growth: { atk: 0.05, hp: 0.05, rcv: 0.06 },
    weights: { atk: 0.65, hp: 0.9, rcv: 1.45 },
  },
  tank: {
    role: 'tank', name: '坦克', color: 0x5a9fd4,
    ui: { badgeBg: 0x1a3560, badgeText: 0xb8dcff, badgeBorder: 0x5a9fd4 },
    base: { atk: 37, hp: 290, rcv: 19 },
    growth: { atk: 0.05, hp: 0.063, rcv: 0.05 },
    weights: { atk: 0.7, hp: 1.45, rcv: 0.8 },
  },
  support: {
    role: 'support', name: '辅助', color: 0x9b7bff,
    ui: { badgeBg: 0x3c1860, badgeText: 0xd4c4ff, badgeBorder: 0x9b7bff },
    base: { atk: 40, hp: 210, rcv: 25 },
    growth: { atk: 0.053, hp: 0.052, rcv: 0.052 },
    weights: { atk: 0.9, hp: 1.0, rcv: 1.1 },
  },
};

/** 兼容旧引用；名称来自 PET_ROLE_PROFILES */
export const PET_ROLE_NAME: Readonly<Record<PetRole, string>> = {
  attacker: PET_ROLE_PROFILES.attacker.name,
  healer: PET_ROLE_PROFILES.healer.name,
  tank: PET_ROLE_PROFILES.tank.name,
  support: PET_ROLE_PROFILES.support.name,
};

/** 取定位档案，越界回退到输出 */
export function getPetRole(role: PetRole): PetRoleProfile {
  return PET_ROLE_PROFILES[role] ?? PET_ROLE_PROFILES.attacker;
}
