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

/**
 * 战斗属性块（阶段十二）：与三维 StatBlock 解耦的「定位差异化」属性。
 * 刻意不并入 StatBlock，避免牵连成长公式 / 三维 UI / 被动 trait / 快照。
 *
 * 每个定位有契合自身的「招牌属性」，作用域严格区分（见 ATTRIB_SCOPE）：
 * - critRate / critDamage（输出）：**个体属性**，仅作用于该宠「自身的攻击」（消珠出手、自身主动技），
 *   不跨宠共享，故无需也不应做队伍聚合。
 * - damageReduction（坦克）：**全队属性**，保护共享的英雄血量；各宠贡献求和后封顶。
 * - healBonus（治疗）：**全队属性**，放大全队回复（心珠 + 治疗技）；各宠贡献求和后封顶。
 * - teamDamageBonus（辅助）：**全队属性**，放大全队输出（叠进全队伤害乘区）。
 */
export interface CombatAttribBlock {
  critRate: number;
  critDamage: number;
  damageReduction: number;
  healBonus: number;
  teamDamageBonus: number;
}

export type AttribKey = keyof CombatAttribBlock;

/** 战斗属性作用域：self = 个体（仅作用自身攻击）/ team = 全队（聚合后作用全队） */
export type AttribScope = 'self' | 'team';

/** 各战斗属性的作用域单一真源；UI 与战斗逻辑都据此区分「个体 / 全队」 */
export const ATTRIB_SCOPE: Readonly<Record<AttribKey, AttribScope>> = {
  critRate: 'self',
  critDamage: 'self',
  damageReduction: 'team',
  healBonus: 'team',
  teamDamageBonus: 'team',
};

export interface AttribUiDef {
  key: AttribKey;
  /** 短标签：暴击 / 暴伤 / 减伤 / 治疗 / 增伤 */
  shortLabel: string;
  /** 长标签（全队属性带「全队」前缀，便于和个体区分） */
  longLabel: string;
  /** 标签强调色 */
  color: number;
  /** 作用域（与 ATTRIB_SCOPE 一致，便于就近读取） */
  scope: AttribScope;
}

/** 战斗属性 UI 单一真源（仿 STAT_UI），详情页 / 队伍总览读此表 */
export const ATTRIB_UI: Readonly<Record<AttribKey, AttribUiDef>> = {
  critRate: { key: 'critRate', shortLabel: '暴击', longLabel: '暴击率', color: 0xff8a3d, scope: 'self' },
  critDamage: { key: 'critDamage', shortLabel: '暴伤', longLabel: '暴击伤害', color: 0xffd24a, scope: 'self' },
  damageReduction: { key: 'damageReduction', shortLabel: '减伤', longLabel: '全队减伤', color: 0x5ad1c4, scope: 'team' },
  healBonus: { key: 'healBonus', shortLabel: '治疗', longLabel: '治疗强化', color: 0x52c97a, scope: 'team' },
  teamDamageBonus: { key: 'teamDamageBonus', shortLabel: '增伤', longLabel: '全队增伤', color: 0xff6b4a, scope: 'team' },
};

export function getAttribUi(attrib: AttribKey): AttribUiDef {
  return ATTRIB_UI[attrib] ?? ATTRIB_UI.critRate;
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
  /**
   * 战斗属性基线（R / ★1 锚点）：由 formulas/attribs.ts 按稀有度缩放 + 星级特性叠加。
   * 默认 0 的属性（如治疗的暴伤）在详情页可显示但弱化。
   */
  attribBase: CombatAttribBlock;
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
    // 输出：个体暴击核心（作用于自身高攻）；暴伤靠星级特性解锁，其余招牌属性归零
    attribBase: { critRate: 0.08, critDamage: 0, damageReduction: 0, healBonus: 0, teamDamageBonus: 0 },
  },
  healer: {
    role: 'healer', name: '治疗', color: 0x52c97a,
    ui: { badgeBg: 0x1a4a2a, badgeText: 0xb8f0c8, badgeBorder: 0x52c97a },
    base: { atk: 34, hp: 190, rcv: 45 },
    growth: { atk: 0.05, hp: 0.05, rcv: 0.06 },
    weights: { atk: 0.65, hp: 0.9, rcv: 1.45 },
    // 治疗：全队治疗强化核心（放大心珠回复 + 治疗技）；其余招牌属性归零
    attribBase: { critRate: 0, critDamage: 0, damageReduction: 0, healBonus: 0.12, teamDamageBonus: 0 },
  },
  tank: {
    role: 'tank', name: '坦克', color: 0x5a9fd4,
    ui: { badgeBg: 0x1a3560, badgeText: 0xb8dcff, badgeBorder: 0x5a9fd4 },
    base: { atk: 37, hp: 290, rcv: 19 },
    growth: { atk: 0.05, hp: 0.063, rcv: 0.05 },
    weights: { atk: 0.7, hp: 1.45, rcv: 0.8 },
    // 坦克：全队减伤核心；其余招牌属性归零
    attribBase: { critRate: 0, critDamage: 0, damageReduction: 0.06, healBonus: 0, teamDamageBonus: 0 },
  },
  support: {
    role: 'support', name: '辅助', color: 0x9b7bff,
    ui: { badgeBg: 0x3c1860, badgeText: 0xd4c4ff, badgeBorder: 0x9b7bff },
    base: { atk: 40, hp: 210, rcv: 25 },
    growth: { atk: 0.053, hp: 0.052, rcv: 0.052 },
    weights: { atk: 0.9, hp: 1.0, rcv: 1.1 },
    // 辅助：全队增伤核心（放大全队输出）；其余招牌属性归零
    attribBase: { critRate: 0, critDamage: 0, damageReduction: 0, healBonus: 0, teamDamageBonus: 0.05 },
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
