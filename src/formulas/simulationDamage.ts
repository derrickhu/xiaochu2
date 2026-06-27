import type { Element } from '@/balance/combat';
import { calcDamage, expectedCritFactor } from './damage';
import type { SimEnemy } from './simulationEnemy';
import type { ComboModel } from './simulationReport';

/** 队伍暴击属性（模拟器按期望值放大，与 BattleController 掷骰镜像） */
export interface SimCritProfile {
  critRate: number;
  critDamage: number;
}

/** 单组属性珠期望伤害（含克制/防御/增伤/敌减伤/期望暴击） */
export function orbGroupDamage(
  atk: number,
  el: Element,
  enemy: SimEnemy,
  defenderDef: number,
  model: ComboModel,
  buffMult: number,
  enemyReduction: number,
  crit: SimCritProfile = { critRate: 0, critDamage: 0 },
): number {
  const raw = calcDamage({
    atk,
    matchCount: model.matchCount,
    combo: model.combo,
    attackerElement: el,
    defenderElement: enemy.def.element,
    defenderDef,
    buffMult,
  });
  return raw * expectedCritFactor(crit.critRate, crit.critDamage) * (1 - enemyReduction);
}
