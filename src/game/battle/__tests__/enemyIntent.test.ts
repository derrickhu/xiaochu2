/**
 * 出招预告的可信度回归
 *
 * 预告是 v0.7 补上的「可读性」缺口——对照项目 xiao_chu 一直有 Boss 固定循环 + 下一招
 * 常驻预告，我们没有，玩家因此把「被封珠 / 被禁疗」体验成随机针对而不是可应对的机制。
 *
 * 但一个会说谎的预告比没有预告更糟：玩家按预告留了护盾，结果挨的是另一招，
 * 就会彻底不再看它。所以这里对全部 16 章 Boss 逐回合验证两件事：
 *   1. 预告的那一招 == 真正打出来的那一招；
 *   2. 轮转指针确实让整套技能都排得上，而不是短 CD 的招反复霸占行动。
 */
import { describe, expect, it } from 'vitest';
import { STAGES } from '@/balance/stages';
import { resolveEncounter } from '@/balance/enemies';
import { enemyStats } from '@/formulas/growth';
import { GROWTH } from '@/balance/growth';
import { skillForEnemy, type SkillRuntimeContext } from '../SkillEngine';
import { initialPhaseState } from '../bossPhase';
import { nextEnemySkillCountdown, predictEnemyIntent } from '../battleEnemyIntent';
import { ENEMY_SKILL_IDS } from '@/balance/skills/ids';
import { runEnemyTurnAction, type EnemyTurnContext } from '../battleEnemyTurn';
import type { EnemyUnit } from '../battleTypes';

const TURNS = 30;

/** Boss 关最后一波 = 章 Boss 的收录形态 */
function bossEnemies(): { stageId: string; enemy: () => EnemyUnit }[] {
  return STAGES
    .filter((s) => s.isBoss || s.type === 'boss')
    .map((s) => {
      const ref = s.encounters[s.encounters.length - 1];
      const def = resolveEncounter(ref).def;
      const stats = enemyStats(def, s.chapter, s.difficulty);
      return {
        stageId: s.id,
        enemy: (): EnemyUnit => ({
          def,
          maxHp: stats.hp,
          hp: stats.hp,
          atk: stats.atk,
          def_: stats.def,
          attackCountdown: GROWTH.enemy.initialAttackCountdown,
          skillCds: (def.skillIds ?? []).map((id) => skillForEnemy(id).cd),
          skillRotation: 0,
          charging: null,
          dmgReduction: null,
          ...initialPhaseState(def, stats.atk),
        }) as EnemyUnit,
      };
    });
}

/**
 * 最小战斗上下文：英雄血量拉满且不真的扣血，好让循环跑满 TURNS 回合，
 * 把 Boss 整套技能表都过一遍，而不是打两下就结束。
 */
function makeCtx(enemy: EnemyUnit): EnemyTurnContext & { tickStatuses: () => void } {
  const state = { enraged: false, resolute: false, undying: false, reduction: 0, resoluteTurns: 0 };
  // 实机由 BattleController 每回合末递减状态；这里补上，否则减伤 / 凝意会永久挂着，
  // 让 Boss 看起来比实际更沉默
  const tickStatuses = () => {
    if (enemy.dmgReduction) {
      enemy.dmgReduction.turnsLeft--;
      if (enemy.dmgReduction.turnsLeft <= 0) {
        enemy.dmgReduction = null;
        state.reduction = 0;
      }
    }
    if (state.resoluteTurns > 0 && --state.resoluteTurns <= 0) state.resolute = false;
  };
  const runtime = (): SkillRuntimeContext => ({
    enemy: {
      hp: enemy.hp, maxHp: enemy.maxHp, atk: enemy.atk, def_: enemy.def_,
      element: enemy.def.element,
    },
    heroHp: 1_000_000,
    heroMaxHp: 1_000_000,
    teamRcvTotal: 0,
    teamAtkTotal: 1000,
    teamDamageBuffMult: 1,
    enemyDamageReduction: state.reduction,
    teamHealBonus: 0,
    enemyEnraged: state.enraged,
    enemyResolute: state.resolute,
    enemyUndying: state.undying,
    teamSize: 5,
    rng: () => 0.5,
  });
  return {
    tickStatuses,
    enemy,
    isStunned: () => false,
    enemyCaster: () => ({ kind: 'enemy', atk: enemy.atk, element: enemy.def.element }),
    runtimeContext: runtime,
    applyEnemyDamage: () => ({ damage: 0, absorbed: 0, heroDead: false }),
    applySkillResult: (result) => {
      // 只镜像会改变「下一招能不能放」的那几个开关，其余状态与预告无关
      for (const e of result.statusEvents) {
        if (e.status === 'enrage') state.enraged = true;
        if (e.status === 'resolve') {
          state.resolute = true;
          state.resoluteTurns = e.turns ?? 3;
        }
        if (e.status === 'undying') state.undying = true;
        if (e.status === 'enemyDamageReduction') {
          state.reduction = e.value;
          enemy.dmgReduction = { reduction: e.value, turnsLeft: e.turns ?? 1 };
        }
      }
    },
  };
}

describe('Boss 出招预告', () => {
  it('预告的那一招就是真正打出来的那一招', () => {
    const mismatches: string[] = [];

    for (const { stageId, enemy: spawn } of bossEnemies()) {
      const enemy = spawn();
      if (enemy.skillIds.length === 0) continue;
      const ctx = makeCtx(enemy);

      for (let turn = 1; turn <= TURNS; turn++) {
        const intent = predictEnemyIntent(ctx);
        const actual = runEnemyTurnAction(ctx);
        ctx.tickStatuses();

        const predictedSkill = intent?.kind === 'skill' ? intent.label : null;
        const actualSkill = actual.skillName ?? null;
        // 直伤技能走 action:'attack' 分支不带 skillName，普攻同样如此，两者无从区分，
        // 只在双方都点名了技能时比对——这已覆盖全部骚扰 / 架势 / 闸门招式。
        if (predictedSkill && actualSkill && predictedSkill !== actualSkill) {
          mismatches.push(`${stageId} 第 ${turn} 回合：预告「${predictedSkill}」实际「${actualSkill}」`);
        }
        if (!predictedSkill && actualSkill) {
          mismatches.push(`${stageId} 第 ${turn} 回合：没有预告，却放了「${actualSkill}」`);
        }
        if (predictedSkill && !actualSkill && actual.action === 'idle') {
          mismatches.push(`${stageId} 第 ${turn} 回合：预告「${predictedSkill}」实际什么也没做`);
        }
      }
    }

    expect(mismatches, `预告与实际出招不符：\n  ${mismatches.join('\n  ')}`).toEqual([]);
  });

  it('轮转让 Boss 整套技能都排得上，没有招被短 CD 挤掉', () => {
    const starved: string[] = [];

    for (const { stageId, enemy: spawn } of bossEnemies()) {
      const skillIds = spawn().skillIds;
      if (skillIds.length < 2) continue;

      /*
       * 狂暴要残血、不灭要还有血、自愈要已受伤——同一个血量不可能让它们都有机会，
       * 所以分档开局各跑一遍再取并集。否则测出来的「没打开」只是场景没给条件，
       * 而不是轮转真的把招挤掉了。
       */
      const seen = new Set<string>();
      for (const hpPct of [1, 0.5, 0.25]) {
        const enemy = spawn();
        enemy.hp = Math.max(1, Math.floor(enemy.maxHp * hpPct));
        const ctx = makeCtx(enemy);
        for (let turn = 1; turn <= TURNS; turn++) {
          const res = runEnemyTurnAction(ctx);
          ctx.tickStatuses();
          // 蓄力起手那一回合就带 skillName，重击释放回合不必再记一次
          if (res.skillName) seen.add(res.skillName);
        }
      }

      const missing = skillIds.map((id) => skillForEnemy(id).name).filter((n) => !seen.has(n));
      if (missing.length > 0) {
        starved.push(`${stageId}：${missing.join('、')} 在 ${TURNS} 回合内一次都没轮到`);
      }
    }

    expect(starved, `以下 Boss 的技能表没打开：\n  ${starved.join('\n  ')}`).toEqual([]);
  });
});

/**
 * Boss 出手密度
 *
 * 「技能不够丰富」在数据上有两种长相：招数太少，以及招数够但大部分回合什么也不做。
 * 后者更隐蔽——技能表看着有三招，实机打起来 Boss 一半回合在发呆，玩家自然觉得
 * 这只怪没有性格。对照 xiao_chu 的 Boss 是固定循环连轴放技能的，我们必须钉住下限。
 */
describe('Boss 出手密度', () => {
  const MIN_SKILLS = 2;
  const MAX_IDLE_SHARE = 0.35;

  it('每章 Boss 至少两招，且空转回合不超过三分之一', () => {
    const thin: string[] = [];

    for (const { stageId, enemy: spawn } of bossEnemies()) {
      const probe = spawn();
      if (probe.skillIds.length < MIN_SKILLS) {
        thin.push(`${stageId}：只有 ${probe.skillIds.length} 招`);
        continue;
      }

      // 半血开局：自愈这类「已受伤才生效」的招才有机会进入循环
      const enemy = spawn();
      enemy.hp = Math.floor(enemy.maxHp * 0.5);
      const ctx = makeCtx(enemy);
      let idle = 0;
      for (let turn = 1; turn <= TURNS; turn++) {
        const res = runEnemyTurnAction(ctx);
        ctx.tickStatuses();
        if (res.action === 'idle') idle++;
      }
      const share = idle / TURNS;
      if (share > MAX_IDLE_SHARE) {
        thin.push(`${stageId}：${Math.round(share * 100)}% 的回合什么也没做`);
      }
    }

    expect(thin, `以下 Boss 打起来是木桩：\n  ${thin.join('\n  ')}`).toEqual([]);
  });
});

describe('条件技不进预告', () => {
  it('血怒满血不报即将放技能，残血才报', () => {
    const stage = STAGES.find((s) => s.id === 'stage_1_3');
    expect(stage, '1-3 焰蝠洞口应存在').toBeTruthy();
    const ref = stage!.encounters[0];
    const def = resolveEncounter(ref).def;
    expect(def.skillIds).toContain(ENEMY_SKILL_IDS.enrage);

    const stats = enemyStats(def, stage!.chapter, stage!.difficulty);
    const spawn = (hpPct: number): EnemyUnit => ({
      def,
      maxHp: stats.hp,
      hp: Math.max(1, Math.floor(stats.hp * hpPct)),
      atk: stats.atk,
      def_: stats.def,
      attackCountdown: GROWTH.enemy.initialAttackCountdown,
      skillCds: (def.skillIds ?? []).map(() => 0),
      skillRotation: 0,
      charging: null,
      dmgReduction: null,
      ...initialPhaseState(def, stats.atk),
    }) as EnemyUnit;

    const full = spawn(0.95);
    const fullCtx = makeCtx(full);
    expect(nextEnemySkillCountdown(full, fullCtx.enemyCaster(), fullCtx.runtimeContext())).toBeNull();

    const low = spawn(0.30);
    const lowCtx = makeCtx(low);
    const intent = nextEnemySkillCountdown(low, lowCtx.enemyCaster(), lowCtx.runtimeContext());
    expect(intent).toEqual(expect.objectContaining({ name: '血怒', turns: 0 }));
  });
});
