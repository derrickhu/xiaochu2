import type { EnemyUnit, TeamPet } from './battleTypes';
import type { SkillCaster, SkillRuntimeContext } from './SkillEngine';

export function makeSkillRuntimeContext(params: {
  enemy: EnemyUnit;
  enemyDefEffective: number;
  heroHp: number;
  heroMaxHp: number;
  team: readonly TeamPet[];
  teamRcvTotal: number;
  teamDamageBuffMult: number;
  passiveTeamDamageMult: number;
  /** 辅助招牌「全队增伤」属性乘区（1 + Σ teamDamageBonus） */
  teamDamageBonusMult: number;
  /** 治疗招牌「全队治疗强化」属性 */
  teamHealBonus: number;
}): SkillRuntimeContext {
  return {
    enemy: {
      hp: params.enemy.hp,
      maxHp: params.enemy.maxHp,
      atk: params.enemy.atk,
      def_: params.enemyDefEffective,
      element: params.enemy.def.element,
    },
    heroHp: params.heroHp,
    heroMaxHp: params.heroMaxHp,
    teamRcvTotal: params.teamRcvTotal,
    teamAtkTotal: params.team.reduce((sum, pet) => sum + pet.atk, 0),
    teamDamageBuffMult:
      params.teamDamageBuffMult * params.passiveTeamDamageMult * params.teamDamageBonusMult,
    enemyDamageReduction: params.enemy.dmgReduction?.reduction ?? 0,
    teamHealBonus: params.teamHealBonus,
  };
}

export function makePetCaster(team: readonly TeamPet[], petIndex: number): SkillCaster {
  const pet = team[petIndex];
  return {
    kind: 'pet',
    atk: pet.atk,
    element: pet.def.element,
    petIndex,
    petDef: pet.def,
    critRate: pet.critRate,
    critDamage: pet.critDamage,
  };
}

export function makeEnemyCaster(enemy: EnemyUnit): SkillCaster {
  return {
    kind: 'enemy',
    atk: enemy.atk,
    element: enemy.def.element,
  };
}
