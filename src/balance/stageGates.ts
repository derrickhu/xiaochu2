/**
 * 全 16 章硬闸门节奏表（纯数据 + 纯函数）
 *
 * 改造前主线是这样的：第 1 章七关 `mechanics` 全空，玩家最初一小时只看到
 * 「史莱姆血更多了」；到了后期，机制也基本是「连续量」——减伤、高防、吸收，
 * 都能靠继续堆数值抹平。于是全程只有一个通解：五色齐 + 总攻最高。
 *
 * 闸门是「离散开关」：条件不满足，这一回合伤害直接降为 1，堆多少攻都一样。
 * 这张表负责把它按难度分层铺到 16 章，让「换阵容」从第一小时起就是必修课。
 *
 * 分层依据（与业界难度词汇对齐）：
 * - Ch1-2  轻闸门：门槛低到几乎必过，作用是**教会读条件**，不是拦人。
 * - Ch3-6  单闸门 + 盘面骚扰：赛前完全可见，靠编队就能解。
 * - Ch7-10 反数值堆叠（锋锐无效）+ 不灭：开始要求操作与补刀手段。
 * - Ch11-14 封主色 + 双闸同场 + 同源相斥：正面打击「五色齐」这个恒定最优解。
 * - Ch15-16 复合 + 多阶段：上述全部叠加，但错开 CD 保证总有输出窗口。
 *
 * 实现约定：闸门的载体是**敌人技能**（见 enemies.ts 的闸门怪），不是关卡常驻状态。
 * 这样「周旋几回合熬过去」始终是第二条解法，玩家不会被一条不会解的机制卡死。
 */
import type { EncounterRef } from './enemies';
import type { StageDef } from './stages';

/** 闸门载体怪：每一档闸门一张专属面孔，玩家看到就知道要换什么打法 */
const GATE_MOB = {
  elementLight: 'enemy_ward_slime_wood',
  comboLight: 'enemy_knot_bat_fire',
  element: 'enemy_wuxing_golem_earth',
  combo: 'enemy_chain_serpent_water',
  damageVoid: 'enemy_blunt_scorpion_metal',
  undying: 'enemy_grit_golem_earth',
  counterSeal: 'enemy_sealward_toad_water',
  /** 属性闸 + 不灭同场 */
  doubleGate: 'enemy_wuxing_tyrant_wood',
  /** 连锁闸 + 锋锐无效，转阶段再加属性闸 */
  composite: 'enemy_gatelord_metal',
} as const;

type GateMobKey = keyof typeof GATE_MOB;

interface GateEntry {
  mob: GateMobKey;
  mechanics: readonly string[];
}

interface ChapterGatePlan {
  /** 铺垫关闸门：key = 关序号（1..7） */
  fillers: Readonly<Record<number, GateEntry>>;
  /** Boss 关闸门；缺省 = 本章 Boss 不带闸门 */
  boss?: GateEntry;
}

const g = (mob: GateMobKey, ...mechanics: string[]): GateEntry => ({ mob, mechanics });

/**
 * 每章最多 2 关带闸门，其中一关固定落在 **index 7 的「临门验队关」**。
 *
 * 末位固定的两个理由：
 * - 设计上它本来就是「进 Boss 前的最后一次检查」，闸门放这里最名副其实；
 * - 预算上 Boss 关也带闸门（多一波），若末位铺垫关不同步加重，
 *   `BUDGET_GUARDRAIL.bossTotalMaxRatio` 会被 Boss/前一关的比值顶穿。
 *
 * 另一关刻意错开位置：闸门关之间要有「正常打」的关卡，否则玩家分不清是这一关的
 * 机制在拦他，还是队伍整体不够格 —— 前者会去换阵容，后者只会去挂机刷级。
 */
const CHAPTER_GATE_PLAN: Readonly<Record<number, ChapterGatePlan>> = {
  // ── Ch1-2 轻闸门：门槛低到几乎必过，只为把「读条件」这件事教会 ──
  1: {
    fillers: { 7: g('elementLight', 'gate_element') },
    boss: g('elementLight', 'gate_element'),
  },
  2: {
    fillers: { 3: g('comboLight', 'gate_combo'), 7: g('elementLight', 'gate_element') },
    boss: g('comboLight', 'gate_combo'),
  },

  // ── Ch3-6 单闸门 + 盘面骚扰：条件赛前完全可见，靠编队就能解 ──
  3: {
    fillers: { 7: g('element', 'gate_element') },
    boss: g('element', 'gate_element'),
  },
  4: {
    fillers: { 3: g('combo', 'gate_combo'), 7: g('element', 'gate_element') },
    boss: g('combo', 'gate_combo'),
  },
  5: {
    fillers: { 2: g('element', 'gate_element'), 7: g('combo', 'gate_combo') },
    boss: g('element', 'gate_element'),
  },
  6: {
    fillers: { 3: g('combo', 'gate_combo'), 7: g('damageVoid', 'gate_damage_void') },
    boss: g('damageVoid', 'gate_damage_void'),
  },

  // ── Ch7-10 反数值堆叠 + 不灭：光靠堆攻会越堆越吃亏，开始要求操作与补刀 ──
  7: {
    fillers: { 2: g('damageVoid', 'gate_damage_void'), 7: g('undying', 'gate_undying') },
    boss: g('undying', 'gate_undying'),
  },
  8: {
    fillers: { 3: g('undying', 'gate_undying'), 7: g('element', 'gate_element') },
    boss: g('undying', 'gate_undying', 'gate_element'),
  },
  9: {
    fillers: { 2: g('damageVoid', 'gate_damage_void'), 7: g('combo', 'gate_combo') },
    boss: g('damageVoid', 'gate_damage_void', 'gate_combo'),
  },
  10: {
    fillers: { 3: g('doubleGate', 'gate_element', 'gate_undying'), 7: g('damageVoid', 'gate_damage_void') },
    boss: g('doubleGate', 'gate_element', 'gate_undying'),
  },

  // ── Ch11-14 封主色 + 双闸同场 + 同源相斥：正面打击「五色齐」这个恒定最优解 ──
  11: {
    fillers: { 2: g('counterSeal', 'gate_counter_seal'), 7: g('doubleGate', 'gate_element', 'gate_undying') },
    boss: g('counterSeal', 'gate_counter_seal', 'rule_comp_penalty'),
  },
  12: {
    fillers: { 3: g('doubleGate', 'gate_element', 'gate_undying'), 7: g('counterSeal', 'gate_counter_seal') },
    boss: g('doubleGate', 'gate_element', 'gate_undying', 'rule_comp_penalty'),
  },
  13: {
    fillers: { 2: g('damageVoid', 'gate_damage_void'), 7: g('counterSeal', 'gate_counter_seal') },
    boss: g('counterSeal', 'gate_counter_seal', 'rule_comp_penalty'),
  },
  14: {
    fillers: { 3: g('undying', 'gate_undying'), 7: g('doubleGate', 'gate_element', 'gate_undying') },
    boss: g('doubleGate', 'gate_element', 'gate_undying', 'rule_comp_penalty'),
  },

  // ── Ch15-16 复合 + 多阶段：三条闸门错开 CD，任一时刻最多两条，总留输出窗口 ──
  15: {
    fillers: { 3: g('composite', 'gate_combo', 'gate_damage_void'), 7: g('counterSeal', 'gate_counter_seal') },
    boss: g('composite', 'gate_combo', 'gate_damage_void', 'rule_comp_penalty'),
  },
  16: {
    fillers: { 3: g('composite', 'gate_combo', 'gate_damage_void'), 7: g('doubleGate', 'gate_element', 'gate_undying') },
    boss: g('composite', 'gate_combo', 'gate_damage_void', 'gate_element', 'rule_comp_penalty'),
  },
};

const mob = (id: string): EncounterRef => ({ kind: 'mob', id });

/**
 * 给关卡叠上本章的闸门层。
 *
 * 闸门怪以**追加一波**的方式进场，而不是替换既有波次：替换会让 archetype
 * （高防傀儡关、自疗蛟关……）失去它本来要教的东西，一关同时换两件事，
 * 玩家就归因不到任何一件上。代价是这些关变长，故一并升为精英档，奖励跟上。
 *
 * Boss 关同样是追加，位置插在 prepMob 之后、Boss 本体之前：热身波仍然承担
 * 它原本的 archetype 教学（高防傀儡、自疗蛟……），闸门怪紧随其后，
 * 让玩家在打 Boss 本体前先看清这一场的闸门长什么样。
 */
export function applyGateLayer(stage: StageDef): StageDef {
  const plan = CHAPTER_GATE_PLAN[stage.chapter];
  if (!plan) return stage;

  if (stage.isBoss) {
    if (!plan.boss) return stage;
    const entry = plan.boss;
    return {
      ...stage,
      // prepMob 恒在首位（见 buildChapterBossDrop 的 encounters 顺序）
      encounters: [stage.encounters[0], mob(GATE_MOB[entry.mob]), ...stage.encounters.slice(1)],
      mechanics: mergeMechanics(stage.mechanics, entry.mechanics),
      starTurnLimit: stage.starTurnLimit + 4,
    };
  }

  const entry = plan.fillers[stage.index];
  if (!entry) return stage;
  return {
    ...stage,
    type: 'elite',
    dropTableId: eliteDropTableOf(stage.dropTableId),
    encounters: [...stage.encounters, mob(GATE_MOB[entry.mob])],
    mechanics: mergeMechanics(stage.mechanics, entry.mechanics),
    // 闸门关多一波，回合上限跟着放宽，否则三星条件会变成「必须秒过闸门」
    starTurnLimit: stage.starTurnLimit + 4,
  };
}

function mergeMechanics(
  base: readonly string[] | undefined,
  add: readonly string[],
): readonly string[] {
  const out = [...(base ?? [])];
  for (const id of add) if (!out.includes(id)) out.push(id);
  return out;
}

/** 普通档掉落表升精英档；没有对应精英表时原样保留 */
function eliteDropTableOf(id: string): string {
  const upgraded = id.replace(/_normal$/, '_elite');
  return ELITE_DROP_TABLES.has(upgraded) ? upgraded : id;
}

const ELITE_DROP_TABLES = new Set([
  'dt_cave_elite', 'dt_peak_elite', 'dt_trial_elite',
]);
