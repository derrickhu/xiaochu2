/**
 * 宠物定位模板与轻量特性系统（纯数据）
 *
 * 通用调参改 PET_ROLE_PROFILES；单只宠物差异通过 traits（及后续星级）覆盖。
 */
import type { Element } from './combat';

export type PetRole = 'attacker' | 'healer' | 'tank' | 'support';

export const PET_ROLE_NAME: Readonly<Record<PetRole, string>> = {
  attacker: '输出',
  healer: '治疗',
  tank: '坦克',
  support: '辅助',
};

export interface StatBlock {
  atk: number;
  hp: number;
  rcv: number;
}

export interface GrowthBlock {
  atk: number;
  hp: number;
  rcv: number;
}

export interface PetRoleProfile {
  role: PetRole;
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
    role: 'attacker',
    base: { atk: 53, hp: 185, rcv: 11 },
    growth: { atk: 0.061, hp: 0.05, rcv: 0.045 },
    weights: { atk: 1.35, hp: 0.75, rcv: 0.55 },
  },
  healer: {
    role: 'healer',
    base: { atk: 34, hp: 190, rcv: 45 },
    growth: { atk: 0.05, hp: 0.05, rcv: 0.06 },
    weights: { atk: 0.65, hp: 0.9, rcv: 1.45 },
  },
  tank: {
    role: 'tank',
    base: { atk: 37, hp: 290, rcv: 19 },
    growth: { atk: 0.05, hp: 0.063, rcv: 0.05 },
    weights: { atk: 0.7, hp: 1.45, rcv: 0.8 },
  },
  support: {
    role: 'support',
    base: { atk: 40, hp: 210, rcv: 25 },
    growth: { atk: 0.053, hp: 0.052, rcv: 0.052 },
    weights: { atk: 0.9, hp: 1.0, rcv: 1.1 },
  },
};
