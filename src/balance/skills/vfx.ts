import type { SkillCategory, SkillDef, SkillVfxId } from './types';

/** 分类 → 默认表现，技能不显式指定 vfx 时兜底 */
export const CATEGORY_DEFAULT_VFX: Readonly<Record<SkillCategory, SkillVfxId>> = {
  nuke: 'petProjectile',
  teamNuke: 'teamVolley',
  multiNuke: 'multiHit',
  dot: 'dotApply',
  control: 'stun',
  debuff: 'defenseBreak',
  heal: 'heal',
  shield: 'shield',
  buff: 'damageBoost',
  convert: 'convertOrbs',
  charge: 'enemyCharge',
  gravity: 'gravity',
  haste: 'haste',
  purify: 'purify',
  utility: 'extraTime',
  enemyGuard: 'enemyShield',
  enemyHeal: 'enemyHeal',
  enemyDebuff: 'enemySeal',
};

/** 解析技能最终使用的表现 id（显式 vfx 优先，否则按分类兜底） */
export function resolveSkillVfx(skill: SkillDef): SkillVfxId {
  return skill.vfx ?? CATEGORY_DEFAULT_VFX[skill.category];
}
