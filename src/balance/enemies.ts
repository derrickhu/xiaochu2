/**
 * 敌人模板表（纯数据，零逻辑）
 *
 * 只存"模板基值"，具体关卡敌人数值由 formulas/growth.ts 曲线生成，
 * 调难度只改曲线参数，不逐行改表。
 */
import type { Element } from './combat';

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
}

export const ENEMIES: readonly EnemyDef[] = [
  { id: 'enemy_slime_wood', name: '青苔史莱姆', element: 'wood', baseHp: 300, baseAtk: 60, baseDef: 10, attackInterval: 2 },
  { id: 'enemy_bat_fire', name: '焰翼蝠', element: 'fire', baseHp: 240, baseAtk: 80, baseDef: 5, attackInterval: 2 },
  { id: 'enemy_golem_earth', name: '碎岩傀儡', element: 'earth', baseHp: 520, baseAtk: 50, baseDef: 30, attackInterval: 3 },
  { id: 'enemy_serpent_water', name: '寒潭幼蛟', element: 'water', baseHp: 360, baseAtk: 70, baseDef: 15, attackInterval: 2 },
  { id: 'enemy_blade_metal', name: '锈刃魔', element: 'metal', baseHp: 320, baseAtk: 90, baseDef: 20, attackInterval: 3 },
];

export const ENEMY_MAP: ReadonlyMap<string, EnemyDef> = new Map(ENEMIES.map((e) => [e.id, e]));
