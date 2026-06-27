/**
 * 战斗属性公式（阶段十二，纯函数，零状态）
 *
 * 单只宠的战斗属性 = (role.attribBase + Σ已解锁星级特性) × RARITY_ATTRIB_POWER[rarity]
 * - critRate / damageReduction / healBonus 限制在 [0, 1]（个体层不做队伍封顶，封顶在队伍聚合处）。
 * - critDamage / teamDamageBonus 不设上限（额外乘区，仅 ≥0）。
 * - level 暂不影响战斗属性（保持最小闭环；后续可在此扩展）。
 */
import type { PetDef } from '@/balance/pets';
import type { CombatAttribBlock } from '@/balance/petRoles';
import { PET_ROLE_PROFILES } from '@/balance/petRoles';
import { getRarityAttribPower } from '@/balance/rarity';
import { unlockedStarTraits } from '@/balance/talents';

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const round4 = (v: number): number => Math.round(v * 10000) / 10000;

/** 单只宠的战斗属性（按 role 基线 + 星级特性，再乘稀有度缩放） */
export function petCombatAttribs(pet: PetDef, _level: number, star: number): CombatAttribBlock {
  const profile = PET_ROLE_PROFILES[pet.role] ?? PET_ROLE_PROFILES.attacker;
  const base = profile.attribBase;

  let critRate = base.critRate;
  let critDamage = base.critDamage;
  let damageReduction = base.damageReduction;
  let healBonus = base.healBonus;
  let teamDamageBonus = base.teamDamageBonus;

  for (const layer of unlockedStarTraits(pet.role, star)) {
    if (layer.attrib === 'critRate') critRate += layer.base;
    else if (layer.attrib === 'critDamage') critDamage += layer.base;
    else if (layer.attrib === 'damageReduction') damageReduction += layer.base;
    else if (layer.attrib === 'healBonus') healBonus += layer.base;
    else teamDamageBonus += layer.base;
  }

  const power = getRarityAttribPower(pet.rarity);
  return {
    critRate: round4(clamp01(critRate * power)),
    critDamage: round4(Math.max(0, critDamage * power)),
    damageReduction: round4(clamp01(damageReduction * power)),
    healBonus: round4(clamp01(healBonus * power)),
    teamDamageBonus: round4(Math.max(0, teamDamageBonus * power)),
  };
}
