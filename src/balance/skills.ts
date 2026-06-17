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
  | 'heal'
  | 'shield'
  | 'damageBoost'
  | 'convertOrbs'
  | 'enemyCharge'
  | 'enemyAttack'
  | 'enemyHeal'
  | 'enemyShield';

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
    }
  | {
      kind: 'charge';
      multiplier: number;
      releaseVfx: SkillVfxId;
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

/** 转珠：随机 count 颗转为目标珠 */
function makeConvert(p: {
  id: string; name: string; to: OrbType; count: number; cd: number; flavor?: string;
}): SkillDef {
  const toName = p.to === 'heart' ? '心珠' : `${ELEMENT_NAME[p.to as Element]}珠`;
  return {
    id: p.id, name: p.name, category: 'convert', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'board',
    tags: ['转珠', toName],
    desc: withFlavor(p.flavor, `将盘面随机 ${p.count} 颗珠子转为${toName}`),
    effects: [{ kind: 'convertOrbs', to: p.to, count: p.count }],
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
