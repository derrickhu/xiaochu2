import { describe, it, expect } from 'vitest';
import { COMBAT } from '@/balance/combat';
import {
  comboMultiplier,
  matchCountMultiplier,
  elementMultiplier,
  defenseReduction,
  calcDamage,
  calcHeal,
} from '../damage';

describe('comboMultiplier（递减分段）', () => {
  it('1 Combo 无加成', () => {
    expect(comboMultiplier(1)).toBe(1.0);
    expect(comboMultiplier(0)).toBe(1.0);
  });

  it('2~6 Combo 每连 +20%', () => {
    expect(comboMultiplier(2)).toBe(1.2);
    expect(comboMultiplier(3)).toBe(1.4);
    expect(comboMultiplier(6)).toBe(2.0);
  });

  it('7~10 Combo 每连 +15%', () => {
    expect(comboMultiplier(7)).toBe(2.15);
    expect(comboMultiplier(10)).toBe(2.6);
  });

  it('11+ Combo 每连 +8%', () => {
    expect(comboMultiplier(11)).toBe(2.68);
    expect(comboMultiplier(15)).toBe(3.0);
  });

  it('曲线快照（改 comboTiers 后此快照 diff 即全局影响）', () => {
    const curve = Array.from({ length: 15 }, (_, i) => comboMultiplier(i + 1));
    expect(curve).toMatchSnapshot();
  });
});

describe('matchCountMultiplier', () => {
  it('3 连 ×1.0 / 4 连 ×1.5 / 5+ 连 ×2.0', () => {
    expect(matchCountMultiplier(3)).toBe(1.0);
    expect(matchCountMultiplier(4)).toBe(1.5);
    expect(matchCountMultiplier(5)).toBe(2.0);
    expect(matchCountMultiplier(6)).toBe(2.0);
  });
});

describe('elementMultiplier（五行克制）', () => {
  it('克制 ×1.6：水克火', () => {
    expect(elementMultiplier('water', 'fire')).toBe(1.6);
  });

  it('被克 = counteredMultiplier：火打水', () => {
    expect(elementMultiplier('fire', 'water')).toBe(COMBAT.counteredMultiplier);
  });

  it('无克制 ×1.0：金对水', () => {
    expect(elementMultiplier('metal', 'water')).toBe(1.0);
  });

  it('五行克制环完整：金→木→土→水→火→金', () => {
    expect(elementMultiplier('metal', 'wood')).toBe(1.6);
    expect(elementMultiplier('wood', 'earth')).toBe(1.6);
    expect(elementMultiplier('earth', 'water')).toBe(1.6);
    expect(elementMultiplier('water', 'fire')).toBe(1.6);
    expect(elementMultiplier('fire', 'metal')).toBe(1.6);
  });
});

describe('defenseReduction', () => {
  it('0 防御无减伤', () => {
    expect(defenseReduction(0)).toBe(0);
  });

  it('防御 = defenseScale 时减伤 50%', () => {
    expect(defenseReduction(300)).toBe(0.5);
  });

  it('减伤永远 < 100%', () => {
    expect(defenseReduction(1e9)).toBeLessThan(1);
  });
});

describe('calcDamage（完整管线）', () => {
  it('基准：100 攻 3 连 1 Combo 无克制 0 防 = 100', () => {
    expect(calcDamage({
      atk: 100, matchCount: 3, combo: 1,
      attackerElement: 'metal', defenderElement: 'water', defenderDef: 0,
    })).toBe(100);
  });

  it('克制 + Combo + 5 连消叠乘', () => {
    // 100 × 2.0(5连) × 1.4(3combo) × 1.6(克制) = 448
    expect(calcDamage({
      atk: 100, matchCount: 5, combo: 3,
      attackerElement: 'water', defenderElement: 'fire', defenderDef: 0,
    })).toBe(448);
  });

  it('防御减伤后向下取整', () => {
    // 100 × (1 - 300/600) = 50
    expect(calcDamage({
      atk: 100, matchCount: 3, combo: 1,
      attackerElement: 'metal', defenderElement: 'water', defenderDef: 300,
    })).toBe(50);
  });

  it('暴击 ×1.5', () => {
    expect(calcDamage({
      atk: 100, matchCount: 3, combo: 1,
      attackerElement: 'metal', defenderElement: 'water', defenderDef: 0, isCrit: true,
    })).toBe(150);
  });

  it('伤害至少 1 点', () => {
    expect(calcDamage({
      atk: 1, matchCount: 3, combo: 1,
      attackerElement: 'fire', defenderElement: 'water', defenderDef: 9999,
    })).toBe(1);
  });

  it('增伤 buff 乘区生效', () => {
    // 100 × 1.5(buff) = 150
    expect(calcDamage({
      atk: 100, matchCount: 3, combo: 1,
      attackerElement: 'metal', defenderElement: 'water', defenderDef: 0,
      buffMult: 1.5,
    })).toBe(150);
  });
});

describe('calcHeal（RCV 模型）', () => {
  it('回复 = 总RCV × 心珠系数 × 心珠数 × Combo 倍率', () => {
    const k = COMBAT.rcvPerHeartOrb;
    // rcv 100 × k × 1 颗 × ×1.0(1combo)
    expect(calcHeal(100, 1, 1)).toBe(Math.floor(100 * k * 1 * 1.0));
    // rcv 100 × k × 3 颗 × ×1.4(3combo)
    expect(calcHeal(100, 3, 3)).toBe(Math.floor(100 * k * 3 * 1.4));
  });

  it('无心珠不回复', () => {
    expect(calcHeal(100, 0, 5)).toBe(0);
  });
});
