import { describe, it, expect } from 'vitest';
import { teamMaxHp, teamRcv, teamElements, petHpInTeam, type TeamMember } from '../team';
import { COMBAT } from '@/balance/combat';
import { PET_MAP, DEFAULT_TEAM } from '@/balance/pets';
import { resolvePassiveForCreature } from '@/balance/passives';
import { petHp, petRcv } from '../growth';

function makeTeam(ids: readonly string[], level = 1, star = 1): TeamMember[] {
  return ids.map((id) => ({ def: PET_MAP.get(id)!, level, star }));
}

describe('teamMaxHp', () => {
  it('空队伍 = 英雄基础生命', () => {
    expect(teamMaxHp([])).toBe(COMBAT.heroBaseHp);
  });

  it('总生命 = 英雄基础 + Σ宠物 hp（无队伍 hp 加成时）', () => {
    // 纯输出队不带任何 hp 光环/团队 hp 被动，队内生命 = 裸生命，可直接核对求和口径
    const team = makeTeam(['pet_wood_003', 'pet_fire_003']);
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

describe('support 阵容协同光环（条件=队中输出≥2）', () => {
  // 同一目标宠在两套队伍里的队内生命对比，隔离出 support 光环的乘区效果。
  // pet_metal_003=辅助(光环 hp)，pet_wood_003 / pet_fire_003=输出，pet_water_003=辅助。
  const target = (members: TeamMember[]): TeamMember =>
    members.find((m) => m.def.id === 'pet_wood_003')!;

  it('队中输出不足 2 只：support 光环不触发', () => {
    // 1 辅助 + 1 输出 → 输出数=1 < 2，光环不生效
    const team = makeTeam(['pet_metal_003', 'pet_wood_003']);
    const t = target(team);
    expect(petHpInTeam(team, t)).toBe(petHp(t.def, t.level, t.star));
  });

  it('队中输出满 2 只：support 光环触发，全队生命被放大', () => {
    // 1 辅助 + 2 输出 → 输出数=2，光环生效，目标输出宠的队内生命应高于裸生命
    const team = makeTeam(['pet_metal_003', 'pet_wood_003', 'pet_fire_003']);
    const t = target(team);
    expect(petHpInTeam(team, t)).toBeGreaterThan(petHp(t.def, t.level, t.star));
  });

  it('无 support 时同队不触发该光环（确认增益来自 support 而非输出自身）', () => {
    const team = makeTeam(['pet_wood_003', 'pet_fire_003']);
    const t = target(team);
    expect(petHpInTeam(team, t)).toBe(petHp(t.def, t.level, t.star));
  });

  it('展示文案为「队中输出满 N 只」而非无条件「队伍满 N 只」', () => {
    const passive = resolvePassiveForCreature('support', 1);
    expect(passive.lines[0]).toContain('队中输出满 2 只');
    expect(passive.lines[0]).not.toContain('队伍满');
  });
});
