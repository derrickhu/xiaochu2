import { describe, it, expect } from 'vitest';
import {
  SKILLS, getSkill, resolveSkillVfx, PET_SKILL_IDS,
  CATEGORY_DEFAULT_VFX, type SkillEffectDef,
} from '../skills';
import { PET_MAP } from '../pets';
import { skillForPet } from '@/game/battle/SkillEngine';

function damageMultiplier(effects: readonly SkillEffectDef[]): number {
  const dmg = effects.find((e) => e.kind === 'damage');
  if (!dmg || dmg.kind !== 'damage') throw new Error('无直伤效果');
  return dmg.multiplier;
}

describe('技能蓝图与分类', () => {
  it('每个技能都有分类，且未显式指定 vfx 时按分类兜底', () => {
    for (const skill of SKILLS) {
      expect(skill.category).toBeTruthy();
      expect(resolveSkillVfx(skill)).toBe(skill.vfx ?? CATEGORY_DEFAULT_VFX[skill.category]);
    }
  });

  it('同类直伤共用蓝图：金/水突刺结构一致（仅文案/数值差异）', () => {
    const metal = getSkill(PET_SKILL_IDS.metalSlash);
    const water = getSkill(PET_SKILL_IDS.waterPierce);
    expect(metal.category).toBe('nuke');
    expect(water.category).toBe('nuke');
    expect(damageMultiplier(metal.effects)).toBe(damageMultiplier(water.effects));
    expect(metal.tags).toEqual(water.tags);
  });

  it('文案由参数生成，不与数值漂移（600% / 700%）', () => {
    expect(getSkill(PET_SKILL_IDS.metalSlash).desc).toContain('600%');
    expect(getSkill(PET_SKILL_IDS.fireBurst).desc).toContain('700%');
  });
});

describe('技能星级分档强化', () => {
  const pet = PET_MAP.get('pet_metal_001')!; // 银光斩：直伤 600%，CD 4，无 skillModifier

  it('1★（tier1）= 基线，不改数值', () => {
    const s = skillForPet(pet, 1);
    expect(damageMultiplier(s.effects)).toBeCloseTo(6, 6);
    expect(s.cd).toBe(4);
  });

  it('3★（tier2）效果 +10%', () => {
    const s = skillForPet(pet, 3);
    expect(damageMultiplier(s.effects)).toBeCloseTo(6 * 1.1, 6);
    expect(s.cd).toBe(4);
  });

  it('5★（tier3）效果 +20% 且 CD -1', () => {
    const s = skillForPet(pet, 5);
    expect(damageMultiplier(s.effects)).toBeCloseTo(6 * 1.2, 6);
    expect(s.cd).toBe(3);
  });
});
