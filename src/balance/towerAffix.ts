/**
 * 通天塔本层试炼（纯数据 + 纯函数）
 *
 * 寻常道 / 险径如果只差 ×1.35 和多一波，过了练度墙之后手感一样——
 * 业界长线塔（深渊、集成战略、神龛）的「更难」是可见规则：换打法，不是多磨几下。
 *
 * 规则按「层 + 路径」确定性抽取，玩家可以预习「这层险径是什么试炼」。
 * 盘面 / 关卡规则走已有 mechanics；闸门怪只作为险径 / 守关的额外波载体，不拆寻常道波数。
 */
import { ELEMENTS } from './combat';
import { ELEMENT_NAME } from './ui';

export type TowerAffixPath = 'battle' | 'elite' | 'event' | 'rest' | 'guard';

export type TowerAffixId =
  | 'seal'
  | 'rock'
  | 'lockedCol'
  | 'banColor'
  | 'noHeart'
  | 'gateElement'
  | 'gateCombo'
  | 'void'
  | 'undying'
  | 'compPenalty';

export interface TowerAffix {
  id: TowerAffixId;
  name: string;
  /** 择路卡主句 */
  summary: string;
  /** 编队 / 战前提示 */
  hint: string;
  mechanics: readonly string[];
  /** 闸门载体怪；有则占用险径/守关已有的额外波，不加第四波 */
  extraMob?: string;
}

const GATE_MOB = {
  element: 'enemy_wuxing_golem_earth',
  combo: 'enemy_chain_serpent_water',
  void: 'enemy_blunt_scorpion_metal',
  undying: 'enemy_grit_golem_earth',
} as const;

type AffixBand = 'light' | 'mid' | 'heavy';

const LIGHT_IDS: readonly TowerAffixId[] = ['seal', 'rock', 'banColor'];
const MID_IDS: readonly TowerAffixId[] = ['noHeart', 'lockedCol', 'gateElement', 'gateCombo'];
const HEAVY_IDS: readonly TowerAffixId[] = ['void', 'undying', 'compPenalty', 'noHeart'];
/** 寻常道中段：极轻盘面规则，和险径的封色/阵盾拉开 */
const BATTLE_EARLY_IDS: readonly TowerAffixId[] = ['seal', 'rock'];
/** 寻常道后期只用盘面 / 规则，不加闸门怪，避免「普通路」也变成多一波 */
const BATTLE_SAFE_IDS: readonly TowerAffixId[] = ['seal', 'rock', 'banColor', 'lockedCol', 'noHeart'];

function banMechanic(floor: number): string {
  return `rule_ban_${ELEMENTS[(floor - 1 + ELEMENTS.length) % ELEMENTS.length]}`;
}

function banName(floor: number): string {
  return `封${ELEMENT_NAME[ELEMENTS[(floor - 1 + ELEMENTS.length) % ELEMENTS.length]]}`;
}

function buildAffix(id: TowerAffixId, floor: number): TowerAffix {
  switch (id) {
    case 'seal':
      return {
        id, name: '封印珠',
        summary: '盘面会出现封印珠',
        hint: '盘面有封印珠：消除相邻珠解封',
        mechanics: ['orb_sealed'],
      };
    case 'rock':
      return {
        id, name: '顽石',
        summary: '盘面顽石更密',
        hint: '顽石封印较多：优先清理周边解封',
        mechanics: ['orb_rock'],
      };
    case 'lockedCol':
      return {
        id, name: '锁列',
        summary: '开局锁死一整列',
        hint: '盘面有一整列被锁：先从两侧消除拆封',
        mechanics: ['orb_locked_col'],
      };
    case 'banColor':
      return {
        id, name: banName(floor),
        summary: `本层${banName(floor)}珠失效`,
        hint: `本层${banName(floor)}珠失效：换属性输出`,
        mechanics: [banMechanic(floor)],
      };
    case 'noHeart':
      return {
        id, name: '禁心',
        summary: '心珠不回血',
        hint: '本层禁心：心珠不回血，靠护盾与速杀',
        mechanics: ['rule_no_heal'],
      };
    case 'gateElement':
      return {
        id, name: '五行阵盾',
        summary: '敌人会开五行阵盾',
        hint: '敌人有五行阵盾：首消要打出多种属性',
        mechanics: ['gate_element'],
        extraMob: GATE_MOB.element,
      };
    case 'gateCombo':
      return {
        id, name: '连锁盾',
        summary: '敌人会开连锁盾',
        hint: '敌人有连锁盾：首消要铺够连数',
        mechanics: ['gate_combo'],
        extraMob: GATE_MOB.combo,
      };
    case 'void':
      return {
        id, name: '锋锐无效',
        summary: '大伤害会被无效',
        hint: '敌人无效化大伤害：用 5 连及以上穿透',
        mechanics: ['gate_damage_void'],
        extraMob: GATE_MOB.void,
      };
    case 'undying':
      return {
        id, name: '不灭',
        summary: '敌人会留 1 血一次',
        hint: '敌人有不灭：会留 1 血一次，备好补刀',
        mechanics: ['gate_undying'],
        extraMob: GATE_MOB.undying,
      };
    case 'compPenalty':
      return {
        id, name: '同源相斥',
        summary: '属性太多或太少都吃亏',
        hint: '本层同源相斥：精简到约三色，别五色齐堆',
        mechanics: ['rule_comp_penalty'],
      };
  }
}

function bandOf(floor: number): AffixBand {
  if (floor >= 40) return 'heavy';
  if (floor >= 20) return 'mid';
  return 'light';
}

function poolFor(path: TowerAffixPath, floor: number): readonly TowerAffixId[] | null {
  if (path === 'event' || path === 'rest') return null;
  const band = bandOf(floor);
  if (path === 'battle') {
    // 前 7 层干净入门；8 层起极轻盘面规则，避免中段寻常道纯磨血
    if (floor < 8) return null;
    if (floor < 20) return BATTLE_EARLY_IDS;
    return BATTLE_SAFE_IDS;
  }
  if (path === 'elite') {
    if (band === 'light') return LIGHT_IDS;
    if (band === 'mid') return MID_IDS;
    return HEAVY_IDS;
  }
  // 守关：始终有具名试炼，档位跟层走
  if (band === 'light') return LIGHT_IDS;
  if (band === 'mid') return MID_IDS;
  return HEAVY_IDS;
}

/** 层 + 路径哈希，同一层同一条路永远同一条规则 */
function pickIndex(len: number, floor: number, salt: number): number {
  if (len <= 0) return 0;
  return Math.abs(floor * 17 + salt * 13) % len;
}

const PATH_SALT: Readonly<Record<TowerAffixPath, number>> = {
  battle: 1,
  elite: 3,
  guard: 5,
  event: 0,
  rest: 0,
};

export function resolveTowerAffix(floor: number, path: TowerAffixPath): TowerAffix | null {
  if (floor <= 0) return null;
  const pool = poolFor(path, floor);
  if (!pool || pool.length === 0) return null;
  const id = pool[pickIndex(pool.length, floor, PATH_SALT[path])];
  return buildAffix(id, floor);
}

/** 择路卡主句：有试炼就写试炼，没有就回退到路径默认文案 */
export function towerAffixSummary(
  floor: number,
  path: TowerAffixPath,
  fallback: string,
): string {
  const affix = resolveTowerAffix(floor, path);
  if (!affix) return fallback;
  if (path === 'elite') return `试炼：${affix.name} · 多一波`;
  if (path === 'guard') return `试炼：${affix.name}`;
  return `本层：${affix.name}`;
}
