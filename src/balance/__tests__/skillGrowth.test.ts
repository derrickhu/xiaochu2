/**
 * 技能成长框架测试：解锁条件判定 + 技能等级派生
 */
import { describe, it, expect } from 'vitest';
import {
  isRequirementMet, requirementHint, nearestPendingRequirement, maxedPetProgress,
} from '@/balance/progression/requirements';
import {
  SKILL_MASTERY_MILESTONES, MAX_SKILL_MASTERY_RANK,
  skillMasteryRank, masteryEffectMult, nextMasteryMilestone,
  PASSIVE_L0_UNLOCK, PASSIVE_LADDER_UNLOCKS, passiveLadderRequirement,
} from '@/balance/skillGrowth';

describe('progression/requirements', () => {
  it('level/star 条件判定', () => {
    expect(isRequirementMet({ kind: 'level', level: 10 }, { level: 10, star: 1 })).toBe(true);
    expect(isRequirementMet({ kind: 'level', level: 10 }, { level: 9, star: 5 })).toBe(false);
    expect(isRequirementMet({ kind: 'star', star: 3 }, { level: 1, star: 3 })).toBe(true);
    expect(isRequirementMet({ kind: 'star', star: 3 }, { level: 99, star: 2 })).toBe(false);
  });

  it('提示文案', () => {
    expect(requirementHint({ kind: 'level', level: 25 })).toBe('Lv.25解锁');
    expect(requirementHint({ kind: 'star', star: 3 })).toBe('★3解锁');
  });

  it('maxedPetProgress 满足一切条件', () => {
    const p = maxedPetProgress();
    expect(isRequirementMet({ kind: 'level', level: 999 }, p)).toBe(true);
    expect(isRequirementMet({ kind: 'star', star: 99 }, p)).toBe(true);
  });

  it('nearestPendingRequirement 返回最近未达成', () => {
    const reqs = [
      { kind: 'level', level: 25 } as const,
      { kind: 'level', level: 45 } as const,
    ];
    expect(nearestPendingRequirement(reqs, { level: 30, star: 1 }))
      .toEqual({ kind: 'level', level: 45 });
    expect(nearestPendingRequirement(reqs, { level: 99, star: 1 })).toBeNull();
  });
});

describe('skillGrowth：技能等级', () => {
  it('里程碑单调且 rank 连续', () => {
    let lastLevel = 0;
    SKILL_MASTERY_MILESTONES.forEach((m, i) => {
      expect(m.rank).toBe(i + 1);
      expect(m.requirement.kind).toBe('level');
      if (m.requirement.kind === 'level') {
        expect(m.requirement.level).toBeGreaterThan(lastLevel - 1);
        lastLevel = m.requirement.level;
      }
    });
  });

  it('skillMasteryRank 按等级派生', () => {
    expect(skillMasteryRank(1)).toBe(1);
    expect(skillMasteryRank(19)).toBe(1);
    expect(skillMasteryRank(20)).toBe(2);
    expect(skillMasteryRank(40)).toBe(3);
    expect(skillMasteryRank(65)).toBe(4);
    expect(skillMasteryRank(90)).toBe(MAX_SKILL_MASTERY_RANK);
    expect(skillMasteryRank(99)).toBe(MAX_SKILL_MASTERY_RANK);
  });

  it('masteryEffectMult 单调不减且满配 ×1.25', () => {
    let last = 0;
    for (let r = 1; r <= MAX_SKILL_MASTERY_RANK; r++) {
      const mult = masteryEffectMult(r);
      expect(mult).toBeGreaterThanOrEqual(last);
      last = mult;
    }
    expect(masteryEffectMult(1)).toBe(1);
    expect(masteryEffectMult(MAX_SKILL_MASTERY_RANK)).toBeCloseTo(1.25, 6);
  });

  it('nextMasteryMilestone', () => {
    expect(nextMasteryMilestone(1)?.rank).toBe(2);
    expect(nextMasteryMilestone(64)?.rank).toBe(4);
    expect(nextMasteryMilestone(90)).toBeNull();
  });
});

describe('skillGrowth：被动解锁门槛', () => {
  it('L0 与 Ladder 门槛严格递增', () => {
    expect(PASSIVE_L0_UNLOCK.kind).toBe('level');
    const l0 = PASSIVE_L0_UNLOCK.kind === 'level' ? PASSIVE_L0_UNLOCK.level : 0;
    expect(l0).toBeGreaterThan(1);
    let prev = l0;
    for (const r of PASSIVE_LADDER_UNLOCKS) {
      expect(r.kind).toBe('level');
      const lv = r.kind === 'level' ? r.level : 0;
      expect(lv).toBeGreaterThan(prev);
      prev = lv;
    }
  });

  it('passiveLadderRequirement 槽位映射且越界取最后一档', () => {
    expect(passiveLadderRequirement(0)).toEqual(PASSIVE_LADDER_UNLOCKS[0]);
    expect(passiveLadderRequirement(2)).toEqual(PASSIVE_LADDER_UNLOCKS[2]);
    expect(passiveLadderRequirement(9)).toEqual(PASSIVE_LADDER_UNLOCKS[2]);
  });
});
