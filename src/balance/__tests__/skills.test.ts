import { describe, it, expect } from 'vitest';
import {
  SKILLS, getSkill, resolveSkillVfx, PET_SKILL_IDS,
  CATEGORY_DEFAULT_VFX, type SkillEffectDef, type SkillDef,
} from '../skills';
import { PET_MAP } from '../pets';
import type { PetDef } from '../pets';
import { getRaritySkillPower } from '../rarity';
import {
  runSkill, skillForPet, applyPetSkillModifiers,
  type SkillCaster, type SkillRuntimeContext,
} from '@/game/battle/SkillEngine';

function damageMultiplier(effects: readonly SkillEffectDef[]): number {
  const dmg = effects.find((e) => e.kind === 'damage');
  if (!dmg || dmg.kind !== 'damage') throw new Error('无直伤效果');
  return dmg.multiplier;
}

const PET_CASTER: SkillCaster = { kind: 'pet', atk: 1000, element: 'fire' };
const CTX: SkillRuntimeContext = {
  enemy: { hp: 100000, maxHp: 100000, atk: 500, def_: 0, element: 'metal' },
  heroHp: 5000, heroMaxHp: 5000,
  teamRcvTotal: 800, teamAtkTotal: 3000,
  teamDamageBuffMult: 1, enemyDamageReduction: 0, teamHealBonus: 0,
};

function skillWith(effects: SkillEffectDef[]): SkillDef {
  return {
    id: 'test_skill', name: '测试技', category: 'nuke', cd: 5,
    owner: 'pet', trigger: 'manual', target: 'enemy', tags: [], desc: '', effects, basePower: 0,
  };
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
  const pet = PET_MAP.get('cr_golden_crane')!; // 金羽仙鹤·金系突刺：直伤 600%，CD 4，无 skillModifier
  // 阶段十：技能数值再叠乘「施法宠稀有度倍率」（金羽仙鹤为 SSR）
  const rp = getRaritySkillPower(pet.rarity);

  it('1★（tier1）= 基线（仅稀有度缩放，不含星级加成）', () => {
    const s = skillForPet(pet, 1);
    expect(damageMultiplier(s.effects)).toBeCloseTo(6 * rp, 6);
    expect(s.cd).toBe(4);
  });

  it('3★（tier2）效果 +10%', () => {
    const s = skillForPet(pet, 3);
    expect(damageMultiplier(s.effects)).toBeCloseTo(6 * 1.1 * rp, 6);
    expect(s.cd).toBe(4);
  });

  it('5★（tier3）效果 +20% 且 CD -1', () => {
    const s = skillForPet(pet, 5);
    expect(damageMultiplier(s.effects)).toBeCloseTo(6 * 1.2 * rp, 6);
    expect(s.cd).toBe(3);
  });
});

describe('星级质变覆写 SKILL_STAR_OVERRIDE', () => {
  // 用无 trait 的合成宠隔离覆写逻辑（避免具体宠 skillModifier 干扰）
  const cleanPet = { traits: [] } as unknown as PetDef;
  const fireBurst = getSkill(PET_SKILL_IDS.fireBurst); // 倍率 7，CD 5

  it('燎原爆 tier3 走质变覆写（倍率 1050%，CD 3，文案覆盖）', () => {
    const s = applyPetSkillModifiers(fireBurst, cleanPet, 3);
    expect(damageMultiplier(s.effects)).toBeCloseTo(7 * 1.5, 6);
    expect(s.cd).toBe(3); // 5 + tier(-1) + override(-1)
    expect(s.desc).toContain('1050%');
  });

  it('未配置覆写的 tier 仍走平 % 加成', () => {
    const s = applyPetSkillModifiers(fireBurst, cleanPet, 2);
    expect(damageMultiplier(s.effects)).toBeCloseTo(7 * 1.1, 6);
  });
});

describe('阶段八新增 effect kind（注册表解算）', () => {
  it('multiHit：产出 hits 段独立伤害事件', () => {
    const skill = skillWith([
      { kind: 'multiHit', source: 'casterAtk', multiplier: 2, hits: 3, element: 'fire', applyDefense: true },
    ]);
    const r = runSkill(skill, PET_CASTER, CTX)!;
    expect(r.action).toBe('multiHit');
    expect(r.damageEvents).toHaveLength(3);
    for (const e of r.damageEvents) {
      expect(e.target).toBe('enemy');
      expect(e.amount).toBe(2000); // atk1000 × 2，def0 不减
    }
  });

  it('dot：产出持续伤害状态（每回合伤害 + 回合数）', () => {
    const skill = skillWith([{ kind: 'dot', source: 'casterAtk', multiplier: 0.5, turns: 3, element: 'fire' }]);
    const r = runSkill(skill, PET_CASTER, CTX)!;
    expect(r.action).toBe('dot');
    const dot = r.statusEvents.find((e) => e.status === 'dot')!;
    expect(dot.target).toBe('enemy');
    expect(dot.value).toBe(500);
    expect(dot.turns).toBe(3);
  });

  it('stun：产出眩晕状态', () => {
    const skill = skillWith([{ kind: 'stun', turns: 2 }]);
    const r = runSkill(skill, PET_CASTER, CTX)!;
    expect(r.action).toBe('stun');
    expect(r.statusEvents.find((e) => e.status === 'stun')?.turns).toBe(2);
  });

  it('defenseBreak：产出破防状态', () => {
    const skill = skillWith([{ kind: 'defenseBreak', pct: 0.4, turns: 2 }]);
    const r = runSkill(skill, PET_CASTER, CTX)!;
    expect(r.action).toBe('defenseBreak');
    const db = r.statusEvents.find((e) => e.status === 'enemyDefenseBreak')!;
    expect(db.value).toBeCloseTo(0.4, 6);
    expect(db.turns).toBe(2);
  });

  it('convertOrbs：透传转珠形状（默认 random）', () => {
    const rowSkill = skillWith([{ kind: 'convertOrbs', to: 'fire', count: 0, shape: 'row' }]);
    expect(runSkill(rowSkill, PET_CASTER, CTX)!.boardRequests[0].shape).toBe('row');
    const defSkill = skillWith([{ kind: 'convertOrbs', to: 'fire', count: 6 }]);
    expect(runSkill(defSkill, PET_CASTER, CTX)!.boardRequests[0].shape).toBe('random');
  });
});
