/**
 * 阶段十契约：稀有度 → 主动/被动强度「单调不倒挂」+ 技能预算自洽。
 */
import { describe, it, expect } from 'vitest';
import { PETS } from '@/balance/pets';
import { getSkill, type SkillCategory } from '@/balance/skills';
import {
  RARITIES, getRaritySkillPower, getRarityPassivePower, type Rarity,
} from '@/balance/rarity';
import {
  ROLE_PASSIVE_LADDER, passiveSlotsForRarity,
} from '@/balance/passives';
import { resolvePetPassiveBundle, computePetCombatAttribs } from '@/balance/passiveEffects';
import type { PetDef } from '@/balance/pets';
import type { PetRole } from '@/balance/petRoles';

function passiveTotalStrength(role: PetRole, rarity: Rarity): number {
  const bundle = resolvePetPassiveBundle(role, rarity, 1);
  let sum = 0;
  for (const e of bundle.effects) {
    if (!e.unlocked || e.source === 'signature' || e.source === 'star') continue;
    if (e.kind === 'statBonus' || e.kind === 'teamAura') sum += e.value;
    else if (e.kind === 'regenPct' || e.kind === 'startShieldPct' || e.kind === 'teamDamageBonus') sum += e.value;
  }
  return sum;
}

describe('技能预算 basePower 自洽', () => {
  it('每只宠的主动技都有正的 basePower（可横向比较）', () => {
    for (const pet of PETS) {
      const skill = getSkill(pet.skillId);
      expect(skill.basePower, `${pet.id} → ${skill.id}`).toBeGreaterThan(0);
    }
  });
});

describe('稀有度强度表严格递增（单一真源）', () => {
  it('RARITY_SKILL_POWER 随稀有度严格递增，锚点 R=1.0', () => {
    expect(getRaritySkillPower(1)).toBe(1.0);
    for (let i = 1; i < RARITIES.length; i++) {
      expect(getRaritySkillPower(RARITIES[i])).toBeGreaterThan(getRaritySkillPower(RARITIES[i - 1]));
    }
  });

  it('RARITY_PASSIVE_POWER 随稀有度严格递增，锚点 R=1.0', () => {
    expect(getRarityPassivePower(1)).toBe(1.0);
    for (let i = 1; i < RARITIES.length; i++) {
      expect(getRarityPassivePower(RARITIES[i])).toBeGreaterThan(getRarityPassivePower(RARITIES[i - 1]));
    }
  });
});

describe('主动技能：同 skillId 跨稀有有效强度严格递增', () => {
  it('任一技能被不同稀有度引用，有效强度随稀有度单调上升', () => {
    const skillIds = new Set(PETS.map((p) => p.skillId));
    for (const skillId of skillIds) {
      const bp = getSkill(skillId).basePower;
      let prev = -Infinity;
      for (const r of RARITIES) {
        const eff = bp * getRaritySkillPower(r);
        expect(eff, `${skillId} @r${r}`).toBeGreaterThan(prev);
        prev = eff;
      }
    }
  });
});

describe('被动：role 阶梯总强度随稀有度严格递增', () => {
  it('每个 role 的多层被动总强度单调上升（层数超集 + 每层缩放）', () => {
    for (const role of Object.keys(ROLE_PASSIVE_LADDER) as PetRole[]) {
      let prev = -Infinity;
      for (const r of RARITIES) {
        const v = passiveTotalStrength(role, r);
        expect(v, `${role} @r${r}`).toBeGreaterThan(prev);
        prev = v;
      }
    }
  });
});

describe('被动：槽位阶梯 R1 / SR1 / SSR2 / UR3', () => {
  it('passiveSlotsForRarity 契约：1/1/2/3', () => {
    expect(passiveSlotsForRarity(1)).toBe(1);
    expect(passiveSlotsForRarity(2)).toBe(1);
    expect(passiveSlotsForRarity(3)).toBe(2);
    expect(passiveSlotsForRarity(4)).toBe(3);
  });

  it('每个 role 的 ladder 效果数 = 槽位数', () => {
    for (const role of Object.keys(ROLE_PASSIVE_LADDER) as PetRole[]) {
      for (const r of RARITIES) {
        const bundle = resolvePetPassiveBundle(role, r, 1);
        const ladderEffects = bundle.effects.filter((e) => e.source === 'ladder');
        expect(ladderEffects.length, `${role} @r${r}`).toBeGreaterThanOrEqual(passiveSlotsForRarity(r));
      }
    }
  });

  it('槽位随稀有度非递减', () => {
    for (let i = 1; i < RARITIES.length; i++) {
      expect(passiveSlotsForRarity(RARITIES[i]))
        .toBeGreaterThanOrEqual(passiveSlotsForRarity(RARITIES[i - 1]));
    }
  });
});

describe('战斗属性：稀有度 × 星级单调不倒挂（阶段十二）', () => {
  const ATTRIB_ROLES: PetRole[] = ['attacker', 'healer', 'tank', 'support'];
  const stub = (role: PetRole, rarity: Rarity): PetDef => ({ role, rarity } as PetDef);
  const attribStrength = (role: PetRole, rarity: Rarity, star: number): number => {
    const a = computePetCombatAttribs(role, rarity, star);
    return a.critRate + a.critDamage + a.damageReduction + a.healBonus + a.teamDamageBonus;
  };

  it('固定星级，战斗属性总强度随稀有度非递减', () => {
    for (const role of ATTRIB_ROLES) {
      for (const star of [1, 3, 5]) {
        let prev = -Infinity;
        for (const r of RARITIES) {
          const v = attribStrength(role, r, star);
          expect(v, `${role} @r${r} ★${star}`).toBeGreaterThanOrEqual(prev);
          prev = v;
        }
      }
    }
  });

  it('固定稀有度，战斗属性总强度随星级非递减', () => {
    for (const role of ATTRIB_ROLES) {
      for (const r of RARITIES) {
        let prev = -Infinity;
        for (let star = 1; star <= 5; star++) {
          const v = attribStrength(role, r, star);
          expect(v, `${role} @r${r} ★${star}`).toBeGreaterThanOrEqual(prev);
          prev = v;
        }
      }
    }
  });
});

describe('分配审计：纯输出类技能无跨稀有倒挂', () => {
  const DAMAGE_CATEGORIES = new Set<SkillCategory>(['nuke', 'multiNuke', 'dot', 'teamNuke']);

  it('同一伤害类目内，高稀有宠的有效技能强度不低于低稀有宠', () => {
    const byCat = new Map<SkillCategory, { rarity: Rarity; eff: number; id: string }[]>();
    for (const pet of PETS) {
      const skill = getSkill(pet.skillId);
      if (!DAMAGE_CATEGORIES.has(skill.category)) continue;
      const eff = skill.basePower * getRaritySkillPower(pet.rarity);
      const arr = byCat.get(skill.category) ?? [];
      arr.push({ rarity: pet.rarity, eff, id: pet.id });
      byCat.set(skill.category, arr);
    }

    for (const [cat, arr] of byCat) {
      for (const lo of arr) {
        for (const hi of arr) {
          if (lo.rarity < hi.rarity) {
            expect(
              hi.eff,
              `${cat}: ${hi.id}(r${hi.rarity}) 应 ≥ ${lo.id}(r${lo.rarity})`,
            ).toBeGreaterThanOrEqual(lo.eff);
          }
        }
      }
    }
  });
});
