import { describe, expect, it } from 'vitest';
import { COMBAT, type Element } from '@/balance/combat';
import { skillComboFactor } from '@/formulas/damage';
import { makeDot, makeMultiHit, makeNuke, makeTeamNuke } from '@/balance/skills/blueprints';
import { runSkill, type SkillCaster, type SkillRuntimeContext } from '../SkillEngine';

const CASTER_ATK = 1000;

function caster(element: Element = 'metal'): SkillCaster {
  return { kind: 'pet', atk: CASTER_ATK, element, critRate: 0, critDamage: 0 };
}

/** 敌人固定取平属（water 对 metal 既不克也不被克），把克制乘区排除在断言之外 */
function ctx(lastCombo?: number): SkillRuntimeContext {
  return {
    enemy: { hp: 1_000_000, maxHp: 1_000_000, atk: 100, def_: 0, element: 'water' },
    heroHp: 1000,
    heroMaxHp: 1000,
    teamRcvTotal: 0,
    teamAtkTotal: CASTER_ATK,
    teamDamageBuffMult: 1,
    enemyDamageReduction: 0,
    teamHealBonus: 0,
    lastCombo,
  };
}

const nuke = makeNuke({ id: 'test_echo_nuke', name: '测试核爆', element: 'metal', multiplier: 5, cd: 5 });

function nukeDamage(lastCombo?: number): number {
  const result = runSkill(nuke, caster(), ctx(lastCombo));
  if (!result) throw new Error('技能未触发');
  return result.damageEvents.reduce((sum, e) => sum + e.amount, 0);
}

describe('skillComboFactor 连锁余韵乘区', () => {
  it('基准连锁正好 ×1.0', () => {
    expect(skillComboFactor(COMBAT.skillComboBaseline)).toBeCloseTo(1, 5);
  });

  it('没消过珠（0）按基准算，不惩罚开局放技', () => {
    expect(skillComboFactor(0)).toBe(1);
  });

  it('高于基准放大、低于基准衰减', () => {
    expect(skillComboFactor(COMBAT.skillComboBaseline + 3)).toBeGreaterThan(1);
    expect(skillComboFactor(COMBAT.skillComboBaseline - 2)).toBeLessThan(1);
  });

  it('两端都封顶，避免技巧带宽把 TTK 护栏顶穿', () => {
    expect(skillComboFactor(99)).toBe(COMBAT.skillComboFactorMax);
    expect(skillComboFactor(1)).toBe(COMBAT.skillComboFactorMin);
  });
});

describe('技能直伤吃连锁余韵', () => {
  it('缺省 lastCombo 与基准档同伤，老调用点行为不变', () => {
    expect(nukeDamage(undefined)).toBe(nukeDamage(COMBAT.skillComboBaseline));
  });

  it('上回合连锁越高，这一发越重', () => {
    expect(nukeDamage(9)).toBeGreaterThan(nukeDamage(COMBAT.skillComboBaseline));
    expect(nukeDamage(3)).toBeLessThan(nukeDamage(COMBAT.skillComboBaseline));
  });

  it('放大幅度与公式一致', () => {
    const base = nukeDamage(COMBAT.skillComboBaseline);
    expect(nukeDamage(9)).toBe(Math.floor(CASTER_ATK * 5 * skillComboFactor(9)));
    expect(base).toBe(CASTER_ATK * 5);
  });

  it('多段技每段都吃', () => {
    const multi = makeMultiHit({
      id: 'test_echo_multi', name: '测试多段', element: 'metal', multiplier: 2, hits: 3, cd: 5,
    });
    const hi = runSkill(multi, caster(), ctx(9))!.damageEvents;
    const base = runSkill(multi, caster(), ctx(COMBAT.skillComboBaseline))!.damageEvents;
    expect(hi).toHaveLength(3);
    expect(hi.reduce((s, e) => s + e.amount, 0)).toBeGreaterThan(base.reduce((s, e) => s + e.amount, 0));
  });

  it('持续伤害的每回合伤害也吃', () => {
    const dot = makeDot({
      id: 'test_echo_dot', name: '测试点燃', element: 'metal', multiplier: 2, turns: 3, cd: 5,
    });
    const hi = runSkill(dot, caster(), ctx(9))!.statusEvents[0].value;
    const base = runSkill(dot, caster(), ctx(COMBAT.skillComboBaseline))!.statusEvents[0].value;
    expect(hi).toBeGreaterThan(base);
  });

  it('齐射吃不到克制，但仍吃连锁——连锁考的是操作，不是编队', () => {
    const volley = makeTeamNuke({ id: 'test_echo_volley', name: '测试齐射', multiplier: 1.5, cd: 7 });
    const hi = runSkill(volley, caster(), ctx(9))!.damageEvents[0].amount;
    const base = runSkill(volley, caster(), ctx(COMBAT.skillComboBaseline))!.damageEvents[0].amount;
    expect(hi).toBeGreaterThan(base);
  });

  it('敌人技不吃连锁（玩家的连锁不该反过来喂敌人）', () => {
    const enemyCaster: SkillCaster = { kind: 'enemy', atk: CASTER_ATK, element: 'metal' };
    const hi = runSkill(nuke, enemyCaster, ctx(9))!.damageEvents[0].amount;
    expect(hi).toBe(CASTER_ATK * 5);
  });
});

describe('技能克制分离度', () => {
  it('克制与被克差距拉到 9 倍，编队才有答案', () => {
    const ratio = COMBAT.skillCounterMultiplier / COMBAT.skillCounteredMultiplier;
    expect(ratio).toBeGreaterThanOrEqual(9);
  });

  it('分离度比消珠更狠（技能是唯一能主动择色投放的乘区）', () => {
    const orbRatio = COMBAT.counterMultiplier / COMBAT.counteredMultiplier;
    const skillRatio = COMBAT.skillCounterMultiplier / COMBAT.skillCounteredMultiplier;
    expect(skillRatio).toBeGreaterThan(orbRatio);
  });

  it('五色均摊期望仍是 1.0，TTK 预算不动', () => {
    expect((COMBAT.skillCounterMultiplier + COMBAT.skillCounteredMultiplier + 3) / 5).toBeCloseTo(1, 5);
  });
});
