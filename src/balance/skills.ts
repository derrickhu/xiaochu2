/**
 * 统一技能定义表（纯数据 + 蓝图工厂，零战斗逻辑）
 *
 * 三层结构：
 * - SkillEffectDef：底层执行格式，逻辑层只实现通用 effect handler。
 * - SkillBlueprint（本文件的 makeXxx 工厂）：把“同一类技能”参数化，消除手写重复。
 *   例如所有单体直伤共用 makeNuke，只传 元素/倍率/CD/文案，不再各复制一份。
 * - SkillCategory：技能分类，用于表现兜底、UI 归类、未来推荐编队。
 *
 * 策划新增技能：优先调用现有蓝图工厂；只有全新机制才加 effect kind 与 handler。
 */
import type { Element, OrbType } from './combat';
import { ELEMENT_NAME } from './ui';

export type SkillOwner = 'pet' | 'enemy' | 'both';
export type SkillTrigger = 'manual' | 'enemyCooldown' | 'chargedRelease';
export type SkillTarget = 'enemy' | 'self' | 'team' | 'board';

/**
 * 技能分类：决定表现兜底与 UI 归类，不参与数值结算。
 */
export type SkillCategory =
  | 'nuke'        // 单体直伤
  | 'teamNuke'    // 全队齐射
  | 'multiNuke'   // 多段直伤
  | 'dot'         // 持续伤害（点燃/中毒/流血）
  | 'control'     // 控制（眩晕等）
  | 'debuff'      // 减益（破防等）
  | 'heal'        // 回复
  | 'shield'      // 护盾
  | 'buff'        // 增益（增伤等）
  | 'convert'     // 转珠
  | 'charge'      // 蓄力（敌）
  | 'enemyGuard'  // 减伤（敌）
  | 'enemyHeal';  // 自疗（敌）

export type SkillVfxId =
  | 'petProjectile'
  | 'teamVolley'
  | 'multiHit'
  | 'dotApply'
  | 'stun'
  | 'defenseBreak'
  | 'heal'
  | 'shield'
  | 'damageBoost'
  | 'convertOrbs'
  | 'enemyCharge'
  | 'enemyAttack'
  | 'enemyHeal'
  | 'enemyShield';

/** 转珠形状：random=随机若干颗，row=整行，col=整列 */
export type ConvertShape = 'random' | 'row' | 'col';

export type DamageSource = 'casterAtk' | 'teamAtk' | 'enemyAtk';

export type SkillEffectDef =
  | {
      kind: 'damage';
      source: DamageSource;
      multiplier: number;
      /** 默认取施法者属性；敌人蓄力等可不填 */
      element?: Element;
      applyDefense?: boolean;
      applyDmgBuff?: boolean;
      applyEnemyReduction?: boolean;
      applyCounter?: boolean;
    }
  | {
      kind: 'heal';
      source: 'teamMaxHp' | 'teamRcv' | 'enemyMaxHp';
      pct: number;
      /** 满血不浪费，常用于敌人自疗 */
      onlyIfDamaged?: boolean;
    }
  | {
      kind: 'shield';
      source: 'teamMaxHp';
      pct: number;
      stack: 'max' | 'add';
    }
  | {
      kind: 'status';
      status: 'teamDamageBuff' | 'enemyDamageReduction';
      mult?: number;
      reduction?: number;
      turns: number;
      stack: 'replace' | 'ignoreIfPresent';
    }
  | {
      kind: 'convertOrbs';
      to: OrbType;
      count: number;
      /** 转珠形状，缺省 random（随机 count 颗） */
      shape?: ConvertShape;
    }
  | {
      kind: 'charge';
      multiplier: number;
      releaseVfx: SkillVfxId;
    }
  | {
      kind: 'multiHit';
      source: DamageSource;
      /** 每段倍率 */
      multiplier: number;
      /** 段数 */
      hits: number;
      element?: Element;
      applyDefense?: boolean;
      applyDmgBuff?: boolean;
      applyEnemyReduction?: boolean;
    }
  | {
      kind: 'dot';
      source: DamageSource;
      /** 每回合伤害 = 来源值 × multiplier */
      multiplier: number;
      turns: number;
      element?: Element;
    }
  | {
      kind: 'stun';
      /** 眩晕回合数（敌人跳过行动） */
      turns: number;
    }
  | {
      kind: 'defenseBreak';
      /** 防御降低比例（0~1） */
      pct: number;
      turns: number;
    };

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  category: SkillCategory;
  /** 冷却回合数（释放后重置为该值） */
  cd: number;
  owner: SkillOwner;
  trigger: SkillTrigger;
  target: SkillTarget;
  /** 表现 id；不填时按 category 兜底（见 CATEGORY_DEFAULT_VFX） */
  vfx?: SkillVfxId;
  effects: readonly SkillEffectDef[];
  tags?: readonly string[];
}

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
  enemyGuard: 'enemyShield',
  enemyHeal: 'enemyHeal',
};

/** 解析技能最终使用的表现 id（显式 vfx 优先，否则按分类兜底） */
export function resolveSkillVfx(skill: SkillDef): SkillVfxId {
  return skill.vfx ?? CATEGORY_DEFAULT_VFX[skill.category];
}

export const PET_SKILL_IDS = {
  metalSlash: 'pet_metal_slash',
  transmuteMetal: 'pet_transmute_metal',
  woodHeal: 'pet_wood_heal',
  woodVolley: 'pet_wood_volley',
  waterShield: 'pet_water_shield',
  waterPierce: 'pet_water_pierce',
  fireBurst: 'pet_fire_burst',
  fireBoost: 'pet_fire_boost',
  earthShield: 'pet_earth_shield',
  earthHeartConvert: 'pet_earth_heart_convert',
  // ── 阶段八新增（展示 dot / stun / defenseBreak / multiHit / convertShape）──
  fireDot: 'pet_fire_dot',
  fireDotUr: 'pet_fire_dot_ur',
  metalDefBreak: 'pet_metal_def_break',
  metalMultiHit: 'pet_metal_multi_hit',
  waterStun: 'pet_water_stun',
  waterMultiHit: 'pet_water_multi_hit',
  woodMultiHit: 'pet_wood_multi_hit',
  woodBigHeal: 'pet_wood_big_heal',
  earthConvertRow: 'pet_earth_convert_row',
  earthHeal: 'pet_earth_heal',
} as const;

export const ENEMY_SKILL_IDS = {
  golemGuard: 'enemy_golem_guard',
  serpentHeal: 'enemy_serpent_heal',
  bladeCharge: 'enemy_blade_charge',
  lionCharge: 'enemy_lion_charge',
  pandaGuard: 'enemy_panda_guard',
  pandaHeal: 'enemy_panda_heal',
} as const;

// ──────────────────────────────────────────────────────────────
// 蓝图工厂：同类技能只描述差异参数，文案由参数生成（防止与数值漂移）
// ──────────────────────────────────────────────────────────────

const pct = (m: number): string => `${Math.round(m * 100)}%`;
const withFlavor = (flavor: string | undefined, body: string): string =>
  flavor ? `${flavor}，${body}` : body;

/** 单体直伤：自身攻击 × multiplier */
function makeNuke(p: {
  id: string; name: string; element: Element; multiplier: number; cd: number;
  flavor?: string; vfx?: SkillVfxId;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'nuke', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'enemy', vfx: p.vfx,
    tags: ['输出', '直伤'],
    desc: withFlavor(p.flavor, `对敌人造成自身攻击 ${pct(p.multiplier)} 的${ELEMENT_NAME[p.element]}属性伤害`),
    effects: [{ kind: 'damage', source: 'casterAtk', multiplier: p.multiplier, applyDefense: true, applyDmgBuff: true, applyEnemyReduction: true }],
  };
}

/** 全队齐射：队伍总攻 × multiplier */
function makeTeamNuke(p: {
  id: string; name: string; multiplier: number; cd: number; flavor?: string;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'teamNuke', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'enemy',
    tags: ['输出', '全队'],
    desc: withFlavor(p.flavor, `造成队伍总攻击 ${pct(p.multiplier)} 的伤害`),
    effects: [{ kind: 'damage', source: 'teamAtk', multiplier: p.multiplier, applyDefense: true, applyDmgBuff: true, applyEnemyReduction: true }],
  };
}

/** 队伍回复：队伍最大生命 × pct */
function makeHeal(p: {
  id: string; name: string; healPct: number; cd: number; flavor?: string;
  extraConvert?: { to: OrbType; count: number };
}): SkillDef {
  const effects: SkillEffectDef[] = [{ kind: 'heal', source: 'teamMaxHp', pct: p.healPct }];
  let desc = `回复队伍最大生命的 ${pct(p.healPct)}`;
  if (p.extraConvert) {
    effects.push({ kind: 'convertOrbs', to: p.extraConvert.to, count: p.extraConvert.count });
    desc += `，并生成 ${p.extraConvert.count} 颗心珠`;
  }
  return {
    id: p.id, name: p.name, category: 'heal', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'team',
    tags: ['治疗'],
    desc: withFlavor(p.flavor, desc),
    effects,
  };
}

/** 护盾：队伍最大生命 × pct 的吸收盾 */
function makeShield(p: {
  id: string; name: string; shieldPct: number; cd: number; flavor?: string;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'shield', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'team',
    tags: ['护盾'],
    desc: withFlavor(p.flavor, `获得队伍最大生命 ${pct(p.shieldPct)} 的护盾`),
    effects: [{ kind: 'shield', source: 'teamMaxHp', pct: p.shieldPct, stack: 'max' }],
  };
}

/** 全队增伤：turns 回合内伤害 × mult */
function makeDamageBuff(p: {
  id: string; name: string; mult: number; turns: number; cd: number; flavor?: string;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'buff', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'team',
    tags: ['增伤'],
    desc: withFlavor(p.flavor, `${p.turns} 回合内全队伤害 ×${p.mult}`),
    effects: [{ kind: 'status', status: 'teamDamageBuff', mult: p.mult, turns: p.turns, stack: 'replace' }],
  };
}

/** 转珠：随机 count 颗 / 整行 / 整列 转为目标珠 */
function makeConvert(p: {
  id: string; name: string; to: OrbType; count: number; cd: number;
  shape?: ConvertShape; flavor?: string;
}): SkillDef {
  const toName = p.to === 'heart' ? '心珠' : `${ELEMENT_NAME[p.to as Element]}珠`;
  const shape = p.shape ?? 'random';
  const where = shape === 'row' ? '一整行' : shape === 'col' ? '一整列' : `随机 ${p.count} 颗`;
  return {
    id: p.id, name: p.name, category: 'convert', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'board',
    tags: ['转珠', toName],
    desc: withFlavor(p.flavor, `将盘面${where}珠子转为${toName}`),
    effects: [{ kind: 'convertOrbs', to: p.to, count: p.count, shape }],
  };
}

/** 多段直伤：自身/队伍攻击 × multiplier，命中 hits 段 */
function makeMultiHit(p: {
  id: string; name: string; element: Element; multiplier: number; hits: number; cd: number;
  source?: DamageSource; flavor?: string;
}): SkillDef {
  const source = p.source ?? 'casterAtk';
  return {
    id: p.id, name: p.name, category: 'multiNuke', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'enemy',
    tags: ['输出', '多段'],
    desc: withFlavor(p.flavor, `对敌人造成 ${p.hits} 段、每段 ${pct(p.multiplier)} 的${ELEMENT_NAME[p.element]}属性伤害`),
    effects: [{ kind: 'multiHit', source, multiplier: p.multiplier, hits: p.hits, element: p.element, applyDefense: true, applyDmgBuff: true, applyEnemyReduction: true }],
  };
}

/** 持续伤害（点燃/中毒/流血）：turns 回合内每回合造成 来源 × multiplier */
function makeDot(p: {
  id: string; name: string; element: Element; multiplier: number; turns: number; cd: number;
  source?: DamageSource; flavor?: string;
}): SkillDef {
  const source = p.source ?? 'casterAtk';
  return {
    id: p.id, name: p.name, category: 'dot', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'enemy',
    tags: ['输出', '持续'],
    desc: withFlavor(p.flavor, `灼烧敌人，${p.turns} 回合内每回合造成 ${pct(p.multiplier)} 攻击的${ELEMENT_NAME[p.element]}伤害`),
    effects: [{ kind: 'dot', source, multiplier: p.multiplier, turns: p.turns, element: p.element }],
  };
}

/** 眩晕：turns 回合内敌人跳过行动 */
function makeStun(p: {
  id: string; name: string; turns: number; cd: number; flavor?: string;
  /** 附带直伤（可选） */
  damage?: { element: Element; multiplier: number };
}): SkillDef {
  const effects: SkillEffectDef[] = [{ kind: 'stun', turns: p.turns }];
  let desc = `眩晕敌人 ${p.turns} 回合，使其无法行动`;
  if (p.damage) {
    effects.unshift({ kind: 'damage', source: 'casterAtk', multiplier: p.damage.multiplier, element: p.damage.element, applyDefense: true, applyDmgBuff: true, applyEnemyReduction: true });
    desc = `对敌人造成自身攻击 ${pct(p.damage.multiplier)} 的${ELEMENT_NAME[p.damage.element]}伤害，并${desc}`;
  }
  return {
    id: p.id, name: p.name, category: 'control', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'enemy',
    tags: ['控制', '眩晕'],
    desc: withFlavor(p.flavor, desc),
    effects,
  };
}

/** 破防：turns 回合内降低敌人防御 pct */
function makeDefenseBreak(p: {
  id: string; name: string; pct: number; turns: number; cd: number; flavor?: string;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'debuff', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'enemy',
    tags: ['减益', '破防'],
    desc: withFlavor(p.flavor, `${p.turns} 回合内降低敌人 ${pct(p.pct)} 防御`),
    effects: [{ kind: 'defenseBreak', pct: p.pct, turns: p.turns }],
  };
}

/** 敌人减伤 */
function makeEnemyGuard(p: {
  id: string; name: string; reduction: number; turns: number; cd: number;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'enemyGuard', cd: p.cd,
    owner: 'enemy', trigger: 'enemyCooldown', target: 'self',
    tags: ['减伤'],
    desc: `获得 ${pct(p.reduction)} 减伤，持续 ${p.turns} 回合`,
    effects: [{ kind: 'status', status: 'enemyDamageReduction', reduction: p.reduction, turns: p.turns, stack: 'ignoreIfPresent' }],
  };
}

/** 敌人自疗 */
function makeEnemyHeal(p: {
  id: string; name: string; healPct: number; cd: number;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'enemyHeal', cd: p.cd,
    owner: 'enemy', trigger: 'enemyCooldown', target: 'self',
    tags: ['自疗'],
    desc: `回复自身最大生命的 ${pct(p.healPct)}`,
    effects: [{ kind: 'heal', source: 'enemyMaxHp', pct: p.healPct, onlyIfDamaged: true }],
  };
}

/** 敌人蓄力重击 */
function makeEnemyCharge(p: {
  id: string; name: string; multiplier: number; cd: number;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'charge', cd: p.cd,
    owner: 'enemy', trigger: 'enemyCooldown', target: 'self',
    tags: ['蓄力'],
    desc: `蓄力一回合，下回合造成攻击力 ${pct(p.multiplier)} 的重击`,
    effects: [{ kind: 'charge', multiplier: p.multiplier, releaseVfx: 'enemyAttack' }],
  };
}

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

  // ── 敌人技能（蓝图生成） ──
  makeEnemyGuard({ id: ENEMY_SKILL_IDS.golemGuard, name: '岩盾', reduction: 0.5, turns: 2, cd: 3 }),
  makeEnemyHeal({ id: ENEMY_SKILL_IDS.serpentHeal, name: '寒潭自愈', healPct: 0.16, cd: 3 }),
  makeEnemyCharge({ id: ENEMY_SKILL_IDS.bladeCharge, name: '蓄势斩', multiplier: 2.6, cd: 4 }),
  makeEnemyCharge({ id: ENEMY_SKILL_IDS.lionCharge, name: '烈焰蓄势', multiplier: 2.3, cd: 3 }),
  makeEnemyGuard({ id: ENEMY_SKILL_IDS.pandaGuard, name: '竹甲守势', reduction: 0.45, turns: 2, cd: 4 }),
  makeEnemyHeal({ id: ENEMY_SKILL_IDS.pandaHeal, name: '啃竹回血', healPct: 0.1, cd: 3 }),
];

export const SKILL_MAP: ReadonlyMap<string, SkillDef> = new Map(SKILLS.map((s) => [s.id, s]));

export function getSkill(skillId: string): SkillDef {
  const skill = SKILL_MAP.get(skillId);
  if (!skill) throw new Error(`未知技能: ${skillId}`);
  return skill;
}

/**
 * 技能星级分档强化：宠物星级（StarProfile.skillTier）越高，技能数值越强、CD 越短。
 * tier 1 = 基线（无加成），保证 1★ 技能数值与配置一致。
 */
export interface SkillTierBonus {
  /** 效果增幅（叠加到伤害倍率 / 回复护盾百分比） */
  effectPct: number;
  /** 冷却调整（负数缩短，最终不低于 1） */
  cdDelta: number;
}

export const SKILL_TIER_BONUS: Readonly<Record<number, SkillTierBonus>> = {
  1: { effectPct: 0, cdDelta: 0 },
  2: { effectPct: 0.1, cdDelta: 0 },
  3: { effectPct: 0.2, cdDelta: -1 },
};

export function getSkillTierBonus(tier: number): SkillTierBonus {
  return SKILL_TIER_BONUS[tier] ?? SKILL_TIER_BONUS[1];
}

/**
 * 星级质变覆写（借鉴 xiao_chu STAR3/STAR5 override）。
 *
 * 与 SKILL_TIER_BONUS 的平 % 不同：这里可对「指定技能 + 指定 skillTier」做质变，
 * 例如 ★5 大幅拉高倍率、缩短 CD 或改写文案，给升星「质变感」。
 * - 键 = 技能 id，二级键 = skillTier（2 = ★3~4，3 = ★5）。
 * - effectMult：覆盖该 tier 的效果倍率（替代 tierBonus.effectPct，乘性，1.0 = 不变）。
 * - cdDelta：在 tierBonus 基础上再调整 CD（负数缩短）。
 * - desc：质变文案（覆盖原描述）。
 * 未配置的技能按 SKILL_TIER_BONUS 平滑加成处理。
 */
export interface SkillStarOverride {
  effectMult?: number;
  cdDelta?: number;
  desc?: string;
}

export const SKILL_STAR_OVERRIDE: Readonly<Record<string, Readonly<Record<number, SkillStarOverride>>>> = {
  // 示例签名技能：★5 质变（Phase 3 扩宠时按需补充）
  [PET_SKILL_IDS.fireBurst]: {
    3: { effectMult: 1.5, cdDelta: -1, desc: '引爆燎原烈焰，对敌人造成自身攻击 1050% 的火属性伤害' },
  },
};

export function getSkillStarOverride(skillId: string, tier: number): SkillStarOverride | null {
  return SKILL_STAR_OVERRIDE[skillId]?.[tier] ?? null;
}
