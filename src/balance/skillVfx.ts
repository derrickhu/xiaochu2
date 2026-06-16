/**
 * 技能表现配置（纯数据）
 *
 * 逻辑层只产出 vfx id；场景层读取本表决定使用哪类演出和默认文案。
 */
import type { SkillVfxId } from './skills';

export type SkillVfxKind =
  | 'projectile'
  | 'teamVolley'
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
