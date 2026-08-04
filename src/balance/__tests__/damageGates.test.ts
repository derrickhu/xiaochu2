import { describe, it, expect } from 'vitest';
import {
  applyDamageVoid,
  evaluateCompPenalty,
  evaluateTurnGates,
  GATE_FAIL_MULT,
  GATE_TUNING,
  NO_GATES,
  VOID_PIERCE_MATCH_COUNT,
  VOID_PIERCE_MULT,
} from '../damageGates';

describe('回合级闸门求值', () => {
  it('无闸门时恒定放行，不产生未满足项', () => {
    const v = evaluateTurnGates(NO_GATES, { elements: 1, combo: 1 });
    expect(v.turnMult).toBe(1);
    expect(v.unmet).toEqual([]);
  });

  it('五行阵盾：属性数达标放行，差一种即整回合归零', () => {
    const gates = { ...NO_GATES, elementNeed: 3 };
    expect(evaluateTurnGates(gates, { elements: 3, combo: 1 }).turnMult).toBe(1);
    expect(evaluateTurnGates(gates, { elements: 4, combo: 1 }).turnMult).toBe(1);

    const failed = evaluateTurnGates(gates, { elements: 2, combo: 1 });
    expect(failed.turnMult).toBe(GATE_FAIL_MULT);
    expect(failed.unmet).toEqual([{ kind: 'elementGate', need: 3, actual: 2 }]);
  });

  it('连锁盾：combo 是下限判定，超出不受罚', () => {
    const gates = { ...NO_GATES, comboNeed: 5 };
    expect(evaluateTurnGates(gates, { elements: 5, combo: 5 }).turnMult).toBe(1);
    expect(evaluateTurnGates(gates, { elements: 5, combo: 9 }).turnMult).toBe(1);
    expect(evaluateTurnGates(gates, { elements: 5, combo: 4 }).turnMult).toBe(GATE_FAIL_MULT);
  });

  it('双闸门同场：两条都未满足时一并报出，供 UI 说清差多少', () => {
    const gates = { ...NO_GATES, elementNeed: 4, comboNeed: 6 };
    const v = evaluateTurnGates(gates, { elements: 2, combo: 3 });
    expect(v.turnMult).toBe(GATE_FAIL_MULT);
    expect(v.unmet.map((u) => u.kind)).toEqual(['elementGate', 'comboGate']);
    expect(v.unmet[0]).toMatchObject({ need: 4, actual: 2 });
    expect(v.unmet[1]).toMatchObject({ need: 6, actual: 3 });
  });

  it('闸门未满足的伤害乘区为 0，配合结算处 Math.max(1) 即「降为 1」', () => {
    const gates = { ...NO_GATES, elementNeed: 3 };
    const mult = evaluateTurnGates(gates, { elements: 1, combo: 1 }).turnMult;
    expect(Math.max(1, Math.floor(999999 * mult))).toBe(1);
  });
});

describe('锋锐无效（单次伤害上限）', () => {
  const THRESHOLD = 1000;

  it('阈值为 0 视为未生效，原样放行', () => {
    expect(applyDamageVoid(999999, 3, 0)).toEqual({ damage: 999999, voided: false, pierced: false });
  });

  it('阈值内的伤害不受影响', () => {
    expect(applyDamageVoid(800, 3, THRESHOLD).damage).toBe(800);
  });

  it('超过阈值即归零 —— 这条让「堆攻」在此处变成负收益', () => {
    const out = applyDamageVoid(1500, 3, THRESHOLD);
    expect(out.voided).toBe(true);
    expect(out.damage).toBe(0);
  });

  it('达到 5 连即穿透并额外增伤，且不再判定阈值', () => {
    const out = applyDamageVoid(1500, VOID_PIERCE_MATCH_COUNT, THRESHOLD);
    expect(out.pierced).toBe(true);
    expect(out.voided).toBe(false);
    expect(out.damage).toBe(Math.floor(1500 * VOID_PIERCE_MULT));
  });

  it('差一颗珠就穿不过去（下限判定，不是约等于）', () => {
    expect(applyDamageVoid(1500, VOID_PIERCE_MATCH_COUNT - 1, THRESHOLD).voided).toBe(true);
  });
});

describe('同源相斥（反构筑）', () => {
  const t = GATE_TUNING.compPenalty;

  it('属性铺太宽：敌人攻击提升，直接打破「五色齐 + 总攻最高」的恒定最优解', () => {
    expect(evaluateCompPenalty(5)).toEqual({ enemyAtkMult: t.wideAtkMult, enemyReduction: 0 });
    expect(evaluateCompPenalty(t.wideCount).enemyAtkMult).toBe(t.wideAtkMult);
  });

  it('属性收太窄：敌人减伤', () => {
    expect(evaluateCompPenalty(1)).toEqual({ enemyAtkMult: 1, enemyReduction: t.narrowReduction });
    expect(evaluateCompPenalty(t.narrowCount).enemyReduction).toBe(t.narrowReduction);
  });

  it('中间存在甜点区：既不加攻也不减伤', () => {
    expect(evaluateCompPenalty(3)).toEqual({ enemyAtkMult: 1, enemyReduction: 0 });
  });
});
