/**
 * 统一被动技能表（纯数据）—— L0 签名层 + L1/L2/L3 稀有度阶梯
 *
 * 解析出口：balance/passiveEffects.ts → resolvePetPassiveBundle
 */
import type { Element } from './combat';
import { PET_ROLE_NAME, STAT_UI, type PetRole, type StatKey } from './petRoles';
import type { Rarity } from './rarity';
import { ELEMENT_NAME } from './ui';

/** 被动触发时机（onLowHp 预留） */
export type PassiveTrigger = 'always' | 'battleStart' | 'turnStart' | 'onLowHp';

/**
 * 单层被动效果（双模型镜像 + L0 招牌战斗属性 kind）
 */
export type PassiveLayerEffect =
  | { kind: 'teamDamageBonus'; base: number }
  | { kind: 'regen'; base: number }
  | { kind: 'startShield'; base: number }
  | { kind: 'statSelf'; stat: StatKey; base: number }
  | { kind: 'statTeam'; stat: StatKey; base: number }
  | {
      kind: 'aura';
      stat: StatKey;
      count: number;
      base: number;
      requireRole?: PetRole;
      requireElement?: Element;
    }
  | { kind: 'critRate'; base: number }
  | { kind: 'critDamage'; base: number }
  | { kind: 'damageReduction'; base: number }
  | { kind: 'healBonus'; base: number };

export interface PassiveLayer {
  name: string;
  effect: PassiveLayerEffect;
}

/**
 * L0 签名层（不占稀有度槽位，始终生效，× RARITY_ATTRIB_POWER）
 */
export const ROLE_PASSIVE_L0: Readonly<Record<PetRole, PassiveLayer>> = {
  attacker: { name: '锐眼', effect: { kind: 'critRate', base: 0.08 } },
  tank: { name: '铁壁', effect: { kind: 'damageReduction', base: 0.06 } },
  healer: { name: '庇心', effect: { kind: 'healBonus', base: 0.12 } },
  support: { name: '激励', effect: { kind: 'teamDamageBonus', base: 0.05 } },
};

/** role 被动阶梯 L1/L2/L3（× RARITY_PASSIVE_POWER） */
export const ROLE_PASSIVE_LADDER: Readonly<Record<PetRole, readonly [PassiveLayer, PassiveLayer, PassiveLayer]>> = {
  attacker: [
    { name: '战意', effect: { kind: 'teamDamageBonus', base: 0.05 } },
    { name: '锐意', effect: { kind: 'teamDamageBonus', base: 0.04 } },
    { name: '决死', effect: { kind: 'teamDamageBonus', base: 0.04 } },
  ],
  healer: [
    { name: '生生不息', effect: { kind: 'regen', base: 0.035 } },
    { name: '甘霖', effect: { kind: 'statTeam', stat: 'rcv', base: 0.10 } },
    { name: '普济', effect: { kind: 'regen', base: 0.025 } },
  ],
  tank: [
    { name: '磐石', effect: { kind: 'startShield', base: 0.12 } },
    { name: '厚壁', effect: { kind: 'statTeam', stat: 'hp', base: 0.08 } },
    { name: '不动', effect: { kind: 'startShield', base: 0.04 } },
  ],
  support: [
    { name: '庇佑', effect: { kind: 'aura', stat: 'hp', requireRole: 'attacker', count: 2, base: 0.06 } },
    { name: '协律', effect: { kind: 'aura', stat: 'rcv', requireRole: 'attacker', count: 2, base: 0.08 } },
    { name: '万众一心', effect: { kind: 'aura', stat: 'hp', requireRole: 'attacker', count: 2, base: 0.10 } },
  ],
};

/** 稀有度 → L1/L2/L3 槽位数：R1 / SR1 / SSR2 / UR3 */
export function passiveSlotsForRarity(rarity: Rarity): number {
  if (rarity <= 2) return 1;
  if (rarity === 3) return 2;
  return 3;
}

const toPct = (v: number): string => `${Math.round(v * 100)}%`;

/** skillTraits 等非 PassiveEffect 的 trait 描述（SkillEngine / 专属强化展示） */
export function describeSkillTrait(t: {
  type: string;
  stat?: StatKey;
  pct?: number;
  scope?: string;
  vs?: Element;
  element?: Element;
  cdDelta?: number;
  effectPctBonus?: number;
  convertCountBonus?: number;
  requireRole?: PetRole;
  requireElement?: Element;
  count?: number;
}): string {
  switch (t.type) {
    case 'statBonus': {
      const scope = t.scope === 'team' ? '全队' : '自身';
      return `${scope}${STAT_UI[t.stat!].longLabel} +${toPct(t.pct!)}`;
    }
    case 'elementDamageBonus':
      return `对${ELEMENT_NAME[t.vs!]}属性伤害 +${toPct(t.pct!)}`;
    case 'skillModifier': {
      const parts: string[] = [];
      if (t.cdDelta) parts.push(`CD ${t.cdDelta > 0 ? '+' : ''}${t.cdDelta}`);
      if (t.effectPctBonus) parts.push(`技能效果 +${toPct(t.effectPctBonus)}`);
      if (t.convertCountBonus) parts.push(`转珠 +${t.convertCountBonus} 颗`);
      return `专属强化：${parts.join('，') || '—'}`;
    }
    case 'teamAura': {
      const cond = t.requireElement
        ? `队中${ELEMENT_NAME[t.requireElement]}属性`
        : t.requireRole
          ? `队中${PET_ROLE_NAME[t.requireRole]}`
          : '队伍';
      return `光环：${cond}满 ${t.count} 只时，全队${STAT_UI[t.stat!].longLabel} +${toPct(t.pct!)}`;
    }
    default:
      return '';
  }
}
