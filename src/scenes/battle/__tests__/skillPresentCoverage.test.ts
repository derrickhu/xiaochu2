import { describe, expect, it } from 'vitest';
import { SKILLS } from '@/balance/skills/registry';
import { resolveSkillVfx } from '@/balance/skills/vfx';
import { SKILL_VFX_MAP } from '@/balance/skillVfx';
import {
  RESIDUAL_CHANNELS,
  channelsOfSkill,
  primaryChannelsOfSkill,
} from '../skillPresentCoverage';

describe('宠物主动技演出覆盖', () => {
  const petSkills = SKILLS.filter((s) => s.owner === 'pet');

  it('每只宠物技的每个效果频道，主演出或残段必须能播到', () => {
    const residual = new Set(RESIDUAL_CHANNELS);
    const gaps: string[] = [];
    for (const skill of petSkills) {
      const required = channelsOfSkill(skill);
      const primary = new Set(primaryChannelsOfSkill(skill));
      const missing = required.filter((ch) => !primary.has(ch) && !residual.has(ch));
      if (missing.length > 0) {
        gaps.push(`${skill.id} ${skill.name}: 缺 ${missing.join(', ')}`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it('每只宠物技都能解析到已登记的 VFX，不会掉进 default 空演出', () => {
    const unknown: string[] = [];
    for (const skill of petSkills) {
      const id = resolveSkillVfx(skill);
      if (!SKILL_VFX_MAP.has(id)) unknown.push(`${skill.id} → ${id}`);
    }
    expect(unknown).toEqual([]);
  });

  it('带直伤的复合技不能只靠净化/破防/护盾主分类（残段必须认 enemyDamage）', () => {
    const nukes = petSkills.filter((s) => channelsOfSkill(s).includes('enemyDamage'));
    expect(nukes.length).toBeGreaterThan(0);
    expect(RESIDUAL_CHANNELS).toContain('enemyDamage');
    const cleanse = petSkills.find((s) => s.id === 'pet_golden_cleanse');
    expect(cleanse).toBeTruthy();
    expect(channelsOfSkill(cleanse!)).toEqual(expect.arrayContaining(['enemyDamage', 'purify']));
  });
});
