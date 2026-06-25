import type { ResolvedEncounter } from '@/balance/enemies';
import type { StageDef } from '@/balance/stages';
import { stageDrops, stageCoinReward } from '@/formulas/economyOutput';
import { enemyStats } from '@/formulas/growth';
import { skillForEnemy } from './SkillEngine';
import type { BattleResult, EnemyUnit } from './battleTypes';

export function buildBattleResult(params: {
  win: boolean;
  stage: StageDef;
  turnsUsed: number;
  tookDamage: boolean;
  waves: readonly ResolvedEncounter[];
}): BattleResult {
  const { win, stage, turnsUsed, tookDamage, waves } = params;
  if (!win) {
    return {
      win, stars: 0, coins: 0, exp: 0, shards: [],
      turnsUsed, noDamage: !tookDamage, discoveredCreatures: [],
    };
  }
  let stars = 1;
  if (turnsUsed <= stage.starTurnLimit) stars++;
  if (!tookDamage) stars++;
  const coins = stageCoinReward(stage.chapter, stars, stage.isBoss);
  const drops = stageDrops(stage.dropTableId, stage.chapter, stars, stage.type);
  const discoveredCreatures = [
    ...new Set(waves.map((w) => w.captureCreatureId).filter((id): id is string => !!id)),
  ];
  return {
    win, stars, coins, exp: drops.exp, shards: drops.shards,
    turnsUsed, noDamage: !tookDamage, discoveredCreatures,
  };
}

export function spawnBattleEnemy(
  stage: StageDef,
  waves: readonly ResolvedEncounter[],
  waveIndex: number,
): EnemyUnit {
  const wave = waves[waveIndex];
  if (!wave) throw new Error(`未知波次: ${stage.id} #${waveIndex}`);
  const def = wave.def;
  const stats = enemyStats(def, stage.chapter, stage.difficulty);
  return {
    def,
    maxHp: stats.hp,
    hp: stats.hp,
    atk: stats.atk,
    def_: stats.def,
    attackCountdown: def.attackInterval,
    skillCds: (def.skillIds ?? []).map((id) => skillForEnemy(id).cd),
    charging: null,
    dmgReduction: null,
  };
}
