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

  it('dragTimeDelta：加时与时间压缩对冲', () => {
    const store = new BattleStatusStore();
    store.add({
      id: 'team_extraDragTime', kind: 'extraDragTime', owner: 'team',
      value: 4, turnsLeft: 2, sourceSkillId: 's', stack: 'max',
    });
    expect(store.dragTimeDelta()).toBe(4);
    store.add({
      id: 'team_timeSqueeze', kind: 'timeSqueeze', owner: 'team',
      value: 3, turnsLeft: 2, sourceSkillId: 'e', stack: 'max',
    });
    expect(store.dragTimeDelta()).toBe(1);
    store.tickTurnEnd();
    store.tickTurnEnd();
    expect(store.dragTimeDelta()).toBe(0);
  });

  it('guaranteedCrit / elementDamageBuff / healBlock / skillSeal / enrage 查询口径', () => {
    const store = new BattleStatusStore();
    expect(store.hasGuaranteedCrit()).toBe(false);
    expect(store.elementBuffMult('fire')).toBe(1);
    expect(store.heartHealMult()).toBe(1);
    expect(store.sealedPetIndex()).toBeNull();
    expect(store.enrageAtkMult()).toBe(1);

    store.add({
      id: 'team_guaranteedCrit', kind: 'guaranteedCrit', owner: 'team',
      value: 1, turnsLeft: 2, sourceSkillId: 's', stack: 'max',
    });
    store.add({
      id: 'team_elementDamageBuff', kind: 'elementDamageBuff', owner: 'team',
      value: 1.5, turnsLeft: 2, sourceSkillId: 's', stack: 'replace', element: 'fire',
    });
    store.add({
      id: 'team_healBlock', kind: 'healBlock', owner: 'team',
      value: 0.5, turnsLeft: 2, sourceSkillId: 'e', stack: 'replace',
    });
    store.add({
      id: 'team_skillSeal', kind: 'skillSeal', owner: 'team',
      value: 2, turnsLeft: 2, sourceSkillId: 'e', stack: 'replace',
    });
    store.add({
      id: 'enemy_enrage', kind: 'enrage', owner: 'enemy',
      value: 1.5, sourceSkillId: 'e', stack: 'ignoreIfPresent',
    });

    expect(store.hasGuaranteedCrit()).toBe(true);
    expect(store.elementBuffMult('fire')).toBeCloseTo(1.5, 6);
    expect(store.elementBuffMult('water')).toBe(1); // 非目标属性不受益
    expect(store.heartHealMult()).toBeCloseTo(0.5, 6);
    expect(store.sealedPetIndex()).toBe(2);
    expect(store.enrageAtkMult()).toBeCloseTo(1.5, 6);
    // enrage 无 turns：tick 不过期
    store.tickTurnEnd();
    store.tickTurnEnd();
    expect(store.enrageAtkMult()).toBeCloseTo(1.5, 6);
    expect(store.hasGuaranteedCrit()).toBe(false);
  });

  it('cleanseTeamDebuffs：只清我方 debuff，不动 buff 与敌方状态', () => {
    const store = new BattleStatusStore();
    store.add({
      id: 'team_dot', kind: 'dot', owner: 'team',
      value: 100, turnsLeft: 3, sourceSkillId: 'e', stack: 'replace',
    });
    store.add({
      id: 'team_healBlock', kind: 'healBlock', owner: 'team',
      value: 0.5, turnsLeft: 2, sourceSkillId: 'e', stack: 'replace',
    });
    store.add({
      id: 'team_teamDamageBuff', kind: 'teamDamageBuff', owner: 'team',
      value: 1.5, turnsLeft: 2, sourceSkillId: 's', stack: 'replace',
    });
    store.add({
      id: 'enemy_dot', kind: 'dot', owner: 'enemy',
      value: 200, turnsLeft: 3, sourceSkillId: 's', stack: 'replace',
    });

    const removed = store.cleanseTeamDebuffs();
    expect(removed.map((s) => s.kind).sort()).toEqual(['dot', 'healBlock']);
    expect(store.get('team', 'dot')).toBeNull();
    expect(store.get('team', 'healBlock')).toBeNull();
    expect(store.get('team', 'teamDamageBuff')).not.toBeNull();
    expect(store.get('enemy', 'dot')).not.toBeNull();
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
