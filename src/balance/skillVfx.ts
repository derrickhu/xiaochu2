/**
 * 技能表现配置（纯数据）
 *
 * 逻辑层只产出 vfx id；场景层读取本表决定使用哪类演出和默认文案。
 */
import type { SkillVfxId } from './skills';

export type SkillVfxKind =
  | 'projectile'
  | 'teamVolley'
  | 'multiHit'
  | 'dotApply'
  | 'stun'
  | 'defenseBreak'
  | 'healBurst'
  | 'shieldBurst'
  | 'buffFloat'
  | 'orbConvert'
  | 'enemyWarn'
  | 'enemySelf';

export interface SkillVfxDef {
  id: SkillVfxId;
  kind: SkillVfxKind;
  flashAlpha?: number;
  flashDuration?: number;
  projectileFrom?: 'caster' | 'team' | 'enemy';
  floatText?: string;
}

export const SKILL_VFX: readonly SkillVfxDef[] = [
  { id: 'petProjectile', kind: 'projectile', projectileFrom: 'caster', flashAlpha: 0.4, flashDuration: 0.25 },
  { id: 'teamVolley', kind: 'teamVolley', projectileFrom: 'team', flashAlpha: 0.4, flashDuration: 0.25 },
  { id: 'multiHit', kind: 'multiHit', projectileFrom: 'caster', flashAlpha: 0.4, flashDuration: 0.22 },
  { id: 'dotApply', kind: 'dotApply', projectileFrom: 'caster', flashAlpha: 0.35, flashDuration: 0.22, floatText: '灼烧' },
  { id: 'stun', kind: 'stun', flashAlpha: 0.3, flashDuration: 0.2, floatText: '眩晕' },
  { id: 'defenseBreak', kind: 'defenseBreak', flashAlpha: 0.3, flashDuration: 0.2, floatText: '破防' },
  { id: 'heal', kind: 'healBurst', flashAlpha: 0.25, flashDuration: 0.2 },
  { id: 'shield', kind: 'shieldBurst', flashAlpha: 0.25, flashDuration: 0.2 },
  { id: 'damageBoost', kind: 'buffFloat', flashAlpha: 0.22, flashDuration: 0.2 },
  { id: 'convertOrbs', kind: 'orbConvert', flashAlpha: 0.22, flashDuration: 0.18 },
  { id: 'enemyCharge', kind: 'enemyWarn', floatText: '蓄力中' },
  { id: 'enemyAttack', kind: 'projectile', projectileFrom: 'enemy' },
  { id: 'enemyHeal', kind: 'enemySelf', floatText: '回复' },
  { id: 'enemyShield', kind: 'enemySelf', floatText: '减伤' },
];

export const SKILL_VFX_MAP: ReadonlyMap<SkillVfxId, SkillVfxDef> =
  new Map(SKILL_VFX.map((vfx) => [vfx.id, vfx]));
