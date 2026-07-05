/**
 * 敌人战斗模板（纯数据 + 解析，零战斗逻辑）
 *
 * 阶段九拆成两类，统一为 EnemyDef 战斗模板供 formulas/growth.ts enemyStats 缩放：
 * - MobDef「杂怪」：单图、低数值、不可收服，关卡循环复用以省美术（核心 6 + 章 Boss 魔物 3）。
 * - CreatureDef 的怪物面（tier1 初级 / tier2 高级）：可收服生物，击败高级形态进收录池。
 *
 * 关卡通过 EncounterRef 引用二者；resolveEncounter() 把引用解析成 EnemyDef + 收录元信息。
 */
import type { Element } from './combat';
import { ENEMY_SKILL_IDS, SKILL_MAP } from './skills';
import { CREATURE_MAP } from './creatures';
import { creatureUsesCrSubpackage } from './creatureIdMigration';
import { SUBPACKAGE_ROOT } from '@/config/Subpackages';

function creatureEnemyRoot(creatureId: string): string {
  const pkg = creatureUsesCrSubpackage(creatureId)
    ? SUBPACKAGE_ROOT.enemyCr
    : SUBPACKAGE_ROOT.enemy;
  return `${pkg}/images/enemy`;
}

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
  /** 立绘路径覆盖（生物怪物面用觉醒/初级全身图）；缺省由 enemyImage(id) 兜底 */
  image?: string;
  /** 来源生物 id（仅生物怪物面有），用于战斗胜利后的收录判定 */
  creatureId?: string;
  /** 怪物形态（仅生物怪物面有） */
  tier?: 'tier1' | 'tier2';
}

/** 杂怪 = EnemyDef 的语义别名（不可收服、单图、低数值） */
export type MobDef = EnemyDef;

/**
 * v0.3 挑战版杂怪基值（第 1 章基准）。调参由 formulas/simulation.ts 模拟器驱动。
 * 核心 6 种在全章节循环复用；3 种章 Boss 魔物作收录关铺垫波。
 */
export const MOBS: readonly MobDef[] = [
  // ── 核心循环杂兵（6） ──
  { id: 'enemy_slime_wood', name: '青苔史莱姆', element: 'wood', baseHp: 620, baseAtk: 95, baseDef: 12, attackInterval: 2 },
  { id: 'enemy_bat_fire', name: '焰翼蝠', element: 'fire', baseHp: 540, baseAtk: 120, baseDef: 8, attackInterval: 2 },
  {
    id: 'enemy_golem_earth', name: '碎岩傀儡', element: 'earth',
    baseHp: 1500, baseAtk: 120, baseDef: 70, attackInterval: 3,
    skillIds: [ENEMY_SKILL_IDS.golemGuard],
  },
  {
    id: 'enemy_serpent_water', name: '寒潭幼蛟', element: 'water',
    baseHp: 1080, baseAtk: 165, baseDef: 22, attackInterval: 2,
    skillIds: [ENEMY_SKILL_IDS.serpentHeal],
  },
  {
    id: 'enemy_scorpion_metal', name: '晶甲蝎', element: 'metal',
    baseHp: 1200, baseAtk: 150, baseDef: 55, attackInterval: 3,
    skillIds: [ENEMY_SKILL_IDS.golemGuard, ENEMY_SKILL_IDS.lionCharge],
  },
  {
    id: 'enemy_toad_water', name: '溶洞毒蟾', element: 'water',
    baseHp: 1100, baseAtk: 170, baseDef: 20, attackInterval: 2,
    skillIds: [ENEMY_SKILL_IDS.serpentHeal],
  },
  // ── 章 Boss 魔物铺垫（3，非灵宠造型） ──
  // 基值按 powerBudget.ts 预算护栏校准：Boss 首波 ≤ 前关最大单波 × 2.5，
  // 消灭旧版（3600/4200/5200）造成的章末 5~11 倍 HP 断崖。
  {
    id: 'enemy_bamboo_tyrant_wood', name: '蛮竹魔将', element: 'wood',
    baseHp: 1200, baseAtk: 150, baseDef: 30, attackInterval: 2,
    skillIds: [ENEMY_SKILL_IDS.pandaGuard, ENEMY_SKILL_IDS.pandaHeal],
  },
  {
    // HP 收敛后由攻压承担「养成门槛」：欠养成队伍被续航检定淘汰，而非磨血墙
    id: 'enemy_crystal_boss_earth', name: '幽晶巨像', element: 'earth',
    baseHp: 1250, baseAtk: 200, baseDef: 60, attackInterval: 2,
    skillIds: [ENEMY_SKILL_IDS.golemGuard, ENEMY_SKILL_IDS.lionCharge],
  },
  {
    id: 'enemy_thunderlord_boss_wood', name: '风雷天尊', element: 'wood',
    baseHp: 1300, baseAtk: 280, baseDef: 45, attackInterval: 2,
    skillIds: [ENEMY_SKILL_IDS.pandaGuard, ENEMY_SKILL_IDS.pandaHeal, ENEMY_SKILL_IDS.lionCharge],
  },
];

export const MOB_MAP: ReadonlyMap<string, MobDef> = new Map(MOBS.map((m) => [m.id, m]));

// 历史兼容别名：旧代码以 ENEMIES/ENEMY_MAP 指代杂怪表
export const ENEMIES = MOBS;
export const ENEMY_MAP = MOB_MAP;

/** 关卡遭遇引用：杂怪 或 生物（指定形态、可标记为收录点） */
export type EncounterRef =
  | { kind: 'mob'; id: string }
  | { kind: 'creature'; id: string; tier: 'tier1' | 'tier2'; captureUnlock?: boolean };

/** 解析后的一波敌人：战斗模板 + 收录元信息 */
export interface ResolvedEncounter {
  def: EnemyDef;
  /** 击败后可收录的生物 id（仅 captureUnlock 的高级怪） */
  captureCreatureId?: string;
}

const TIER_SUFFIX: Record<'tier1' | 'tier2', string> = { tier1: '·初', tier2: '·觉' };

/** 由生物怪物面构造一个战斗模板 EnemyDef */
export function creatureMonsterDef(creatureId: string, tier: 'tier1' | 'tier2'): EnemyDef {
  const c = CREATURE_MAP.get(creatureId);
  if (!c) throw new Error(`未知生物: ${creatureId}`);
  const t = c.monster[tier];
  const enemyRoot = creatureEnemyRoot(creatureId);
  const image = tier === 'tier2'
    ? `${enemyRoot}/${creatureId}_awakened.png`
    : `${enemyRoot}/${creatureId}.png`;
  return {
    id: `${creatureId}#${tier}`,
    name: t.name ?? `${c.name}${TIER_SUFFIX[tier]}`,
    element: c.element,
    baseHp: t.baseHp,
    baseAtk: t.baseAtk,
    baseDef: t.baseDef,
    attackInterval: t.attackInterval,
    skillIds: t.skillIds,
    image,
    creatureId,
    tier,
  };
}

/** 编队/选关预览用：一行描述敌人行动模式与技能 */
export function formatEnemyAbility(def: EnemyDef): string {
  const interval = `每${def.attackInterval}回合`;
  if (!def.skillIds?.length) return `${interval}普攻`;
  const skills = def.skillIds
    .map((id) => SKILL_MAP.get(id))
    .filter((s): s is NonNullable<typeof s> => !!s);
  const skillPart = skills.map((s) => `${s.name}(${s.desc})`).join('、');
  return `${interval} · ${skillPart}`;
}

/** 解析一条遭遇引用为战斗模板 + 收录元信息 */
export function resolveEncounter(ref: EncounterRef): ResolvedEncounter {
  if (ref.kind === 'mob') {
    const def = MOB_MAP.get(ref.id);
    if (!def) throw new Error(`未知杂怪: ${ref.id}`);
    return { def };
  }
  const def = creatureMonsterDef(ref.id, ref.tier);
  const captureCreatureId = ref.tier === 'tier2' && ref.captureUnlock ? ref.id : undefined;
  return { def, captureCreatureId };
}
