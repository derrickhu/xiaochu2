/**
 * 阶段十二契约（角色专属重构）：每个定位有招牌战斗属性
 * （输出=暴击率/暴击伤害、坦克=受击减伤、治疗=治疗强化、辅助=全队增伤），
 * 星级节点对「所有稀有度」都解锁（稀有度只放大数值），且高稀有/高星不弱于低档（单调不倒挂）。
 */
import { describe, it, expect } from 'vitest';
import type { PetDef } from '@/balance/pets';
import { PETS, INITIAL_PET_LEVEL } from '@/balance/pets';
import { PET_ROLE_PROFILES, type PetRole, type AttribKey } from '@/balance/petRoles';
import { RARITIES, getRarityAttribPower, type Rarity } from '@/balance/rarity';
import { ROLE_STAR_TRAITS, isStarTraitUnlocked } from '@/balance/talents';
import { petCombatAttribs } from '../attribs';
import { teamAttribAggregate, teamDamageReduction, type TeamMember } from '../team';
import { COMBAT } from '@/balance/combat';

/** 仅 role + rarity 驱动战斗属性，构造最小测试桩 */
function stub(role: PetRole, rarity: Rarity): PetDef {
  return { role, rarity } as PetDef;
}

const ROLES: PetRole[] = ['attacker', 'healer', 'tank', 'support'];
const ALL_KEYS: AttribKey[] = ['critRate', 'critDamage', 'damageReduction', 'healBonus', 'teamDamageBonus'];
const attribSum = (role: PetRole, rarity: Rarity, star: number): number => {
  const a = petCombatAttribs(stub(role, rarity), 1, star);
  return ALL_KEYS.reduce((sum, k) => sum + a[k], 0);
};

/** 每个定位的招牌属性键（attribBase 中唯一非零项） */
const SIGNATURE: Record<PetRole, AttribKey> = {
  attacker: 'critRate',
  tank: 'damageReduction',
  healer: 'healBonus',
  support: 'teamDamageBonus',
};

describe('petCombatAttribs：基线 × 稀有度缩放', () => {
  it('★1 仅 role 基线 × RARITY_ATTRIB_POWER（无星级特性）', () => {
    for (const role of ROLES) {
      const base = PET_ROLE_PROFILES[role].attribBase;
      for (const r of RARITIES) {
        const a = petCombatAttribs(stub(role, r), INITIAL_PET_LEVEL, 1);
        const p = getRarityAttribPower(r);
        for (const k of ALL_KEYS) {
          expect(a[k], `${role}@r${r} ${k}`).toBeCloseTo(base[k] * p, 6);
        }
      }
    }
  });

  it('各定位 ★1 只有自身招牌属性非零，其余为 0', () => {
    for (const role of ROLES) {
      const a = petCombatAttribs(stub(role, 3), 1, 1);
      for (const k of ALL_KEYS) {
        if (k === SIGNATURE[role]) {
          expect(a[k], `${role} 招牌 ${k}`).toBeGreaterThan(0);
        } else {
          expect(a[k], `${role} 非招牌 ${k}`).toBe(0);
        }
      }
    }
  });

  it('所有稀有度 ★5 都解锁全部星级特性（无需SSR永久锁）', () => {
    for (const r of RARITIES) {
      const p = getRarityAttribPower(r);
      // 输出：★3 暴伤 + ★5 暴击率，所有稀有度都生效（数值随稀有度放大）
      const atk5 = petCombatAttribs(stub('attacker', r), 1, 5);
      expect(atk5.critRate, `attacker@r${r} critRate`).toBeCloseTo((0.08 + 0.06) * p, 6);
      expect(atk5.critDamage, `attacker@r${r} critDamage`).toBeCloseTo(0.30 * p, 6);
      // 治疗：★3/★5 各 +0.10 治疗强化
      const heal5 = petCombatAttribs(stub('healer', r), 1, 5);
      expect(heal5.healBonus, `healer@r${r} healBonus`).toBeCloseTo((0.12 + 0.10 + 0.10) * p, 6);
      // 辅助：★3/★5 各 +0.04 全队增伤
      const sup5 = petCombatAttribs(stub('support', r), 1, 5);
      expect(sup5.teamDamageBonus, `support@r${r} teamDamageBonus`).toBeCloseTo((0.05 + 0.04 + 0.04) * p, 6);
    }
  });

  it('坦克逐级叠加减伤（★3 / ★5）', () => {
    const t1 = petCombatAttribs(stub('tank', 3), 1, 1).damageReduction;
    const t3 = petCombatAttribs(stub('tank', 3), 1, 3).damageReduction;
    const t5 = petCombatAttribs(stub('tank', 3), 1, 5).damageReduction;
    expect(t3).toBeGreaterThan(t1);
    expect(t5).toBeGreaterThan(t3);
  });

  it('属性钳制：critRate / damageReduction / healBonus ∈ [0,1]，critDamage / teamDamageBonus ≥ 0', () => {
    for (const role of ROLES) {
      for (const r of RARITIES) {
        for (const star of [1, 3, 5]) {
          const a = petCombatAttribs(stub(role, r), 1, star);
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

describe('isStarTraitUnlocked：仅星级单轴门槛（所有稀有度通用）', () => {
  it('星级达标即解锁，与稀有度无关', () => {
    for (const role of ROLES) {
      for (const layer of ROLE_STAR_TRAITS[role]) {
        expect(isStarTraitUnlocked(layer, layer.star - 1)).toBe(false); // 星级不足
        expect(isStarTraitUnlocked(layer, layer.star)).toBe(true); // 达标解锁
      }
    }
  });
});

describe('单调性：高稀有 / 高星不弱于低档', () => {
  it('固定星级下，战斗属性总强度随稀有度非递减', () => {
    for (const role of ROLES) {
      for (const star of [1, 3, 5]) {
        let prev = -Infinity;
        for (const r of RARITIES) {
          const v = attribSum(role, r, star);
          expect(v, `${role}@r${r}★${star}`).toBeGreaterThanOrEqual(prev);
          prev = v;
        }
      }
    }
  });

  it('固定稀有度下，战斗属性总强度随星级非递减', () => {
    for (const role of ROLES) {
      for (const r of RARITIES) {
        let prev = -Infinity;
        for (let star = 1; star <= 5; star++) {
          const v = attribSum(role, r, star);
          expect(v, `${role}@r${r}★${star}`).toBeGreaterThanOrEqual(prev);
          prev = v;
        }
      }
    }
  });
});

describe('teamAttribAggregate：全队属性聚合（减伤/治疗强化/全队增伤）', () => {
  it('单宠队伍：等于该宠自身全队属性贡献', () => {
    const def = PETS[0];
    const members: TeamMember[] = [{ def, level: INITIAL_PET_LEVEL, star: 1 }];
    const self = petCombatAttribs(def, INITIAL_PET_LEVEL, 1);
    const agg = teamAttribAggregate(members);
    expect(agg.damageReduction).toBeCloseTo(self.damageReduction, 4);
    expect(agg.healBonus).toBeCloseTo(self.healBonus, 4);
    expect(agg.teamDamageBonus).toBeCloseTo(self.teamDamageBonus, 4);
  });

  it('多坦克减伤求和，且全局封顶 60%', () => {
    const tank = PETS.find((p) => p.role === 'tank') ?? PETS[0];
    const members: TeamMember[] = Array.from({ length: 5 }, () => ({
      def: tank, level: INITIAL_PET_LEVEL, star: 5,
    }));
    expect(teamAttribAggregate(members).damageReduction).toBeLessThanOrEqual(COMBAT.damageReductionCap);
  });

  it('多治疗强化求和，且全局封顶 healBonusCap', () => {
    const healer = PETS.find((p) => p.role === 'healer') ?? PETS[0];
    const members: TeamMember[] = Array.from({ length: 5 }, () => ({
      def: healer, level: INITIAL_PET_LEVEL, star: 5,
    }));
    expect(teamAttribAggregate(members).healBonus).toBeLessThanOrEqual(COMBAT.healBonusCap);
  });

  it('暴击是个体属性，不进入队伍聚合（纯输出队 全队属性均为 0）', () => {
    const atk = PETS.find((p) => p.role === 'attacker') ?? PETS[0];
    const members: TeamMember[] = [{ def: atk, level: INITIAL_PET_LEVEL, star: 1 }];
    const agg = teamAttribAggregate(members);
    expect(agg.damageReduction).toBe(0);
    expect(agg.healBonus).toBe(0);
    expect(agg.teamDamageBonus).toBe(0);
    expect(teamDamageReduction(members)).toBe(0);
  });
});
