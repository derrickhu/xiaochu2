import { describe, expect, it } from 'vitest';
import { COMBAT, type Element } from '@/balance/combat';
import { makeMultiHit, makeNuke, makeTeamNuke } from '@/balance/skills/blueprints';
import { runSkill, type SkillCaster, type SkillRuntimeContext } from '../SkillEngine';

const CASTER_ATK = 1000;

function caster(element: Element): SkillCaster {
  return { kind: 'pet', atk: CASTER_ATK, element, critRate: 0, critDamage: 0 };
}

function ctx(enemyElement: Element): SkillRuntimeContext {
  return {
    enemy: { hp: 1_000_000, maxHp: 1_000_000, atk: 100, def_: 0, element: enemyElement },
    heroHp: 1000,
    heroMaxHp: 1000,
    teamRcvTotal: 0,
    teamAtkTotal: CASTER_ATK,
    teamDamageBuffMult: 1,
    enemyDamageReduction: 0,
    teamHealBonus: 0,
  };
}

function enemyDamage(skill: ReturnType<typeof makeNuke>, atkElement: Element, defElement: Element): number {
  const result = runSkill(skill, caster(atkElement), ctx(defElement));
  if (!result) throw new Error('技能未触发');
  return result.damageEvents
    .filter((e) => e.target === 'enemy')
    .reduce((sum, e) => sum + e.amount, 0);
}

// 金克木、木克土、土克水、水克火、火克金
const nuke = makeNuke({ id: 'test_nuke', name: '测试核爆', element: 'metal', multiplier: 5, cd: 5 });

describe('技能瞬发直伤吃五行克制', () => {
  it('打克制目标按 skillCounterMultiplier 放大', () => {
    const neutral = enemyDamage(nuke, 'metal', 'water');
    const countering = enemyDamage(nuke, 'metal', 'wood');
    expect(countering).toBe(Math.floor(neutral * COMBAT.skillCounterMultiplier));
  });

  it('打被克目标按 skillCounteredMultiplier 衰减', () => {
    const neutral = enemyDamage(nuke, 'metal', 'water');
    const countered = enemyDamage(nuke, 'metal', 'fire');
    expect(countered).toBe(Math.floor(neutral * COMBAT.skillCounteredMultiplier));
  });

  it('五色均摊的期望值仍是 1.0，TTK 预算不受影响', () => {
    const expected = (COMBAT.skillCounterMultiplier + COMBAT.skillCounteredMultiplier + 3) / 5;
    expect(expected).toBeCloseTo(1.0, 5);
  });

  it('多段技每一段都吃克制', () => {
    const multi = makeMultiHit({
      id: 'test_multi', name: '测试多段', element: 'metal', multiplier: 2, hits: 3, cd: 5,
    });
    const neutral = enemyDamage(multi, 'metal', 'water');
    const countering = enemyDamage(multi, 'metal', 'wood');
    expect(countering).toBeGreaterThan(neutral);
  });

  it('全队齐射是混属性齐射，不吃克制', () => {
    const volley = makeTeamNuke({ id: 'test_volley', name: '测试齐射', multiplier: 1.5, cd: 7 });
    expect(enemyDamage(volley, 'metal', 'wood')).toBe(enemyDamage(volley, 'metal', 'fire'));
  });

  it('敌人技能打英雄不吃克制（英雄无属性）', () => {
    const enemyCtx = ctx('wood');
    const result = runSkill(nuke, { kind: 'enemy', atk: CASTER_ATK, element: 'metal' }, enemyCtx);
    expect(result?.damageEvents[0]).toMatchObject({ target: 'hero', amount: CASTER_ATK * 5 });
  });
});
