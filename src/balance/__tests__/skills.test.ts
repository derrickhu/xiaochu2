import { describe, it, expect } from 'vitest';
import {
  SKILLS, getSkill, resolveSkillVfx, PET_SKILL_IDS,
  CATEGORY_DEFAULT_VFX, type SkillEffectDef, type SkillDef,
} from '../skills';
import { formatBasePower, describeSkillBudget, describeSkillEffects } from '../skills/display';
import { PET_MAP } from '../pets';
import type { PetDef } from '../pets';
import { getRaritySkillPower } from '../rarity';
import {
  runSkill, skillForPet, applyPetSkillModifiers,
  type SkillCaster, type SkillRuntimeContext,
} from '@/game/battle/SkillEngine';

function damageMultiplier(effects: readonly SkillEffectDef[]): number {
  const dmg = effects.find((e) => e.kind === 'damage');
  if (!dmg || dmg.kind !== 'damage') throw new Error('无直伤效果');
  return dmg.multiplier;
}

const PET_CASTER: SkillCaster = { kind: 'pet', atk: 1000, element: 'fire' };
const CTX: SkillRuntimeContext = {
  enemy: { hp: 100000, maxHp: 100000, atk: 500, def_: 0, element: 'metal' },
  heroHp: 5000, heroMaxHp: 5000,
  teamRcvTotal: 800, teamAtkTotal: 3000,
  teamDamageBuffMult: 1, enemyDamageReduction: 0, teamHealBonus: 0,
};

function skillWith(effects: SkillEffectDef[]): SkillDef {
  return {
    id: 'test_skill', name: '测试技', category: 'nuke', cd: 5,
    owner: 'pet', trigger: 'manual', target: 'enemy', tags: [], desc: '', effects, basePower: 0,
  };
}

describe('技能蓝图与分类', () => {
  it('每个技能都有分类，且未显式指定 vfx 时按分类兜底', () => {
    for (const skill of SKILLS) {
      expect(skill.category).toBeTruthy();
      expect(resolveSkillVfx(skill)).toBe(skill.vfx ?? CATEGORY_DEFAULT_VFX[skill.category]);
    }
  });

  it('同类直伤共用蓝图：金/水突刺结构一致（仅文案/数值差异）', () => {
    const metal = getSkill(PET_SKILL_IDS.metalSlash);
    const water = getSkill(PET_SKILL_IDS.waterPierce);
    expect(metal.category).toBe('nuke');
    expect(water.category).toBe('nuke');
    expect(damageMultiplier(metal.effects)).toBe(damageMultiplier(water.effects));
    expect(metal.tags).toEqual(water.tags);
  });

  it('文案由参数生成，不与数值漂移（600% / 700%）', () => {
    expect(getSkill(PET_SKILL_IDS.metalSlash).desc).toContain('600%');
    expect(getSkill(PET_SKILL_IDS.fireBurst).desc).toContain('700%');
  });
});

describe('技能展示 display', () => {
  it('formatBasePower 消除浮点噪声', () => {
    expect(formatBasePower(6)).toBe('6');
    expect(formatBasePower(12.000000000000002)).toBe('12');
    expect(formatBasePower(1.4)).toBe('1.4');
  });

  it('describeSkillBudget 含预算与 UR 参考', () => {
    const s = getSkill(PET_SKILL_IDS.metalSlash);
    const text = describeSkillBudget(s);
    expect(text).toContain('预算指数 6');
    expect(text).toContain('UR≈');
    expect(text).toContain('不直接读 basePower');
  });

  it('describeSkillEffects 含倍率摘要', () => {
    const text = describeSkillEffects(getSkill(PET_SKILL_IDS.metalSlash));
    expect(text).toContain('600%');
    expect(text).toContain('casterAtk');
  });
});

describe('技能星级分档强化', () => {
  const pet = PET_MAP.get('pet_011')!; // 金羽仙鹤·金羽净世：直伤 450% + 驱散，CD 6，无 skillModifier
  // 阶段十：技能数值再叠乘「施法宠稀有度倍率」（金羽仙鹤为 SSR）
  const rp = getRaritySkillPower(pet.rarity);

  it('1★（tier1）= 基线（仅稀有度缩放，不含星级加成）', () => {
    const s = skillForPet(pet, 1);
    expect(damageMultiplier(s.effects)).toBeCloseTo(4.5 * rp, 6);
    expect(s.cd).toBe(6);
  });

  it('3★（tier2）效果 +10%', () => {
    const s = skillForPet(pet, 3);
    expect(damageMultiplier(s.effects)).toBeCloseTo(4.5 * 1.1 * rp, 6);
    expect(s.cd).toBe(6);
  });

  it('5★（tier3）效果 +20% 且 CD -1', () => {
    const s = skillForPet(pet, 5);
    expect(damageMultiplier(s.effects)).toBeCloseTo(4.5 * 1.2 * rp, 6);
    expect(s.cd).toBe(5);
  });
});

describe('星级质变覆写 SKILL_STAR_OVERRIDE', () => {
  // 用无 trait 的合成宠隔离覆写逻辑（避免具体宠 skillModifier 干扰）
  const cleanPet = { traits: [] } as unknown as PetDef;
  const fireBurst = getSkill(PET_SKILL_IDS.fireBurst); // 倍率 7，CD 5

  it('燎原爆 tier3 走质变覆写（倍率 1050%，CD 3，文案覆盖）', () => {
    const s = applyPetSkillModifiers(fireBurst, cleanPet, 3);
    expect(damageMultiplier(s.effects)).toBeCloseTo(7 * 1.5, 6);
    expect(s.cd).toBe(3); // 5 + tier(-1) + override(-1)
    expect(s.desc).toContain('1050%');
  });

  it('未配置覆写的 tier 仍走平 % 加成', () => {
    const s = applyPetSkillModifiers(fireBurst, cleanPet, 2);
    expect(damageMultiplier(s.effects)).toBeCloseTo(7 * 1.1, 6);
  });
});

describe('阶段八新增 effect kind（注册表解算）', () => {
  it('multiHit：产出 hits 段独立伤害事件', () => {
    const skill = skillWith([
      { kind: 'multiHit', source: 'casterAtk', multiplier: 2, hits: 3, element: 'fire', applyDefense: true },
    ]);
    const r = runSkill(skill, PET_CASTER, CTX)!;
    expect(r.action).toBe('multiHit');
    expect(r.damageEvents).toHaveLength(3);
    for (const e of r.damageEvents) {
      expect(e.target).toBe('enemy');
      expect(e.amount).toBe(2000); // atk1000 × 2，def0 不减
    }
  });

  it('dot：产出持续伤害状态（每回合伤害 + 回合数）', () => {
    const skill = skillWith([{ kind: 'dot', source: 'casterAtk', multiplier: 0.5, turns: 3, element: 'fire' }]);
    const r = runSkill(skill, PET_CASTER, CTX)!;
    expect(r.action).toBe('dot');
    const dot = r.statusEvents.find((e) => e.status === 'dot')!;
    expect(dot.target).toBe('enemy');
    expect(dot.value).toBe(500);
    expect(dot.turns).toBe(3);
  });

  it('stun：产出眩晕状态', () => {
    const skill = skillWith([{ kind: 'stun', turns: 2 }]);
    const r = runSkill(skill, PET_CASTER, CTX)!;
    expect(r.action).toBe('stun');
    expect(r.statusEvents.find((e) => e.status === 'stun')?.turns).toBe(2);
  });

  it('defenseBreak：产出破防状态', () => {
    const skill = skillWith([{ kind: 'defenseBreak', pct: 0.4, turns: 2 }]);
    const r = runSkill(skill, PET_CASTER, CTX)!;
    expect(r.action).toBe('defenseBreak');
    const db = r.statusEvents.find((e) => e.status === 'enemyDefenseBreak')!;
    expect(db.value).toBeCloseTo(0.4, 6);
    expect(db.turns).toBe(2);
  });

  it('convertOrbs：透传转珠形状（默认 random）与定向来源色', () => {
    const rowSkill = skillWith([{ kind: 'convertOrbs', to: 'fire', count: 0, shape: 'row' }]);
    expect(firstConvert(runSkill(rowSkill, PET_CASTER, CTX)!).shape).toBe('row');
    const defSkill = skillWith([{ kind: 'convertOrbs', to: 'fire', count: 6 }]);
    expect(firstConvert(runSkill(defSkill, PET_CASTER, CTX)!).shape).toBe('random');
    const fromSkill = skillWith([{ kind: 'convertOrbs', to: 'fire', count: 6, from: 'water' }]);
    expect(firstConvert(runSkill(fromSkill, PET_CASTER, CTX)!).from).toBe('water');
    const crossSkill = skillWith([{ kind: 'convertOrbs', to: 'fire', count: 0, shape: 'cross' }]);
    expect(firstConvert(runSkill(crossSkill, PET_CASTER, CTX)!).shape).toBe('cross');
  });
});

function firstConvert(r: SkillRunResult) {
  const req = r.boardRequests.find((b) => b.type === 'convertOrbs');
  if (!req || req.type !== 'convertOrbs') throw new Error('无转珠请求');
  return req;
}

type SkillRunResult = NonNullable<ReturnType<typeof runSkill>>;

describe('目标十三新增 effect kind（注册表解算）', () => {
  it('gravity：按敌人当前 HP 百分比伤害（无视防御）', () => {
    const skill = skillWith([{ kind: 'gravity', pct: 0.3 }]);
    const ctx = { ...CTX, enemy: { ...CTX.enemy, hp: 50000, def_: 500 } };
    const r = runSkill(skill, PET_CASTER, ctx)!;
    expect(r.action).toBe('gravity');
    expect(r.damageEvents[0].amount).toBe(15000); // 50000 × 0.3，def 不参与
  });

  it('haste：产出 teamCdDelta', () => {
    const skill = skillWith([{ kind: 'haste', amount: 2 }]);
    const r = runSkill(skill, PET_CASTER, CTX)!;
    expect(r.action).toBe('haste');
    expect(r.teamCdDelta).toBe(2);
  });

  it('purify：产出解封请求 + 驱散标记', () => {
    const skill = skillWith([{ kind: 'purify', unsealBoard: true, cleanseTeam: true }]);
    const r = runSkill(skill, PET_CASTER, CTX)!;
    expect(r.boardRequests.some((b) => b.type === 'unsealAll')).toBe(true);
    expect(r.cleanseTeam).toBe(true);
  });

  it('delayEnemyAttack：产出敌人普攻延迟', () => {
    const skill = skillWith([{ kind: 'delayEnemyAttack', turns: 2 }]);
    expect(runSkill(skill, PET_CASTER, CTX)!.enemyAttackDelay).toBe(2);
  });

  it('extraDragTime / guaranteedCrit / elementDamageBuff：产出对应 team 状态', () => {
    const skill = skillWith([
      { kind: 'extraDragTime', seconds: 4, turns: 3 },
      { kind: 'guaranteedCrit', turns: 2 },
      { kind: 'elementDamageBuff', element: 'fire', mult: 1.5, turns: 2 },
    ]);
    const r = runSkill(skill, PET_CASTER, CTX)!;
    const extra = r.statusEvents.find((e) => e.status === 'extraDragTime')!;
    expect(extra.target).toBe('team');
    expect(extra.value).toBe(4);
    expect(r.statusEvents.find((e) => e.status === 'guaranteedCrit')?.turns).toBe(2);
    const elBuff = r.statusEvents.find((e) => e.status === 'elementDamageBuff')!;
    expect(elBuff.element).toBe('fire');
    expect(elBuff.value).toBeCloseTo(1.5, 6);
  });

  const ENEMY_CASTER: SkillCaster = { kind: 'enemy', atk: 500, element: 'water' };

  it('sealOrbs：产出封珠请求', () => {
    const skill = skillWith([{ kind: 'sealOrbs', count: 5 }]);
    const r = runSkill(skill, ENEMY_CASTER, CTX)!;
    const req = r.boardRequests.find((b) => b.type === 'sealRandom');
    expect(req && req.type === 'sealRandom' ? req.count : 0).toBe(5);
  });

  it('敌方 dot（剧毒）落到 team', () => {
    const skill = skillWith([{ kind: 'dot', source: 'enemyAtk', multiplier: 0.4, turns: 3 }]);
    const r = runSkill(skill, ENEMY_CASTER, CTX)!;
    const dot = r.statusEvents.find((e) => e.status === 'dot')!;
    expect(dot.target).toBe('team');
    expect(dot.value).toBe(200); // enemyAtk 500 × 0.4
  });

  it('timeSqueeze / healBlock：产出 team debuff', () => {
    const skill = skillWith([
      { kind: 'timeSqueeze', seconds: 4, turns: 2 },
      { kind: 'healBlock', mult: 0.5, turns: 2 },
    ]);
    const r = runSkill(skill, ENEMY_CASTER, CTX)!;
    expect(r.statusEvents.find((e) => e.status === 'timeSqueeze')?.value).toBe(4);
    expect(r.statusEvents.find((e) => e.status === 'healBlock')?.value).toBeCloseTo(0.5, 6);
  });

  it('enrage：仅在低血且未狂暴时触发，值为攻击乘区', () => {
    const skill = skillWith([{ kind: 'enrage', atkMult: 1.5, threshold: 0.3 }]);
    // 满血不触发
    expect(runSkill(skill, ENEMY_CASTER, CTX)).toBeNull();
    // 低血触发
    const lowCtx = { ...CTX, enemy: { ...CTX.enemy, hp: 20000 } };
    const r = runSkill(skill, ENEMY_CASTER, lowCtx)!;
    expect(r.statusEvents.find((e) => e.status === 'enrage')?.value).toBeCloseTo(1.5, 6);
    // 已狂暴不再触发
    expect(runSkill(skill, ENEMY_CASTER, { ...lowCtx, enemyEnraged: true })).toBeNull();
  });

  it('skillSeal：按 rng 选中宠物 index', () => {
    const skill = skillWith([{ kind: 'skillSeal', turns: 2 }]);
    const ctx = { ...CTX, teamSize: 4, rng: () => 0.6 };
    const r = runSkill(skill, ENEMY_CASTER, ctx)!;
    const seal = r.statusEvents.find((e) => e.status === 'skillSeal')!;
    expect(seal.value).toBe(2); // floor(0.6 × 4)
    expect(seal.turns).toBe(2);
    // 无队伍信息时不触发
    expect(runSkill(skill, ENEMY_CASTER, CTX)).toBeNull();
  });
});
