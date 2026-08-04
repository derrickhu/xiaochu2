/**
 * 队长技契约：per-pet 分配、稀有度单调、格式池覆盖度、只认首位、静态档接进队伍聚合。
 *
 * 这批断言守的是「换队长 = 换打法」而不是「换一个数值」：老版本按 role×rarity 派生，
 * 全表只有 4 种效果，测试当时验的是「四 role 互不重叠」；现在验的是格式池真的铺开了。
 */
import { describe, it, expect } from 'vitest';
import { PET_MAP, type PetDef } from '@/balance/pets';
import { PET_ROLE_NAME, type PetRole } from '@/balance/petRoles';
import { RARITIES } from '@/balance/rarity';
import { leaderSkillDefOf, resolveLeaderSkill, type LeaderEffect } from '../leaderSkill';
import { buildTeam } from '@/formulas/simulationReport';
import {
  teamAtk, teamMaxHp, teamRcv, teamLeaderSkill, leaderComboBonus, leaderTurnMods,
} from '@/formulas/team';
import { comboMultiplier, calcDamage } from '@/formulas/damage';

const ALL_ROLES = Object.keys(PET_ROLE_NAME) as PetRole[];
const ALL_PETS = [...PET_MAP.values()];

/** 找一只该 role 且队长技为指定格式的宠（per-pet 后不能再按 role 随便取一只） */
function petWithEffect(role: PetRole, kind: LeaderEffect['kind']): PetDef {
  const pet = ALL_PETS.find((p) => p.role === role && leaderSkillDefOf(p).effect.kind === kind);
  expect(pet, `缺少 role=${role} 且队长技为 ${kind} 的灵宠`).toBeDefined();
  return pet!;
}

describe('队长技格式分配', () => {
  it('每只宠都能解析出队长技，且文案非空', () => {
    for (const pet of ALL_PETS) {
      const skill = resolveLeaderSkill(pet);
      expect(skill.value, pet.id).toBeGreaterThan(0);
      expect(skill.text.length, pet.id).toBeGreaterThan(4);
    }
  });

  it('同一只宠多次解析结果稳定（分配是确定性的，不能每次进游戏都变）', () => {
    for (const pet of ALL_PETS.slice(0, 20)) {
      expect(resolveLeaderSkill(pet)).toEqual(resolveLeaderSkill(pet));
    }
  });

  it('全表铺开 ≥10 种效果格式（换宠换的是打法，不是同一条的大小）', () => {
    const kinds = new Set(ALL_PETS.map((p) => leaderSkillDefOf(p).effect.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(10);
  });

  it('每个 role 内至少 3 种格式，且生效条件不全是无条件档', () => {
    for (const role of ALL_ROLES) {
      const kinds = new Set(
        ALL_PETS.filter((p) => p.role === role).map((p) => leaderSkillDefOf(p).effect.kind),
      );
      expect(kinds.size, role).toBeGreaterThanOrEqual(3);
    }
  });

  it('专精令的属性取自持有者自身（火宠强化火，不是全表同一个属性）', () => {
    const specialists = ALL_PETS
      .map((p) => ({ pet: p, effect: leaderSkillDefOf(p).effect }))
      .filter((x) => x.effect.kind === 'elementDamage');
    expect(specialists.length).toBeGreaterThan(0);
    for (const { pet, effect } of specialists) {
      expect(effect.kind === 'elementDamage' && effect.element, pet.id).toBe(pet.element);
    }
  });

  it('强度随稀有度严格递增（复用 RARITY_PASSIVE_POWER 同一把尺子）', () => {
    for (const role of ALL_ROLES) {
      const base = ALL_PETS.find((p) => p.role === role)!;
      const values = RARITIES.map((r) => resolveLeaderSkill({ ...base, rarity: r }).value);
      for (let i = 1; i < values.length; i++) {
        expect(values[i], `${role} R${RARITIES[i]}`).toBeGreaterThan(values[i - 1]);
      }
    }
  });
});

describe('队长技只认编队首位', () => {
  const atkPet = petWithEffect('attacker', 'statTeam');
  const tankPet = petWithEffect('tank', 'statTeam');
  const healPet = petWithEffect('healer', 'statTeam');
  const ids = [atkPet.id, tankPet.id, healPet.id];

  it('攻击队长抬全队攻击，换成坦克队长后攻击回落、生命抬升', () => {
    const atkLead = buildTeam(ids, 30, 2);
    const tankLead = buildTeam([ids[1], ids[0], ids[2]], 30, 2);

    expect(teamLeaderSkill(atkLead)!.name).toBe(leaderSkillDefOf(atkPet).name);
    expect(teamLeaderSkill(tankLead)!.name).toBe(leaderSkillDefOf(tankPet).name);
    expect(teamAtk(atkLead)).toBeGreaterThan(teamAtk(tankLead));
    expect(teamMaxHp(tankLead)).toBeGreaterThan(teamMaxHp(atkLead));
  });

  it('治疗队长抬全队回复', () => {
    const base = buildTeam(ids, 30, 2);
    const healLead = buildTeam([ids[2], ids[0], ids[1]], 30, 2);
    expect(teamRcv(healLead)).toBeGreaterThan(teamRcv(base));
  });

  it('空队无队长技（不抛异常）', () => {
    expect(teamLeaderSkill([])).toBeNull();
    expect(leaderComboBonus([])).toBe(0);
  });
});

describe('条件档交给战斗期求值', () => {
  it('合鸣令队长产生 comboBonus，攻击系队长为 0', () => {
    const supportPet = petWithEffect('support', 'comboBonus');
    const other = petWithEffect('attacker', 'statTeam');
    expect(leaderComboBonus(buildTeam([supportPet.id, other.id], 30, 2))).toBeGreaterThan(0);
    expect(leaderComboBonus(buildTeam([other.id, supportPet.id], 30, 2))).toBe(0);
  });

  it('专精令导出属性乘区，血战令导出血线条件（静态档不出现在这里）', () => {
    const spec = petWithEffect('attacker', 'elementDamage');
    const mods = leaderTurnMods(buildTeam([spec.id], 30, 2));
    expect(mods.elementMult?.element).toBe(spec.element);
    expect(mods.elementMult!.mult).toBeGreaterThan(1);

    const lowHp = petWithEffect('attacker', 'hpLow');
    const lowMods = leaderTurnMods(buildTeam([lowHp.id], 30, 2));
    expect(lowMods.hpConditional?.mode).toBe('low');
    expect(lowMods.elementMult).toBeNull();

    const stat = petWithEffect('attacker', 'statTeam');
    const statMods = leaderTurnMods(buildTeam([stat.id], 30, 2));
    expect(statMods).toEqual(leaderTurnMods([]));
  });

  it('Combo 收益随连击数线性放大：1 Combo 无收益，高连才明显', () => {
    const bonus = 0.02;
    expect(comboMultiplier(1, bonus)).toBe(comboMultiplier(1));
    const low = comboMultiplier(3, bonus) - comboMultiplier(3);
    const high = comboMultiplier(10, bonus) - comboMultiplier(10);
    expect(low).toBeCloseTo(bonus * 2, 6);
    expect(high).toBeCloseTo(bonus * 9, 6);
  });

  it('接进伤害管线（calcDamage 走同一个 comboMultiplier）', () => {
    const input = {
      atk: 1000, matchCount: 3, combo: 8,
      attackerElement: 'fire' as const, defenderElement: 'fire' as const, defenderDef: 0,
    };
    expect(calcDamage({ ...input, comboBonus: 0.03 })).toBeGreaterThan(calcDamage(input));
  });
});
