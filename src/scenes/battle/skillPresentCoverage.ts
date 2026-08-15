/**
 * 宠物主动技「效果 → 必须有的演出频道」。
 *
 * 主分类 VFX 只负责一个主频道；其余频道由 presentResiduals 补演。
 * 审计测试用这张表扫完全部宠物技，漏频道会直接红。
 */
import { resolveSkillVfx } from '@/balance/skills/vfx';
import { SKILL_VFX_MAP, type SkillVfxKind } from '@/balance/skillVfx';
import type { SkillDef, SkillEffectDef } from '@/balance/skills';

export type PresentChannel =
  | 'enemyDamage'
  | 'heal'
  | 'convert'
  | 'shield'
  | 'purify'
  | 'defenseBreak'
  | 'stun'
  | 'delayAttack'
  | 'extraTime'
  | 'haste'
  | 'dmgBoost'
  | 'critBoost'
  | 'elementBuff'
  | 'dot';

/** 残段演出必须能补的频道（主 VFX 没播的，全部走这里） */
export const RESIDUAL_CHANNELS: readonly PresentChannel[] = [
  'enemyDamage', 'heal', 'convert', 'shield', 'purify',
  'defenseBreak', 'stun', 'delayAttack', 'extraTime',
  'haste', 'dmgBoost', 'critBoost', 'elementBuff', 'dot',
];

/** 某个 VFX 主演出会播哪些频道（必须与 battleSkillPresenter 的 switch 一致） */
export const VFX_PRIMARY_CHANNELS: Readonly<Record<SkillVfxKind, readonly PresentChannel[]>> = {
  projectile: ['enemyDamage'],
  teamVolley: ['enemyDamage'],
  multiHit: ['enemyDamage'],
  gravityCrush: ['enemyDamage'],
  dotApply: ['enemyDamage', 'dot'],
  stun: ['enemyDamage', 'stun'],
  defenseBreak: ['enemyDamage', 'defenseBreak'],
  healBurst: ['heal'],
  shieldBurst: ['shield'],
  buffFloat: [], // 由 result.type 决定，见 primaryChannelsOfCast
  hasteGlow: ['haste'],
  purifyWave: ['enemyDamage', 'purify'],
  timeExtend: ['extraTime'],
  orbConvert: ['convert'],
  enemyWarn: [],
  enemySelf: [],
  teamDebuff: [],
};

export function channelsOfEffect(effect: SkillEffectDef): PresentChannel[] {
  switch (effect.kind) {
    case 'damage':
    case 'multiHit':
    case 'gravity':
      return ['enemyDamage'];
    case 'heal':
      return ['heal'];
    case 'shield':
      return ['shield'];
    case 'convertOrbs':
      return ['convert'];
    case 'dot':
      return ['dot'];
    case 'stun':
      return ['stun'];
    case 'defenseBreak':
      return ['defenseBreak'];
    case 'haste':
      return ['haste'];
    case 'purify':
      return ['purify'];
    case 'delayEnemyAttack':
      return ['delayAttack'];
    case 'extraDragTime':
      return ['extraTime'];
    case 'guaranteedCrit':
      return ['critBoost'];
    case 'elementDamageBuff':
      return ['elementBuff'];
    case 'status':
      return effect.status === 'teamDamageBuff' ? ['dmgBoost'] : [];
    default:
      return [];
  }
}

export function channelsOfSkill(skill: SkillDef): PresentChannel[] {
  const set = new Set<PresentChannel>();
  for (const effect of skill.effects) {
    for (const ch of channelsOfEffect(effect)) set.add(ch);
  }
  return [...set];
}

export function primaryChannelsOfCast(
  kind: SkillVfxKind | undefined,
  action: string,
  vfxId?: string,
): PresentChannel[] {
  if (!kind) return [];
  // 威吓可把直伤插在第一段，action 会变成 instantDmg，必须看 vfx id
  if (vfxId === 'delayAttack' || (kind === 'buffFloat' && action === 'delayAttack')) {
    return ['delayAttack', 'enemyDamage'];
  }
  if (kind === 'buffFloat') {
    if (action === 'dmgBoost') return ['dmgBoost'];
    if (action === 'elementBuff') return ['elementBuff'];
    if (action === 'critBoost') return ['critBoost'];
    return [];
  }
  return [...(VFX_PRIMARY_CHANNELS[kind] ?? [])];
}

export function primaryChannelsOfSkill(skill: SkillDef): PresentChannel[] {
  const vfxId = resolveSkillVfx(skill);
  const kind = SKILL_VFX_MAP.get(vfxId)?.kind;
  const first = skill.effects[0];
  const action = first ? inferActionForCoverage(first) : '';
  return primaryChannelsOfCast(kind, action, vfxId);
}

/** 与 SkillEngine.inferAction 对齐的精简版，只服务覆盖审计 */
function inferActionForCoverage(effect: SkillEffectDef): string {
  switch (effect.kind) {
    case 'damage':
      return effect.source === 'teamAtk' ? 'teamAttack' : 'instantDmg';
    case 'status':
      return effect.status === 'teamDamageBuff' ? 'dmgBoost' : 'enemyShield';
    case 'heal':
      return effect.source === 'enemyMaxHp' ? 'heal' : 'healPct';
    case 'convertOrbs':
      return 'convertOrbs';
    case 'delayEnemyAttack':
      return 'delayAttack';
    case 'extraDragTime':
      return 'extraTime';
    case 'guaranteedCrit':
      return 'critBoost';
    case 'elementDamageBuff':
      return 'elementBuff';
    default:
      return effect.kind;
  }
}
