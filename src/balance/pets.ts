/**
 * 灵宠数值表（纯数据，零逻辑）
 *
 * 阶段二：三维数值模型（atk / hp / rcv，对标智龙迷城）——
 * - 队伍总生命 = 英雄基础 + Σ宠物 hp（坦克宠 hp 高）
 * - 心珠回复 = 队伍总 rcv × 心珠系数（治疗宠 rcv 高）
 * - 输出宠 atk 高，三个定位天然成立，后续属性/觉醒/装备均在此挂点
 *
 * 首发 10 只（每属性 2 只：1 输出 + 1 功能位），覆盖 6 种主动技能。
 * 数值参考 xiao_chu petBase 按比例换算。
 */
import type { Element, OrbType } from './combat';

export type Rarity = 1 | 2 | 3 | 4 | 5;

export type PetRole = 'attacker' | 'healer' | 'tank' | 'support';

export const PET_ROLE_NAME: Readonly<Record<PetRole, string>> = {
  attacker: '输出',
  healer: '治疗',
  tank: '坦克',
  support: '辅助',
};

/** 主动技能（回合 CD 制，6 种类型） */
interface SkillBase {
  name: string;
  desc: string;
  /** 冷却回合数（释放后重置为该值，每个玩家回合 -1） */
  cd: number;
}

export type PetSkillDef =
  /** 直伤：自身攻击 × multiplier，无视克制 */
  | (SkillBase & { type: 'instantDmg'; multiplier: number })
  /** 回复：队伍最大生命 × pct */
  | (SkillBase & { type: 'healPct'; pct: number })
  /** 增伤：全队伤害 × mult，持续 turns 回合 */
  | (SkillBase & { type: 'dmgBoost'; mult: number; turns: number })
  /** 护盾：获得队伍最大生命 × pct 的吸收盾 */
  | (SkillBase & { type: 'shield'; pct: number })
  /** 转珠：随机 count 颗其他珠转为 to */
  | (SkillBase & { type: 'convertOrbs'; to: OrbType; count: number })
  /** 全队齐射：队伍总攻击 × multiplier 一次性输出 */
  | (SkillBase & { type: 'teamAttack'; multiplier: number });

export type PetSkillType = PetSkillDef['type'];

export interface PetDef {
  id: string;
  name: string;
  element: Element;
  rarity: Rarity;
  role: PetRole;
  /** 1 级基础攻击 + 每级成长率（复利） */
  baseAtk: number;
  atkGrowth: number;
  /** 1 级基础生命 + 每级成长率（复利） */
  baseHp: number;
  hpGrowth: number;
  /** 1 级基础回复 + 每级成长率（复利） */
  baseRcv: number;
  rcvGrowth: number;
  skill: PetSkillDef;
}

export const PETS: readonly PetDef[] = [
  // ── 金 ──
  {
    id: 'pet_metal_001',
    name: '银爪幼狸',
    element: 'metal',
    rarity: 1,
    role: 'attacker',
    baseAtk: 52, atkGrowth: 0.06,
    baseHp: 170, hpGrowth: 0.05,
    baseRcv: 10, rcvGrowth: 0.05,
    skill: {
      type: 'instantDmg', name: '银光斩', cd: 4, multiplier: 6,
      desc: '挥出银光利爪，对敌人造成自身攻击 600% 的金属性伤害',
    },
  },
  {
    id: 'pet_metal_002',
    name: '锐金鼠将',
    element: 'metal',
    rarity: 2,
    role: 'support',
    baseAtk: 40, atkGrowth: 0.055,
    baseHp: 210, hpGrowth: 0.05,
    baseRcv: 22, rcvGrowth: 0.05,
    skill: {
      type: 'convertOrbs', name: '点金术', cd: 7, to: 'metal', count: 6,
      desc: '将盘面随机 6 颗珠子点化为金珠',
    },
  },
  // ── 木 ──
  {
    id: 'pet_wood_001',
    name: '青藤小鹿',
    element: 'wood',
    rarity: 1,
    role: 'healer',
    baseAtk: 34, atkGrowth: 0.05,
    baseHp: 190, hpGrowth: 0.05,
    baseRcv: 45, rcvGrowth: 0.06,
    skill: {
      type: 'healPct', name: '青藤抚愈', cd: 5, pct: 0.3,
      desc: '青藤缠绕治愈，回复队伍最大生命的 30%',
    },
  },
  {
    id: 'pet_wood_002',
    name: '藤萝灵蛇',
    element: 'wood',
    rarity: 2,
    role: 'attacker',
    baseAtk: 50, atkGrowth: 0.06,
    baseHp: 230, hpGrowth: 0.055,
    baseRcv: 12, rcvGrowth: 0.045,
    skill: {
      type: 'teamAttack', name: '万藤齐发', cd: 7, multiplier: 1.4,
      desc: '号令全队齐射，造成队伍总攻击 140% 的伤害',
    },
  },
  // ── 水 ──
  {
    id: 'pet_water_001',
    name: '碧波灵鲤',
    element: 'water',
    rarity: 1,
    role: 'tank',
    baseAtk: 38, atkGrowth: 0.05,
    baseHp: 280, hpGrowth: 0.06,
    baseRcv: 20, rcvGrowth: 0.05,
    skill: {
      type: 'shield', name: '水幕屏障', cd: 6, pct: 0.25,
      desc: '展开水幕，获得队伍最大生命 25% 的护盾',
    },
  },
  {
    id: 'pet_water_002',
    name: '玄水蛟龙',
    element: 'water',
    rarity: 2,
    role: 'attacker',
    baseAtk: 54, atkGrowth: 0.065,
    baseHp: 180, hpGrowth: 0.05,
    baseRcv: 10, rcvGrowth: 0.045,
    skill: {
      type: 'instantDmg', name: '玄水突刺', cd: 4, multiplier: 6,
      desc: '化作水龙突刺，对敌人造成自身攻击 600% 的水属性伤害',
    },
  },
  // ── 火 ──
  {
    id: 'pet_fire_001',
    name: '赤焰雀',
    element: 'fire',
    rarity: 1,
    role: 'attacker',
    baseAtk: 56, atkGrowth: 0.06,
    baseHp: 160, hpGrowth: 0.045,
    baseRcv: 10, rcvGrowth: 0.045,
    skill: {
      type: 'instantDmg', name: '燎原爆', cd: 5, multiplier: 7,
      desc: '引燃燎原之火，对敌人造成自身攻击 700% 的火属性伤害',
    },
  },
  {
    id: 'pet_fire_002',
    name: '烈阳火凰',
    element: 'fire',
    rarity: 2,
    role: 'support',
    baseAtk: 42, atkGrowth: 0.055,
    baseHp: 200, hpGrowth: 0.05,
    baseRcv: 24, rcvGrowth: 0.05,
    skill: {
      type: 'dmgBoost', name: '战意鼓舞', cd: 6, mult: 1.5, turns: 2,
      desc: '战凰长鸣鼓舞全队，2 回合内全队伤害 ×1.5',
    },
  },
  // ── 土 ──
  {
    id: 'pet_earth_001',
    name: '岩甲幼龟',
    element: 'earth',
    rarity: 1,
    role: 'tank',
    baseAtk: 36, atkGrowth: 0.05,
    baseHp: 300, hpGrowth: 0.065,
    baseRcv: 18, rcvGrowth: 0.05,
    skill: {
      type: 'shield', name: '岩甲庇护', cd: 7, pct: 0.3,
      desc: '岩甲护体，获得队伍最大生命 30% 的护盾',
    },
  },
  {
    id: 'pet_earth_002',
    name: '大地灵鼹',
    element: 'earth',
    rarity: 2,
    role: 'support',
    baseAtk: 38, atkGrowth: 0.05,
    baseHp: 220, hpGrowth: 0.055,
    baseRcv: 30, rcvGrowth: 0.055,
    skill: {
      type: 'convertOrbs', name: '大地恩泽', cd: 6, to: 'heart', count: 5,
      desc: '大地赐福，将盘面随机 5 颗珠子化为心珠',
    },
  },
];

export const PET_MAP: ReadonlyMap<string, PetDef> = new Map(PETS.map((p) => [p.id, p]));

/**
 * 默认编队（v0.3 挑战版）：刻意只覆盖 金/木/水/火 四色（缺土），且含火系双宠。
 * - 土珠对默认队 = 无效珠，玩家进编队界面即看到"未覆盖：土"提示
 * - 逼玩家针对关卡（尤其 1-6 水怪需土克制）做编队取舍，而非一队通关
 */
export const DEFAULT_TEAM: readonly string[] = [
  'pet_fire_001',
  'pet_fire_002',
  'pet_water_001',
  'pet_wood_001',
  'pet_metal_001',
];

/** 编队槽位数 */
export const TEAM_SIZE = 5;

/** 可玩 Demo：固定队伍的等级/星级（招募养成上线后由 PlayerData 接管） */
export const DEMO_TEAM_LEVEL = 5;
export const DEMO_TEAM_STAR = 1;
