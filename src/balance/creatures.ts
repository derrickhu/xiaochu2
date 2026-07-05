/**
 * 统一生物表（阶段九 · 宠物即怪）——纯数据，零逻辑
 *
 * 单一真源：一个「生物 CreatureDef」同时承载
 * - 宠物面：id / name / element / rarity / role / skillId（被动按 role+稀有度阶梯派生）
 * - 怪物面：monster.tier1（初级怪）/ monster.tier2（高级怪），各含战斗模板数值与敌人技能
 * - 四形态美术（约定）：宠物初始头像 / 宠物觉醒头像 / 初级怪全身 / 高级怪全身
 *
 * 获取闭环：开局 R 直给 + 章 Boss 直掉 SR/SSR + 灵玉召唤（含 UR）。
 *
 * pets.ts 仅作为本表「宠物面视图」，enemies.ts 的 MobDef 是不可收服的廉价杂怪，二者不混用。
 */
import type { Element } from './combat';
import { PET_SKILL_IDS, ENEMY_SKILL_IDS } from './skills';
import type { PetRole, SkillTraitDef, StatBlock, GrowthBlock } from './petRoles';
import type { Rarity } from './rarity';

/** 怪物单形态战斗模板（数值口径同 enemies.ts 的 MobDef，供 enemyStats 缩放） */
export interface CreatureMonsterTier {
  /** 该形态独立命名（缺省用生物名 + 形态后缀） */
  name?: string;
  baseHp: number;
  baseAtk: number;
  baseDef: number;
  attackInterval: number;
  /** 敌人技能引用（balance/skills.ts owner:'enemy'），无 = 纯普攻 */
  skillIds?: readonly string[];
}

export interface CreatureDef {
  id: string;
  name: string;
  element: Element;
  /** 天生稀有度（引用键，行为见 balance/rarity.ts）；与养成 star 正交 */
  rarity: Rarity;
  role: PetRole;
  statProfile?: Partial<StatBlock>;
  growthProfile?: Partial<GrowthBlock>;
  /** 宠物主动技引用（消珠驱动），效果在 balance/skills.ts */
  skillId: string;
  /** 专属技能修饰 / 元素克制（非 PassiveEffect 管线） */
  skillTraits?: readonly SkillTraitDef[];
  /**
   * 被动由 role + 稀有度阶梯统一派生（见 passives.ts 的 ROLE_PASSIVE_LADDER），
   * 此处不再承载专属被动；新增/调整被动一律改阶梯表，保证单调与超集成立。
   */
  /** 怪物面：初级怪 / 高级怪 两形态 */
  monster: {
    tier1: CreatureMonsterTier;
    tier2: CreatureMonsterTier;
  };
}

/**
 * 怪物两形态数值生成器：按 power rank 平滑铺出初级/高级基值（第 1 章基准，
 * 关卡按章节成长 × difficulty 再放大，见 formulas/growth.ts enemyStats）。
 */
function monsterPair(
  rank: number,
  opts: {
    t1Skills?: readonly string[];
    t2Skills?: readonly string[];
    ai1?: number;
    ai2?: number;
    /** 攻击基值倍率（章 Boss 波用）：HP 预算收敛后由攻压承担养成门槛 */
    atkScale?: number;
  } = {},
): { tier1: CreatureMonsterTier; tier2: CreatureMonsterTier } {
  const atkScale = opts.atkScale ?? 1;
  const t1Hp = Math.round(600 + rank * 70);
  const t1Atk = Math.round((118 + rank * 7) * atkScale);
  const t1Def = Math.round(8 + rank * 2);
  return {
    tier1: {
      baseHp: t1Hp,
      baseAtk: t1Atk,
      baseDef: t1Def,
      attackInterval: opts.ai1 ?? 1,
      skillIds: opts.t1Skills,
    },
    tier2: {
      baseHp: Math.round(t1Hp * 1.75),
      baseAtk: Math.round(t1Atk * 1.28),
      baseDef: Math.round(t1Def * 1.6) + 12,
      attackInterval: opts.ai2 ?? 2,
      skillIds: opts.t2Skills,
    },
  };
}

const E = ENEMY_SKILL_IDS;

export const CREATURES: readonly CreatureDef[] = [
  // ══════════════════════════════════════════════════════════════
  // 新 10 只（xiaochu2 原生，四形态齐备）：pet_001–010 为初始/进阶
  // ══════════════════════════════════════════════════════════════
  // ── 金 ──
  {
    id: 'pet_001', name: '裂甲铁犀', element: 'metal', rarity: 1, role: 'support',
    skillId: PET_SKILL_IDS.metalDefBreak,
    monster: monsterPair(6, { t2Skills: [E.golemGuard] }),
  },
  {
    id: 'pet_002', name: '锋芒剑姬', element: 'metal', rarity: 4, role: 'attacker',
    skillId: PET_SKILL_IDS.metalMultiHit,
    monster: monsterPair(9, { t2Skills: [E.bladeCharge] }),
  },
  // ── 木 ──
  {
    id: 'pet_003', name: '青藤连弩手', element: 'wood', rarity: 1, role: 'attacker',
    skillId: PET_SKILL_IDS.woodMultiHit,
    monster: monsterPair(6, { t2Skills: [E.lionCharge] }),
  },
  {
    // 怪物面 = 第 2 章 Boss 波 2/3：rank 按 powerBudget 护栏校准
    id: 'pet_004', name: '灵鹿医者', element: 'wood', rarity: 2, role: 'healer',
    skillId: PET_SKILL_IDS.woodBigHeal,
    monster: monsterPair(6, { t2Skills: [E.serpentHeal] }),
  },
  // ── 水 ──
  {
    id: 'pet_005', name: '冰魄仙鹤', element: 'water', rarity: 1, role: 'support',
    skillId: PET_SKILL_IDS.waterStun,
    monster: monsterPair(7, { t2Skills: [E.golemGuard] }),
  },
  {
    id: 'pet_006', name: '玄冰龙皇', element: 'water', rarity: 4, role: 'attacker',
    skillId: PET_SKILL_IDS.waterMultiHit,
    monster: monsterPair(10, { t2Skills: [E.bladeCharge, E.serpentHeal] }),
  },
  // ── 火 ──
  {
    id: 'pet_007', name: '炽羽火狐', element: 'fire', rarity: 1, role: 'attacker',
    skillId: PET_SKILL_IDS.fireDot,
    monster: monsterPair(7, { t2Skills: [E.lionCharge] }),
  },
  {
    id: 'pet_008', name: '焚天魔将', element: 'fire', rarity: 4, role: 'attacker',
    skillId: PET_SKILL_IDS.fireDotUr,
    monster: monsterPair(9, { t2Skills: [E.lionCharge, E.pandaGuard] }),
  },
  // ── 土 ──
  {
    id: 'pet_009', name: '磐石守卫', element: 'earth', rarity: 1, role: 'tank',
    skillId: PET_SKILL_IDS.earthConvertRow,
    monster: monsterPair(6, { t2Skills: [E.golemGuard] }),
  },
  {
    // 钥匙宠（Ch6 Boss 掉落）：加时对抗 Ch6 时间压缩
    // 怪物面 = 第 6 章 Boss：首教「时间压缩」机制
    id: 'pet_010', name: '厚土娘娘', element: 'earth', rarity: 3, role: 'healer',
    skillId: PET_SKILL_IDS.earthTime,
    monster: monsterPair(5, { t1Skills: [E.timeSqueeze], t2Skills: [E.timeSqueeze, E.pandaGuard, E.pandaHeal] }),
  },

  // ══════════════════════════════════════════════════════════════
  // xiao_chu 20 只（ch13–16，四文件齐全，复制重命名落地）
  // ══════════════════════════════════════════════════════════════
  // ── 金 ──
  {
    // 钥匙宠（Ch5 Boss 掉落）：直伤 + 驱散，应对 Ch5 剧毒/禁疗
    // 怪物面 = 第 5 章 Boss：首教「剧毒」机制
    id: 'pet_011', name: '金羽仙鹤', element: 'metal', rarity: 3, role: 'attacker',
    skillId: PET_SKILL_IDS.goldenCleanse,
    monster: monsterPair(11, { t1Skills: [E.poisonTeam], t2Skills: [E.poisonTeam, E.bladeCharge] }),
  },
  {
    id: 'pet_012', name: '潮汐魔鳐', element: 'metal', rarity: 2, role: 'support',
    skillId: PET_SKILL_IDS.transmuteMetal,
    monster: monsterPair(14, { t2Skills: [E.golemGuard] }),
  },
  {
    id: 'pet_013', name: '雷纹玉蝉', element: 'metal', rarity: 4, role: 'attacker',
    skillId: PET_SKILL_IDS.thunderCrit,
    monster: monsterPair(17, { t2Skills: [E.bladeCharge, E.golemGuard] }),
  },
  {
    id: 'pet_014', name: '玄影天鹏', element: 'metal', rarity: 4, role: 'support',
    skillId: PET_SKILL_IDS.shadowPurify,
    monster: monsterPair(14, { t2Skills: [E.sealOrbs, E.bladeCharge, E.pandaGuard] }),
  },
  // ── 木 ──
  {
    id: 'pet_015', name: '玉角灵羊', element: 'wood', rarity: 1, role: 'healer',
    skillId: PET_SKILL_IDS.woodHeal,
    monster: monsterPair(10, { t2Skills: [E.serpentHeal] }),
  },
  {
    // 怪物面 = 第 8 章 Boss：首教「技能封印 + 狂暴」+ 封木规则
    id: 'pet_016', name: '昆仑玉蛟', element: 'wood', rarity: 3, role: 'attacker',
    skillId: PET_SKILL_IDS.woodVolley,
    monster: monsterPair(16, { t1Skills: [E.enrage], t2Skills: [E.skillSeal, E.enrage, E.lionCharge] }),
  },
  {
    // 怪物面 = 第 1 章 Boss 波 2/3：rank 按 powerBudget 护栏（总量 ≈ 前关 3.5 倍）校准
    id: 'pet_017', name: '星辉灵鹿', element: 'wood', rarity: 2, role: 'attacker',
    skillId: PET_SKILL_IDS.starCross,
    monster: monsterPair(9, { t2Skills: [E.lionCharge] }),
  },
  {
    id: 'pet_018', name: '混沌骨狐', element: 'wood', rarity: 4, role: 'healer',
    skillId: PET_SKILL_IDS.chaosHaste,
    monster: monsterPair(20, { t2Skills: [E.pandaGuard, E.pandaHeal] }),
  },
  // ── 水 ──
  {
    id: 'pet_019', name: '云绒灵狐', element: 'water', rarity: 1, role: 'tank',
    skillId: PET_SKILL_IDS.waterShield,
    monster: monsterPair(10, { t2Skills: [E.golemGuard] }),
  },
  {
    id: 'pet_020', name: '深渊水母', element: 'water', rarity: 3, role: 'support',
    skillId: PET_SKILL_IDS.abyssDelay,
    monster: monsterPair(13, { t2Skills: [E.serpentHeal] }),
  },
  {
    id: 'pet_021', name: '霜鳍海豹', element: 'water', rarity: 2, role: 'support',
    skillId: PET_SKILL_IDS.frostGuard,
    monster: monsterPair(13, { t2Skills: [E.serpentHeal] }),
  },
  {
    id: 'pet_022', name: '归墟玄鲸', element: 'water', rarity: 4, role: 'attacker',
    skillId: PET_SKILL_IDS.waterPierce,
    monster: monsterPair(15, { t2Skills: [E.bladeCharge, E.serpentHeal] }),
  },
  {
    id: 'pet_023', name: '虚空魔眼', element: 'water', rarity: 4, role: 'attacker',
    skillId: PET_SKILL_IDS.voidResonance,
    monster: monsterPair(19, { t2Skills: [E.golemGuard, E.bladeCharge] }),
  },
  // ── 火 ──
  {
    id: 'pet_024', name: '赤日金乌', element: 'fire', rarity: 1, role: 'attacker',
    skillId: PET_SKILL_IDS.fireBurst,
    monster: monsterPair(16, { t2Skills: [E.lionCharge] }),
  },
  {
    // 怪物面 = 第 4 章 Boss：首教「敌人中途封珠」；rank 按 powerBudget 护栏校准
    id: 'pet_025', name: '星河烛龙', element: 'fire', rarity: 3, role: 'support',
    skillId: PET_SKILL_IDS.fireBoost,
    monster: monsterPair(4, { t1Skills: [E.sealOrbs], t2Skills: [E.sealOrbs, E.bladeCharge, E.pandaGuard] }),
  },
  {
    id: 'pet_026', name: '天外魔君', element: 'fire', rarity: 4, role: 'attacker',
    skillId: PET_SKILL_IDS.skyfallGravity,
    monster: monsterPair(16, { t1Skills: [E.enrage], t2Skills: [E.skillSeal, E.enrage, E.lionCharge] }),
  },
  // ── 土 ──
  {
    id: 'pet_027', name: '玄岩石猿', element: 'earth', rarity: 1, role: 'tank',
    skillId: PET_SKILL_IDS.earthShield,
    monster: monsterPair(11, { t2Skills: [E.golemGuard] }),
  },
  {
    // 钥匙宠（Ch3 Boss 掉落）：大护盾扛 Ch4 敌人封珠期的输出真空
    // 怪物面 = 第 3 章 Boss 波 2/3：rank 按 powerBudget 护栏校准
    id: 'pet_028', name: '归墟玄龟', element: 'earth', rarity: 3, role: 'tank',
    skillId: PET_SKILL_IDS.abyssBulwark,
    monster: monsterPair(9, { atkScale: 6, t2Skills: [E.golemGuard, E.lionCharge] }),
  },
  {
    // 怪物面 = 第 7 章 Boss：首教「禁疗」；rank 按 powerBudget 护栏校准
    id: 'pet_029', name: '星轮机关兽', element: 'earth', rarity: 3, role: 'support',
    skillId: PET_SKILL_IDS.earthHeartConvert,
    monster: monsterPair(5, { t1Skills: [E.healBlock], t2Skills: [E.healBlock, E.golemGuard, E.bladeCharge] }),
  },
  {
    id: 'pet_030', name: '裂隙甲虫', element: 'earth', rarity: 4, role: 'tank',
    skillId: PET_SKILL_IDS.riftShield,
    monster: monsterPair(17, { t2Skills: [E.healBlock, E.golemGuard, E.bladeCharge] }),
  },
];

export const CREATURE_MAP: ReadonlyMap<string, CreatureDef> = new Map(
  CREATURES.map((c) => [c.id, c]),
);

export const CREATURE_IDS: readonly string[] = CREATURES.map((c) => c.id);

/**
 * 初始赠送阵容（五行各 1，新 10 只中每属性较低稀有度的一只）。
 * 建档/迁移时同时写入 ownedPets / team（开场师门契约登记，直给）。
 */
export const STARTER_CREATURE_IDS: readonly string[] = [
  'pet_001',
  'pet_003',
  'pet_005',
  'pet_007',
  'pet_009',
];

/** R 档灵宠开局即收录进召唤池，无需章节 Boss */
export const DEFAULT_SUMMON_POOL_R_IDS: readonly string[] = CREATURES
  .filter((c) => c.rarity === 1)
  .map((c) => c.id);

/** 取生物定义（未知抛错，便于早暴露数据错误） */
export function getCreature(id: string): CreatureDef {
  const c = CREATURE_MAP.get(id);
  if (!c) throw new Error(`未知生物: ${id}`);
  return c;
}
