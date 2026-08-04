/**
 * 闸门在控制器层的落地契约：不灭的三条致死路径、同源相斥读队伍表、抗性配额分摊。
 *
 * 这几条都不是纯函数测试能覆盖的 —— 它们的价值全在「有没有真的收口到唯一入口」。
 * 以不灭为例：只要有一条致死路径绕过 damageEnemy，玩家就会发现「用技能补最后一下
 * 能白嫖过根性」，机制当场作废。
 */
import { describe, it, expect } from 'vitest';
import { BattleController } from '../BattleController';
import { STAGES } from '@/balance/stages';
import { DEFAULT_TEAM } from '@/balance/pets';
import { ENEMY_SKILL_IDS } from '@/balance/skills';
import { skillForEnemy, runSkill } from '../SkillEngine';
import { evaluateCompPenalty, GATE_TUNING } from '@/balance/damageGates';
import { applyResist, resolveResists, RESIST_PER_PET, type ResistKind } from '@/balance/petTags';

const STAGE_ID = STAGES[0].id;
const noCritRng = (): number => 0.99;

/** 让敌人立刻放出不灭，走的是和实战完全一致的技能路径 */
function ctrlWithUndying(): BattleController {
  const ctrl = new BattleController(STAGE_ID, DEFAULT_TEAM, noCritRng);
  ctrl.enemy.skillIds = [ENEMY_SKILL_IDS.undying];
  ctrl.enemy.skillCds = [0];
  expect(ctrl.enemyAct().action).toBe('undying');
  return ctrl;
}

describe('不灭：三条致死路径都要被拦住', () => {
  it('消珠致死：留 1 血并置位，供表现层播「不灭」', () => {
    const ctrl = ctrlWithUndying();
    const r = ctrl.applyPetAttack({
      petIndex: 0,
      element: 'fire',
      damage: ctrl.enemy.hp + 9999,
      isCrit: false,
      counter: 0,
    });
    expect(r.enemyDead).toBe(false);
    expect(ctrl.enemy.hp).toBe(1);
    expect(ctrl.undyingTriggered).toBe(true);
  });

  it('技能致死：走同一个 damageEnemy 入口，同样留 1 血', () => {
    const ctrl = ctrlWithUndying();
    expect(ctrl.damageEnemy(ctrl.enemy.hp + 9999)).toBe(false);
    expect(ctrl.enemy.hp).toBe(1);
  });

  it('DoT 致死：回合结束的跳伤也被挡下，毒不能白嫖过根性', () => {
    const ctrl = ctrlWithUndying();
    ctrl.enemy.hp = 1000;
    // 与 enemyAct 末尾的 DoT 结算同源：都收口在 damageEnemy
    expect(ctrl.damageEnemy(1000)).toBe(false);
    expect(ctrl.enemy.hp).toBe(1);
  });

  it('每场只挡一次：挡下后再来一击就真的死了', () => {
    const ctrl = ctrlWithUndying();
    ctrl.damageEnemy(ctrl.enemy.hp + 9999);
    expect(ctrl.damageEnemy(50)).toBe(true);
    expect(ctrl.enemy.hp).toBe(0);
  });

  it('非致死伤害不消耗不灭（否则撑不到该救命的那一刻）', () => {
    const ctrl = ctrlWithUndying();
    ctrl.damageEnemy(1);
    expect(ctrl.statuses.some((s) => s.kind === 'undying')).toBe(true);
  });

  it('挡下之后状态即移除，敌人不会赖在 1 血上反复不死', () => {
    const ctrl = ctrlWithUndying();
    ctrl.damageEnemy(ctrl.enemy.hp + 1);
    expect(ctrl.statuses.some((s) => s.kind === 'undying')).toBe(false);
  });
});

describe('同源相斥：读队伍构成而不是读数值', () => {
  const t = GATE_TUNING.compPenalty;

  it('五色齐反而挨打更重 —— 这正是要打破的那个恒定最优解', () => {
    expect(evaluateCompPenalty(5).enemyAtkMult).toBe(t.wideAtkMult);
    expect(evaluateCompPenalty(t.wideCount).enemyAtkMult).toBe(t.wideAtkMult);
  });

  it('收得太窄敌人减伤，两头都罚才逼得出甜点区', () => {
    expect(evaluateCompPenalty(t.narrowCount).enemyReduction).toBe(t.narrowReduction);
    expect(evaluateCompPenalty(1).enemyReduction).toBe(t.narrowReduction);
  });

  it('3 色是甜点区：既不加攻也不减伤', () => {
    expect(evaluateCompPenalty(3)).toEqual({ enemyAtkMult: 1, enemyReduction: 0 });
  });
});

describe('抗性配额：5 只凑满才免疫', () => {
  const quotaOf = (n: number) =>
    resolveResists(Array<ResistKind>(n).fill('healBlock'));

  it('每宠 20%，线性叠加到 100% 封顶', () => {
    expect(quotaOf(1).healBlock).toBeCloseTo(RESIST_PER_PET, 4);
    expect(quotaOf(4).healBlock).toBeCloseTo(RESIST_PER_PET * 4, 4);
    expect(quotaOf(5).healBlock).toBe(1);
    expect(quotaOf(6).healBlock).toBe(1);
  });

  it('不同词条各算各的配额，不能互相顶替', () => {
    const mixed = resolveResists(['healBlock', 'sealOrbs', 'sealOrbs']);
    expect(mixed.healBlock).toBeCloseTo(RESIST_PER_PET, 4);
    expect(mixed.sealOrbs).toBeCloseTo(RESIST_PER_PET * 2, 4);
    expect(mixed.timeSqueeze).toBe(0);
  });

  it('按比例砍时长而不是砍概率：收益能在编队页算清', () => {
    expect(applyResist(10, 0)).toBe(10);
    expect(applyResist(10, RESIST_PER_PET * 2)).toBe(6);
    // 向上取整并保底 1：短 debuff 不会被半吊子抗性直接抹平
    expect(applyResist(2, RESIST_PER_PET * 2)).toBe(2);
    expect(applyResist(10, 1)).toBe(0);
  });

  it('满配抗性让整招哑火，不足则照常落地', () => {
    const skill = skillForEnemy(ENEMY_SKILL_IDS.healBlock);
    const ctx = {
      enemy: { hp: 1000, maxHp: 1000, atk: 100, def_: 0, element: 'water' as const },
      heroHp: 1000,
      heroMaxHp: 1000,
      teamRcvTotal: 100,
      teamAtkTotal: 1000,
      teamDamageBuffMult: 1,
      enemyDamageReduction: 0,
      teamHealBonus: 0,
      teamSize: 5,
      rng: () => 0,
    };
    const caster = { kind: 'enemy' as const, atk: 100, element: 'water' as const };
    const turnsOf = (n: number): number | undefined =>
      runSkill(skill, caster, { ...ctx, teamResists: quotaOf(n) })
        ?.statusEvents.find((e) => e.status === 'healBlock')?.turns;

    expect(turnsOf(0)).toBeGreaterThan(0);
    // 4 只（80%）还不够 —— 分摊配额的取舍必须是真的
    expect(turnsOf(4)).toBeGreaterThan(0);
    expect(turnsOf(5)).toBeUndefined();
  });
});
