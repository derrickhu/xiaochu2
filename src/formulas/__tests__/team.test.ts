import { describe, it, expect } from 'vitest';
import { teamMaxHp, teamRcv, teamElements, type TeamMember } from '../team';
import { COMBAT } from '@/balance/combat';
import { PET_MAP, DEFAULT_TEAM } from '@/balance/pets';
import { petHp, petRcv } from '../growth';

function makeTeam(ids: readonly string[], level = 1, star = 1): TeamMember[] {
  return ids.map((id) => ({ def: PET_MAP.get(id)!, level, star }));
}

describe('teamMaxHp', () => {
  it('空队伍 = 英雄基础生命', () => {
    expect(teamMaxHp([])).toBe(COMBAT.heroBaseHp);
  });

  it('总生命 = 英雄基础 + Σ宠物 hp', () => {
    const team = makeTeam(DEFAULT_TEAM);
    const expected = COMBAT.heroBaseHp +
      team.reduce((s, m) => s + petHp(m.def, m.level, m.star), 0);
    expect(teamMaxHp(team)).toBe(expected);
  });

  it('换上坦克宠总生命更高', () => {
    const base = teamMaxHp(makeTeam(['pet_fire_001']));
    const tanky = teamMaxHp(makeTeam(['pet_earth_001']));
    expect(tanky).toBeGreaterThan(base);
  });
});

describe('teamRcv', () => {
  it('总回复 = Σ宠物 rcv', () => {
    const team = makeTeam(DEFAULT_TEAM);
    const expected = team.reduce((s, m) => s + petRcv(m.def, m.level, m.star), 0);
    expect(teamRcv(team)).toBe(expected);
  });

  it('换上治疗宠总回复更高', () => {
    const noHealer = teamRcv(makeTeam(['pet_fire_001']));
    const withHealer = teamRcv(makeTeam(['pet_wood_001']));
    expect(withHealer).toBeGreaterThan(noHealer);
  });
});

describe('teamElements', () => {
  it('默认队伍(v0.3 挑战版)刻意只覆盖四行(缺土)，逼玩家编队', () => {
    const set = teamElements(makeTeam(DEFAULT_TEAM));
    expect(set.size).toBe(4);
    expect(set.has('earth')).toBe(false);
  });

  it('缺属性队伍：覆盖集合反映实际属性', () => {
    const set = teamElements(makeTeam(['pet_fire_001', 'pet_fire_002', 'pet_wood_001']));
    expect(set.has('fire')).toBe(true);
    expect(set.has('wood')).toBe(true);
    expect(set.has('water')).toBe(false);
    expect(set.size).toBe(2);
  });
});
