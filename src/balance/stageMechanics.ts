/**
 * 机制节奏表（纯数据，零逻辑）——「打关不枯燥」的单一真源
 *
 * 三轴机制来源：
 * - board：棋盘/珠子机制（保鲜价值最高）。当前落地「封印珠」，其余为扩展点。
 * - enemy：敌人机制（复用 enemies.ts 的技能组合，标签用于 UI 提示与节奏统计）。
 * - rule：关卡规则机制（最轻，数据驱动：禁心、禁属性珠、多波等）。
 *
 * 节奏原则：每章 Boss 首教 1 种可玩挑战（bossChallenge.ts）；
 * 铺垫关仅复用已学挑战。本表 orb_* / rule_* 为真机制；enemy_* 多为 UI 提示，实际靠 encounters 配 mob。
 */
import type { Element } from './combat';

export type MechanicAxis = 'board' | 'enemy' | 'rule';

export interface MechanicDef {
  id: string;
  axis: MechanicAxis;
  name: string;
  /** 设计说明 */
  desc: string;
  /** 战前一句话提示（UI 展示用） */
  uiHint: string;
  // ── board 轴参数 ──
  /** 开局封印珠数量（board 轴） */
  sealOrbs?: number;
  /** 开局整列封印的列数（board 轴，锁列） */
  sealColumns?: number;
  // ── rule 轴参数 ──
  /** 心珠不回血（禁心） */
  noHeartHeal?: boolean;
  /** 禁用某属性珠（消除无伤害，等同未覆盖） */
  banElement?: Element;
  /** 同源相斥：读队伍属性种类数，过多则敌人变强、过少则敌人减伤 */
  compPenalty?: boolean;
  /**
   * 战前「必带对策」清单项。区别于 uiHint 的一句话描述，
   * 这里是玩家可自查的短标签，编队界面会逐条比对当前阵容能否应对。
   */
  counterTags?: readonly string[];
}

export const MECHANICS: Readonly<Record<string, MechanicDef>> = {
  // ── board 轴 ──
  orb_sealed: {
    id: 'orb_sealed', axis: 'board', name: '封印珠',
    desc: '开局随机封印若干珠子，锁定不可拖动/消除；在其相邻处发生消除即可解封。',
    uiHint: '盘面有封印珠：消除其相邻珠子来解封',
    sealOrbs: 4,
  },
  orb_rock: {
    id: 'orb_rock', axis: 'board', name: '顽石封印',
    desc: '更高密度的封印珠（顽石变体），需要更主动地清理周边解封。',
    uiHint: '盘面顽石封印较多：优先清理周边解封',
    sealOrbs: 6,
  },
  orb_locked_col: {
    id: 'orb_locked_col', axis: 'board', name: '锁列',
    desc: '开局整列封印。与散点封印同规则（相邻消除解封），但压迫集中：'
      + '一整列不可用会直接掐断纵向连消路线，逼玩家先花几手拆封而不是直接铺 Combo。',
    uiHint: '盘面有一整列被锁：先从两侧消除拆封',
    sealColumns: 1,
  },

  // ── enemy 轴（映射到 enemies.ts 既有技能组合，标签用于节奏与提示） ──
  enemy_fast_attack: {
    id: 'enemy_fast_attack', axis: 'enemy', name: '高攻速',
    desc: '敌人攻击间隔短，缺乏治疗/护盾会被持续磨血。',
    uiHint: '敌人攻速快：备好治疗或护盾',
  },
  enemy_damage_reduce: {
    id: 'enemy_damage_reduce', axis: 'enemy', name: '减伤',
    desc: '敌人周期性获得减伤，低倍率输出收益骤降。',
    uiHint: '敌人会减伤：用克制或爆发破防',
  },
  enemy_self_heal: {
    id: 'enemy_self_heal', axis: 'enemy', name: '自疗',
    desc: '敌人会自我回复，DPS 不足会被拖死。',
    uiHint: '敌人会自疗：集中爆发抢血线',
  },
  enemy_charge: {
    id: 'enemy_charge', axis: 'enemy', name: '蓄力重击',
    desc: '敌人蓄力后打出重击，需要护盾/治疗扛住。',
    uiHint: '敌人会蓄力重击：护盾/治疗扛住',
  },
  enemy_double_charge: {
    id: 'enemy_double_charge', axis: 'enemy', name: '连续蓄力',
    desc: '高频蓄力重击，对续航与减伤要求更高。',
    uiHint: '敌人连续蓄力：续航与护盾要足',
  },
  enemy_guard_heal: {
    id: 'enemy_guard_heal', axis: 'enemy', name: '减伤+自疗',
    desc: '减伤与自疗双技能，必须克制+爆发+续航三者兼备。',
    uiHint: '敌人减伤又自疗：克制+爆发+续航缺一不可',
  },

  // ── enemy 轴（目标十三：逐章解锁的新敌人机制，载体为章末 Boss 技能组） ──
  enemy_seal_cast: {
    id: 'enemy_seal_cast', axis: 'enemy', name: '战中封珠',
    desc: '敌人战斗中周期性封印珠子，持续压缩可用盘面（Ch4 首教）。',
    uiHint: '敌人会封印珠子：净化技或相邻消除解封',
  },
  enemy_poison: {
    id: 'enemy_poison', axis: 'enemy', name: '剧毒',
    desc: '敌人对我方施加中毒 DoT，每回合掉血（Ch5 首教）。',
    uiHint: '敌人会下毒：带净化/驱散技解毒',
  },
  enemy_time_squeeze: {
    id: 'enemy_time_squeeze', axis: 'enemy', name: '时间压缩',
    desc: '敌人压缩转珠时限，操作窗口骤减（Ch6 首教）。',
    uiHint: '敌人会压缩转珠时间：加时技对抗',
  },
  enemy_heal_block: {
    id: 'enemy_heal_block', axis: 'enemy', name: '禁疗',
    desc: '敌人封锁心珠回复，续航依赖护盾（Ch7 首教）。',
    uiHint: '敌人会禁疗：靠护盾减伤扛过',
  },
  enemy_skill_seal_enrage: {
    id: 'enemy_skill_seal_enrage', axis: 'enemy', name: '技能封印+狂暴',
    desc: '敌人封印宠物主动技，低血后狂暴强化攻击（Ch8 终章复合）。',
    uiHint: '敌人会封技能且低血狂暴：速杀或重力爆发',
  },

  // ── enemy 轴（第 9~16 章：逐章首教一种新机制，载体见 bossChallenge.ts）──
  enemy_phase: {
    id: 'enemy_phase', axis: 'enemy', name: '形态转换',
    desc: '敌人跨过血线切换形态，攻击节奏与技能表都会变（Ch10 首教）。',
    uiHint: '敌人会转形态：血条分段处留一手爆发',
  },
  enemy_absorb: {
    id: 'enemy_absorb', axis: 'enemy', name: '属性吸收',
    desc: '敌人吸收克制自身的属性，那一色伤害近乎归零，逼中途换输出色（Ch11 首教）。',
    uiHint: '敌人会吸收克制色：备好第二种输出属性',
  },
  enemy_counter: {
    id: 'enemy_counter', axis: 'enemy', name: '反击态',
    desc: '敌人反击态下我方每次出手都会被反弹，铺 Combo 越多反伤越重（Ch12 首教）。',
    uiHint: '敌人反击态：少而重地打，别无脑铺 Combo',
  },
  enemy_atk_down: {
    id: 'enemy_atk_down', axis: 'enemy', name: '削攻',
    desc: '敌人削弱我方全部伤害，可被净化技解除（Ch13 首教）。',
    uiHint: '敌人会削弱我方伤害：带净化技解除',
  },
  enemy_resolve_guard: {
    id: 'enemy_resolve_guard', axis: 'enemy', name: '免控坚壁',
    desc: '敌人凝意期间免疫眩晕与威吓，控制链打法失效（Ch14 首教）。',
    uiHint: '敌人免疫控制：靠破防与爆发硬拆',
  },
  enemy_final_trial: {
    id: 'enemy_final_trial', axis: 'enemy', name: '终局试炼',
    desc: '终章复合：转形态 + 属性吸收 + 免控同场，对养成与编队的总检验（Ch16）。',
    uiHint: '终局试炼：克制/爆发/续航全要到位',
  },

  // ── enemy 轴（硬闸门：不满足条件伤害直接降为 1，堆数值无法抵消） ──
  gate_element: {
    id: 'gate_element', axis: 'enemy', name: '五行阵盾',
    desc: '敌人张开阵盾数回合：首消必须打出足够多种属性的伤害，否则整回合伤害降为 1。'
      + '只看首消，天降连锁不参与判定。',
    uiHint: '敌人有五行阵盾：首消要打出多种属性，否则本回合几乎无伤害',
    counterTags: ['多属性覆盖'],
  },
  gate_combo: {
    id: 'gate_combo', axis: 'enemy', name: '连锁盾',
    desc: '敌人张开连锁盾数回合：首消需达到指定连数，否则整回合伤害降为 1。'
      + '同样只认首消，避免天降 combo 帮倒忙或背刺。',
    uiHint: '敌人有连锁盾：首消要铺够连数，否则本回合几乎无伤害',
    counterTags: ['铺连能力'],
  },
  gate_damage_void: {
    id: 'gate_damage_void', axis: 'enemy', name: '锋锐无效',
    desc: '单次伤害超过阈值即被无效化——数值越高越吃亏。'
      + '解法是消出 5 连及以上：达到即穿透并额外增伤，把「堆攻」换成「练手」。',
    uiHint: '敌人无效化大伤害：用 5 连及以上消除穿透',
    counterTags: ['5 连消除'],
  },
  gate_undying: {
    id: 'gate_undying', axis: 'enemy', name: '不灭',
    desc: '血线以上的致死伤害会留 1 血，每场一次。'
      + '解法多条：持续伤害、固定伤害、追打，都能把这 1 血抹掉。',
    uiHint: '敌人有不灭：会留 1 血一次，备好持续伤害补刀',
    counterTags: ['持续伤害'],
  },
  gate_counter_seal: {
    id: 'gate_counter_seal', axis: 'enemy', name: '克属封印',
    desc: '封锁「克制敌人自身」那一色的全部珠。玩家赖以输出的主色整片锁死，'
      + '必须临时改用第二输出色，或先花几手拆封。',
    uiHint: '敌人会封克制色：备好第二输出属性',
    counterTags: ['第二输出色'],
  },

  // ── rule 轴 ──
  rule_comp_penalty: {
    id: 'rule_comp_penalty', axis: 'rule', name: '同源相斥',
    desc: '本关会看你的队伍属性构成：属性种类过多则敌人攻击提升，过少则敌人减伤。'
      + '「五色齐 + 总攻最高」在这里不再是万能解，中间的种类数才是甜点区。',
    uiHint: '本关同源相斥：属性种类太多或太少都会吃亏',
    compPenalty: true,
    counterTags: ['精简属性'],
  },
  rule_multi_wave: {
    id: 'rule_multi_wave', axis: 'rule', name: '多波',
    desc: '多波敌人，需保留血量与技能节奏。',
    uiHint: '多波敌人：注意保留血量',
  },
  rule_no_heal: {
    id: 'rule_no_heal', axis: 'rule', name: '禁心',
    desc: '本关心珠不回血，考验无伤运营与护盾。',
    uiHint: '本关禁心：心珠不回血，靠护盾与走位',
    noHeartHeal: true,
  },
  rule_ban_water: {
    id: 'rule_ban_water', axis: 'rule', name: '封水',
    desc: '本关水珠失效（消除无伤害），逼迫调整队伍属性。',
    uiHint: '本关水珠失效：换属性输出',
    banElement: 'water',
  },
  rule_ban_fire: {
    id: 'rule_ban_fire', axis: 'rule', name: '封火',
    desc: '本关火珠失效（消除无伤害），逼迫调整队伍属性。',
    uiHint: '本关火珠失效：换属性输出',
    banElement: 'fire',
  },
  rule_ban_metal: {
    id: 'rule_ban_metal', axis: 'rule', name: '封金',
    desc: '本关金珠失效（消除无伤害），逼迫调整队伍属性。',
    uiHint: '本关金珠失效：换属性输出',
    banElement: 'metal',
  },
  rule_ban_wood: {
    id: 'rule_ban_wood', axis: 'rule', name: '封木',
    desc: '本关木珠失效（消除无伤害），逼迫调整队伍属性。',
    uiHint: '本关木珠失效：换属性输出',
    banElement: 'wood',
  },
  rule_ban_earth: {
    id: 'rule_ban_earth', axis: 'rule', name: '封土',
    desc: '本关土珠失效（消除无伤害），逼迫调整队伍属性。',
    uiHint: '本关土珠失效：换属性输出',
    banElement: 'earth',
  },

  // ── 历练（阶段九收录）轴：标注高级怪收录玩法节奏 ──
  trial_capture: {
    id: 'trial_capture', axis: 'enemy', name: '历练收录',
    desc: '击败生物的高级形态即可收录进宠物池，随后可经召唤/碎片拥有。',
    uiHint: '击败高级形态可收录该生物',
  },
  trial_elite_pair: {
    id: 'trial_elite_pair', axis: 'enemy', name: '双形态历练',
    desc: '同一生物初级与高级形态接连登场，逐步施压。',
    uiHint: '初级铺垫、高级压轴：保留爆发收尾',
  },
  trial_void: {
    id: 'trial_void', axis: 'enemy', name: '虚空侵蚀',
    desc: '终局历练：高级怪数值与技能压满，养成与编队的总检验。',
    uiHint: '终局历练：克制+爆发+续航全到位',
  },
};

export function getMechanic(id: string): MechanicDef | undefined {
  return MECHANICS[id];
}

/** 汇总一组机制 id 的运行期效果（供战斗/模拟读取） */
export interface MechanicEffects {
  sealOrbs: number;
  sealColumns: number;
  noHeartHeal: boolean;
  bannedElements: Element[];
  hints: string[];
  /** 本关是否启用同源相斥（战斗开始时读队伍属性种类数结算） */
  compPenalty: boolean;
  /** 战前「必带对策」清单（去重后的短标签） */
  counterTags: string[];
}

export function resolveMechanics(ids: readonly string[] | undefined): MechanicEffects {
  const eff: MechanicEffects = {
    sealOrbs: 0, sealColumns: 0, noHeartHeal: false, bannedElements: [], hints: [],
    compPenalty: false, counterTags: [],
  };
  if (!ids) return eff;
  for (const id of ids) {
    const m = MECHANICS[id];
    if (!m) continue;
    if (m.sealOrbs) eff.sealOrbs = Math.max(eff.sealOrbs, m.sealOrbs);
    if (m.sealColumns) eff.sealColumns = Math.max(eff.sealColumns, m.sealColumns);
    if (m.noHeartHeal) eff.noHeartHeal = true;
    if (m.banElement && !eff.bannedElements.includes(m.banElement)) eff.bannedElements.push(m.banElement);
    if (m.compPenalty) eff.compPenalty = true;
    for (const tag of m.counterTags ?? []) {
      if (!eff.counterTags.includes(tag)) eff.counterTags.push(tag);
    }
    eff.hints.push(m.uiHint);
  }
  return eff;
}
