/**
 * 技能执行器（纯战斗逻辑，无渲染依赖）
 *
 * 宠物主动技、敌人技能、模拟器都应通过这里执行效果，避免多处 switch 分叉。
 */
import type { Element, OrbType } from '@/balance/combat';
import type { PetDef } from '@/balance/pets';
import type { SkillDef, SkillEffectDef, SkillVfxId } from '@/balance/skills';
import { getSkill, resolveSkillVfx, getSkillTierBonus } from '@/balance/skills';
import { getStarProfile } from '@/balance/growth';
import type { StatusStackPolicy } from './BattleStatus';
import { defenseReduction } from '@/formulas/damage';

export interface SkillCaster {
  kind: 'pet' | 'enemy';
  atk: number;
  element: Element;
  petIndex?: number;
  petDef?: PetDef;
}

export interface SkillRuntimeEnemy {
  hp: number;
  maxHp: number;
  atk: number;
  def_: number;
  element: Element;
}

export interface SkillRuntimeContext {
  enemy: SkillRuntimeEnemy;
  heroHp: number;
  heroMaxHp: number;
  teamRcvTotal: number;
  teamAtkTotal: number;
  teamDamageBuffMult: number;
  enemyDamageReduction: number;
}

export interface DamageEvent {
  target: 'enemy' | 'hero';
  amount: number;
  element?: Element;
  vfx: SkillVfxId;
}

export interface HealEvent {
  target: 'team' | 'enemy';
  amount: number;
  vfx: SkillVfxId;
}

export interface StatusEvent {
  target: 'team' | 'enemy';
  status: 'shield' | 'teamDamageBuff' | 'enemyDamageReduction' | 'charge';
  value: number;
  turns?: number;
  stack: StatusStackPolicy;
  vfx: SkillVfxId;
}

export interface BoardRequest {
  type: 'convertOrbs';
  to: OrbType;
  count: number;
  vfx: SkillVfxId;
}

export interface SkillResult {
  skill: SkillDef;
  caster: SkillCaster;
  action:
    | 'instantDmg'
    | 'teamAttack'
    | 'healPct'
    | 'shield'
    | 'dmgBoost'
    | 'convertOrbs'
    | 'charge'
    | 'chargedAttack'
    | 'heal'
    | 'enemyShield';
  vfxEvents: readonly SkillVfxId[];
  damageEvents: DamageEvent[];
  healEvents: HealEvent[];
  statusEvents: StatusEvent[];
  boardRequests: BoardRequest[];
}

export function skillForPet(pet: PetDef, star = 1): SkillDef {
  const tier = getStarProfile(star).skillTier;
  return applyPetSkillModifiers(getSkill(pet.skillId), pet, tier);
}

export function skillCdForPet(pet: PetDef, star = 1): number {
  return skillForPet(pet, star).cd;
}

export function skillForEnemy(skillId: string): SkillDef {
  return getSkill(skillId);
}

export function applyPetSkillModifiers(skill: SkillDef, pet: PetDef, skillTier = 1): SkillDef {
  const tierBonus = getSkillTierBonus(skillTier);
  let cd = skill.cd + tierBonus.cdDelta;
  let effectPctBonus = tierBonus.effectPct;
  let convertCountBonus = 0;
  for (const trait of pet.traits ?? []) {
    if (trait.type !== 'skillModifier') continue;
    if (trait.skillId !== skill.id) continue;
    cd += trait.cdDelta ?? 0;
    effectPctBonus += trait.effectPctBonus ?? 0;
    convertCountBonus += trait.convertCountBonus ?? 0;
  }

  if (effectPctBonus === 0 && convertCountBonus === 0 && cd === skill.cd) return skill;

  const effects = skill.effects.map((effect): SkillEffectDef => {
    if (effect.kind === 'damage') {
      return { ...effect, multiplier: effect.multiplier * (1 + effectPctBonus) };
    }
    if (effect.kind === 'heal' || effect.kind === 'shield') {
      return { ...effect, pct: effect.pct * (1 + effectPctBonus) };
    }
    if (effect.kind === 'convertOrbs') {
      return { ...effect, count: effect.count + convertCountBonus };
    }
    return effect;
  });

  return { ...skill, cd: Math.max(1, cd), effects };
}

export function runSkill(skill: SkillDef, caster: SkillCaster, ctx: SkillRuntimeContext): SkillResult | null {
  const vfx = resolveSkillVfx(skill);
  const result: SkillResult = {
    skill,
    caster,
    action: inferAction(skill),
    vfxEvents: [vfx],
    damageEvents: [],
    healEvents: [],
    statusEvents: [],
    boardRequests: [],
  };

  for (const effect of skill.effects) {
    const fired = runEffect(effect, skill, vfx, caster, ctx, result);
    if (!fired) return null;
  }

  return result;
}

export function runChargedAttack(
  skill: SkillDef,
  caster: SkillCaster,
  ctx: SkillRuntimeContext,
  multiplier: number,
  vfx: SkillVfxId,
): SkillResult {
  const amount = Math.floor(caster.atk * multiplier);
  return {
    skill,
    caster,
    action: 'chargedAttack',
    vfxEvents: [vfx],
    damageEvents: [{ target: 'hero', amount, element: caster.element, vfx }],
    healEvents: [],
    statusEvents: [],
    boardRequests: [],
  };
}

function inferAction(skill: SkillDef): SkillResult['action'] {
  const effect = skill.effects[0];
  if (!effect) return 'dmgBoost';
  switch (effect.kind) {
    case 'damage':
      return effect.source === 'teamAtk' ? 'teamAttack' : 'instantDmg';
    case 'heal':
      return effect.source === 'enemyMaxHp' ? 'heal' : 'healPct';
    case 'shield':
      return 'shield';
    case 'status':
      return effect.status === 'teamDamageBuff' ? 'dmgBoost' : 'enemyShield';
    case 'convertOrbs':
      return 'convertOrbs';
    case 'charge':
      return 'charge';
  }
}

function runEffect(
  effect: SkillEffectDef,
  skill: SkillDef,
  vfx: SkillVfxId,
  caster: SkillCaster,
  ctx: SkillRuntimeContext,
  result: SkillResult,
): boolean {
  switch (effect.kind) {
    case 'damage': {
      const raw = damageSourceValue(effect.source, caster, ctx) * effect.multiplier;
      const reduced = raw
        * (effect.applyDefense === false ? 1 : (1 - defenseReduction(ctx.enemy.def_)))
        * (effect.applyDmgBuff === false ? 1 : ctx.teamDamageBuffMult)
        * (effect.applyEnemyReduction === false ? 1 : (1 - ctx.enemyDamageReduction));
      const amount = Math.max(1, Math.floor(reduced));
      result.damageEvents.push({
        target: caster.kind === 'enemy' ? 'hero' : 'enemy',
        amount,
        element: effect.element ?? caster.element,
        vfx,
      });
      return true;
    }
    case 'heal': {
      if (effect.onlyIfDamaged && ctx.enemy.hp >= ctx.enemy.maxHp) return false;
      const base = effect.source === 'teamMaxHp'
        ? ctx.heroMaxHp
        : effect.source === 'teamRcv'
          ? ctx.teamRcvTotal
          : ctx.enemy.maxHp;
      const amount = Math.floor(base * effect.pct);
      result.healEvents.push({
        target: effect.source === 'enemyMaxHp' ? 'enemy' : 'team',
        amount,
        vfx,
      });
      return true;
    }
    case 'shield': {
      result.statusEvents.push({
        target: 'team',
        status: 'shield',
        value: Math.floor(ctx.heroMaxHp * effect.pct),
        stack: effect.stack,
        vfx,
      });
      return true;
    }
    case 'status': {
      if (effect.status === 'teamDamageBuff') {
        result.statusEvents.push({
          target: 'team',
          status: 'teamDamageBuff',
          value: effect.mult ?? 1,
          turns: effect.turns,
          stack: effect.stack,
          vfx,
        });
        return true;
      }
      result.statusEvents.push({
        target: 'enemy',
        status: 'enemyDamageReduction',
        value: effect.reduction ?? 0,
        turns: effect.turns,
        stack: effect.stack,
        vfx,
      });
      return true;
    }
    case 'convertOrbs':
      result.boardRequests.push({ type: 'convertOrbs', to: effect.to, count: effect.count, vfx });
      return true;
    case 'charge':
      result.statusEvents.push({
        target: 'enemy',
        status: 'charge',
        value: effect.multiplier,
        stack: 'replace',
        vfx: effect.releaseVfx,
      });
      return true;
  }
}

function damageSourceValue(source: 'casterAtk' | 'teamAtk' | 'enemyAtk', caster: SkillCaster, ctx: SkillRuntimeContext): number {
  switch (source) {
    case 'casterAtk':
      return caster.atk;
    case 'teamAtk':
      return ctx.teamAtkTotal;
    case 'enemyAtk':
      return ctx.enemy.atk;
  }
}
