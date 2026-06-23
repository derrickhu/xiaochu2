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
    // 同稀有（rarity 2）下：攻击位 vs 坦克位，坦克 hp 更高
    const base = teamMaxHp(makeTeam(['pet_wood_003']));
    const tanky = teamMaxHp(makeTeam(['pet_earth_003']));
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
    // 同稀有（rarity 2）下：攻击位 vs 治疗位，治疗 rcv 更高
    const noHealer = teamRcv(makeTeam(['pet_wood_003']));
    const withHealer = teamRcv(makeTeam(['pet_wood_004']));
    expect(withHealer).toBeGreaterThan(noHealer);
  });
});

describe('teamElements', () => {
  it('初始队伍（五行各 1）覆盖全部 5 种属性', () => {
    const set = teamElements(makeTeam(DEFAULT_TEAM));
    expect(set.size).toBe(5);
    expect(set.has('earth')).toBe(true);
  });

  it('缺属性队伍：覆盖集合反映实际属性', () => {
    const set = teamElements(makeTeam(['pet_fire_003', 'pet_fire_004', 'pet_wood_003']));
    expect(set.has('fire')).toBe(true);
    expect(set.has('wood')).toBe(true);
    expect(set.has('water')).toBe(false);
    expect(set.size).toBe(2);
  });
});
