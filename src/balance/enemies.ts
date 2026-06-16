/**
 * 敌人模板表（纯数据，零逻辑）
 *
 * 只存"模板基值"，具体关卡敌人数值由 formulas/growth.ts 曲线生成，
 * 调难度只改曲线参数，不逐行改表。
 */
import type { Element } from './combat';

/**
 * 怪物技能（回合 CD 制）：
 * - chargeAttack：就绪后先蓄力一回合（头顶预告），下一回合打出 atk × mult 重击
 * - healSelf：回复自身最大生命 × pct（仅在掉血后才会释放）
 * - shieldSelf：获得减伤状态，受到伤害 ×(1-reduction)，持续 turns 回合
 */
export type EnemySkillDef =
  | { type: 'chargeAttack'; cd: number; mult: number }
  | { type: 'healSelf'; cd: number; pct: number }
  | { type: 'shieldSelf'; cd: number; reduction: number; turns: number };

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
  /** 主动技能（无 = 纯普攻怪） */
  skills?: readonly EnemySkillDef[];
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
    skills: [{ type: 'shieldSelf', cd: 3, reduction: 0.5, turns: 2 }],
  },
  /** 自疗：dps 不够就被回血拖死，需要输出宠/增伤集中爆发 */
  {
    id: 'enemy_serpent_water', name: '寒潭幼蛟', element: 'water',
    baseHp: 1080, baseAtk: 165, baseDef: 22, attackInterval: 2,
    skills: [{ type: 'healSelf', cd: 3, pct: 0.16 }],
  },
  /** 蓄力重击：一击 ×2.6，需要护盾/治疗位扛住 */
  {
    id: 'enemy_blade_metal', name: '锈刃魔', element: 'metal',
    baseHp: 900, baseAtk: 150, baseDef: 28, attackInterval: 3,
    skills: [{ type: 'chargeAttack', cd: 4, mult: 2.6 }],
  },
  // ── 第一章扩展怪 ──
  /** 高攻速攻怪：没有治疗/护盾会被持续磨死 */
  { id: 'enemy_hedgehog_wood', name: '荆棘刺猬', element: 'wood', baseHp: 760, baseAtk: 175, baseDef: 10, attackInterval: 2 },
  /** 蓄力 + 高攻：蓄力一击可打掉脆队近半血，第一章后段硬墙 */
  {
    id: 'enemy_lion_fire', name: '烈焰狂狮', element: 'fire',
    baseHp: 1320, baseAtk: 185, baseDef: 16, attackInterval: 2,
    skills: [{ type: 'chargeAttack', cd: 3, mult: 2.3 }],
  },
  /** 章末 Boss：减伤 + 自疗双技能，必须克制(金) + 爆发 + 续航全到位 */
  {
    id: 'enemy_panda_boss_wood', name: '蛮竹熊猫王', element: 'wood',
    baseHp: 3600, baseAtk: 170, baseDef: 30, attackInterval: 2,
    skills: [
      { type: 'shieldSelf', cd: 4, reduction: 0.45, turns: 2 },
      { type: 'healSelf', cd: 3, pct: 0.10 },
    ],
  },
];

export const ENEMY_MAP: ReadonlyMap<string, EnemyDef> = new Map(ENEMIES.map((e) => [e.id, e]));
