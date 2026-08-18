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
import type { EnemyDisplayTier } from './enemyDisplay';
import { inferCreatureDisplayTier } from './enemyDisplay';

function creatureEnemyRoot(creatureId: string): string {
  const pkg = creatureUsesCrSubpackage(creatureId)
    ? SUBPACKAGE_ROOT.enemyCr
    : SUBPACKAGE_ROOT.enemy;
  return `${pkg}/images/enemy`;
}

/** 杂怪立绘路径（供强化形态复用基础怪的图，与 Assets.enemyImage 同口径） */
function enemyImageOf(mobId: string): string {
  return `${SUBPACKAGE_ROOT.enemy}/images/enemy/${mobId}.png`;
}

/**
 * Boss 阶段：血线跨过 hpThreshold 时切入，一次切换消耗敌人一个回合（做「转阶段」演出）。
 *
 * 与 enrage 的区别：enrage 是挂在 skillIds 上、靠 CD 轮询的一次性技能，只能改攻击；
 * 阶段是独立于技能循环的状态机，能同时改攻击、攻击间隔与技能表，且可多段。
 * 两者可共存（enrage 仍作为「低血狂暴」技保留给非阶段 Boss）。
 */
export interface EnemyPhaseDef {
  /** 触发血线：hp / maxHp ≤ 此值时进入（按数组顺序递减，如 0.7 → 0.35） */
  hpThreshold: number;
  /** UI 阶段标签（血条分段与转阶段横幅都用它） */
  label: string;
  /** 攻击倍率，基准是出场攻击（不与前一阶段叠乘，避免多段爆炸） */
  atkMult?: number;
  /** 攻击间隔覆写（变频：拉长蓄力节奏或转为高频压制） */
  attackInterval?: number;
  /** 进入该阶段后追加进技能表的技能（CD 从 0 起算，可立即释放） */
  addSkillIds?: readonly string[];
  /** 转阶段当回合无视 CD 直接释放的「切入技」 */
  onEnterSkillId?: string;
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
  /** 战斗/UI 表现档位：杂兵 / 精英 / 守关 / Boss */
  displayTier: EnemyDisplayTier;
  /** 主动技能引用（无 = 纯普攻怪），具体效果在 balance/skills.ts */
  skillIds?: readonly string[];
  /** 立绘路径覆盖（生物怪物面用觉醒/初级全身图）；缺省由 enemyImage(id) 兜底 */
  image?: string;
  /** 来源生物 id（仅生物怪物面有），用于战斗胜利后的收录判定 */
  creatureId?: string;
  /** 怪物形态（仅生物怪物面有） */
  tier?: 'tier1' | 'tier2';
  /** Boss 多阶段（血线递减顺序）；缺省 = 单阶段普通敌人 */
  phases?: readonly EnemyPhaseDef[];
}

/** 杂怪 = EnemyDef 的语义别名（不可收服、单图、低数值） */
export type MobDef = EnemyDef;

/**
 * v0.3 挑战版杂怪基值（第 1 章基准）。调参由 formulas/simulation.ts 模拟器驱动。
 * 核心 6 种在全章节循环复用；3 种章 Boss 魔物作收录关铺垫波。
 */
export const MOBS: readonly MobDef[] = [
  /*
   * ── 核心循环杂兵（6）── 泛称命名，displayTier 区分杂兵 / 精英。
   *
   * v0.7：杂兵不再「零技能」。旧口径是「无技能=杂兵」，但这两只覆盖了前八章的绝大多数
   * 铺垫关，直接导致 128 关里 22 关是纯数值关——敌人只会平A，玩家只要总攻够高就能秒推，
   * 关与关之间没有任何可辨识的差别，自然也不会去想「这一关该带谁」。
   * 现在各给一手**轻量且可读**的技能：毒教续航、蓄力教看预警。两者都不改变胜负，
   * 只是让玩家在低压环境里先认识 Boss 关会连招用上的那套语汇。
   *
   * 同期上调第 1 章基础血量（杂兵约 +60%、精英约 +33%）。按锚点养成的中手过去
   * 2 回合就能清掉铺垫关，一场战斗连「敌人出手 → 玩家调整」这个最小循环都跑不完，
   * 机制加得再多也来不及触发。抬到 TTK_FLOOR 要求的 3/4 回合，机制才有生效的时间窗。
   */
  {
    id: 'enemy_slime_wood', name: '木域软泥', element: 'wood', displayTier: 'mob',
    baseHp: 1000, baseAtk: 155, baseDef: 12, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.poisonTeam],
  },
  {
    id: 'enemy_bat_fire', name: '洞窟火蝠', element: 'fire', displayTier: 'mob',
    baseHp: 870, baseAtk: 195, baseDef: 8, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.enrage],
  },
  /*
   * 轻档杂兵补位（v0.7 新增两只）。
   *
   * 铺垫关的第二波原本永远是软泥或火蝠，两只怪覆盖了近四成关卡——不管给它们配什么技能，
   * 那一招都会立刻变成「到处都是」的换皮机制（机制多样性测试就是这么被顶穿的）。
   * 加两张面孔把配方错开，顺带补上封珠与压时间这两种前期原本见不到的压力类型。
   */
  {
    id: 'enemy_moss_sprite_wood', name: '苔纹木灵', element: 'wood', displayTier: 'mob',
    baseHp: 900, baseAtk: 165, baseDef: 14, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.sealOrbs],
    image: enemyImageOf('enemy_slime_wood'),
  },
  {
    id: 'enemy_cinder_imp_fire', name: '余烬小妖', element: 'fire', displayTier: 'mob',
    baseHp: 820, baseAtk: 205, baseDef: 8, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.timeSqueeze],
    image: enemyImageOf('enemy_bat_fire'),
  },
  {
    /*
     * 高防 + 周期减伤本身就拖时间，血量给到 1750 即可，再高普通关会变成消耗战。
     * DEF 也从 70 降到 52：防御按 1.20^(章-1) 复利放大，第 13 章会滚到 600+，
     * 两层减伤叠在一起把「高防怪」变成了单纯的耐久检查，而不是一道要破防的题。
     */
    id: 'enemy_golem_earth', name: '碎石傀儡', element: 'earth', displayTier: 'elite',
    baseHp: 1750, baseAtk: 155, baseDef: 52, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.golemGuard],
  },
  {
    id: 'enemy_serpent_water', name: '寒潭小蛟', element: 'water', displayTier: 'elite',
    baseHp: 1440, baseAtk: 205, baseDef: 22, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.serpentHeal],
  },
  {
    // 蓄力重击的教学面孔；减伤交给碎石傀儡，这里不重复挂 golemGuard
    id: 'enemy_scorpion_metal', name: '铁壳毒蝎', element: 'metal', displayTier: 'elite',
    baseHp: 1600, baseAtk: 195, baseDef: 55, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.bladeCharge, ENEMY_SKILL_IDS.healBlock],
  },
  {
    id: 'enemy_toad_water', name: '湿苔毒蟾', element: 'water', displayTier: 'elite',
    baseHp: 1680, baseAtk: 215, baseDef: 20, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.serpentHeal],
  },
  // ── 章 Boss 守关波（3）── 具名魔将/巨像，与铺垫杂兵拉开身份
  {
    id: 'enemy_bamboo_tyrant_wood', name: '蛮竹魔将', element: 'wood', displayTier: 'miniBoss',
    baseHp: 1200, baseAtk: 195, baseDef: 30, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.pandaGuard, ENEMY_SKILL_IDS.pandaHeal],
  },
  {
    id: 'enemy_crystal_boss_earth', name: '幽晶巨像', element: 'earth', displayTier: 'miniBoss',
    baseHp: 1250, baseAtk: 265, baseDef: 60, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.golemGuard, ENEMY_SKILL_IDS.lionCharge],
  },
  {
    // 仅用于第 7 章（noHeart）Boss 首波。baseAtk 从 365 降到 285：365 是三只魔将里的
    // 离群值（另两只 195 / 265），配上 lionCharge 2.3 倍后在第 7 章打出 5646 伤害，
    // 而该章 rule_no_heal 让我方零回复、锚点首通队仅 6699 血 —— 低手中手同在第 6 回合
    // 被同一击带走，胜负与操作脱钩。降到 285 后蓄力约为血线六成，留出扛一击的空间。
    id: 'enemy_thunderlord_boss_wood', name: '风雷天尊', element: 'wood', displayTier: 'miniBoss',
    baseHp: 1300, baseAtk: 285, baseDef: 45, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.pandaGuard, ENEMY_SKILL_IDS.pandaHeal, ENEMY_SKILL_IDS.lionCharge],
  },

  // ── 后期章节（9~16）机制载体（6）──
  // 每只承载一种新挑战，供 recipeForChallenge 的铺垫关首教。
  // 立绘复用同族基础怪（image 覆盖）：新怪立绘属美术批产范围，未到位前
  // 借「同一种怪的强化形态」这一通行约定，靠名字与 displayTier 区分身份，
  // 而不是先上一批占位空图。
  {
    id: 'enemy_golem_bulwark_earth', name: '磐岩傀儡', element: 'earth', displayTier: 'elite',
    baseHp: 1600, baseAtk: 165, baseDef: 75, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.golemGuardHeavy, ENEMY_SKILL_IDS.resolve],
    image: enemyImageOf('enemy_golem_earth'),
  },
  {
    id: 'enemy_thorn_scorpion_metal', name: '荆棘毒蝎', element: 'metal', displayTier: 'elite',
    baseHp: 1300, baseAtk: 195, baseDef: 55, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.counterStrike, ENEMY_SKILL_IDS.golemGuard],
    image: enemyImageOf('enemy_scorpion_metal'),
  },
  {
    id: 'enemy_devour_serpent_water', name: '吞灵寒蛟', element: 'water', displayTier: 'elite',
    baseHp: 1250, baseAtk: 205, baseDef: 25, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.elementAbsorb, ENEMY_SKILL_IDS.serpentHealHeavy],
    image: enemyImageOf('enemy_serpent_water'),
  },
  {
    // 后期铺垫关的常客，血量按精英档补齐（900 时第 14 章开场关会被 2 回合秒推）
    id: 'enemy_wither_bat_fire', name: '枯翼魔蝠', element: 'fire', displayTier: 'elite',
    baseHp: 1320, baseAtk: 205, baseDef: 10, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.atkDebuffHeavy, ENEMY_SKILL_IDS.poisonTeamHeavy],
    image: enemyImageOf('enemy_bat_fire'),
  },
  {
    id: 'enemy_bind_slime_wood', name: '缚灵藤泥', element: 'wood', displayTier: 'elite',
    baseHp: 1000, baseAtk: 165, baseDef: 15, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.sealOrbsHeavy, ENEMY_SKILL_IDS.timeSqueezeHeavy],
    image: enemyImageOf('enemy_slime_wood'),
  },
  {
    // 唯一带阶段的杂怪：作 phaseShift 的铺垫教学，让玩家在 Boss 前先见一次转形态。
    // 灭世一击放在二阶段 addSkillIds 而非初始技能表：重击被血线门控，
    // 不会在开场就打出「抛硬币」式秒杀（第 7/8 章调参教训）。
    id: 'enemy_crystal_warden_earth', name: '幽晶魔像', element: 'earth', displayTier: 'miniBoss',
    baseHp: 1400, baseAtk: 230, baseDef: 60, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.damageVoid],
    image: enemyImageOf('enemy_crystal_boss_earth'),
    phases: [
      { hpThreshold: 0.5, label: '晶壳剥落', addSkillIds: [ENEMY_SKILL_IDS.chargeHeavy] },
    ],
  },

  // ── 补齐五行配比（5）──
  // 金 / 火此前各只 1 只，锐金洞天与赤焰熔窟三波打的是同一只怪 —— 秘境的卖点是
  // 「为当日属性组克制队」，三波同怪会把它压成同一场战斗打三遍。
  // 每属性补到「杂兵 + 精英 + 守关」三档齐备，秘境三波与塔的属性轮换才有货可用。
  // 立绘沿用同族基础怪（同 image 覆盖约定），新怪立绘并入美术批产。
  {
    id: 'enemy_scorpion_swarm_metal', name: '铁鳞蝎兵', element: 'metal', displayTier: 'mob',
    baseHp: 700, baseAtk: 175, baseDef: 30, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.bladeCharge],
    image: enemyImageOf('enemy_scorpion_metal'),
  },
  {
    id: 'enemy_scorpion_king_metal', name: '金甲蝎王', element: 'metal', displayTier: 'miniBoss',
    baseHp: 1280, baseAtk: 230, baseDef: 70, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.golemGuard, ENEMY_SKILL_IDS.counterStrike],
    image: enemyImageOf('enemy_scorpion_metal'),
  },
  {
    id: 'enemy_bat_swarm_fire', name: '炽炎蝠群', element: 'fire', displayTier: 'elite',
    baseHp: 820, baseAtk: 205, baseDef: 10, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.poisonTeam],
    image: enemyImageOf('enemy_bat_fire'),
  },
  {
    id: 'enemy_bat_king_fire', name: '焰狱蝠王', element: 'fire', displayTier: 'miniBoss',
    baseHp: 1150, baseAtk: 255, baseDef: 20, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.lionCharge, ENEMY_SKILL_IDS.atkDebuff],
    image: enemyImageOf('enemy_bat_fire'),
  },
  {
    id: 'enemy_serpent_king_water', name: '寒渊蛟王', element: 'water', displayTier: 'miniBoss',
    baseHp: 1300, baseAtk: 240, baseDef: 30, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.serpentHeal, ENEMY_SKILL_IDS.timeSqueeze],
    image: enemyImageOf('enemy_serpent_water'),
  },
  // 木与土补一只「轻档」：这两系原有的中间档挂的是后期梯度技（封珠加重 / 坚韧不死），
  // 秘境初阶从第 1 章就开，拿后期技当第二波会把新号直接劝退。
  {
    id: 'enemy_vine_slime_wood', name: '藤蔓妖泥', element: 'wood', displayTier: 'elite',
    baseHp: 980, baseAtk: 170, baseDef: 18, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.poisonTeam],
    image: enemyImageOf('enemy_slime_wood'),
  },
  {
    id: 'enemy_pebble_earth', name: '碎砾小傀', element: 'earth', displayTier: 'mob',
    baseHp: 780, baseAtk: 145, baseDef: 40, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.resolve],
    image: enemyImageOf('enemy_golem_earth'),
  },

  // ── 硬闸门载体（9）──
  // 闸门是「不满足条件伤害降为 1」的离散开关，堆数值抵消不掉，只能改阵容或改操作。
  // 这批怪的定位是让每一档闸门都有专属面孔：玩家看到这只怪就知道要换什么打法。
  // 攻防刻意压在同档基准以下 —— 闸门本身已经是压力，再叠高数值就变成双重惩罚。
  // 立绘沿用同族基础怪（同 image 覆盖约定）。
  {
    // Ch1-2 轻闸门：只要两种属性，第一小时就把「数值不是万能」教到
    id: 'enemy_ward_slime_wood', name: '结界藤泥', element: 'wood', displayTier: 'elite',
    baseHp: 900, baseAtk: 150, baseDef: 15, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.elementGateLight],
    image: enemyImageOf('enemy_slime_wood'),
  },
  {
    id: 'enemy_knot_bat_fire', name: '缠丝火蝠', element: 'fire', displayTier: 'elite',
    baseHp: 760, baseAtk: 175, baseDef: 8, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.comboGateLight],
    image: enemyImageOf('enemy_bat_fire'),
  },
  {
    // Ch3-6 常规单闸门
    id: 'enemy_wuxing_golem_earth', name: '五行石傀', element: 'earth', displayTier: 'elite',
    baseHp: 1350, baseAtk: 160, baseDef: 65, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.elementGate],
    image: enemyImageOf('enemy_golem_earth'),
  },
  {
    id: 'enemy_chain_serpent_water', name: '锁链寒蛟', element: 'water', displayTier: 'elite',
    baseHp: 1150, baseAtk: 195, baseDef: 25, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.comboGate],
    image: enemyImageOf('enemy_serpent_water'),
  },
  {
    // Ch7-10 反数值堆叠：越堆攻越吃亏，逼玩家去练 5 连
    id: 'enemy_blunt_scorpion_metal', name: '钝锋铁蝎', element: 'metal', displayTier: 'elite',
    baseHp: 1400, baseAtk: 190, baseDef: 60, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.damageVoid],
    image: enemyImageOf('enemy_scorpion_metal'),
  },
  {
    id: 'enemy_grit_golem_earth', name: '不灭岩傀', element: 'earth', displayTier: 'miniBoss',
    baseHp: 1500, baseAtk: 200, baseDef: 70, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.undying, ENEMY_SKILL_IDS.golemGuardHeavy],
    image: enemyImageOf('enemy_golem_earth'),
  },
  {
    // Ch11-14 封主色：逼出第二输出位
    id: 'enemy_sealward_toad_water', name: '封色毒蟾', element: 'water', displayTier: 'elite',
    baseHp: 1250, baseAtk: 200, baseDef: 25, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.counterSeal, ENEMY_SKILL_IDS.healBlock],
    image: enemyImageOf('enemy_toad_water'),
  },
  {
    // Ch11-14 双闸门同场：属性闸 + 不灭，一次考编队宽度与补刀手段
    id: 'enemy_wuxing_tyrant_wood', name: '五行魔将', element: 'wood', displayTier: 'miniBoss',
    baseHp: 1450, baseAtk: 225, baseDef: 40, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.elementGateBoss, ENEMY_SKILL_IDS.undying],
    image: enemyImageOf('enemy_bamboo_tyrant_wood'),
  },
  {
    // Ch15-16 复合终局：连锁闸 + 锋锐无效同场，转阶段后再加属性闸。
    // 三条闸门错开 CD，任一时刻最多两条同时生效，保证总有能出输出的窗口。
    id: 'enemy_gatelord_metal', name: '万缚蝎王', element: 'metal', displayTier: 'miniBoss',
    baseHp: 1600, baseAtk: 240, baseDef: 75, attackInterval: 1,
    skillIds: [ENEMY_SKILL_IDS.comboGateBoss, ENEMY_SKILL_IDS.damageVoid],
    image: enemyImageOf('enemy_scorpion_metal'),
    phases: [
      { hpThreshold: 0.5, label: '万缚展开', addSkillIds: [ENEMY_SKILL_IDS.elementGateBoss] },
    ],
  },
];

export const MOB_MAP: ReadonlyMap<string, MobDef> = new Map(MOBS.map((m) => [m.id, m]));

// 历史兼容别名：旧代码以 ENEMIES/ENEMY_MAP 指代杂怪表
export const ENEMIES = MOBS;
export const ENEMY_MAP = MOB_MAP;

/** 关卡遭遇引用：杂怪 或 生物（指定形态、可标记为收录点） */
export type EncounterRef =
  | { kind: 'mob'; id: string }
  | { kind: 'creature'; id: string; tier: 'tier1' | 'tier2'; bossDrop?: boolean };

/** 解析后的一波敌人：战斗模板 + Boss 掉落元信息 */
export interface ResolvedEncounter {
  def: EnemyDef;
  /** 击败后可直得灵宠 id（仅 bossDrop 的高级怪） */
  bossDropPetId?: string;
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
    phases: t.phases,
    displayTier: inferCreatureDisplayTier(tier),
    image,
    creatureId,
    tier,
  };
}

/** 编队/选关预览用：一行描述敌人行动模式与技能 */
export function formatEnemyAbility(def: EnemyDef): string {
  const rhythm = def.attackInterval <= 1 ? '每回合普攻' : `每${def.attackInterval}回合普攻`;
  if (!def.skillIds?.length) return rhythm;
  const skills = def.skillIds
    .map((id) => SKILL_MAP.get(id))
    .filter((s): s is NonNullable<typeof s> => !!s);
  const skillPart = skills.map((s) => `${s.name}(${s.desc})`).join('、');
  return `${rhythm} · ${skillPart}`;
}

/** 解析一条遭遇引用为战斗模板 + 收录元信息 */
export function resolveEncounter(ref: EncounterRef): ResolvedEncounter {
  if (ref.kind === 'mob') {
    const def = MOB_MAP.get(ref.id);
    if (!def) throw new Error(`未知杂怪: ${ref.id}`);
    return { def };
  }
  const def = creatureMonsterDef(ref.id, ref.tier);
  const bossDropPetId = ref.tier === 'tier2' && ref.bossDrop ? ref.id : undefined;
  return { def, bossDropPetId };
}
