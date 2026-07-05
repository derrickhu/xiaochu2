import type { Element } from '@/balance/combat';
import type { EnemyDef } from '@/balance/enemies';
import { resolveEncounter } from '@/balance/enemies';
import type { SkillVfxId } from '@/balance/skills';
import type { StageDef } from '@/balance/stages';
import { skillForEnemy } from '@/game/battle/SkillEngine';
import { enemyStats } from './growth';
import { GROWTH } from '@/balance/growth';

export interface SimEnemy {
  def: EnemyDef;
  maxHp: number;
  hp: number;
  atk: number;
  def_: number;
  attackCountdown: number;
  skillCds: number[];
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
    charging: null,
    dmgReduction: null,
  };
}

export type SimElement = Element;
