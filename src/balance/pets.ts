/**
 * 灵宠数值表（纯数据，零逻辑）
 *
 * 三维数值模型（atk / hp / rcv）：
 * - 同 role + 同 rarity + 同星级 → 初始三维与成长曲线一致（R = petRoles.ts 模板基准）
 * - 稀有度决定初始三维档位（见 balance/rarity.ts 的 statMult，越高越强）
 * - 个体差异仅来自 skillId + 战斗向 traits（克制增伤、技能修正、编队光环等）
 * - 星级倍率见 balance/growth.ts
 *
 * 首发 10 只覆盖 R/SR/SSR/UR/LR 五档稀有度；默认队刻意保持低稀有（入门偏弱）。
 */
import type { Element } from './combat';
import { PET_SKILL_IDS } from './skills';
import type { PetRole, PetTraitDef, StatBlock, GrowthBlock } from './petRoles';
import type { Rarity } from './rarity';
export { PET_ROLE_NAME, type PetRole, type PetTraitDef } from './petRoles';
export type { Rarity } from './rarity';

export interface PetDef {
  id: string;
  name: string;
  element: Element;
  /** 天生稀有度（引用键），行为见 balance/rarity.ts；与养成进度 star 正交 */
  rarity: Rarity;
  role: PetRole;
  /** 相对 role 模板的个体倍率；默认 1，后续觉醒/个体化再填 */
  statProfile?: Partial<StatBlock>;
  /** 相对 role 模板的成长率覆盖；默认用模板，后续星级曲线再填 */
  growthProfile?: Partial<GrowthBlock>;
  /** 主动技能引用，具体效果在 balance/skills.ts */
  skillId: string;
  /** 个性化能力：被动、光环、技能修正等 */
  traits?: readonly PetTraitDef[];
}

export const PETS: readonly PetDef[] = [
  // ── 金 ──
  {
    id: 'pet_metal_001',
    name: '银爪幼狸',
    element: 'metal',
    rarity: 1,
    role: 'attacker',
    skillId: PET_SKILL_IDS.metalSlash,
    traits: [{ type: 'elementDamageBonus', element: 'metal', vs: 'wood', pct: 0.08 }],
  },
  {
    id: 'pet_metal_002',
    name: '锐金鼠将',
    element: 'metal',
    rarity: 3,
    role: 'support',
    skillId: PET_SKILL_IDS.transmuteMetal,
    traits: [{ type: 'skillModifier', skillId: PET_SKILL_IDS.transmuteMetal, convertCountBonus: 1 }],
  },
  // ── 木 ──
  {
    id: 'pet_wood_001',
    name: '青藤小鹿',
    element: 'wood',
    rarity: 1,
    role: 'healer',
    skillId: PET_SKILL_IDS.woodHeal,
  },
  {
    id: 'pet_wood_002',
    name: '藤萝灵蛇',
    element: 'wood',
    rarity: 3,
    role: 'attacker',
    skillId: PET_SKILL_IDS.woodVolley,
    traits: [{ type: 'teamAura', requireRole: 'attacker', count: 2, stat: 'atk', pct: 0.04 }],
  },
  // ── 水 ──
  {
    id: 'pet_water_001',
    name: '碧波灵鲤',
    element: 'water',
    rarity: 1,
    role: 'tank',
    skillId: PET_SKILL_IDS.waterShield,
  },
  {
    id: 'pet_water_002',
    name: '玄水蛟龙',
    element: 'water',
    rarity: 4,
    role: 'attacker',
    skillId: PET_SKILL_IDS.waterPierce,
    traits: [{ type: 'elementDamageBonus', element: 'water', vs: 'fire', pct: 0.08 }],
  },
  // ── 火 ──
  {
    id: 'pet_fire_001',
    name: '赤焰雀',
    element: 'fire',
    rarity: 2,
    role: 'attacker',
    skillId: PET_SKILL_IDS.fireBurst,
    traits: [{ type: 'skillModifier', skillId: PET_SKILL_IDS.fireBurst, effectPctBonus: 0.05 }],
  },
  {
    id: 'pet_fire_002',
    name: '烈阳火凰',
    element: 'fire',
    rarity: 2,
    role: 'support',
    skillId: PET_SKILL_IDS.fireBoost,
    traits: [{ type: 'teamAura', requireElement: 'fire', count: 2, stat: 'atk', pct: 0.05 }],
  },
  // ── 土 ──
  {
    id: 'pet_earth_001',
    name: '岩甲幼龟',
    element: 'earth',
    rarity: 4,
    role: 'tank',
    skillId: PET_SKILL_IDS.earthShield,
  },
  {
    id: 'pet_earth_002',
    name: '大地灵鼹',
    element: 'earth',
    rarity: 5,
    role: 'support',
    skillId: PET_SKILL_IDS.earthHeartConvert,
    traits: [{ type: 'skillModifier', skillId: PET_SKILL_IDS.earthHeartConvert, convertCountBonus: 1 }],
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
