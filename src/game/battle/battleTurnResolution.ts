import { type Element } from '@/balance/combat';
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
  /** 队长技「合鸣令」每连额外倍率（无辅助队长时为 0） */
  leaderComboBonus: number;
  /** 全队治疗强化（治疗招牌属性），放大心珠回复；默认 0 */
  teamHealBonus: number;
  /** 必暴击 buff（guaranteedCrit 状态）：本回合全部出手强制暴击 */
  guaranteedCrit: boolean;
  /** 心珠回复乘区（禁疗 debuff，无则 1） */
  heartHealMult: number;
  /** 单属性增伤乘区（elementDamageBuff 状态，无则 1） */
  elementBuffMult: (element: Element) => number;
  /** 敌方属性吸收乘区（被吸那一色的伤害折扣，无则 1） */
  elementAbsorbMult: (element: Element) => number;
  rng: () => number;
  elementTraitDamageMult: (pet: TeamPet, defender: Element) => number;
  counterRelation: (attacker: Element, defender: Element) => 1 | 0 | -1;
}

export function resolvePlayerTurnDamage(opts: ResolvePlayerTurnOptions): TurnResolution {
  const combo = opts.groups.length;
  const comboMul = comboMultiplier(combo, opts.leaderComboBonus);
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
    // 暴击为「个体属性」：用出手宠自身的暴击率掷骰、暴击伤害结算；必暴击 buff 强制暴击
    const isCrit = opts.guaranteedCrit || opts.rng() < pet.critRate;
    const raw = calcDamage({
      atk: pet.atk,
      matchCount: group.cells.length,
      combo,
      attackerElement: element,
      defenderElement: opts.enemy.def.element,
      defenderDef: opts.enemyDefEffective,
      isCrit,
      critDamage: pet.critDamage,
      buffMult: opts.teamDamageMult * opts.elementBuffMult(element),
      comboBonus: opts.leaderComboBonus,
    }) * opts.elementTraitDamageMult(pet, opts.enemy.def.element);
    // 属性吸收与减伤同层（都是敌方抗性），在增伤乘区之后结算
    const damage = Math.max(
      1,
      Math.floor(
        raw
        * (1 - (opts.enemy.dmgReduction?.reduction ?? 0))
        * opts.elementAbsorbMult(element),
      ),
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
    ? Math.floor(calcHeal(opts.teamRcvTotal, healOrbs, combo, opts.teamHealBonus) * opts.heartHealMult)
    : 0;
  return {
    combo,
    comboMul,
    attacks,
    heal: heartHeal + opts.passiveRegenPerTurn,
  };
}
