import type { Element } from '@/balance/combat';
import type { EnemyDef } from '@/balance/enemies';
import { resolveEncounter } from '@/balance/enemies';
import type { SkillVfxId } from '@/balance/skills';
import type { StageDef } from '@/balance/stages';
import { skillForEnemy } from '@/game/battle/SkillEngine';
import { initialPhaseState } from '@/game/battle/bossPhase';
import { enemyStats } from './growth';
import { GROWTH } from '@/balance/growth';

export interface SimEnemy {
  def: EnemyDef;
  maxHp: number;
  hp: number;
  atk: number;
  def_: number;
  /** 出场攻击：Boss 阶段 atkMult 的基准（口径同 EnemyUnit） */
  baseAtk: number;
  attackCountdown: number;
  /** 当前攻击间隔（Boss 阶段可覆写） */
  attackInterval: number;
  /** 当前技能表（Boss 阶段可追加） */
  skillIds: string[];
  skillCds: number[];
  /** 出招轮转指针（口径同 EnemyUnit） */
  skillRotation: number;
  /** 已进入的 Boss 阶段数 */
  phaseIndex: number;
  charging: { mult: number; skillId: string; releaseVfx: SkillVfxId } | null;
  dmgReduction: { reduction: number; turnsLeft: number } | null;
}

export function spawnSimEnemy(stage: StageDef, waveIndex: number): SimEnemy {
  const ref = stage.encounters[waveIndex];
  if (!ref) throw new Error(`未知波次: ${stage.id} #${waveIndex}`);
  const def = resolveEncounter(ref).def;
  const stats = enemyStats(def, stage.chapter, stage.difficulty);
  return {
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
  };
}

export type SimElement = Element;
