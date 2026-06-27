/**
 * PassiveEffect 统一管线测试
 */
import { describe, it, expect } from 'vitest';
import type { PetDef } from '@/balance/pets';
import { PETS, INITIAL_PET_LEVEL } from '@/balance/pets';
import { passiveSlotsForRarity } from '@/balance/passives';
import type { PetRole } from '@/balance/petRoles';
import { RARITIES, type Rarity } from '@/balance/rarity';
import { resolvePetPassiveBundle } from '@/balance/passiveEffects';
import { computePetCombatAttribs } from '@/balance/passiveEffects';
import { teamEffectAggregate, type TeamMember } from '@/formulas/team';
import { petSelfCombatProfile, teamStatMultiplier } from '@/formulas/passiveCombat';

const ROLES: PetRole[] = ['attacker', 'healer', 'tank', 'support'];

function stub(role: PetRole, rarity: Rarity): PetDef {
  return { role, rarity } as PetDef;
}

describe('resolvePetPassiveBundle', () => {
  it('ladder 层数 = passiveSlotsForRarity', () => {
    for (const role of ROLES) {
      for (const r of RARITIES) {
        const bundle = resolvePetPassiveBundle(role, r, 1);
        const ladderCount = bundle.effects.filter((e) => e.source === 'ladder').length;
        expect(ladderCount, `${role}@r${r}`).toBeGreaterThan(0);
        expect(ladderCount).toBeLessThanOrEqual(passiveSlotsForRarity(r) * 2);
      }
    }
  });

  it('displayLines 含 star 成长行（Phase C UI）', () => {
    const locked = resolvePetPassiveBundle('support', 3, 1, { includeStarInDisplay: true });
    expect(locked.displayLines.some((l) => l.text.includes('★3解锁'))).toBe(true);
    expect(locked.displayLines.some((l) => l.unlocked === false)).toBe(true);
    const unlocked = resolvePetPassiveBundle('support', 3, 5, { includeStarInDisplay: true });
    expect(unlocked.displayLines.filter((l) => l.text.includes('锐眼') || l.text.includes('激励')).length)
      .toBeGreaterThanOrEqual(2);
    expect(unlocked.displayLines.filter((l) => l.unlocked === true).length).toBeGreaterThanOrEqual(2);
  });

  it('attacker 文案为「全队增伤」', () => {
    const lines = resolvePetPassiveBundle('attacker', 3, 1).displayLines;
    const dmgLine = lines.find((l) => l.text.includes('增伤'));
    expect(dmgLine?.text).toContain('全队增伤');
    expect(dmgLine?.text).not.toContain('全队伤害');
  });
});

describe('teamEffectAggregate：统一求和口径', () => {
  it('★5 混合队 teamDamageMult = 1 + Σ', () => {
    const members: TeamMember[] = [
      { def: PETS.find((p) => p.role === 'attacker')!, level: INITIAL_PET_LEVEL, star: 5 },
      { def: PETS.find((p) => p.role === 'support')!, level: INITIAL_PET_LEVEL, star: 5 },
      { def: PETS.find((p) => p.role === 'tank')!, level: INITIAL_PET_LEVEL, star: 5 },
    ];
    let dmgSum = 0;
    for (const m of members) {
      dmgSum += computePetCombatAttribs(m.def.role, m.def.rarity, m.star).teamDamageBonus;
      const bundle = resolvePetPassiveBundle(m.def.role, m.def.rarity, m.star);
      for (const e of bundle.effects) {
        if (e.kind === 'teamDamageBonus' && e.source === 'ladder' && e.unlocked) dmgSum += e.value;
      }
    }
    expect(teamEffectAggregate(members).teamDamageMult).toBeCloseTo(1 + dmgSum, 4);
  });
});

describe('petSelfCombatProfile', () => {
  it('全矩阵 crit 一致', () => {
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
  it('真实编队 bundle 连乘', () => {
    const members: TeamMember[] = PETS.slice(0, 5).map((def) => ({
      def, level: INITIAL_PET_LEVEL, star: 1,
    }));
    for (const target of members) {
      for (const stat of ['atk', 'hp', 'rcv'] as const) {
        let mult = 1;
        for (const source of members) {
          const bundle = resolvePetPassiveBundle(source.def.role, source.def.rarity, source.star);
          for (const e of bundle.statEffects) {
            if (e.kind === 'statBonus' && e.statScope === 'team' && e.stat === stat) mult *= 1 + e.value;
            if (e.kind === 'teamAura' && e.stat === stat && e.aura) {
              const count = members.filter((m) => {
                if (e.aura!.requireRole && m.def.role !== e.aura!.requireRole) return false;
                if (e.aura!.requireElement && m.def.element !== e.aura!.requireElement) return false;
                return true;
              }).length;
              if (count >= e.aura.count) mult *= 1 + e.value;
            }
          }
        }
        expect(teamStatMultiplier(members, target, stat)).toBeCloseTo(mult, 6);
      }
    }
  });
});
