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
  | 'enemySelf'
  // ── 目标十三新增 ──
  | 'gravityCrush'
  | 'hasteGlow'
  | 'purifyWave'
  | 'timeExtend'
  | 'teamDebuff';

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
  // ── 目标十三新增（宠物侧） ──
  { id: 'gravity', kind: 'gravityCrush', flashAlpha: 0.5, flashDuration: 0.3, floatText: '重压' },
  { id: 'haste', kind: 'hasteGlow', flashAlpha: 0.28, flashDuration: 0.22, floatText: '连携' },
  { id: 'purify', kind: 'purifyWave', flashAlpha: 0.35, flashDuration: 0.28, floatText: '净化' },
  { id: 'extraTime', kind: 'timeExtend', flashAlpha: 0.25, flashDuration: 0.2, floatText: '时间延长' },
  { id: 'critBoost', kind: 'buffFloat', flashAlpha: 0.25, flashDuration: 0.2, floatText: '必暴击' },
  { id: 'elementBuff', kind: 'buffFloat', flashAlpha: 0.25, flashDuration: 0.2, floatText: '属性强化' },
  { id: 'delayAttack', kind: 'buffFloat', flashAlpha: 0.25, flashDuration: 0.2, floatText: '威吓' },
  // ── 敌人侧 ──
  { id: 'enemyCharge', kind: 'enemyWarn', floatText: '蓄力中' },
  { id: 'enemyAttack', kind: 'projectile', projectileFrom: 'enemy' },
  { id: 'enemyHeal', kind: 'enemySelf', floatText: '回复' },
  { id: 'enemyShield', kind: 'enemySelf', floatText: '减伤' },
  // ── 目标十三新增（敌人对我方 debuff） ──
  { id: 'enemySeal', kind: 'teamDebuff', floatText: '封珠' },
  { id: 'enemyPoison', kind: 'teamDebuff', floatText: '中毒' },
  { id: 'enemySqueeze', kind: 'teamDebuff', floatText: '时间压缩' },
  { id: 'enemyHealBlock', kind: 'teamDebuff', floatText: '禁疗' },
  { id: 'enemyEnrage', kind: 'enemyWarn', floatText: '狂暴' },
  { id: 'enemySkillSeal', kind: 'teamDebuff', floatText: '技能封印' },
];

export const SKILL_VFX_MAP: ReadonlyMap<SkillVfxId, SkillVfxDef> =
  new Map(SKILL_VFX.map((vfx) => [vfx.id, vfx]));
