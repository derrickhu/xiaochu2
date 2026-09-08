import { describe, expect, it } from 'vitest';

import { COMBAT, counterElementOf } from '@/balance/combat';
import { ELEMENT_NAME } from '@/balance/ui';
import { COACH_FAIL_THRESHOLD, defeatCoaching } from '@/scenes/battle/defeatCoaching';

describe('卡关指路', () => {
  it('第 1 次失败只给通用提示：可能只是手生，立刻教换队显得聒噪', () => {
    const c = defeatCoaching({ element: 'fire', fails: 1, isMainline: true });
    expect(c.tip).toBe('提示：消除克制属性珠子伤害更高');
    expect(c.offerTeam).toBe(false);
  });

  it('连败第 2 次起指名克制属性，并把编队摆进入口', () => {
    const c = defeatCoaching({ element: 'fire', fails: COACH_FAIL_THRESHOLD, isMainline: true });
    // 火属性关 → 水克火
    expect(counterElementOf('fire')).toBe('water');
    expect(c.tip).toContain('火属性');
    expect(c.tip).toContain('水系');
    expect(c.offerTeam).toBe(true);
    expect(c.guideHead).toContain('水系');
  });

  it('五行每一关都算得出克制属性，文案不会出现 undefined', () => {
    for (const el of ['metal', 'wood', 'water', 'fire', 'earth'] as const) {
      const c = defeatCoaching({ element: el, fails: 3, isMainline: true });
      expect(c.tip).toContain(ELEMENT_NAME[el]);
      expect(c.tip).toContain(ELEMENT_NAME[counterElementOf(el)]);
      expect(c.tip).not.toContain('undefined');
    }
  });

  it('倍率跟随数值表，不写死 1.6（现值已是 1.75）', () => {
    const c = defeatCoaching({ element: 'water', fails: 2, isMainline: true });
    expect(c.tip).toContain(`×${COMBAT.counterMultiplier}`);
  });

  it('塔 / 秘境不走指路：它们有自己的收场文案', () => {
    const c = defeatCoaching({ element: 'fire', fails: 5, isMainline: false });
    expect(c.offerTeam).toBe(false);
    expect(c.tip).toBe('提示：消除克制属性珠子伤害更高');
  });
});
