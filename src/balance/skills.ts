/**
 * 统一技能定义表（纯数据，零逻辑）
 *
 * 宠物与敌人共用同一套 SkillDef / SkillEffectDef：
 * - 策划新增技能优先改本文件
 * - 逻辑层只实现通用 effect handler
 * - 表现层通过 vfx id 选择演出，不反向依赖技能逻辑
 */
import type { Element, OrbType } from './combat';

export type SkillOwner = 'pet' | 'enemy' | 'both';
export type SkillTrigger = 'manual' | 'enemyCooldown' | 'chargedRelease';
export type SkillTarget = 'enemy' | 'self' | 'team' | 'board';

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
  /** 冷却回合数（释放后重置为该值） */
  cd: number;
  owner: SkillOwner;
  trigger: SkillTrigger;
  target: SkillTarget;
  vfx: SkillVfxId;
  effects: readonly SkillEffectDef[];
  tags?: readonly string[];
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

export const SKILLS: readonly SkillDef[] = [
  {
    id: PET_SKILL_IDS.metalSlash,
    name: '银光斩',
    cd: 4,
    owner: 'pet',
    trigger: 'manual',
    target: 'enemy',
    vfx: 'petProjectile',
    tags: ['输出', '直伤'],
    desc: '挥出银光利爪，对敌人造成自身攻击 600% 的金属性伤害',
    effects: [{ kind: 'damage', source: 'casterAtk', multiplier: 6, applyDefense: true, applyDmgBuff: true, applyEnemyReduction: true }],
  },
  {
    id: PET_SKILL_IDS.transmuteMetal,
    name: '点金术',
    cd: 7,
    owner: 'pet',
    trigger: 'manual',
    target: 'board',
    vfx: 'convertOrbs',
    tags: ['转珠', '金珠'],
    desc: '将盘面随机 6 颗珠子点化为金珠',
    effects: [{ kind: 'convertOrbs', to: 'metal', count: 6 }],
  },
  {
    id: PET_SKILL_IDS.woodHeal,
    name: '青藤抚愈',
    cd: 5,
    owner: 'pet',
    trigger: 'manual',
    target: 'team',
    vfx: 'heal',
    tags: ['治疗'],
    desc: '青藤缠绕治愈，回复队伍最大生命的 30%',
    effects: [{ kind: 'heal', source: 'teamMaxHp', pct: 0.3 }],
  },
  {
    id: PET_SKILL_IDS.woodVolley,
    name: '万藤齐发',
    cd: 7,
    owner: 'pet',
    trigger: 'manual',
    target: 'enemy',
    vfx: 'teamVolley',
    tags: ['输出', '全队'],
    desc: '号令全队齐射，造成队伍总攻击 140% 的伤害',
    effects: [{ kind: 'damage', source: 'teamAtk', multiplier: 1.4, applyDefense: true, applyDmgBuff: true, applyEnemyReduction: true }],
  },
  {
    id: PET_SKILL_IDS.waterShield,
    name: '水幕屏障',
    cd: 6,
    owner: 'pet',
    trigger: 'manual',
    target: 'team',
    vfx: 'shield',
    tags: ['护盾'],
    desc: '展开水幕，获得队伍最大生命 25% 的护盾',
    effects: [{ kind: 'shield', source: 'teamMaxHp', pct: 0.25, stack: 'max' }],
  },
  {
    id: PET_SKILL_IDS.waterPierce,
    name: '玄水突刺',
    cd: 4,
    owner: 'pet',
    trigger: 'manual',
    target: 'enemy',
    vfx: 'petProjectile',
    tags: ['输出', '直伤'],
    desc: '化作水龙突刺，对敌人造成自身攻击 600% 的水属性伤害',
    effects: [{ kind: 'damage', source: 'casterAtk', multiplier: 6, applyDefense: true, applyDmgBuff: true, applyEnemyReduction: true }],
  },
  {
    id: PET_SKILL_IDS.fireBurst,
    name: '燎原爆',
    cd: 5,
    owner: 'pet',
    trigger: 'manual',
    target: 'enemy',
    vfx: 'petProjectile',
    tags: ['输出', '直伤'],
    desc: '引燃燎原之火，对敌人造成自身攻击 700% 的火属性伤害',
    effects: [{ kind: 'damage', source: 'casterAtk', multiplier: 7, applyDefense: true, applyDmgBuff: true, applyEnemyReduction: true }],
  },
  {
    id: PET_SKILL_IDS.fireBoost,
    name: '战意鼓舞',
    cd: 6,
    owner: 'pet',
    trigger: 'manual',
    target: 'team',
    vfx: 'damageBoost',
    tags: ['增伤'],
    desc: '战凰长鸣鼓舞全队，2 回合内全队伤害 ×1.5',
    effects: [{ kind: 'status', status: 'teamDamageBuff', mult: 1.5, turns: 2, stack: 'replace' }],
  },
  {
    id: PET_SKILL_IDS.earthShield,
    name: '岩甲庇护',
    cd: 7,
    owner: 'pet',
    trigger: 'manual',
    target: 'team',
    vfx: 'shield',
    tags: ['护盾'],
    desc: '岩甲护体，获得队伍最大生命 30% 的护盾',
    effects: [{ kind: 'shield', source: 'teamMaxHp', pct: 0.3, stack: 'max' }],
  },
  {
    id: PET_SKILL_IDS.earthHeartConvert,
    name: '大地恩泽',
    cd: 6,
    owner: 'pet',
    trigger: 'manual',
    target: 'board',
    vfx: 'convertOrbs',
    tags: ['转珠', '心珠'],
    desc: '大地赐福，将盘面随机 5 颗珠子化为心珠',
    effects: [{ kind: 'convertOrbs', to: 'heart', count: 5 }],
  },
  {
    id: ENEMY_SKILL_IDS.golemGuard,
    name: '岩盾',
    cd: 3,
    owner: 'enemy',
    trigger: 'enemyCooldown',
    target: 'self',
    vfx: 'enemyShield',
    tags: ['减伤'],
    desc: '获得 50% 减伤，持续 2 回合',
    effects: [{ kind: 'status', status: 'enemyDamageReduction', reduction: 0.5, turns: 2, stack: 'ignoreIfPresent' }],
  },
  {
    id: ENEMY_SKILL_IDS.serpentHeal,
    name: '寒潭自愈',
    cd: 3,
    owner: 'enemy',
    trigger: 'enemyCooldown',
    target: 'self',
    vfx: 'enemyHeal',
    tags: ['自疗'],
    desc: '回复自身最大生命的 16%',
    effects: [{ kind: 'heal', source: 'enemyMaxHp', pct: 0.16, onlyIfDamaged: true }],
  },
  {
    id: ENEMY_SKILL_IDS.bladeCharge,
    name: '蓄势斩',
    cd: 4,
    owner: 'enemy',
    trigger: 'enemyCooldown',
    target: 'self',
    vfx: 'enemyCharge',
    tags: ['蓄力'],
    desc: '蓄力一回合，下回合造成攻击力 260% 的重击',
    effects: [{ kind: 'charge', multiplier: 2.6, releaseVfx: 'enemyAttack' }],
  },
  {
    id: ENEMY_SKILL_IDS.lionCharge,
    name: '烈焰蓄势',
    cd: 3,
    owner: 'enemy',
    trigger: 'enemyCooldown',
    target: 'self',
    vfx: 'enemyCharge',
    tags: ['蓄力'],
    desc: '蓄力一回合，下回合造成攻击力 230% 的重击',
    effects: [{ kind: 'charge', multiplier: 2.3, releaseVfx: 'enemyAttack' }],
  },
  {
    id: ENEMY_SKILL_IDS.pandaGuard,
    name: '竹甲守势',
    cd: 4,
    owner: 'enemy',
    trigger: 'enemyCooldown',
    target: 'self',
    vfx: 'enemyShield',
    tags: ['减伤'],
    desc: '获得 45% 减伤，持续 2 回合',
    effects: [{ kind: 'status', status: 'enemyDamageReduction', reduction: 0.45, turns: 2, stack: 'ignoreIfPresent' }],
  },
  {
    id: ENEMY_SKILL_IDS.pandaHeal,
    name: '啃竹回血',
    cd: 3,
    owner: 'enemy',
    trigger: 'enemyCooldown',
    target: 'self',
    vfx: 'enemyHeal',
    tags: ['自疗'],
    desc: '回复自身最大生命的 10%',
    effects: [{ kind: 'heal', source: 'enemyMaxHp', pct: 0.1, onlyIfDamaged: true }],
  },
];

export const SKILL_MAP: ReadonlyMap<string, SkillDef> = new Map(SKILLS.map((s) => [s.id, s]));

export function getSkill(skillId: string): SkillDef {
  const skill = SKILL_MAP.get(skillId);
  if (!skill) throw new Error(`未知技能: ${skillId}`);
  return skill;
}
