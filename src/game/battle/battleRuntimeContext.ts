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
  /** 合并后的被动全队增伤乘区（ladder + 招牌/星级 teamDamageBonus） */
  teamDamageMult: number;
  teamHealBonus: number;
  /** 敌人是否已狂暴（enrage 每场一次） */
  enemyEnraged?: boolean;
  /** 随机源（敌方技能封印选目标） */
  rng?: () => number;
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
    teamDamageBuffMult: params.teamDamageBuffMult * params.teamDamageMult,
    enemyDamageReduction: params.enemy.dmgReduction?.reduction ?? 0,
    teamHealBonus: params.teamHealBonus,
    enemyEnraged: params.enemyEnraged ?? false,
    teamSize: params.team.length,
    rng: params.rng,
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
