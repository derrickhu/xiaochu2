import { describe, expect, it } from 'vitest';
import {
  BLESS_RATE,
  COMBO_MASTER_THRESHOLD,
  HUNTER_HP_PCT,
  aggregateBlessModifiers,
  getBless,
} from '@/balance/towerBless';

describe('通天塔机缘幅度', () => {
  it('专精输出线压在约 3.3 倍，不再乘出 7 倍', () => {
    const mod = aggregateBlessModifiers({
      bless_atk: 3,
      bless_element_fire: 3,
      bless_combo_master: 2,
      bless_hunter: 2,
    });
    const focused = mod.atkMult
      * (mod.elementMult.fire ?? 1)
      * mod.comboMasterMult
      * mod.hunterMult;
    expect(focused).toBeCloseTo(1.24 * 1.45 * 1.4 * 1.3, 5);
    expect(focused).toBeGreaterThan(3.0);
    expect(focused).toBeLessThan(3.5);
  });

  it('连锁门槛与猎手血线按条件技收紧', () => {
    expect(COMBO_MASTER_THRESHOLD).toBe(10);
    expect(HUNTER_HP_PCT).toBe(0.7);
  });

  it('文案和结算读同一份幅度', () => {
    expect(getBless('bless_atk')?.desc(3)).toBe('全队攻击 +24%');
    expect(getBless('bless_element_fire')?.desc(3)).toContain('45%');
    const ember = getBless('bless_ember')?.desc(3) ?? '';
    expect(ember).toContain(`${Math.round(BLESS_RATE.ember * 3 * 100)}%`);
  });
});
