import type { Element } from '@/balance/combat';
import { calcDamage } from './damage';
import type { SimEnemy } from './simulationEnemy';
import type { ComboModel } from './simulationReport';

/** 单组属性珠期望伤害（含克制/防御/增伤/敌减伤） */
export function orbGroupDamage(
  atk: number,
  el: Element,
  enemy: SimEnemy,
  defenderDef: number,
  model: ComboModel,
  buffMult: number,
  enemyReduction: number,
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
  return raw * (1 - enemyReduction);
}
