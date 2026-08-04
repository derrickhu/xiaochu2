import { resolveResists } from '@/balance/petTags';
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
  /** 敌人是否凝意中（免疫眩晕与威吓） */
  enemyResolute?: boolean;
  /** 敌人是否已挂着不灭（避免空放同一招） */
  enemyUndying?: boolean;
  /** 我方伤害削弱乘区（敌方削攻 debuff） */
  teamAtkDebuffMult?: number;
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
    teamDamageBuffMult: params.teamDamageBuffMult
      * params.teamDamageMult
      * (params.teamAtkDebuffMult ?? 1),
    enemyDamageReduction: params.enemy.dmgReduction?.reduction ?? 0,
    teamHealBonus: params.teamHealBonus,
    enemyEnraged: params.enemyEnraged ?? false,
    enemyResolute: params.enemyResolute ?? false,
    enemyUndying: params.enemyUndying ?? false,
    teamSize: params.team.length,
    // 抗性配额直接从上阵表算，不走参数：任何调用点忘了传都会静默丢失免疫
    teamResists: resolveResists(params.team.map((p) => p.def.tags.resist)),
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
