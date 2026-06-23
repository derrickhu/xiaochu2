import { describe, it, expect } from 'vitest';
import { BattleStatusStore } from '../BattleStatus';

describe('BattleStatusStore 通用计时状态管线', () => {
  it('dot：tickTurnEnd 每回合产出伤害并按 turns 衰减过期', () => {
    const store = new BattleStatusStore();
    store.add({
      id: 'enemy_dot', kind: 'dot', owner: 'enemy',
      value: 120, turnsLeft: 2, sourceSkillId: 's', stack: 'replace',
    });

    const t1 = store.tickTurnEnd();
    expect(t1).toEqual([{ owner: 'enemy', amount: 120 }]);
    expect(store.get('enemy', 'dot')).not.toBeNull();

    const t2 = store.tickTurnEnd();
    expect(t2).toEqual([{ owner: 'enemy', amount: 120 }]);
    // 第二回合后过期
    expect(store.get('enemy', 'dot')).toBeNull();

    expect(store.tickTurnEnd()).toEqual([]);
  });

  it('stun：isStunned 在持续期内为真，到期清除', () => {
    const store = new BattleStatusStore();
    store.add({
      id: 'enemy_stun', kind: 'stun', owner: 'enemy',
      value: 1, turnsLeft: 1, sourceSkillId: 's', stack: 'replace',
    });
    expect(store.isStunned('enemy')).toBe(true);
    store.tickTurnEnd();
    expect(store.isStunned('enemy')).toBe(false);
  });

  it('defenseBreak：defenseBreakPct 返回比例，max 叠加取较大值', () => {
    const store = new BattleStatusStore();
    store.add({
      id: 'enemy_def_break', kind: 'enemyDefenseBreak', owner: 'enemy',
      value: 0.3, turnsLeft: 2, sourceSkillId: 's', stack: 'max',
    });
    expect(store.defenseBreakPct('enemy')).toBeCloseTo(0.3, 6);
    store.add({
      id: 'enemy_def_break', kind: 'enemyDefenseBreak', owner: 'enemy',
      value: 0.5, turnsLeft: 2, sourceSkillId: 's', stack: 'max',
    });
    expect(store.defenseBreakPct('enemy')).toBeCloseTo(0.5, 6);
    expect(store.defenseBreakPct('team')).toBe(0);
  });
});
