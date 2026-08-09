/**
 * 技能执行器（纯战斗逻辑，无渲染依赖）
 *
 * 宠物主动技、敌人技能、模拟器都应通过这里执行效果，避免多处 switch 分叉。
 */
import { counterElementOf, type Element, type OrbType } from '@/balance/combat';
import type { PetDef } from '@/balance/pets';
import type { SkillDef, SkillEffectDef, SkillVfxId, ConvertShape } from '@/balance/skills';
import { getSkill, resolveSkillVfx, getSkillTierBonus, getSkillStarOverride } from '@/balance/skills';
import { getStarProfile } from '@/balance/growth';
import { getRaritySkillPower } from '@/balance/rarity';
import { skillMasteryRank, masteryEffectMult } from '@/balance/skillGrowth';
import { applyResist, type ResistKind, type ResistQuota } from '@/balance/petTags';
import type { StatusKind, StatusStackPolicy } from './BattleStatus';
import { defenseReduction, expectedCritFactor, skillElementMultiplier } from '@/formulas/damage';

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
  /** 敌人是否已狂暴（enrage 每场只触发一次）；默认 false */
  enemyEnraged?: boolean;
  /** 敌人是否凝意中（免疫眩晕与威吓）；默认 false */
  enemyResolute?: boolean;
  /** 敌人是否已挂着不灭（避免每回合空放同一招占掉行动）；默认 false */
  enemyUndying?: boolean;
  /** 队伍人数（敌方技能封印随机选目标用）；默认 0 */
  teamSize?: number;
  /**
   * 我方抗性配额（0..1）。放在技能引擎而不是状态应用处，是因为满配要让敌人这一招
   * 整个哑火（返回 false，不占技能位也不出提示），而不是先上一个 0 回合的状态。
   */
  teamResists?: ResistQuota;
  /** 随机源（敌方技能封印选目标）；默认 Math.random */
  rng?: () => number;
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
  status: Exclude<StatusKind, 'shield'> | 'shield' | 'charge';
  value: number;
  turns?: number;
  stack: StatusStackPolicy;
  vfx: SkillVfxId;
  /** elementDamageBuff 的目标属性 */
  element?: Element;
}

export type BoardRequest =
  | {
      type: 'convertOrbs';
      to: OrbType;
      count: number;
      shape: ConvertShape;
      from?: OrbType;
      vfx: SkillVfxId;
    }
  | {
      /** 敌方扰盘：随机封印 count 颗珠 */
      type: 'sealRandom';
      count: number;
      vfx: SkillVfxId;
    }
  | {
      /** 净化：解除全部封印珠 */
      type: 'unsealAll';
      vfx: SkillVfxId;
    }
  | {
      /** 克属封印：封锁盘面上该属性的全部珠 */
      type: 'sealElement';
      element: Element;
      vfx: SkillVfxId;
    };

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
    | 'enemyShield'
    // ── 目标十三新增 ──
    | 'gravity'
    | 'haste'
    | 'purify'
    | 'delayAttack'
    | 'extraTime'
    | 'critBoost'
    | 'elementBuff'
    | 'sealOrbs'
    | 'poison'
    | 'timeSqueeze'
    | 'healBlock'
    | 'enrage'
    | 'skillSeal'
    | 'atkDebuff'
    | 'resolve'
    | 'elementAbsorb'
    | 'counterStrike'
    // ── 硬闸门 ──
    | 'elementGate'
    | 'comboGate'
    | 'damageVoid'
    | 'undying'
    | 'counterSeal';
  vfxEvents: readonly SkillVfxId[];
  damageEvents: DamageEvent[];
  healEvents: HealEvent[];
  statusEvents: StatusEvent[];
  boardRequests: BoardRequest[];
  /** haste：全队其他宠物技能 CD 减少量 */
  teamCdDelta?: number;
  /** purify：是否清除我方 debuff */
  cleanseTeam?: boolean;
  /** delayEnemyAttack：敌人普攻倒计时 +N */
  enemyAttackDelay?: number;
  /** 敌人凝意导致眩晕/威吓落空（其余效果仍生效），供演出提示「免疫」 */
  immuneControl?: boolean;
}

/**
 * 宠物主动技解析：星级 skillTier（质变档）× 技能等级 mastery（等级渐进档）
 * @param level 宠物等级，派生技能等级 Lv.1~5；缺省 1 = 基线
 */
export function skillForPet(pet: PetDef, star = 1, level = 1): SkillDef {
  const tier = getStarProfile(star).skillTier;
  const masteryMult = masteryEffectMult(skillMasteryRank(level));
  return applyPetSkillModifiers(getSkill(pet.skillId), pet, tier, masteryMult);
}

export function skillCdForPet(pet: PetDef, star = 1, level = 1): number {
  return skillForPet(pet, star, level).cd;
}

export function skillForEnemy(skillId: string): SkillDef {
  return getSkill(skillId);
}

export function applyPetSkillModifiers(
  skill: SkillDef,
  pet: PetDef,
  skillTier = 1,
  masteryMult = 1,
): SkillDef {
  const tierBonus = getSkillTierBonus(skillTier);
  const override = getSkillStarOverride(skill.id, skillTier);

  let cd = skill.cd + tierBonus.cdDelta + (override?.cdDelta ?? 0);
  // 质变覆写优先：effectMult 替代平 % 加成
  let effectMult = override?.effectMult ?? (1 + tierBonus.effectPct);
  // 稀有度技能倍率（锚点 R=1.0，与星级 tier 独立叠乘，保证同 skillId 跨稀有单调）
  effectMult *= getRaritySkillPower(pet.rarity);
  // 技能等级乘区（等级里程碑派生，独立于星级/稀有度）
  effectMult *= masteryMult;
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
    // 重力按敌人当前 HP 百分比结算，随星级/稀有度放大但封顶（避免斩杀失衡）
    if (effect.kind === 'gravity') {
      return { ...effect, pct: Math.min(0.5, effect.pct * effectMult) };
    }
    if (effect.kind === 'elementDamageBuff') {
      return { ...effect, mult: 1 + (effect.mult - 1) * effectMult };
    }
    return effect;
  });

  return { ...skill, cd: Math.max(1, cd), effects, desc: override?.desc ?? skill.desc };
}

/** 按抗性配额削减骚扰的持续回合 / 颗数；满配返回 0，让这一招整个哑火 */
function resistedAmount(ctx: SkillRuntimeContext, kind: ResistKind, amount: number): number {
  return applyResist(amount, ctx.teamResists?.[kind] ?? 0);
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
    case 'gravity':
      return 'gravity';
    case 'haste':
      return 'haste';
    case 'purify':
      return 'purify';
    case 'delayEnemyAttack':
      return 'delayAttack';
    case 'extraDragTime':
      return 'extraTime';
    case 'guaranteedCrit':
      return 'critBoost';
    case 'elementDamageBuff':
      return 'elementBuff';
    case 'sealOrbs':
      return 'sealOrbs';
    case 'timeSqueeze':
      return 'timeSqueeze';
    case 'healBlock':
      return 'healBlock';
    case 'enrage':
      return 'enrage';
    case 'skillSeal':
      return 'skillSeal';
    case 'atkDebuff':
      return 'atkDebuff';
    case 'resolve':
      return 'resolve';
    case 'elementAbsorb':
      return 'elementAbsorb';
    case 'counterAttack':
      return 'counterStrike';
    case 'elementGate':
      return 'elementGate';
    case 'comboGate':
      return 'comboGate';
    case 'damageVoid':
      return 'damageVoid';
    case 'undying':
      return 'undying';
    case 'counterSeal':
      return 'counterSeal';
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

/**
 * 瞬发直伤是否吃五行克制。
 *
 * 消珠有「消除数 × Combo × 克制」三层乘区，技能原本一层都不吃，于是无论怎么调倍率，
 * 放技的手感都只是「又一次平 A」。让瞬发直伤接上克制这一层，放技才第一次和编队产生关系。
 *
 * 三类不吃：敌人技（英雄无属性）、全队齐射（teamAtk 是混属性齐射）、持续伤害。
 * 后两者因此成为「不挑颜色的保底输出」，与「挑对颜色就爆炸」的瞬发直伤形成分工。
 */
function counterMultFor(
  source: 'casterAtk' | 'teamAtk' | 'enemyAtk',
  caster: SkillCaster,
  ctx: SkillRuntimeContext,
  element: Element | undefined,
  applyCounter: boolean | undefined,
): number {
  if (caster.kind !== 'pet' || source === 'teamAtk' || applyCounter === false) return 1;
  return skillElementMultiplier(element ?? caster.element, ctx.enemy.element);
}

/** 单段直伤结算（damage / multiHit 共用） */
function resolveHitAmount(
  source: 'casterAtk' | 'teamAtk' | 'enemyAtk',
  multiplier: number,
  caster: SkillCaster,
  ctx: SkillRuntimeContext,
  opts: {
    applyDefense?: boolean;
    applyDmgBuff?: boolean;
    applyEnemyReduction?: boolean;
    applyCounter?: boolean;
    element?: Element;
  },
): number {
  const raw = damageSourceValue(source, caster, ctx) * multiplier;
  // 宠物施法的直伤/多段技按「施法宠自身」暴击的期望值放大（确定性，与模拟器镜像）；敌人技不暴击。
  const critFactor = caster.kind === 'pet'
    ? expectedCritFactor(caster.critRate ?? 0, caster.critDamage ?? 0)
    : 1;
  const reduced = raw
    * critFactor
    * counterMultFor(source, caster, ctx, opts.element, opts.applyCounter)
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

  stun: (effect, { vfx, ctx, result }) => {
    // 凝意中的敌人免控：只让眩晕这一段落空，技能其余段（如附带直伤）照常结算，
    // 因此这里不能 return false —— 那会让整个技能不触发。
    if (ctx.enemyResolute) {
      result.immuneControl = true;
      return true;
    }
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
      from: effect.from,
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

  // ── 目标十三新增（宠物侧） ──

  gravity: (effect, { vfx, ctx, result }) => {
    // 按敌人当前 HP 百分比结算，无视防御/减伤（PAD「重力」），不暴击
    const amount = Math.max(1, Math.floor(ctx.enemy.hp * effect.pct));
    result.damageEvents.push({ target: 'enemy', amount, vfx });
    return true;
  },

  haste: (effect, { result }) => {
    result.teamCdDelta = (result.teamCdDelta ?? 0) + effect.amount;
    return true;
  },

  purify: (effect, { vfx, result }) => {
    if (effect.unsealBoard) result.boardRequests.push({ type: 'unsealAll', vfx });
    if (effect.cleanseTeam) result.cleanseTeam = true;
    return true;
  },

  delayEnemyAttack: (effect, { ctx, result }) => {
    if (ctx.enemyResolute) {
      result.immuneControl = true;
      return true;
    }
    result.enemyAttackDelay = (result.enemyAttackDelay ?? 0) + effect.turns;
    return true;
  },

  extraDragTime: (effect, { vfx, result }) => {
    result.statusEvents.push({
      target: 'team',
      status: 'extraDragTime',
      value: effect.seconds,
      turns: effect.turns,
      stack: 'max',
      vfx,
    });
    return true;
  },

  guaranteedCrit: (effect, { vfx, result }) => {
    result.statusEvents.push({
      target: 'team',
      status: 'guaranteedCrit',
      value: 1,
      turns: effect.turns,
      stack: 'max',
      vfx,
    });
    return true;
  },

  elementDamageBuff: (effect, { vfx, result }) => {
    result.statusEvents.push({
      target: 'team',
      status: 'elementDamageBuff',
      value: effect.mult,
      turns: effect.turns,
      stack: 'replace',
      vfx,
      element: effect.element,
    });
    return true;
  },

  // ── 目标十三新增（敌人侧） ──

  sealOrbs: (effect, { vfx, ctx, result }) => {
    const count = resistedAmount(ctx, 'sealOrbs', effect.count);
    if (count <= 0) return false;
    result.boardRequests.push({ type: 'sealRandom', count, vfx });
    return true;
  },

  timeSqueeze: (effect, { vfx, ctx, result }) => {
    const turns = resistedAmount(ctx, 'timeSqueeze', effect.turns);
    if (turns <= 0) return false;
    result.statusEvents.push({
      target: 'team',
      status: 'timeSqueeze',
      value: effect.seconds,
      turns,
      stack: 'max',
      vfx,
    });
    return true;
  },

  healBlock: (effect, { vfx, ctx, result }) => {
    const turns = resistedAmount(ctx, 'healBlock', effect.turns);
    if (turns <= 0) return false;
    result.statusEvents.push({
      target: 'team',
      status: 'healBlock',
      value: effect.mult,
      turns,
      stack: 'replace',
      vfx,
    });
    return true;
  },

  enrage: (effect, { vfx, ctx, result }) => {
    // 每场只触发一次，且仅在 HP 低于阈值时进入狂暴
    if (ctx.enemyEnraged) return false;
    if (ctx.enemy.hp > ctx.enemy.maxHp * effect.threshold) return false;
    result.statusEvents.push({
      target: 'enemy',
      status: 'enrage',
      value: effect.atkMult,
      stack: 'ignoreIfPresent',
      vfx,
    });
    return true;
  },

  atkDebuff: (effect, { vfx, result }) => {
    result.statusEvents.push({
      target: 'team',
      status: 'atkDebuff',
      value: effect.mult,
      turns: effect.turns,
      stack: 'replace',
      vfx,
    });
    return true;
  },

  elementAbsorb: (effect, { vfx, ctx, result }) => {
    // 缺省吸「克制自己」的那一色：玩家打 Boss 必然带克制队，吸这色才真正逼换队
    const element = effect.element ?? counterElementOf(ctx.enemy.element);
    result.statusEvents.push({
      target: 'enemy',
      status: 'elementAbsorb',
      value: effect.mult,
      turns: effect.turns,
      stack: 'replace',
      element,
      vfx,
    });
    return true;
  },

  counterAttack: (effect, { vfx, result }) => {
    result.statusEvents.push({
      target: 'enemy',
      status: 'counterStrike',
      value: effect.multiplier,
      turns: effect.turns,
      stack: 'replace',
      vfx,
    });
    return true;
  },

  // ── 硬闸门（离散开关，堆数值无法抵消；求值见 balance/damageGates） ──

  elementGate: (effect, { vfx, result }) => {
    result.statusEvents.push({
      target: 'enemy',
      status: 'elementGate',
      value: effect.need,
      turns: effect.turns,
      stack: 'replace',
      vfx,
    });
    return true;
  },

  comboGate: (effect, { vfx, result }) => {
    result.statusEvents.push({
      target: 'enemy',
      status: 'comboGate',
      value: effect.need,
      turns: effect.turns,
      stack: 'replace',
      vfx,
    });
    return true;
  },

  damageVoid: (effect, { vfx, ctx, result }) => {
    // 阈值按敌人血池换算成绝对值，跨章自动缩放，不用每关手填
    const threshold = Math.max(1, Math.floor(ctx.enemy.maxHp * effect.thresholdPct));
    result.statusEvents.push({
      target: 'enemy',
      status: 'damageVoid',
      value: threshold,
      turns: effect.turns,
      stack: 'replace',
      vfx,
    });
    return true;
  },

  undying: (effect, { vfx, ctx, result }) => {
    // 已经挂着就不重放：不灭没有回合数，否则敌人每个 CD 都会空放一次白占行动
    if (ctx.enemyUndying) return false;
    // 血线已经低于阈值就不再上不灭：被打穿一次后 HP=1，这条守卫天然保证每场只留一次命
    if (ctx.enemy.hp <= ctx.enemy.maxHp * effect.hpThresholdPct) return false;
    result.statusEvents.push({
      target: 'enemy',
      status: 'undying',
      value: effect.hpThresholdPct,
      stack: 'ignoreIfPresent',
      vfx,
    });
    return true;
  },

  counterSeal: (_effect, { vfx, ctx, result }) => {
    // 封「克制敌人自己」那一色：玩家打 Boss 必然带这色，封它才真正逼出第二输出。
    // 不另挂状态——封印珠沿用棋盘既有的「邻格消除即解封」规则，玩家可以自己拆。
    const element = counterElementOf(ctx.enemy.element);
    result.boardRequests.push({ type: 'sealElement', element, vfx });
    return true;
  },

  resolve: (effect, { vfx, ctx, result }) => {
    // 已在凝意中不重复叠加（否则每次 CD 到就无限续，等于永久免控）
    if (ctx.enemyResolute) return false;
    result.statusEvents.push({
      target: 'enemy',
      status: 'resolve',
      value: 1,
      turns: effect.turns,
      stack: 'replace',
      vfx,
    });
    return true;
  },

  skillSeal: (effect, { vfx, ctx, result }) => {
    const teamSize = ctx.teamSize ?? 0;
    if (teamSize <= 0) return false;
    const turns = resistedAmount(ctx, 'skillSeal', effect.turns);
    if (turns <= 0) return false;
    const rng = ctx.rng ?? Math.random;
    const petIndex = Math.min(teamSize - 1, Math.floor(rng() * teamSize));
    result.statusEvents.push({
      target: 'team',
      status: 'skillSeal',
      value: petIndex,
      turns,
      stack: 'replace',
      vfx,
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
