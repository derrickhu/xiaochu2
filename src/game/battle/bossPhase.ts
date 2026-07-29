/**
 * Boss 阶段状态机（纯函数，无 Pixi / 无副作用外泄）
 *
 * 为什么单独成模块：真实战斗（battleEnemyTurn.ts）与模拟器（formulas/simulation.ts）
 * 各有一套敌人回合编排。阶段切换若只写在战斗侧，模拟器就测不到，而 powerBudget 的
 * TTK 契约全建立在模拟器上——Boss 转阶段后的攻击与技能变化不进模拟，配平就是盲的。
 * 故这里只操作「两侧结构上都有」的字段，由两侧在各自回合开头调用同一对函数。
 */
import type { EnemyDef, EnemyPhaseDef } from '@/balance/enemies';
import { skillForEnemy } from './SkillEngine';

/** EnemyUnit（战斗）与 SimEnemy（模拟器）共同满足的最小结构 */
export interface PhaseCapableEnemy {
  def: EnemyDef;
  hp: number;
  maxHp: number;
  atk: number;
  /** 出场攻击，阶段 atkMult 的基准（避免多段叠乘） */
  baseAtk: number;
  /** 当前攻击间隔（阶段可覆写，故不能直接读 def） */
  attackInterval: number;
  /** 当前技能表（阶段可追加，故不能直接读 def） */
  skillIds: string[];
  skillCds: number[];
  /** 已进入的阶段数：0 = 原始形态，1 = 已切到 phases[0] */
  phaseIndex: number;
}

/** 出场时的阶段相关字段（两侧 spawn 共用，保证初值一致） */
export function initialPhaseState(def: EnemyDef, atk: number): {
  baseAtk: number;
  attackInterval: number;
  skillIds: string[];
  phaseIndex: number;
} {
  return {
    baseAtk: atk,
    attackInterval: def.attackInterval,
    skillIds: [...(def.skillIds ?? [])],
    phaseIndex: 0,
  };
}

/** 当前血量是否已跨过下一阶段的血线；无阶段 / 已走完 / 未到线均返回 null */
export function pendingBossPhase(enemy: PhaseCapableEnemy): EnemyPhaseDef | null {
  const phases = enemy.def.phases;
  if (!phases || enemy.phaseIndex >= phases.length) return null;
  if (enemy.hp <= 0) return null;
  const next = phases[enemy.phaseIndex];
  return enemy.hp <= enemy.maxHp * next.hpThreshold ? next : null;
}

/**
 * 切入阶段：改攻击 / 攻击间隔 / 技能表。
 * 不在这里释放切入技——那需要各自引擎的 SkillEngine 上下文，由调用方处理。
 */
export function enterBossPhase(enemy: PhaseCapableEnemy, phase: EnemyPhaseDef): void {
  enemy.phaseIndex++;
  if (phase.atkMult !== undefined) enemy.atk = Math.floor(enemy.baseAtk * phase.atkMult);
  if (phase.attackInterval !== undefined) enemy.attackInterval = phase.attackInterval;
  for (const id of phase.addSkillIds ?? []) {
    if (enemy.skillIds.includes(id)) continue;
    enemy.skillIds.push(id);
    // CD 从 0 起算：新技能是这一阶段的「新威胁」，应当能立刻打出来
    enemy.skillCds.push(0);
  }
}

/**
 * 血条分段：返回各阶段占总血量的比例边界（降序，如 [0.7, 0.35]）。
 * 无阶段返回空数组，HUD 据此决定画不画分隔线。
 */
export function phaseHpMarkers(def: EnemyDef): readonly number[] {
  return (def.phases ?? []).map((p) => p.hpThreshold);
}

/** 当前阶段标签（原始形态无标签） */
export function currentPhaseLabel(enemy: PhaseCapableEnemy): string | null {
  const phases = enemy.def.phases;
  if (!phases || enemy.phaseIndex === 0) return null;
  return phases[enemy.phaseIndex - 1]?.label ?? null;
}

/** 校验阶段表：血线必须严格递减且落在 (0, 1)，技能 id 必须存在（数据契约用） */
export function validatePhases(def: EnemyDef): string[] {
  const errors: string[] = [];
  const phases = def.phases;
  if (!phases?.length) return errors;
  let prev = 1;
  for (const [i, p] of phases.entries()) {
    if (p.hpThreshold <= 0 || p.hpThreshold >= 1) {
      errors.push(`${def.id} phases[${i}] 血线 ${p.hpThreshold} 应在 (0,1) 开区间`);
    }
    if (p.hpThreshold >= prev) {
      errors.push(`${def.id} phases[${i}] 血线 ${p.hpThreshold} 未低于前一阶段 ${prev}`);
    }
    prev = p.hpThreshold;
    for (const id of [...(p.addSkillIds ?? []), ...(p.onEnterSkillId ? [p.onEnterSkillId] : [])]) {
      try {
        skillForEnemy(id);
      } catch {
        errors.push(`${def.id} phases[${i}] 引用了不存在的敌人技 ${id}`);
      }
    }
  }
  return errors;
}
