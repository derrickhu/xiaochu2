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
  // ── rule 轴参数 ──
  /** 心珠不回血（禁心） */
  noHeartHeal?: boolean;
  /** 禁用某属性珠（消除无伤害，等同未覆盖） */
  banElement?: Element;
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

  // ── rule 轴 ──
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
  noHeartHeal: boolean;
  bannedElements: Element[];
  hints: string[];
}

export function resolveMechanics(ids: readonly string[] | undefined): MechanicEffects {
  const eff: MechanicEffects = { sealOrbs: 0, noHeartHeal: false, bannedElements: [], hints: [] };
  if (!ids) return eff;
  for (const id of ids) {
    const m = MECHANICS[id];
    if (!m) continue;
    if (m.sealOrbs) eff.sealOrbs = Math.max(eff.sealOrbs, m.sealOrbs);
    if (m.noHeartHeal) eff.noHeartHeal = true;
    if (m.banElement && !eff.bannedElements.includes(m.banElement)) eff.bannedElements.push(m.banElement);
    eff.hints.push(m.uiHint);
  }
  return eff;
}
