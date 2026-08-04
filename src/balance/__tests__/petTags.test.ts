/**
 * 宠物差异化词条契约：特攻对位、羁绊档位与封顶、抗性配额「5 只凑满才免疫」。
 *
 * 这三条各自要守住一个设计意图，测试按意图而不是按实现来断言：
 * 特攻要能让对位翻盘、羁绊不能盖过闸门惩罚、抗性不能靠一只宠单开免疫。
 */
import { describe, it, expect } from 'vitest';
import { ELEMENTS } from '@/balance/combat';
import { PETS } from '@/balance/pets';
import {
  applyResist, petTagsOf, resolveBonds, resolveResists,
  BOND_BONUS_CAP, BOND_TIER_2, BOND_TIER_3, KILLER_MULT, RESIST_PER_PET,
  ELEMENT_BOND, ROLE_BOND,
} from '../petTags';
import { killerMult } from '@/formulas/team';

describe('特攻 killerElement', () => {
  it('每只宠都有特攻，且不指向自身属性（那与克制/专精令重复）', () => {
    for (const pet of PETS) {
      expect(pet.tags.killerElement, pet.id).not.toBe(pet.element);
      expect(ELEMENTS).toContain(pet.tags.killerElement);
    }
  });

  it('五种属性都有足量的对位宠可选（不能有一个属性无人能克）', () => {
    for (const el of ELEMENTS) {
      const killers = PETS.filter((p) => p.tags.killerElement === el);
      expect(killers.length, `无宠特攻 ${el}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('对位命中才给乘区，错位为 1', () => {
    const pet = PETS[0];
    expect(killerMult(pet, pet.tags.killerElement)).toBe(KILLER_MULT);
    const wrong = ELEMENTS.find((e) => e !== pet.tags.killerElement)!;
    expect(killerMult(pet, wrong)).toBe(1);
  });

  it('派生是确定性的（同一只宠每次进游戏词条一致）', () => {
    for (const pet of PETS.slice(0, 20)) {
      expect(petTagsOf(pet)).toEqual(petTagsOf(pet));
      expect(petTagsOf(pet)).toEqual(pet.tags);
    }
  });
});

describe('羁绊 bondTags', () => {
  it('每只宠带属性宗 + 职能宗各一枚', () => {
    for (const pet of PETS) {
      expect(pet.tags.bondTags).toEqual([ELEMENT_BOND[pet.element], ROLE_BOND[pet.role]]);
    }
  });

  it('1 只不触发，2 只小成，3 只大成（只取最高档，不叠加）', () => {
    expect(resolveBonds([['炽炎']]).damageBonus).toBe(0);
    expect(resolveBonds([['炽炎'], ['炽炎']]).damageBonus).toBeCloseTo(BOND_TIER_2, 4);
    expect(resolveBonds([['炽炎'], ['炽炎'], ['炽炎']]).damageBonus).toBeCloseTo(BOND_TIER_3, 4);
    expect(resolveBonds(Array(5).fill(['炽炎'])).damageBonus).toBeCloseTo(BOND_TIER_3, 4);
  });

  it('总增伤封顶，不让羁绊盖过闸门的惩罚', () => {
    const five = Array(5).fill(['炽炎', '锋锐', '甲', '乙', '丙']);
    expect(resolveBonds(five).damageBonus).toBeCloseTo(BOND_BONUS_CAP, 4);
  });

  it('展示顺序按收益降序（编队页第一眼要看到最值钱的那条）', () => {
    const summary = resolveBonds([['炽炎', '锋锐'], ['炽炎', '磐固'], ['炽炎', '锋锐'], ['幽林', '锋锐']]);
    const bonuses = summary.active.map((a) => a.bonus);
    expect([...bonuses].sort((a, b) => b - a)).toEqual(bonuses);
    expect(summary.active[0].tag).toBe('炽炎');
  });

  it('纯色队同时吃到属性宗大成 —— 与「同源相斥」形成正面对撞', () => {
    const mono = PETS.filter((p) => p.element === 'fire').slice(0, 5);
    const bonds = resolveBonds(mono.map((p) => p.tags.bondTags));
    expect(bonds.active.some((a) => a.tag === ELEMENT_BOND.fire && a.count >= 3)).toBe(true);
  });
});

describe('抗性配额', () => {
  it('单宠 20%，同抗性 5 只才凑满 100%', () => {
    expect(resolveResists(['sealOrbs']).sealOrbs).toBeCloseTo(RESIST_PER_PET, 4);
    expect(resolveResists(Array(4).fill('sealOrbs')).sealOrbs).toBeCloseTo(0.8, 4);
    expect(resolveResists(Array(5).fill('sealOrbs')).sealOrbs).toBe(1);
  });

  it('配额不外溢到别的抗性（分摊才是取舍所在）', () => {
    const q = resolveResists(['sealOrbs', 'sealOrbs', 'healBlock']);
    expect(q.sealOrbs).toBeCloseTo(0.4, 4);
    expect(q.healBlock).toBeCloseTo(0.2, 4);
    expect(q.timeSqueeze).toBe(0);
    expect(q.skillSeal).toBe(0);
  });

  it('未满配按比例砍时长且至少留 1 回合，满配才彻底免疫', () => {
    expect(applyResist(5, 0)).toBe(5);
    expect(applyResist(5, 0.2)).toBe(4);
    expect(applyResist(5, 0.8)).toBe(1);
    expect(applyResist(1, 0.8)).toBe(1);
    expect(applyResist(5, 1)).toBe(0);
  });

  it('四种抗性在全表都有足够载体（不能有一种凑不满 5 只）', () => {
    const counts = new Map<string, number>();
    for (const pet of PETS) {
      counts.set(pet.tags.resist, (counts.get(pet.tags.resist) ?? 0) + 1);
    }
    for (const kind of ['sealOrbs', 'healBlock', 'timeSqueeze', 'skillSeal']) {
      expect(counts.get(kind) ?? 0, `${kind} 载体不足`).toBeGreaterThanOrEqual(5);
    }
  });
});
