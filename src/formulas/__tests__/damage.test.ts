import { describe, it, expect } from 'vitest';
import { COMBAT } from '@/balance/combat';
import {
  comboMultiplier,
  matchCountMultiplier,
  elementMultiplier,
  defenseReduction,
  calcDamage,
  calcHeal,
  expectedCritFactor,
  applyDamageReduction,
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

  it('暴击 ×1.5（critBase，无额外暴伤）', () => {
    expect(calcDamage({
      atk: 100, matchCount: 3, combo: 1,
      attackerElement: 'metal', defenderElement: 'water', defenderDef: 0, isCrit: true,
    })).toBe(150);
  });

  it('暴击倍率叠加 critDamage：×(critBase + critDamage)', () => {
    // 100 × (1.5 + 0.5) = 200
    expect(calcDamage({
      atk: 100, matchCount: 3, combo: 1,
      attackerElement: 'metal', defenderElement: 'water', defenderDef: 0,
      isCrit: true, critDamage: 0.5,
    })).toBe(200);
  });

  it('未暴击时 critDamage 不生效', () => {
    expect(calcDamage({
      atk: 100, matchCount: 3, combo: 1,
      attackerElement: 'metal', defenderElement: 'water', defenderDef: 0,
      isCrit: false, critDamage: 0.5,
    })).toBe(100);
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

describe('expectedCritFactor（期望暴击系数，双模型镜像）', () => {
  it('暴击率 0 → 系数 1（无放大）', () => {
    expect(expectedCritFactor(0, 0)).toBe(1);
    expect(expectedCritFactor(0, 0.5)).toBe(1);
  });

  it('1 + critRate × ((critBase + critDamage) - 1)', () => {
    // 0.5 × ((1.5 + 0.5) - 1) = 0.5 → 1.5
    expect(expectedCritFactor(0.5, 0.5)).toBeCloseTo(1.5, 6);
    // 0.2 × (1.5 - 1) = 0.1 → 1.1
    expect(expectedCritFactor(0.2)).toBeCloseTo(1.1, 6);
  });

  it('暴击率被钳制到 [0,1]', () => {
    expect(expectedCritFactor(2, 0)).toBe(expectedCritFactor(1, 0));
    expect(expectedCritFactor(-1, 0)).toBe(1);
  });
});

describe('applyDamageReduction（受击减伤，封顶 60%）', () => {
  it('0 减伤原样返回', () => {
    expect(applyDamageReduction(100, 0)).toBe(100);
  });

  it('30% 减伤后向下取整', () => {
    expect(applyDamageReduction(100, 0.3)).toBe(70);
  });

  it('封顶 60%：超过封顶按 60% 结算', () => {
    expect(applyDamageReduction(100, 0.9)).toBe(40);
    expect(applyDamageReduction(100, 0.6)).toBe(40);
  });

  it('负减伤按 0 处理', () => {
    expect(applyDamageReduction(100, -0.5)).toBe(100);
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

  it('治疗强化 healBonus 放大回复：× (1 + healBonus)', () => {
    const k = COMBAT.rcvPerHeartOrb;
    // rcv 100 × k × 2 颗 × ×1.0 × (1 + 0.5)
    expect(calcHeal(100, 2, 1, 0.5)).toBe(Math.floor(100 * k * 2 * 1.0 * 1.5));
  });

  it('healBonus 缺省为 0，不影响现有调用', () => {
    expect(calcHeal(100, 2, 1, 0)).toBe(calcHeal(100, 2, 1));
  });

  it('负 healBonus 按 0 处理', () => {
    expect(calcHeal(100, 2, 1, -0.5)).toBe(calcHeal(100, 2, 1));
  });
});
