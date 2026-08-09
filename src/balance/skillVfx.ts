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
  { id: 'enemyAtkDebuff', kind: 'teamDebuff', floatText: '攻击削弱' },
  { id: 'enemyResolve', kind: 'enemySelf', floatText: '凝意' },
  { id: 'enemyElementAbsorb', kind: 'enemySelf', floatText: '属性吸收' },
  { id: 'enemyCounter', kind: 'enemySelf', floatText: '反击态' },
];

export const SKILL_VFX_MAP: ReadonlyMap<SkillVfxId, SkillVfxDef> =
  new Map(SKILL_VFX.map((vfx) => [vfx.id, vfx]));

export type SkillImpactTier = 'light' | 'heavy';

/**
 * 瞬发直伤命中的「停拍 + 镜头微推」。
 *
 * 技能和平 A 走的是同一套命中反馈（闪白 + 击退 + 粒子），所以无论倍率调多高，
 * 屏幕上看到的都只是「数字大了点」。这里补上格斗游戏那套惯用手法：命中瞬间把敌人推近，
 * 停一拍再弹回。停拍是全部手感的来源——画面卡住的那几十毫秒，玩家才「感觉到」打中了。
 *
 * hold 卡得很紧：120ms 以上就会从「打击感」变成「掉帧」，而技能一场要放十几次。
 */
export const SKILL_IMPACT: Readonly<Record<SkillImpactTier, {
  /** 敌人立绘推近的倍率，代替真镜头推近（战斗根容器由震屏独占，不宜再叠变换） */
  punchScale: number;
  punchIn: number;
  /** 停拍时长 */
  hold: number;
  settle: number;
}>> = {
  light: { punchScale: 1.06, punchIn: 0.05, hold: 0.03, settle: 0.14 },
  heavy: { punchScale: 1.16, punchIn: 0.05, hold: 0.09, settle: 0.2 },
};

/** 单次伤害占敌人最大血量的比例达到多少才按重击演出 */
export const SKILL_IMPACT_HEAVY_HP_RATIO = 0.18;
