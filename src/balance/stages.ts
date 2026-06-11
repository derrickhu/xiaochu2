/**
 * 关卡表（纯数据，零逻辑）
 *
 * 只存参数：敌人引用 + 难度系数，奖励与敌人实际数值由公式层生成。
 */
import type { Element } from './combat';

export interface StageDef {
  id: string;
  chapter: number;
  index: number;
  name: string;
  /** 关卡主属性（克制软墙提示用） */
  element: Element;
  /** 敌人模板 id 列表（依次为每波） */
  enemies: string[];
  /** 关内难度递增系数（敌人曲线额外乘数） */
  difficulty: number;
  /** 是否章节 Boss 关 */
  isBoss?: boolean;
  /** 三星目标：回合数限制 */
  starTurnLimit: number;
}

export const STAGES: readonly StageDef[] = [
  { id: 'stage_1_1', chapter: 1, index: 1, name: '青苔林边', element: 'wood', enemies: ['enemy_slime_wood'], difficulty: 1.0, starTurnLimit: 10 },
  { id: 'stage_1_2', chapter: 1, index: 2, name: '林间小径', element: 'wood', enemies: ['enemy_slime_wood', 'enemy_bat_fire'], difficulty: 1.1, starTurnLimit: 12 },
  { id: 'stage_1_3', chapter: 1, index: 3, name: '焰蝠洞口', element: 'fire', enemies: ['enemy_bat_fire', 'enemy_bat_fire'], difficulty: 1.2, starTurnLimit: 12 },
  { id: 'stage_1_4', chapter: 1, index: 4, name: '碎岩谷', element: 'earth', enemies: ['enemy_golem_earth'], difficulty: 1.35, starTurnLimit: 14 },
  { id: 'stage_1_5', chapter: 1, index: 5, name: '寒潭深处', element: 'water', enemies: ['enemy_serpent_water', 'enemy_golem_earth'], difficulty: 1.5, isBoss: true, starTurnLimit: 16 },
];

export const STAGE_MAP: ReadonlyMap<string, StageDef> = new Map(STAGES.map((s) => [s.id, s]));
