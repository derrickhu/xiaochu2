/**
 * 队长技契约：稀有度单调、四 role 方向互不重叠、只认首位、双引擎口径一致。
 */
import { describe, it, expect } from 'vitest';
import { PET_MAP, type PetDef } from '@/balance/pets';
import { PET_ROLE_NAME, type PetRole } from '@/balance/petRoles';
import { RARITIES } from '@/balance/rarity';
import { LEADER_SKILL_BY_ROLE, resolveLeaderSkill } from '../leaderSkill';
import { buildTeam } from '@/formulas/simulationReport';
import { teamAtk, teamMaxHp, teamRcv, teamLeaderSkill, leaderComboBonus } from '@/formulas/team';
import { comboMultiplier, calcDamage } from '@/formulas/damage';

const ALL_ROLES = Object.keys(PET_ROLE_NAME) as PetRole[];

/** 按 role 找一只真实存在的宠（队长技派生只依赖 role + rarity） */
function petOfRole(role: PetDef['role']): PetDef {
  const pet = [...PET_MAP.values()].find((p) => p.role === role);
  expect(pet, `缺少 role=${role} 的灵宠`).toBeDefined();
  return pet!;
}

describe('队长技派生', () => {
  it('四个 role 各有一条，且效果方向互不重叠（换队长是选择而非比大小）', () => {
    const dirs = ALL_ROLES.map((role) => {
      const e = LEADER_SKILL_BY_ROLE[role].effect;
      return e.kind === 'statTeam' ? `stat:${e.stat}` : 'combo';
    });
    expect(new Set(dirs).size).toBe(ALL_ROLES.length);
  });

  it('强度随稀有度严格递增（复用 RARITY_PASSIVE_POWER 同一把尺子）', () => {
    for (const role of ALL_ROLES) {
      const values = RARITIES.map((r) => resolveLeaderSkill(role, r).value);
      for (let i = 1; i < values.length; i++) {
        expect(values[i], `${role} R${RARITIES[i]}`).toBeGreaterThan(values[i - 1]);
      }
    }
  });

  it('文案带出方向与数值（编队页与详情页共用这一行）', () => {
    expect(resolveLeaderSkill('attacker', 1).text).toContain('全队攻击');
    expect(resolveLeaderSkill('tank', 1).text).toContain('全队生命');
    expect(resolveLeaderSkill('healer', 1).text).toContain('全队回复');
    expect(resolveLeaderSkill('support', 1).text).toContain('Combo');
  });
});

describe('队长技只认编队首位', () => {
  const ids = [
    petOfRole('attacker').id, petOfRole('tank').id, petOfRole('healer').id,
  ];

  it('攻击队长抬全队攻击，换成坦克队长后攻击回落、生命抬升', () => {
    const atkLead = buildTeam(ids, 30, 2);
    const tankLead = buildTeam([ids[1], ids[0], ids[2]], 30, 2);

    expect(teamLeaderSkill(atkLead)!.name).toBe(LEADER_SKILL_BY_ROLE.attacker.name);
    expect(teamLeaderSkill(tankLead)!.name).toBe(LEADER_SKILL_BY_ROLE.tank.name);
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

describe('辅助队长：每连额外倍率', () => {
  it('仅辅助队长产生 comboBonus，其余 role 为 0', () => {
    const support = buildTeam([petOfRole('support').id, petOfRole('tank').id], 30, 2);
    const tank = buildTeam([petOfRole('tank').id, petOfRole('support').id], 30, 2);
    expect(leaderComboBonus(support)).toBeGreaterThan(0);
    expect(leaderComboBonus(tank)).toBe(0);
  });

  it('收益随连击数线性放大：1 Combo 无收益，高连才明显', () => {
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
