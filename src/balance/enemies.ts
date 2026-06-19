/**
 * 敌人模板表（纯数据，零逻辑）
 *
 * 只存"模板基值"，具体关卡敌人数值由 formulas/growth.ts 曲线生成，
 * 调难度只改曲线参数，不逐行改表。
 */
import type { Element } from './combat';
import { ENEMY_SKILL_IDS } from './skills';

export interface EnemyDef {
  id: string;
  name: string;
  element: Element;
  /** 模板基础生命（第 1 章基准） */
  baseHp: number;
  /** 模板基础攻击 */
  baseAtk: number;
  /** 模板基础防御 */
  baseDef: number;
  /** 攻击间隔（回合） */
  attackInterval: number;
  /** 主动技能引用（无 = 纯普攻怪），具体效果在 balance/skills.ts */
  skillIds?: readonly string[];
}

/**
 * v0.3 挑战版基值（第 1 章基准）。调参由 formulas/simulation.ts 模拟器驱动：
 * 目标是中手(5C)玩家在 1-5 起需要"克制/爆发/护盾/续航"对应解法才能稳过并冲三星，
 * 乱带队伍会卡关或被技能怪拖死。
 */
export const ENEMIES: readonly EnemyDef[] = [
  // ── 普攻教学怪（1-1~1-3 仍可乱打过，建立手感）──
  { id: 'enemy_slime_wood', name: '青苔史莱姆', element: 'wood', baseHp: 620, baseAtk: 95, baseDef: 12, attackInterval: 2 },
  { id: 'enemy_bat_fire', name: '焰翼蝠', element: 'fire', baseHp: 540, baseAtk: 120, baseDef: 8, attackInterval: 2 },
  // ── 技能怪：制造编队需求 ──
  /** 高防 + 减伤：低倍率输出几乎破不了防，逼玩家带克制（木）或高倍率爆发 */
  {
    id: 'enemy_golem_earth', name: '碎岩傀儡', element: 'earth',
    baseHp: 1500, baseAtk: 120, baseDef: 70, attackInterval: 3,
    skillIds: [ENEMY_SKILL_IDS.golemGuard],
  },
  /** 自疗：dps 不够就被回血拖死，需要输出宠/增伤集中爆发 */
  {
    id: 'enemy_serpent_water', name: '寒潭幼蛟', element: 'water',
    baseHp: 1080, baseAtk: 165, baseDef: 22, attackInterval: 2,
    skillIds: [ENEMY_SKILL_IDS.serpentHeal],
  },
  /** 蓄力重击：一击 ×2.6，需要护盾/治疗位扛住 */
  {
    id: 'enemy_blade_metal', name: '锈刃魔', element: 'metal',
    baseHp: 900, baseAtk: 150, baseDef: 28, attackInterval: 3,
    skillIds: [ENEMY_SKILL_IDS.bladeCharge],
  },
  // ── 第一章扩展怪 ──
  /** 高攻速攻怪：没有治疗/护盾会被持续磨死 */
  { id: 'enemy_hedgehog_wood', name: '荆棘刺猬', element: 'wood', baseHp: 760, baseAtk: 175, baseDef: 10, attackInterval: 2 },
  /** 蓄力 + 高攻：蓄力一击可打掉脆队近半血，第一章后段硬墙 */
  {
    id: 'enemy_lion_fire', name: '烈焰狂狮', element: 'fire',
    baseHp: 1320, baseAtk: 185, baseDef: 16, attackInterval: 2,
    skillIds: [ENEMY_SKILL_IDS.lionCharge],
  },
  /** 章末 Boss：减伤 + 自疗双技能，必须克制(金) + 爆发 + 续航全到位 */
  {
    id: 'enemy_panda_boss_wood', name: '蛮竹熊猫王', element: 'wood',
    baseHp: 3600, baseAtk: 170, baseDef: 30, attackInterval: 2,
    skillIds: [ENEMY_SKILL_IDS.pandaGuard, ENEMY_SKILL_IDS.pandaHeal],
  },

  // ── 第二章 · 幽晶溶洞（复用技能组合，章节成长自动放大基值）──
  /** 晶甲蝎：高防 + 蓄力 */
  {
    id: 'enemy_scorpion_metal', name: '晶甲蝎', element: 'metal',
    baseHp: 1200, baseAtk: 150, baseDef: 55, attackInterval: 3,
    skillIds: [ENEMY_SKILL_IDS.golemGuard, ENEMY_SKILL_IDS.bladeCharge],
  },
  /** 溶洞蟾：自疗 + 高攻速 */
  {
    id: 'enemy_toad_water', name: '溶洞毒蟾', element: 'water',
    baseHp: 1100, baseAtk: 170, baseDef: 20, attackInterval: 2,
    skillIds: [ENEMY_SKILL_IDS.serpentHeal],
  },
  /** 章末 Boss：减伤 + 蓄力，封印珠盘面 */
  {
    id: 'enemy_crystal_boss_earth', name: '幽晶巨像', element: 'earth',
    baseHp: 4200, baseAtk: 180, baseDef: 60, attackInterval: 2,
    skillIds: [ENEMY_SKILL_IDS.golemGuard, ENEMY_SKILL_IDS.bladeCharge],
  },

  // ── 第三章 · 风雷绝巅 ──
  /** 雷羽鹰：连续蓄力高攻 */
  {
    id: 'enemy_eagle_fire', name: '雷羽鹰', element: 'fire',
    baseHp: 1600, baseAtk: 200, baseDef: 22, attackInterval: 2,
    skillIds: [ENEMY_SKILL_IDS.lionCharge],
  },
  /** 绝巅守卫：减伤 + 自疗 */
  {
    id: 'enemy_warden_metal', name: '绝巅守卫', element: 'metal',
    baseHp: 2200, baseAtk: 185, baseDef: 50, attackInterval: 2,
    skillIds: [ENEMY_SKILL_IDS.pandaGuard, ENEMY_SKILL_IDS.serpentHeal],
  },
  /** 章末 Boss：减伤 + 自疗 + 蓄力三技能，禁心关压力拉满 */
  {
    id: 'enemy_thunderlord_boss_wood', name: '风雷天尊', element: 'wood',
    baseHp: 5200, baseAtk: 200, baseDef: 45, attackInterval: 2,
    skillIds: [ENEMY_SKILL_IDS.pandaGuard, ENEMY_SKILL_IDS.pandaHeal, ENEMY_SKILL_IDS.lionCharge],
  },
];

export const ENEMY_MAP: ReadonlyMap<string, EnemyDef> = new Map(ENEMIES.map((e) => [e.id, e]));
