import { COMBAT, type Element } from '@/balance/combat';
import { calcDamage, calcHeal, comboMultiplier } from '@/formulas/damage';
import type { MatchGroup } from '@/game/board/BoardModel';
import type { EnemyUnit, TeamPet, TurnResolution } from './battleTypes';

export interface ResolvePlayerTurnOptions {
  groups: MatchGroup[];
  team: readonly TeamPet[];
  enemy: EnemyUnit;
  bannedElements: ReadonlySet<Element>;
  enemyDefEffective: number;
  teamRcvTotal: number;
  noHeartHeal: boolean;
  passiveRegenPerTurn: number;
  teamDamageMult: number;
  rng: () => number;
  elementTraitDamageMult: (pet: TeamPet, defender: Element) => number;
  counterRelation: (attacker: Element, defender: Element) => 1 | 0 | -1;
}

export function resolvePlayerTurnDamage(opts: ResolvePlayerTurnOptions): TurnResolution {
  const combo = opts.groups.length;
  const comboMul = comboMultiplier(combo);
  const attacks: TurnResolution['attacks'] = [];
  let healOrbs = 0;

  for (const group of opts.groups) {
    if (group.orb === 'heart') {
      healOrbs += group.cells.length;
      continue;
    }
    const element = group.orb as Element;
    if (opts.bannedElements.has(element)) continue;
    const petIndex = opts.team.findIndex((p) => p.def.element === element);
    if (petIndex < 0) continue;
    const pet = opts.team[petIndex];
    const isCrit = opts.rng() < COMBAT.critChance;
    const raw = calcDamage({
      atk: pet.atk,
      matchCount: group.cells.length,
      combo,
      attackerElement: element,
      defenderElement: opts.enemy.def.element,
      defenderDef: opts.enemyDefEffective,
      isCrit,
      buffMult: opts.teamDamageMult,
    }) * opts.elementTraitDamageMult(pet, opts.enemy.def.element);
    const damage = Math.max(
      1,
      Math.floor(raw * (1 - (opts.enemy.dmgReduction?.reduction ?? 0))),
    );
    attacks.push({
      petIndex,
      element,
      damage,
      isCrit,
      counter: opts.counterRelation(element, opts.enemy.def.element),
    });
  }

  const heartHeal = (healOrbs > 0 && !opts.noHeartHeal)
    ? calcHeal(opts.teamRcvTotal, healOrbs, combo)
    : 0;
  return {
    combo,
    comboMul,
    attacks,
    heal: heartHeal + opts.passiveRegenPerTurn,
  };
}
