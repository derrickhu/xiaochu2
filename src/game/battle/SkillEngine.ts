/**
 * 技能执行器（纯战斗逻辑，无渲染依赖）
 *
 * 宠物主动技、敌人技能、模拟器都应通过这里执行效果，避免多处 switch 分叉。
 */
import type { Element, OrbType } from '@/balance/combat';
import type { PetDef } from '@/balance/pets';
import type { SkillDef, SkillEffectDef, SkillVfxId, ConvertShape } from '@/balance/skills';
import { getSkill, resolveSkillVfx, getSkillTierBonus, getSkillStarOverride } from '@/balance/skills';
import { getStarProfile } from '@/balance/growth';
import { getRaritySkillPower } from '@/balance/rarity';
import type { StatusStackPolicy } from './BattleStatus';
import { defenseReduction, expectedCritFactor } from '@/formulas/damage';

export interface SkillCaster {
  kind: 'pet' | 'enemy';
  atk: number;
  element: Element;
  petIndex?: number;
  petDef?: PetDef;
  /** 个体暴击率（仅 pet 施法者；直伤/多段技按期望暴击放大，DOT 不暴击） */
  critRate?: number;
  /** 个体额外暴击伤害 */
  critDamage?: number;
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
  /** 全队治疗强化（治疗招牌属性），放大对全队的回复事件；默认 0 */
  teamHealBonus: number;
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
  status: 'shield' | 'teamDamageBuff' | 'enemyDamageReduction' | 'charge' | 'dot' | 'stun' | 'enemyDefenseBreak';
  value: number;
  turns?: number;
  stack: StatusStackPolicy;
  vfx: SkillVfxId;
}

export interface BoardRequest {
  type: 'convertOrbs';
  to: OrbType;
  count: number;
  shape: ConvertShape;
  vfx: SkillVfxId;
}

export interface SkillResult {
  skill: SkillDef;
  caster: SkillCaster;
  action:
    | 'instantDmg'
    | 'teamAttack'
    | 'multiHit'
    | 'dot'
    | 'stun'
    | 'defenseBreak'
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
  const override = getSkillStarOverride(skill.id, skillTier);

  let cd = skill.cd + tierBonus.cdDelta + (override?.cdDelta ?? 0);
  // 质变覆写优先：effectMult 替代平 % 加成
  let effectMult = override?.effectMult ?? (1 + tierBonus.effectPct);
  // 稀有度技能倍率（锚点 R=1.0，与星级 tier 独立叠乘，保证同 skillId 跨稀有单调）
  effectMult *= getRaritySkillPower(pet.rarity);
  let convertCountBonus = 0;
  for (const trait of pet.skillTraits ?? []) {
    if (trait.type !== 'skillModifier') continue;
    if (trait.skillId !== skill.id) continue;
    cd += trait.cdDelta ?? 0;
    effectMult *= 1 + (trait.effectPctBonus ?? 0);
    convertCountBonus += trait.convertCountBonus ?? 0;
  }

  const noChange = effectMult === 1 && convertCountBonus === 0 && cd === skill.cd && !override?.desc;
  if (noChange) return skill;

  const effects = skill.effects.map((effect): SkillEffectDef => {
    if (effect.kind === 'damage' || effect.kind === 'multiHit' || effect.kind === 'dot') {
      return { ...effect, multiplier: effect.multiplier * effectMult };
    }
    if (effect.kind === 'heal' || effect.kind === 'shield') {
      return { ...effect, pct: effect.pct * effectMult };
    }
    if (effect.kind === 'convertOrbs') {
      return { ...effect, count: effect.count + convertCountBonus };
    }
    return effect;
  });

  return { ...skill, cd: Math.max(1, cd), effects, desc: override?.desc ?? skill.desc };
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
    case 'multiHit':
      return 'multiHit';
    case 'dot':
      return 'dot';
    case 'stun':
      return 'stun';
    case 'defenseBreak':
      return 'defenseBreak';
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

/**
 * Effect handler 注册表（策略模式）：每种 effect kind 对应一个纯函数 handler，
 * 只读 ctx、向 result 推事件，返回 false = 整个技能不触发（如敌人满血自疗）。
 * 新增 effect 只需：扩 SkillEffectDef 类型 + 在此注册一个 handler。
 */
interface EffectContext {
  skill: SkillDef;
  vfx: SkillVfxId;
  caster: SkillCaster;
  ctx: SkillRuntimeContext;
  result: SkillResult;
}

type EffectHandler<K extends SkillEffectDef['kind'] = SkillEffectDef['kind']> = (
  effect: Extract<SkillEffectDef, { kind: K }>,
  c: EffectContext,
) => boolean;

/** 单段直伤结算（damage / multiHit 共用） */
function resolveHitAmount(
  source: 'casterAtk' | 'teamAtk' | 'enemyAtk',
  multiplier: number,
  caster: SkillCaster,
  ctx: SkillRuntimeContext,
  opts: { applyDefense?: boolean; applyDmgBuff?: boolean; applyEnemyReduction?: boolean },
): number {
  const raw = damageSourceValue(source, caster, ctx) * multiplier;
  // 宠物施法的直伤/多段技按「施法宠自身」暴击的期望值放大（确定性，与模拟器镜像）；敌人技不暴击。
  const critFactor = caster.kind === 'pet'
    ? expectedCritFactor(caster.critRate ?? 0, caster.critDamage ?? 0)
    : 1;
  const reduced = raw
    * critFactor
    * (opts.applyDefense === false ? 1 : (1 - defenseReduction(ctx.enemy.def_)))
    * (opts.applyDmgBuff === false ? 1 : ctx.teamDamageBuffMult)
    * (opts.applyEnemyReduction === false ? 1 : (1 - ctx.enemyDamageReduction));
  return Math.max(1, Math.floor(reduced));
}

const EFFECT_HANDLERS: { [K in SkillEffectDef['kind']]: EffectHandler<K> } = {
  damage: (effect, { vfx, caster, ctx, result }) => {
    const amount = resolveHitAmount(effect.source, effect.multiplier, caster, ctx, effect);
    result.damageEvents.push({
      target: caster.kind === 'enemy' ? 'hero' : 'enemy',
      amount,
      element: effect.element ?? caster.element,
      vfx,
    });
    return true;
  },

  multiHit: (effect, { vfx, caster, ctx, result }) => {
    const target = caster.kind === 'enemy' ? 'hero' : 'enemy';
    const element = effect.element ?? caster.element;
    for (let i = 0; i < effect.hits; i++) {
      const amount = resolveHitAmount(effect.source, effect.multiplier, caster, ctx, effect);
      result.damageEvents.push({ target, amount, element, vfx });
    }
    return true;
  },

  dot: (effect, { vfx, caster, ctx, result }) => {
    const perTurn = Math.max(1, Math.floor(damageSourceValue(effect.source, caster, ctx) * effect.multiplier));
    result.statusEvents.push({
      target: caster.kind === 'enemy' ? 'team' : 'enemy',
      status: 'dot',
      value: perTurn,
      turns: effect.turns,
      stack: 'replace',
      vfx,
    });
    return true;
  },

  stun: (effect, { vfx, result }) => {
    result.statusEvents.push({
      target: 'enemy',
      status: 'stun',
      value: 1,
      turns: effect.turns,
      stack: 'replace',
      vfx,
    });
    return true;
  },

  defenseBreak: (effect, { vfx, result }) => {
    result.statusEvents.push({
      target: 'enemy',
      status: 'enemyDefenseBreak',
      value: effect.pct,
      turns: effect.turns,
      stack: 'max',
      vfx,
    });
    return true;
  },

  heal: (effect, { vfx, ctx, result }) => {
    if (effect.onlyIfDamaged && ctx.enemy.hp >= ctx.enemy.maxHp) return false;
    const base = effect.source === 'teamMaxHp'
      ? ctx.heroMaxHp
      : effect.source === 'teamRcv'
        ? ctx.teamRcvTotal
        : ctx.enemy.maxHp;
    const target = effect.source === 'enemyMaxHp' ? 'enemy' : 'team';
    // 治疗强化只放大对全队的回复，不增益敌人自疗
    const healBonusMult = target === 'team' ? 1 + Math.max(0, ctx.teamHealBonus) : 1;
    result.healEvents.push({
      target,
      amount: Math.floor(base * effect.pct * healBonusMult),
      vfx,
    });
    return true;
  },

  shield: (effect, { vfx, ctx, result }) => {
    result.statusEvents.push({
      target: 'team',
      status: 'shield',
      value: Math.floor(ctx.heroMaxHp * effect.pct),
      stack: effect.stack,
      vfx,
    });
    return true;
  },

  status: (effect, { vfx, result }) => {
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
  },

  convertOrbs: (effect, { vfx, result }) => {
    result.boardRequests.push({
      type: 'convertOrbs',
      to: effect.to,
      count: effect.count,
      shape: effect.shape ?? 'random',
      vfx,
    });
    return true;
  },

  charge: (effect, { result }) => {
    result.statusEvents.push({
      target: 'enemy',
      status: 'charge',
      value: effect.multiplier,
      stack: 'replace',
      vfx: effect.releaseVfx,
    });
    return true;
  },
};

function runEffect(
  effect: SkillEffectDef,
  skill: SkillDef,
  vfx: SkillVfxId,
  caster: SkillCaster,
  ctx: SkillRuntimeContext,
  result: SkillResult,
): boolean {
  const handler = EFFECT_HANDLERS[effect.kind] as EffectHandler;
  return handler(effect, { skill, vfx, caster, ctx, result });
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
