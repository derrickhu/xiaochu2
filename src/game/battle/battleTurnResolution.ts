import { type Element } from '@/balance/combat';
import {
  applyDamageVoid,
  evaluateTurnGates,
  NO_GATES,
  type GateSnapshot,
} from '@/balance/damageGates';
import { calcDamage, calcHeal, comboMultiplier } from '@/formulas/damage';
import { killerMult, type LeaderTurnMods } from '@/formulas/team';
import type { MatchGroup } from '@/game/board/BoardModel';
import type { EnemyUnit, TeamPet, TurnResolution } from './battleTypes';

export interface ResolvePlayerTurnOptions {
  groups: MatchGroup[];
  team: readonly TeamPet[];
  enemy: EnemyUnit;
  bannedElements: ReadonlySet<Element>;
  enemyDefEffective: number;
  teamRcvTotal: number;
  noHeartHeal: boolean;
  passiveRegenPerTurn: number;
  teamDamageMult: number;
  /** 队长技「合鸣令」每连额外倍率（无辅助队长时为 0） */
  leaderComboBonus: number;
  /** 全队治疗强化（治疗招牌属性），放大心珠回复；默认 0 */
  teamHealBonus: number;
  /** 必暴击 buff（guaranteedCrit 状态）：本回合全部出手强制暴击 */
  guaranteedCrit: boolean;
  /** 心珠回复乘区（禁疗 debuff，无则 1） */
  heartHealMult: number;
  /** 单属性增伤乘区（elementDamageBuff 状态，无则 1） */
  elementBuffMult: (element: Element) => number;
  /** 敌方属性吸收乘区（被吸那一色的伤害折扣，无则 1） */
  elementAbsorbMult: (element: Element) => number;
  rng: () => number;
  elementTraitDamageMult: (pet: TeamPet, defender: Element) => number;
  counterRelation: (attacker: Element, defender: Element) => 1 | 0 | -1;

  // ── 通天塔灵机（缺省即无影响，主线与秘境不传） ──
  /** 与回合无关的固定增伤乘区（背水 / 猎手 / 收割 / 复仇，由控制器按当前血线预结算） */
  runDamageMult?: number;
  /** Combo 达门槛后的增伤（连锁大师） */
  comboMaster?: { threshold: number; mult: number };
  /** 每颗心珠为本回合提供的增伤（心火） */
  heartFirePerOrb?: number;
  /** 大消除的额外真伤比例（雷霆），按队伍攻击总和计算 */
  thunderTrueDamagePct?: number;
  /** 雷霆的消除数门槛 */
  thunderMatchCount?: number;
  /** 队伍攻击总和（雷霆真伤基数） */
  teamAtkTotal?: number;
  /** 本回合首次出手必定暴击（一击必杀） */
  firstMatchCrit?: boolean;

  /** 当前生效的硬闸门（缺省 = 无闸门，主线早期与秘境不传） */
  gates?: GateSnapshot;

  /**
   * 队长技里需要看盘面的部分（专精令 / 连锋令 / 疾锋令）。
   * 血线条件档已由控制器按当时血量折进 runDamageMult，不走这里。
   */
  leader?: LeaderTurnMods;
}

/**
 * 统计首消（waveIndex === 0）情况，供闸门判定。
 * 只认玩家亲手摆出的第一波：天降连锁不参与，避免随机 combo 背刺。
 * 属性数只算「真能造成伤害」的色——未编入队伍或被本关禁用的珠不算数，
 * 口径对齐 PAD 的「属性攻击盾」而非「属性盾」。
 */
function firstWaveStats(opts: ResolvePlayerTurnOptions): { elements: number; combo: number } {
  const elements = new Set<Element>();
  let combo = 0;
  for (const group of opts.groups) {
    if ((group.waveIndex ?? 0) !== 0) continue;
    combo++;
    if (group.orb === 'heart') continue;
    const element = group.orb as Element;
    if (opts.bannedElements.has(element)) continue;
    if (!opts.team.some((p) => p.def.element === element)) continue;
    elements.add(element);
  }
  return { elements: elements.size, combo };
}

export function resolvePlayerTurnDamage(opts: ResolvePlayerTurnOptions): TurnResolution {
  const combo = opts.groups.length;
  const comboMul = comboMultiplier(combo, opts.leaderComboBonus);
  const attacks: TurnResolution['attacks'] = [];
  let healOrbs = 0;

  // 心火要在算伤害前拿到本回合心珠总数，故先数一遍
  let heartOrbs = 0;
  for (const group of opts.groups) {
    if (group.orb === 'heart') heartOrbs += group.cells.length;
  }

  const comboMasterMult = opts.comboMaster && combo >= opts.comboMaster.threshold
    ? opts.comboMaster.mult
    : 1;
  const heartFireMult = 1 + (opts.heartFirePerOrb ?? 0) * heartOrbs;
  const baseRunMult = (opts.runDamageMult ?? 1) * comboMasterMult * heartFireMult;
  const thunderPct = opts.thunderTrueDamagePct ?? 0;
  const thunderMatch = opts.thunderMatchCount ?? Infinity;
  let firstAttackPending = opts.firstMatchCrit === true;

  // 硬闸门：任一未满足则整回合消珠伤害压到 1，堆数值无法抵消
  const gates = opts.gates ?? NO_GATES;
  const stats = firstWaveStats(opts);
  const verdict = evaluateTurnGates(gates, stats);

  // 连锋令按首消 combo 判定，口径与连锁盾一致：天降凑出来的连不算数，
  // 否则「铺连」这个操作目标会被随机性稀释掉
  const leader = opts.leader;
  const leaderComboMult = leader?.comboStep && stats.combo >= leader.comboStep.threshold
    ? leader.comboStep.mult
    : 1;
  const runMult = baseRunMult * leaderComboMult;

  for (const group of opts.groups) {
    if (group.orb === 'heart') {
      healOrbs += group.cells.length;
      continue;
    }
    const element = group.orb as Element;
    if (opts.bannedElements.has(element)) continue;
    /*
     * 同属性的宠物**全部**参与这一组攻击（v0.7；旧实现是 findIndex 只取第一只）。
     *
     * 旧口径下同色第二只完全不出伤，等于规定了「五色各一只」是唯一不浪费席位的编队，
     * 于是所谓「换阵容」永远只是在同一个位置上换一只更高星的宠——纵向养成的换皮而已。
     * 全员出手之后，收窄属性才第一次有正收益（少一色，但那一色打两倍），
     * 和「盘面只掉本队颜色」「同源相斥的三色甜点区」共同构成一组真实取舍：
     *   五色 = 覆盖广、能过五行阵盾，但吃同源相斥的 ×1.6 敌攻；
     *   三色 = 单色爆发翻倍、敌人不加攻，但过不了属性闸门。
     */
    const attackers = opts.team
      .map((pet, petIndex) => ({ pet, petIndex }))
      .filter(({ pet }) => pet.def.element === element);
    if (attackers.length === 0) continue;

    // 专精令按属性、疾锋令按单组消除数生效，两者都是「这一组」的乘区而非整回合的
    const leaderElementMult = leader?.elementMult?.element === element
      ? leader.elementMult.mult
      : 1;
    const leaderBigMatchMult = leader?.bigMatch && group.cells.length >= leader.bigMatch.matchCount
      ? leader.bigMatch.mult
      : 1;
    // 雷霆真伤按「组」结算，不随出手宠数量翻倍，故只挂在这一组的第一只身上
    let thunderPending = verdict.turnMult > 0 && thunderPct > 0 && group.cells.length >= thunderMatch;

    for (const { pet, petIndex } of attackers) {
      // 暴击为「个体属性」：用出手宠自身的暴击率掷骰、暴击伤害结算；必暴击 buff 强制暴击
      const isCrit = opts.guaranteedCrit || firstAttackPending || opts.rng() < pet.critRate;
      firstAttackPending = false;
      const raw = calcDamage({
        atk: pet.atk,
        matchCount: group.cells.length,
        combo,
        attackerElement: element,
        defenderElement: opts.enemy.def.element,
        defenderDef: opts.enemyDefEffective,
        isCrit,
        critDamage: pet.critDamage,
        buffMult: opts.teamDamageMult
          * opts.elementBuffMult(element)
          * runMult
          * leaderElementMult
          * leaderBigMatchMult,
        comboBonus: opts.leaderComboBonus,
      })
        * opts.elementTraitDamageMult(pet, opts.enemy.def.element)
        // 特攻与克制同层但独立：对位宠靠这一乘区压过错位的高星宠
        * killerMult(pet.def, opts.enemy.def.element);
      // 属性吸收与减伤同层（都是敌方抗性），在增伤乘区之后结算；
      // 闸门乘区最后压上，未满足时配合 Math.max(1) 就是「伤害降为 1」
      let damage = Math.max(
        1,
        Math.floor(
          raw
          * (1 - (opts.enemy.dmgReduction?.reduction ?? 0))
          * opts.elementAbsorbMult(element)
          * verdict.turnMult,
        ),
      );
      // 雷霆真伤不吃防御与抗性，但闸门未过时不给它开后门
      if (thunderPending) {
        damage += Math.floor((opts.teamAtkTotal ?? 0) * thunderPct);
        thunderPending = false;
      }
      // 锋锐无效：超过阈值的一击归零，5 连消除可穿透并拿额外增伤
      const voidOutcome = applyDamageVoid(damage, group.cells.length, gates.voidThreshold);
      damage = Math.max(1, voidOutcome.damage);
      attacks.push({
        petIndex,
        element,
        damage,
        isCrit,
        counter: opts.counterRelation(element, opts.enemy.def.element),
        voided: voidOutcome.voided,
        pierced: voidOutcome.pierced,
      });
    }
  }

  const heartHeal = (healOrbs > 0 && !opts.noHeartHeal)
    ? Math.floor(calcHeal(opts.teamRcvTotal, healOrbs, combo, opts.teamHealBonus) * opts.heartHealMult)
    : 0;
  return {
    combo,
    comboMul,
    attacks,
    heal: heartHeal + opts.passiveRegenPerTurn,
    gateUnmet: verdict.unmet,
  };
}
