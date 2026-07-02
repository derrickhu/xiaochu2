/**
 * 被动效果统一模型 — 解析 L0 + ladder + star 为 PassiveEffect，战斗/UI 单一出口。
 */
import type { Element } from './combat';
import {
  ATTRIB_SCOPE, ATTRIB_UI, PET_ROLE_NAME,
  STAT_UI, type AttribKey, type CombatAttribBlock, type PetRole, type StatKey,
} from './petRoles';
import {
  ROLE_PASSIVE_L0, ROLE_PASSIVE_LADDER, passiveSlotsForRarity, type PassiveLayerEffect,
} from './passives';
import { getRarityAttribPower, getRarityPassivePower, type Rarity } from './rarity';
import { ELEMENT_NAME } from './ui';

export type EffectScope = 'self' | 'team';

export type PassiveEffectKind =
  | 'critRate' | 'critDamage'
  | 'damageReduction' | 'healBonus' | 'teamDamageBonus'
  | 'regenPct' | 'startShieldPct'
  | 'statBonus' | 'teamAura';

export type EffectSource = 'signature' | 'ladder' | 'star';

export interface PassiveEffect {
  kind: PassiveEffectKind;
  scope: EffectScope;
  value: number;
  source: EffectSource;
  unlocked: boolean;
  unlockHint?: string;
  displayName?: string;
  statScope?: 'self' | 'team';
  stat?: StatKey;
  aura?: { requireRole?: PetRole; requireElement?: Element; count: number };
}

export interface PassiveDisplayLine {
  text: string;
  unlocked?: boolean;
  color?: number;
}

export interface PassiveEffectBundle {
  effects: readonly PassiveEffect[];
  displayLines: readonly PassiveDisplayLine[];
  statEffects: readonly PassiveEffect[];
}

/** 星级成长配置（原 talents.ts ROLE_STAR_TRAITS） */
export interface StarEffectLayer {
  star: number;
  name: string;
  attrib: AttribKey;
  base: number;
}

export const ROLE_STAR_EFFECTS: Readonly<Record<PetRole, readonly StarEffectLayer[]>> = {
  attacker: [
    { star: 3, name: '会心', attrib: 'critDamage', base: 0.30 },
    { star: 5, name: '狂暴', attrib: 'critRate', base: 0.06 },
  ],
  tank: [
    { star: 3, name: '铁壁', attrib: 'damageReduction', base: 0.04 },
    { star: 5, name: '不动如山', attrib: 'damageReduction', base: 0.04 },
  ],
  healer: [
    { star: 3, name: '守护', attrib: 'healBonus', base: 0.10 },
    { star: 5, name: '庇心', attrib: 'healBonus', base: 0.10 },
  ],
  support: [
    { star: 3, name: '锐眼', attrib: 'teamDamageBonus', base: 0.04 },
    { star: 5, name: '激励', attrib: 'teamDamageBonus', base: 0.04 },
  ],
};

export function isStarEffectUnlocked(layer: StarEffectLayer, star: number): boolean {
  return star >= layer.star;
}

export function unlockedStarEffects(role: PetRole, star: number): StarEffectLayer[] {
  const ladder = ROLE_STAR_EFFECTS[role] ?? ROLE_STAR_EFFECTS.attacker;
  return ladder.filter((layer) => isStarEffectUnlocked(layer, star));
}

type TeamAggregateRule = 'sum' | 'product' | 'none';

export interface EffectRegistryEntry {
  scope: EffectScope;
  teamAggregate: TeamAggregateRule;
  clampSelf?: boolean;
  describe: (e: PassiveEffect) => string;
  uiColor: (e: PassiveEffect) => number;
}

const BONUS_KEYS = new Set<AttribKey>(['critDamage', 'healBonus', 'teamDamageBonus']);

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const round4 = (v: number): number => Math.round(v * 10000) / 10000;
const toPct = (v: number): string => `${Math.round(v * 1000) / 10}%`;
const toPctInt = (v: number): string => `${Math.round(v * 100)}%`;

function formatAttribLine(key: AttribKey, value: number): string {
  const ui = ATTRIB_UI[key];
  const prefix = BONUS_KEYS.has(key) ? '+' : '';
  const scope = ATTRIB_SCOPE[key] === 'self' ? '（自身）' : '';
  return `${ui.longLabel} ${prefix}${toPct(value)}${scope}`;
}

function describeStarEffect(e: PassiveEffect): string {
  const body = EFFECT_REGISTRY[e.kind].describe(e);
  const prefix = e.displayName ? `${e.displayName}：` : '';
  const hint = e.unlocked ? '' : `（${e.unlockHint ?? '未解锁'}）`;
  return `${prefix}${body}${hint}`;
}

function describeLadderTrigger(kind: PassiveEffectKind, value: number): string {
  switch (kind) {
    case 'teamDamageBonus':
      return `常驻：全队增伤 +${toPctInt(value)}`;
    case 'regenPct':
      return `每回合：回复全队最大生命 ${toPctInt(value)}`;
    case 'startShieldPct':
      return `开局：获得最大生命 ${toPctInt(value)} 的护盾`;
    default:
      return '';
  }
}

function describeStatBonus(e: PassiveEffect): string {
  if (!e.stat) return '';
  const scope = e.statScope === 'team' ? '全队' : '自身';
  return `常驻：${scope}${STAT_UI[e.stat].longLabel} +${toPctInt(e.value)}`;
}

function describeTeamAura(e: PassiveEffect): string {
  if (!e.stat || !e.aura) return '';
  const cond = e.aura.requireElement
    ? `队中${ELEMENT_NAME[e.aura.requireElement]}属性`
    : e.aura.requireRole
      ? `队中${PET_ROLE_NAME[e.aura.requireRole]}`
      : '队伍';
  return `光环：${cond}满 ${e.aura.count} 只时，全队${STAT_UI[e.stat].longLabel} +${toPctInt(e.value)}`;
}

export const EFFECT_REGISTRY: Readonly<Record<PassiveEffectKind, EffectRegistryEntry>> = {
  critRate: {
    scope: 'self', teamAggregate: 'none', clampSelf: true,
    describe: (e) => formatAttribLine('critRate', e.value),
    uiColor: () => ATTRIB_UI.critRate.color,
  },
  critDamage: {
    scope: 'self', teamAggregate: 'none',
    describe: (e) => formatAttribLine('critDamage', e.value),
    uiColor: () => ATTRIB_UI.critDamage.color,
  },
  damageReduction: {
    scope: 'team', teamAggregate: 'sum', clampSelf: true,
    describe: (e) => formatAttribLine('damageReduction', e.value),
    uiColor: () => ATTRIB_UI.damageReduction.color,
  },
  healBonus: {
    scope: 'team', teamAggregate: 'sum', clampSelf: true,
    describe: (e) => formatAttribLine('healBonus', e.value),
    uiColor: () => ATTRIB_UI.healBonus.color,
  },
  teamDamageBonus: {
    scope: 'team', teamAggregate: 'sum',
    describe: (e) => e.source === 'ladder'
      ? describeLadderTrigger('teamDamageBonus', e.value)
      : formatAttribLine('teamDamageBonus', e.value),
    uiColor: () => ATTRIB_UI.teamDamageBonus.color,
  },
  regenPct: {
    scope: 'team', teamAggregate: 'sum',
    describe: (e) => describeLadderTrigger('regenPct', e.value),
    uiColor: () => STAT_UI.rcv.color,
  },
  startShieldPct: {
    scope: 'team', teamAggregate: 'sum',
    describe: (e) => describeLadderTrigger('startShieldPct', e.value),
    uiColor: () => STAT_UI.hp.color,
  },
  statBonus: {
    scope: 'self', teamAggregate: 'product',
    describe: describeStatBonus,
    uiColor: (e) => (e.stat ? STAT_UI[e.stat].color : 0xffffff),
  },
  teamAura: {
    scope: 'team', teamAggregate: 'product',
    describe: describeTeamAura,
    uiColor: (e) => (e.stat ? STAT_UI[e.stat].color : 0xffffff),
  },
};

const ATTRIB_KINDS = new Set<PassiveEffectKind>([
  'critRate', 'critDamage', 'damageReduction', 'healBonus', 'teamDamageBonus',
]);

function scaleAttribValue(kind: PassiveEffectKind, raw: number): number {
  if (kind === 'critRate' || kind === 'damageReduction' || kind === 'healBonus') {
    return round4(clamp01(raw));
  }
  return round4(Math.max(0, raw));
}

function l0EffectToPassive(layer: typeof ROLE_PASSIVE_L0[PetRole], rarity: Rarity): PassiveEffect {
  const e = layer.effect;
  const power = getRarityAttribPower(rarity);
  const kind = e.kind as PassiveEffectKind;
  const value = scaleAttribValue(kind, e.base * power);
  return {
    kind,
    scope: ATTRIB_SCOPE[kind as AttribKey],
    value,
    source: 'signature',
    unlocked: true,
    displayName: layer.name,
  };
}

/** 战斗属性块（L0 + star × RARITY_ATTRIB_POWER，与旧 petCombatAttribs 等价） */
export function computePetCombatAttribs(role: PetRole, rarity: Rarity, star: number): CombatAttribBlock {
  const l0 = ROLE_PASSIVE_L0[role] ?? ROLE_PASSIVE_L0.attacker;
  const e0 = l0.effect;
  let critRate = e0.kind === 'critRate' ? e0.base : 0;
  let critDamage = e0.kind === 'critDamage' ? e0.base : 0;
  let damageReduction = e0.kind === 'damageReduction' ? e0.base : 0;
  let healBonus = e0.kind === 'healBonus' ? e0.base : 0;
  let teamDamageBonus = e0.kind === 'teamDamageBonus' ? e0.base : 0;

  for (const layer of unlockedStarEffects(role, star)) {
    if (layer.attrib === 'critRate') critRate += layer.base;
    else if (layer.attrib === 'critDamage') critDamage += layer.base;
    else if (layer.attrib === 'damageReduction') damageReduction += layer.base;
    else if (layer.attrib === 'healBonus') healBonus += layer.base;
    else teamDamageBonus += layer.base;
  }

  const power = getRarityAttribPower(rarity);
  return {
    critRate: round4(clamp01(critRate * power)),
    critDamage: round4(Math.max(0, critDamage * power)),
    damageReduction: round4(clamp01(damageReduction * power)),
    healBonus: round4(clamp01(healBonus * power)),
    teamDamageBonus: round4(Math.max(0, teamDamageBonus * power)),
  };
}

function expandL0Signature(role: PetRole, rarity: Rarity): PassiveEffect[] {
  return [l0EffectToPassive(ROLE_PASSIVE_L0[role] ?? ROLE_PASSIVE_L0.attacker, rarity)];
}

function expandStarEffects(role: PetRole, rarity: Rarity, star: number): PassiveEffect[] {
  const power = getRarityAttribPower(rarity);
  const effects: PassiveEffect[] = [];
  for (const layer of ROLE_STAR_EFFECTS[role] ?? ROLE_STAR_EFFECTS.attacker) {
    const unlocked = isStarEffectUnlocked(layer, star);
    const kind = layer.attrib as PassiveEffectKind;
    effects.push({
      kind,
      scope: ATTRIB_SCOPE[layer.attrib],
      value: scaleAttribValue(kind, layer.base * power),
      source: 'star',
      unlocked,
      unlockHint: unlocked ? undefined : `★${layer.star}解锁`,
      displayName: layer.name,
    });
  }
  return effects;
}

function expandLadderEffect(e: PassiveLayerEffect, v: number, displayName: string): PassiveEffect[] {
  switch (e.kind) {
    case 'teamDamageBonus':
      return [{
        kind: 'teamDamageBonus', scope: 'team', value: v, source: 'ladder',
        unlocked: true, displayName,
      }];
    case 'regen':
      return [{
        kind: 'regenPct', scope: 'team', value: v, source: 'ladder',
        unlocked: true, displayName,
      }];
    case 'startShield':
      return [{
        kind: 'startShieldPct', scope: 'team', value: v, source: 'ladder',
        unlocked: true, displayName,
      }];
    case 'statSelf':
      return [{
        kind: 'statBonus', scope: 'self', statScope: 'self', stat: e.stat, value: v,
        source: 'ladder', unlocked: true, displayName,
      }];
    case 'statTeam':
      return [{
        kind: 'statBonus', scope: 'team', statScope: 'team', stat: e.stat, value: v,
        source: 'ladder', unlocked: true, displayName,
      }];
    case 'aura':
      return [{
        kind: 'teamAura', scope: 'team', stat: e.stat, value: v, source: 'ladder',
        unlocked: true, displayName,
        aura: {
          count: e.count,
          ...(e.requireRole ? { requireRole: e.requireRole } : {}),
          ...(e.requireElement ? { requireElement: e.requireElement } : {}),
        },
      }];
    default:
      if (ATTRIB_KINDS.has(e.kind as PassiveEffectKind)) {
        const kind = e.kind as PassiveEffectKind;
        return [{
          kind, scope: ATTRIB_SCOPE[kind as AttribKey], value: v,
          source: 'ladder', unlocked: true, displayName,
        }];
      }
      return [];
  }
}

function expandLadderLayers(role: PetRole, rarity: Rarity): PassiveEffect[] {
  const ladder = ROLE_PASSIVE_LADDER[role] ?? ROLE_PASSIVE_LADDER.attacker;
  const slots = passiveSlotsForRarity(rarity);
  const rp = getRarityPassivePower(rarity);
  const effects: PassiveEffect[] = [];
  for (const layer of ladder.slice(0, slots)) {
    const v = round3(layer.effect.base * rp);
    effects.push(...expandLadderEffect(layer.effect, v, layer.name));
  }
  return effects;
}

const SOURCE_ORDER: Record<EffectSource, number> = { signature: 0, ladder: 1, star: 2 };

function buildDisplayLines(
  effects: readonly PassiveEffect[],
  options?: { includeStar?: boolean },
): PassiveDisplayLine[] {
  const includeStar = options?.includeStar ?? false;
  return effects
    .filter((e) => includeStar || e.source !== 'star')
    .filter((e) => {
      if (e.source === 'star' && includeStar) return true;
      return e.unlocked && e.value > 0;
    })
    .sort((a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source])
    .map((e) => ({
      text: e.source === 'star' ? describeStarEffect(e) : EFFECT_REGISTRY[e.kind].describe(e),
      unlocked: e.unlocked,
      color: e.unlocked ? EFFECT_REGISTRY[e.kind].uiColor(e) : undefined,
    }));
}

export function resolvePetPassiveBundle(
  role: PetRole,
  rarity: Rarity,
  star: number,
  options?: { includeStarInDisplay?: boolean },
): PassiveEffectBundle {
  const effects: PassiveEffect[] = [
    ...expandL0Signature(role, rarity),
    ...expandLadderLayers(role, rarity),
    ...expandStarEffects(role, rarity, star),
  ];
  const statEffects = effects.filter(
    (e) => (e.kind === 'statBonus' || e.kind === 'teamAura') && e.unlocked,
  );
  return {
    effects,
    displayLines: buildDisplayLines(effects, { includeStar: options?.includeStarInDisplay }),
    statEffects,
  };
}
