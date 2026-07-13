/**
 * 阶段十二契约 + PassiveEffect 统一管线测试
 */
import { describe, it, expect } from 'vitest';
import type { PetDef } from '@/balance/pets';
import { PETS, INITIAL_PET_LEVEL } from '@/balance/pets';
import { ROLE_PASSIVE_L0 } from '@/balance/passives';
import type { PetRole, AttribKey } from '@/balance/petRoles';
import { RARITIES, getRarityAttribPower, type Rarity } from '@/balance/rarity';
import { ROLE_STAR_EFFECTS, isStarEffectUnlocked } from '@/balance/passiveEffects';
import { computePetCombatAttribs, resolvePetPassiveBundle } from '@/balance/passiveEffects';
import { teamEffectAggregate, type TeamMember } from '@/formulas/team';
import { petSelfCombatProfile, teamStatMultiplier } from '@/formulas/passiveCombat';
import { COMBAT } from '@/balance/combat';

function stub(role: PetRole, rarity: Rarity): PetDef {
  return { role, rarity } as PetDef;
}

const ROLES: PetRole[] = ['attacker', 'healer', 'tank', 'support'];
const ALL_KEYS: AttribKey[] = ['critRate', 'critDamage', 'damageReduction', 'healBonus', 'teamDamageBonus'];
const attribSum = (role: PetRole, rarity: Rarity, star: number): number => {
  const a = computePetCombatAttribs(role, rarity, star);
  return ALL_KEYS.reduce((sum, k) => sum + a[k], 0);
};

const SIGNATURE: Record<PetRole, AttribKey> = {
  attacker: 'critRate',
  tank: 'damageReduction',
  healer: 'healBonus',
  support: 'teamDamageBonus',
};

describe('computePetCombatAttribs：L0 × 稀有度缩放', () => {
  it('★1 仅 L0 签名 × RARITY_ATTRIB_POWER（无星级特性）', () => {
    for (const role of ROLES) {
      const l0 = ROLE_PASSIVE_L0[role].effect;
      const base = l0.kind === 'critRate' ? { critRate: l0.base, critDamage: 0, damageReduction: 0, healBonus: 0, teamDamageBonus: 0 }
        : l0.kind === 'damageReduction' ? { critRate: 0, critDamage: 0, damageReduction: l0.base, healBonus: 0, teamDamageBonus: 0 }
        : l0.kind === 'healBonus' ? { critRate: 0, critDamage: 0, damageReduction: 0, healBonus: l0.base, teamDamageBonus: 0 }
        : { critRate: 0, critDamage: 0, damageReduction: 0, healBonus: 0, teamDamageBonus: l0.base };
      for (const r of RARITIES) {
        const a = computePetCombatAttribs(role, r, 1);
        const p = getRarityAttribPower(r);
        for (const k of ALL_KEYS) {
          expect(a[k], `${role}@r${r} ${k}`).toBeCloseTo(base[k] * p, 6);
        }
      }
    }
  });

  it('各定位 ★1 只有自身招牌属性非零', () => {
    for (const role of ROLES) {
      const a = computePetCombatAttribs(role, 3, 1);
      for (const k of ALL_KEYS) {
        if (k === SIGNATURE[role]) {
          expect(a[k], `${role} 招牌 ${k}`).toBeGreaterThan(0);
        } else {
          expect(a[k], `${role} 非招牌 ${k}`).toBe(0);
        }
      }
    }
  });

  it('所有稀有度 ★5 都解锁全部星级特性', () => {
    for (const r of RARITIES) {
      const p = getRarityAttribPower(r);
      const atk5 = computePetCombatAttribs('attacker', r, 5);
      expect(atk5.critRate).toBeCloseTo((0.08 + 0.06) * p, 6);
      expect(atk5.critDamage).toBeCloseTo(0.30 * p, 6);
      const heal5 = computePetCombatAttribs('healer', r, 5);
      expect(heal5.healBonus).toBeCloseTo((0.12 + 0.10 + 0.10) * p, 6);
      const sup5 = computePetCombatAttribs('support', r, 5);
      expect(sup5.teamDamageBonus).toBeCloseTo((0.05 + 0.04 + 0.04) * p, 6);
    }
  });

  it('坦克逐级叠加减伤（★3 / ★5）', () => {
    const t1 = computePetCombatAttribs('tank', 3, 1).damageReduction;
    const t3 = computePetCombatAttribs('tank', 3, 3).damageReduction;
    const t5 = computePetCombatAttribs('tank', 3, 5).damageReduction;
    expect(t3).toBeGreaterThan(t1);
    expect(t5).toBeGreaterThan(t3);
  });

  it('属性钳制', () => {
    for (const role of ROLES) {
      for (const r of RARITIES) {
        for (const star of [1, 3, 5]) {
          const a = computePetCombatAttribs(role, r, star);
          for (const k of ['critRate', 'damageReduction', 'healBonus'] as AttribKey[]) {
            expect(a[k]).toBeGreaterThanOrEqual(0);
            expect(a[k]).toBeLessThanOrEqual(1);
          }
          expect(a.critDamage).toBeGreaterThanOrEqual(0);
          expect(a.teamDamageBonus).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe('isStarEffectUnlocked', () => {
  it('星级达标即解锁', () => {
    for (const role of ROLES) {
      for (const layer of ROLE_STAR_EFFECTS[role]) {
        expect(isStarEffectUnlocked(layer, layer.star - 1)).toBe(false);
        expect(isStarEffectUnlocked(layer, layer.star)).toBe(true);
      }
    }
  });
});

describe('单调性', () => {
  it('固定星级，战斗属性总强度随稀有度非递减', () => {
    for (const role of ROLES) {
      for (const star of [1, 3, 5]) {
        let prev = -Infinity;
        for (const r of RARITIES) {
          expect(attribSum(role, r, star)).toBeGreaterThanOrEqual(prev);
          prev = attribSum(role, r, star);
        }
      }
    }
  });

  it('固定稀有度，战斗属性总强度随星级非递减', () => {
    for (const role of ROLES) {
      for (const r of RARITIES) {
        let prev = -Infinity;
        for (let star = 1; star <= 5; star++) {
          expect(attribSum(role, r, star)).toBeGreaterThanOrEqual(prev);
          prev = attribSum(role, r, star);
        }
      }
    }
  });
});

describe('teamEffectAggregate', () => {
  it('单宠队伍等于自身贡献（同等级口径）', () => {
    const def = PETS[0];
    const members: TeamMember[] = [{ def, level: INITIAL_PET_LEVEL, star: 1 }];
    const self = computePetCombatAttribs(def.role, def.rarity, 1, INITIAL_PET_LEVEL);
    const agg = teamEffectAggregate(members);
    expect(agg.damageReduction).toBeCloseTo(self.damageReduction, 4);
    expect(agg.healBonus).toBeCloseTo(self.healBonus, 4);
  });

  it('L0 签名被动 Lv.10 解锁：满级队 > Lv.1 队', () => {
    const tank = PETS.find((p) => p.role === 'tank') ?? PETS[0];
    const low: TeamMember[] = [{ def: tank, level: 1, star: 1 }];
    const high: TeamMember[] = [{ def: tank, level: 10, star: 1 }];
    expect(teamEffectAggregate(low).damageReduction).toBe(0);
    expect(teamEffectAggregate(high).damageReduction).toBeGreaterThan(0);
  });

  it('多坦克减伤封顶', () => {
    const tank = PETS.find((p) => p.role === 'tank') ?? PETS[0];
    const members: TeamMember[] = Array.from({ length: 5 }, () => ({
      def: tank, level: INITIAL_PET_LEVEL, star: 5,
    }));
    expect(teamEffectAggregate(members).damageReduction).toBeLessThanOrEqual(COMBAT.damageReductionCap);
  });

  it('多治疗强化封顶', () => {
    const healer = PETS.find((p) => p.role === 'healer') ?? PETS[0];
    const members: TeamMember[] = Array.from({ length: 5 }, () => ({
      def: healer, level: INITIAL_PET_LEVEL, star: 5,
    }));
    expect(teamEffectAggregate(members).healBonus).toBeLessThanOrEqual(COMBAT.healBonusCap);
  });
});

describe('petSelfCombatProfile', () => {
  it('crit 与 computePetCombatAttribs 一致', () => {
    for (const role of ROLES) {
      for (const r of RARITIES) {
        for (const star of [1, 3, 5]) {
          const pet = stub(role, r);
          const a = computePetCombatAttribs(role, r, star);
          const neu = petSelfCombatProfile(pet, star);
          expect(neu.critRate).toBe(a.critRate);
          expect(neu.critDamage).toBe(a.critDamage);
        }
      }
    }
  });
});

describe('teamStatMultiplier', () => {
  it('support 光环与 bundle statEffects 一致', () => {
    const members: TeamMember[] = PETS.slice(0, 5).map((def) => ({
      def, level: INITIAL_PET_LEVEL, star: 1,
    }));
    for (const target of members) {
      for (const stat of ['atk', 'hp', 'rcv'] as const) {
        let legacyMult = 1;
        for (const source of members) {
          const bundle = resolvePetPassiveBundle(
            source.def.role, source.def.rarity, { level: source.level, star: source.star },
          );
          for (const e of bundle.statEffects) {
            if (e.kind === 'statBonus' && e.statScope === 'team' && e.stat === stat) {
              legacyMult *= 1 + e.value;
            }
            if (e.kind === 'teamAura' && e.stat === stat && e.aura) {
              const count = members.filter((m) => {
                if (e.aura!.requireRole && m.def.role !== e.aura!.requireRole) return false;
                if (e.aura!.requireElement && m.def.element !== e.aura!.requireElement) return false;
                return true;
              }).length;
              if (count >= e.aura.count) legacyMult *= 1 + e.value;
            }
          }
        }
        expect(teamStatMultiplier(members, target, stat)).toBeCloseTo(legacyMult, 6);
      }
    }
  });
});
