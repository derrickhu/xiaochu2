/**
 * 能力描述（展示层共享）：把 PetDef.traits 翻译成中文被动文案。
 * 抽卡 / 商店 / 图鉴的「能力卡」复用，保证「看能力再抽/买」口径一致。
 */
import type { PetDef } from '@/balance/pets';
import { PET_ROLE_NAME, STAT_UI } from '@/balance/pets';
import { ELEMENT_NAME } from '@/balance/ui';
import type { PetTraitDef } from '@/balance/petRoles';

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** 单条 trait → 中文被动描述 */
export function describeTrait(t: PetTraitDef): string {
  switch (t.type) {
    case 'statBonus': {
      const scope = t.scope === 'team' ? '全队' : '自身';
      return `${scope}${STAT_UI[t.stat].longLabel} +${pct(t.pct)}`;
    }
    case 'elementDamageBonus':
      return `对${ELEMENT_NAME[t.vs]}属性伤害 +${pct(t.pct)}`;
    case 'skillModifier': {
      const parts: string[] = [];
      if (t.cdDelta) parts.push(`CD ${t.cdDelta > 0 ? '+' : ''}${t.cdDelta}`);
      if (t.effectPctBonus) parts.push(`技能效果 +${pct(t.effectPctBonus)}`);
      if (t.convertCountBonus) parts.push(`转珠 +${t.convertCountBonus} 颗`);
      return `专属强化：${parts.join('，') || '—'}`;
    }
    case 'teamAura': {
      const cond = t.requireElement
        ? `队中${ELEMENT_NAME[t.requireElement]}属性`
        : t.requireRole
          ? `队中${PET_ROLE_NAME[t.requireRole]}`
          : '队伍';
      return `光环：${cond}满 ${t.count} 只时，全队${STAT_UI[t.stat].longLabel} +${pct(t.pct)}`;
    }
    default:
      return '';
  }
}

/** 一只宠的全部被动描述（无 trait 返回空数组） */
export function traitLines(pet: PetDef): string[] {
  return (pet.traits ?? []).map(describeTrait).filter((s) => s.length > 0);
}
