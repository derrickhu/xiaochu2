import type { SkillDef } from './types';
import { ENEMY_SKILL_IDS, PET_SKILL_IDS } from './ids';
import {
  makeCleanseNuke,
  makeConvert,
  makeDamageBuff,
  makeDefenseBreak,
  makeDelayAttack,
  makeDot,
  makeElementBuff,
  makeEnemyCharge,
  makeEnemyEnrage,
  makeEnemyGuard,
  makeEnemyHeal,
  makeEnemyHealBlock,
  makeEnemyPoison,
  makeEnemySealOrbs,
  makeEnemySkillSeal,
  makeEnemyTimeSqueeze,
  makeExtraTime,
  makeGravity,
  makeGuaranteedCrit,
  makeHaste,
  makeHeal,
  makeMultiHit,
  makeNuke,
  makePurify,
  makeShield,
  makeStun,
  makeTeamNuke,
} from './blueprints';

export const SKILLS: readonly SkillDef[] = [
  // ── 宠物技能（蓝图生成，去重） ──
  makeNuke({ id: PET_SKILL_IDS.metalSlash, name: '银光斩', element: 'metal', multiplier: 6, cd: 4, flavor: '挥出银光利爪' }),
  makeConvert({ id: PET_SKILL_IDS.transmuteMetal, name: '点金术', to: 'metal', count: 6, cd: 7 }),
  makeHeal({ id: PET_SKILL_IDS.woodHeal, name: '青藤抚愈', healPct: 0.3, cd: 5, flavor: '青藤缠绕治愈' }),
  makeTeamNuke({ id: PET_SKILL_IDS.woodVolley, name: '万藤齐发', multiplier: 1.4, cd: 7, flavor: '号令全队齐射' }),
  makeShield({ id: PET_SKILL_IDS.waterShield, name: '水幕屏障', shieldPct: 0.25, cd: 6, flavor: '展开水幕' }),
  makeNuke({ id: PET_SKILL_IDS.waterPierce, name: '玄水突刺', element: 'water', multiplier: 6, cd: 4, flavor: '化作水龙突刺' }),
  makeNuke({ id: PET_SKILL_IDS.fireBurst, name: '燎原爆', element: 'fire', multiplier: 7, cd: 5, flavor: '引燃燎原之火' }),
  makeDamageBuff({ id: PET_SKILL_IDS.fireBoost, name: '战意鼓舞', mult: 1.5, turns: 2, cd: 6, flavor: '战凰长鸣鼓舞全队' }),
  makeShield({ id: PET_SKILL_IDS.earthShield, name: '岩甲庇护', shieldPct: 0.3, cd: 7, flavor: '岩甲护体' }),
  makeConvert({ id: PET_SKILL_IDS.earthHeartConvert, name: '大地恩泽', to: 'heart', count: 5, cd: 6, flavor: '大地赐福' }),

  // ── 阶段八新增宠物技能（展示新效果，全部蓝图生成）──
  makeDot({ id: PET_SKILL_IDS.fireDot, name: '业火灼烧', element: 'fire', multiplier: 1.8, turns: 3, cd: 5, flavor: '喷吐业火' }),
  makeDot({ id: PET_SKILL_IDS.fireDotUr, name: '焚天烈焰', element: 'fire', multiplier: 3.0, turns: 4, cd: 6, flavor: '焚尽苍穹' }),
  makeDefenseBreak({ id: PET_SKILL_IDS.metalDefBreak, name: '裂甲冲撞', pct: 0.4, turns: 3, cd: 5, flavor: '以角破甲' }),
  makeMultiHit({ id: PET_SKILL_IDS.metalMultiHit, name: '剑舞乱斩', element: 'metal', multiplier: 3, hits: 4, cd: 6, flavor: '剑光纷舞' }),
  makeStun({ id: PET_SKILL_IDS.waterStun, name: '冰封锁影', turns: 1, cd: 6, flavor: '寒霜封形', damage: { element: 'water', multiplier: 4 } }),
  makeMultiHit({ id: PET_SKILL_IDS.waterMultiHit, name: '玄冰万箭', element: 'water', multiplier: 3.5, hits: 5, cd: 7, flavor: '召玄冰之箭' }),
  makeMultiHit({ id: PET_SKILL_IDS.woodMultiHit, name: '青藤连弩', element: 'wood', multiplier: 2.2, hits: 3, cd: 5, flavor: '藤箭连发' }),
  makeHeal({ id: PET_SKILL_IDS.woodBigHeal, name: '灵木回春', healPct: 0.4, cd: 6, flavor: '灵木之力涌动' }),
  makeConvert({ id: PET_SKILL_IDS.earthConvertRow, name: '裂地成行', to: 'earth', count: 0, shape: 'row', cd: 6, flavor: '震开大地' }),
  makeHeal({ id: PET_SKILL_IDS.earthHeal, name: '厚土庇佑', healPct: 0.35, cd: 6, flavor: '厚土滋养', extraConvert: { to: 'heart', count: 4 } }),

  // ── 目标十三·技能唯一化：12 个新独占技（消灭全部两两复用 + 钥匙宠改造） ──
  // UR 机制型招牌技
  makeGuaranteedCrit({ id: PET_SKILL_IDS.thunderCrit, name: '雷纹共振', turns: 2, cd: 7, flavor: '蝉翼雷纹共鸣' }),
  makePurify({ id: PET_SKILL_IDS.shadowPurify, name: '玄影净世', cd: 6, healPct: 0.15, flavor: '玄影展翼拂尘' }),
  makeHaste({ id: PET_SKILL_IDS.chaosHaste, name: '混沌轮回', amount: 1, healPct: 0.25, cd: 7, flavor: '逆转混沌之流' }),
  makeElementBuff({ id: PET_SKILL_IDS.voidResonance, name: '虚空共鸣', element: 'water', mult: 1.5, turns: 2, cd: 6, flavor: '魔眼凝视深渊' }),
  makeGravity({ id: PET_SKILL_IDS.skyfallGravity, name: '天外陨灭', pct: 0.25, cd: 8, flavor: '引天外陨星', damage: { element: 'fire', multiplier: 4 } }),
  makeShield({ id: PET_SKILL_IDS.riftShield, name: '裂隙晶壁', shieldPct: 0.3, cd: 7, flavor: '晶甲展开裂隙屏障', delayAttack: 1 }),
  // SSR 复合技（钥匙宠：净世斩解毒 / 加时对抗时间压缩 / 玄龟护盾）
  makeCleanseNuke({ id: PET_SKILL_IDS.goldenCleanse, name: '金羽净世', element: 'metal', multiplier: 4.5, cd: 6, flavor: '金羽拂过邪祟' }),
  makeExtraTime({ id: PET_SKILL_IDS.earthTime, name: '厚土怀抱', seconds: 3, turns: 3, cd: 6, healPct: 0.2, flavor: '大地包容万物' }),
  makeShield({ id: PET_SKILL_IDS.abyssBulwark, name: '归墟玄障', shieldPct: 0.35, cd: 7, flavor: '玄龟负甲镇归墟', extraConvert: { to: 'heart', count: 3 } }),
  makeDelayAttack({ id: PET_SKILL_IDS.abyssDelay, name: '深渊时枷', turns: 2, cd: 6, flavor: '水母漫展时之触须', damage: { element: 'water', multiplier: 3 } }),
  // SR 强化/双效果技
  makeConvert({ id: PET_SKILL_IDS.starCross, name: '星辉十字阵', to: 'wood', count: 0, shape: 'cross', cd: 7, flavor: '星辉落成十字' }),
  makeShield({ id: PET_SKILL_IDS.frostGuard, name: '霜潮护幕', shieldPct: 0.22, cd: 6, flavor: '霜潮环绕成幕', extraConvert: { to: 'heart', count: 3 } }),

  // ── 敌人技能（蓝图生成） ──
  makeEnemyGuard({ id: ENEMY_SKILL_IDS.golemGuard, name: '岩盾', reduction: 0.5, turns: 2, cd: 3 }),
  makeEnemyHeal({ id: ENEMY_SKILL_IDS.serpentHeal, name: '寒潭自愈', healPct: 0.16, cd: 3 }),
  makeEnemyCharge({ id: ENEMY_SKILL_IDS.bladeCharge, name: '蓄势斩', multiplier: 2.6, cd: 4 }),
  makeEnemyCharge({ id: ENEMY_SKILL_IDS.lionCharge, name: '烈焰蓄势', multiplier: 2.3, cd: 3 }),
  makeEnemyGuard({ id: ENEMY_SKILL_IDS.pandaGuard, name: '竹甲守势', reduction: 0.45, turns: 2, cd: 4 }),
  makeEnemyHeal({ id: ENEMY_SKILL_IDS.pandaHeal, name: '啃竹回血', healPct: 0.1, cd: 3 }),

  // ── 目标十三·新敌人技能池（章节机制载体，见 stageMechanics 逐章解锁） ──
  makeEnemySealOrbs({ id: ENEMY_SKILL_IDS.sealOrbs, name: '封灵咒', count: 4, cd: 4 }),
  makeEnemyPoison({ id: ENEMY_SKILL_IDS.poisonTeam, name: '蚀骨毒雾', multiplier: 0.5, turns: 3, cd: 4 }),
  makeEnemyTimeSqueeze({ id: ENEMY_SKILL_IDS.timeSqueeze, name: '时之枷锁', seconds: 4, turns: 2, cd: 4 }),
  makeEnemyHealBlock({ id: ENEMY_SKILL_IDS.healBlock, name: '禁疗诅咒', mult: 0.5, turns: 2, cd: 4 }),
  makeEnemyEnrage({ id: ENEMY_SKILL_IDS.enrage, name: '血怒', atkMult: 1.5, threshold: 0.35, cd: 2 }),
  makeEnemySkillSeal({ id: ENEMY_SKILL_IDS.skillSeal, name: '封灵印', turns: 2, cd: 5 }),
];

export const SKILL_MAP: ReadonlyMap<string, SkillDef> = new Map(SKILLS.map((s) => [s.id, s]));

export function getSkill(skillId: string): SkillDef {
  const skill = SKILL_MAP.get(skillId);
  if (!skill) throw new Error(`未知技能: ${skillId}`);
  return skill;
}
