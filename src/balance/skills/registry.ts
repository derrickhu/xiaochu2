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
  makeEnemyAtkDebuff,
  makeEnemyCharge,
  makeEnemyComboGate,
  makeEnemyCounter,
  makeEnemyCounterSeal,
  makeEnemyDamageVoid,
  makeEnemyElementAbsorb,
  makeEnemyElementGate,
  makeEnemyEnrage,
  makeEnemyGuard,
  makeEnemyResolve,
  makeEnemyUndying,
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
import { makeComposite } from './composite';
import { MATRIX_SKILLS } from './petMatrix';
import { SIGNATURE_SKILLS } from './signatures';

export const SKILLS: readonly SkillDef[] = [
  // ── 宠物技能（蓝图生成，去重） ──
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

  // ── 目标十三·技能唯一化：12 个新独占技（消灭全部两两复用 + 钥匙宠改造） ──
  makePurify({ id: PET_SKILL_IDS.shadowPurify, name: '玄影净世', cd: 6, healPct: 0.15, flavor: '玄影展翼拂尘' }),
  // SSR 复合技（钥匙宠：净世斩解毒 / 加时对抗时间压缩 / 玄龟护盾）
  makeCleanseNuke({ id: PET_SKILL_IDS.goldenCleanse, name: '金羽净世', element: 'metal', multiplier: 4.5, cd: 6, flavor: '金羽拂过邪祟' }),
  makeExtraTime({ id: PET_SKILL_IDS.earthTime, name: '厚土怀抱', seconds: 3, turns: 3, cd: 6, healPct: 0.2, flavor: '大地包容万物' }),
  makeShield({ id: PET_SKILL_IDS.abyssBulwark, name: '归墟玄障', shieldPct: 0.35, cd: 7, flavor: '玄龟负甲镇归墟', extraConvert: { to: 'heart', count: 3 } }),
  makeDelayAttack({ id: PET_SKILL_IDS.abyssDelay, name: '深渊时枷', turns: 2, cd: 6, flavor: '水母漫展时之触须', damage: { element: 'water', multiplier: 3 } }),
  // SR 强化/双效果技
  makeConvert({ id: PET_SKILL_IDS.starCross, name: '星辉十字阵', to: 'wood', count: 0, shape: 'cross', cd: 7, flavor: '星辉落成十字' }),
  makeShield({ id: PET_SKILL_IDS.frostGuard, name: '霜潮护幕', shieldPct: 0.22, cd: 6, flavor: '霜潮环绕成幕', extraConvert: { to: 'heart', count: 3 } }),

  // ── v0.5 招牌技升级：核心 30 只里效果偏单薄的 SSR / UR 补足层数 ──
  // 分层目标是「SSR 双效 / UR 三效」。原先这 7 只只有 1~2 段，与量产名录的
  // SSR/UR 不对等（见 signatures.ts）。这里保留各自的主效数值，只补功能段，
  // 避免直接抬高直伤破坏 powerBudget 的 TTK 预算。
  // 例外：pet_002 / 006 / 008 / 022 四只维持单段，作为「纯粹输出型 UR」——
  // 它们的类目（multiNuke / dot / nuke）受跨稀有倒挂审计约束，加段会牵动整条阶梯。
  makeComposite({
    id: PET_SKILL_IDS.voidResonance, name: '虚空共鸣', category: 'buff', target: 'team', cd: 6,
    tags: ['属性增伤', '转珠'], flavor: '魔眼凝视深渊',
    segments: [
      { kind: 'elementBuff', element: 'water', mult: 1.5, turns: 2 },
      { kind: 'convert', to: 'water', count: 4 },
    ],
  }),
  makeComposite({
    id: PET_SKILL_IDS.fireBoost, name: '战意鼓舞', category: 'buff', target: 'team', cd: 6,
    tags: ['增伤', '转珠'], flavor: '战凰长鸣鼓舞全队',
    segments: [
      { kind: 'damageBuff', mult: 1.5, turns: 2 },
      { kind: 'convert', to: 'fire', count: 4 },
    ],
  }),
  makeComposite({
    id: PET_SKILL_IDS.earthHeartConvert, name: '大地恩泽', category: 'convert', target: 'board', cd: 6,
    tags: ['转珠', '治疗'], flavor: '大地赐福',
    segments: [
      { kind: 'convert', to: 'heart', count: 5 },
      { kind: 'heal', pct: 0.2 },
    ],
  }),
  makeComposite({
    id: PET_SKILL_IDS.thunderCrit, name: '雷纹共振', category: 'buff', target: 'team', cd: 7,
    tags: ['暴击', '增伤', '转珠'], flavor: '蝉翼雷纹共鸣',
    segments: [
      { kind: 'guaranteedCrit', turns: 2 },
      { kind: 'damageBuff', mult: 1.3, turns: 2 },
      { kind: 'convert', to: 'metal', count: 4 },
    ],
  }),
  makeComposite({
    id: PET_SKILL_IDS.chaosHaste, name: '混沌轮回', category: 'haste', target: 'team', cd: 7,
    tags: ['缩CD', '治疗', '转珠'], flavor: '逆转混沌之流',
    segments: [
      { kind: 'haste', amount: 1 },
      { kind: 'heal', pct: 0.25 },
      { kind: 'convert', to: 'heart', count: 4 },
    ],
  }),
  makeComposite({
    id: PET_SKILL_IDS.skyfallGravity, name: '天外陨灭', category: 'gravity', target: 'enemy', cd: 8,
    tags: ['重力', '伤害', '破防'], flavor: '引天外陨星',
    segments: [
      { kind: 'gravity', pct: 0.25 },
      { kind: 'damage', element: 'fire', multiplier: 4 },
      { kind: 'defenseBreak', pct: 0.4, turns: 2 },
    ],
  }),
  makeComposite({
    id: PET_SKILL_IDS.riftShield, name: '裂隙晶壁', category: 'shield', target: 'team', cd: 7,
    tags: ['护盾', '威吓', '治疗'], flavor: '晶甲展开裂隙屏障',
    segments: [
      { kind: 'shield', pct: 0.3 },
      { kind: 'delayAttack', turns: 1 },
      { kind: 'heal', pct: 0.18 },
    ],
  }),

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

  // ── 后期章节（9~16）梯度变体 ──
  // 9 只杂怪要撑 16 章，若只靠 enemyStats 放大数值，第 12 章的碎石傀儡和第 3 章手感一模一样。
  // 这里同机制换档：压力来自「同一招更狠」，玩家已学会的应对方式仍然有效，只是余量更小。
  makeEnemySealOrbs({ id: ENEMY_SKILL_IDS.sealOrbsHeavy, name: '封灵大咒', count: 6, cd: 4 }),
  makeEnemyPoison({ id: ENEMY_SKILL_IDS.poisonTeamHeavy, name: '腐骨毒渊', multiplier: 0.8, turns: 3, cd: 4 }),
  makeEnemyTimeSqueeze({ id: ENEMY_SKILL_IDS.timeSqueezeHeavy, name: '时之重枷', seconds: 6, turns: 2, cd: 4 }),
  makeEnemyHealBlock({ id: ENEMY_SKILL_IDS.healBlockHeavy, name: '绝疗诅咒', mult: 0.25, turns: 2, cd: 4 }),
  makeEnemySkillSeal({ id: ENEMY_SKILL_IDS.skillSealHeavy, name: '万灵封印', turns: 3, cd: 5 }),
  makeEnemyGuard({ id: ENEMY_SKILL_IDS.golemGuardHeavy, name: '磐岩壁垒', reduction: 0.65, turns: 3, cd: 4 }),
  makeEnemyHeal({ id: ENEMY_SKILL_IDS.serpentHealHeavy, name: '玄水复苏', healPct: 0.25, cd: 4 }),
  makeEnemyCharge({ id: ENEMY_SKILL_IDS.chargeHeavy, name: '灭世一击', multiplier: 2.8, cd: 4 }),
  makeEnemyEnrage({ id: ENEMY_SKILL_IDS.enrageHeavy, name: '狂血', atkMult: 1.8, threshold: 0.3, cd: 2 }),

  // ── 新机制：削攻（逼玩家带净化）与凝意（破控制链）──
  makeEnemyAtkDebuff({ id: ENEMY_SKILL_IDS.atkDebuff, name: '摧锋', mult: 0.6, turns: 2, cd: 4 }),
  makeEnemyAtkDebuff({ id: ENEMY_SKILL_IDS.atkDebuffHeavy, name: '断锋', mult: 0.45, turns: 2, cd: 5 }),
  makeEnemyResolve({ id: ENEMY_SKILL_IDS.resolve, name: '凝意', turns: 3, cd: 5 }),
  makeEnemyElementAbsorb({ id: ENEMY_SKILL_IDS.elementAbsorb, name: '五行吸纳', mult: 0.2, turns: 2, cd: 5 }),
  makeEnemyCounter({ id: ENEMY_SKILL_IDS.counterStrike, name: '荆棘反噬', multiplier: 0.22, turns: 3, cd: 5 }),

  // ── 硬闸门：三档梯度。轻档从第 1 章就上，让「数值不是万能」在第一小时被教到；
  // 常规/首领档随章加压。CD 均大于持续回合，保证每个闸门之间都有能自由输出的窗口。
  makeEnemyElementGate({ id: ENEMY_SKILL_IDS.elementGateLight, name: '两仪盾', need: 2, turns: 3, cd: 4 }),
  makeEnemyElementGate({ id: ENEMY_SKILL_IDS.elementGate, name: '三才阵盾', need: 3, turns: 4, cd: 5 }),
  makeEnemyElementGate({ id: ENEMY_SKILL_IDS.elementGateBoss, name: '五行大阵', need: 4, turns: 4, cd: 5 }),
  makeEnemyComboGate({ id: ENEMY_SKILL_IDS.comboGateLight, name: '缠丝结', need: 3, turns: 3, cd: 4 }),
  makeEnemyComboGate({ id: ENEMY_SKILL_IDS.comboGate, name: '连锁盾', need: 5, turns: 3, cd: 4 }),
  makeEnemyComboGate({ id: ENEMY_SKILL_IDS.comboGateBoss, name: '万缚锁链', need: 7, turns: 3, cd: 5 }),
  makeEnemyDamageVoid({ id: ENEMY_SKILL_IDS.damageVoid, name: '锋锐无效', thresholdPct: 0.12, turns: 4, cd: 5 }),
  makeEnemyUndying({ id: ENEMY_SKILL_IDS.undying, name: '不灭根性', hpThresholdPct: 0.3, cd: 1 }),
  makeEnemyCounterSeal({ id: ENEMY_SKILL_IDS.counterSeal, name: '克属封印', turns: 2, cd: 4 }),

  // ── 量产名录 pet_031~pet_100 的技能（见 creatureRoster.ts）──
  // R/SR 由「蓝图 × 属性」矩阵生成，SSR/UR 为手写复合招牌技
  ...MATRIX_SKILLS,
  ...SIGNATURE_SKILLS,
];

export const SKILL_MAP: ReadonlyMap<string, SkillDef> = new Map(SKILLS.map((s) => [s.id, s]));

export function getSkill(skillId: string): SkillDef {
  const skill = SKILL_MAP.get(skillId);
  if (!skill) throw new Error(`未知技能: ${skillId}`);
  return skill;
}
