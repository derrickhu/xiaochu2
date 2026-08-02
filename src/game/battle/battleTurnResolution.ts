import { type Element } from '@/balance/combat';
import { calcDamage, calcHeal, comboMultiplier } from '@/formulas/damage';
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
  const runMult = (opts.runDamageMult ?? 1) * comboMasterMult * heartFireMult;
  const thunderPct = opts.thunderTrueDamagePct ?? 0;
  const thunderMatch = opts.thunderMatchCount ?? Infinity;
  let firstAttackPending = opts.firstMatchCrit === true;

  for (const group of opts.groups) {
    if (group.orb === 'heart') {
      healOrbs += group.cells.length;
      continue;
    }
    const element = group.orb as Element;
    if (opts.bannedElements.has(element)) continue;
    const petIndex = opts.team.findIndex((p) => p.def.element === element);
    if (petIndex < 0) continue;
    const pet = opts.team[petIndex];
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
      buffMult: opts.teamDamageMult * opts.elementBuffMult(element) * runMult,
      comboBonus: opts.leaderComboBonus,
    }) * opts.elementTraitDamageMult(pet, opts.enemy.def.element);
    // 属性吸收与减伤同层（都是敌方抗性），在增伤乘区之后结算
    let damage = Math.max(
      1,
      Math.floor(
        raw
        * (1 - (opts.enemy.dmgReduction?.reduction ?? 0))
        * opts.elementAbsorbMult(element),
      ),
    );
    // 雷霆真伤不吃防御与抗性，直接叠在该组伤害上
    if (thunderPct > 0 && group.cells.length >= thunderMatch) {
      damage += Math.floor((opts.teamAtkTotal ?? 0) * thunderPct);
    }
    attacks.push({
      petIndex,
      element,
      damage,
      isCrit,
      counter: opts.counterRelation(element, opts.enemy.def.element),
    });
  }

  const heartHeal = (healOrbs > 0 && !opts.noHeartHeal)
    ? Math.floor(calcHeal(opts.teamRcvTotal, healOrbs, combo, opts.teamHealBonus) * opts.heartHealMult)
    : 0;
  return {
    combo,
    comboMul,
    attacks,
    heal: heartHeal + opts.passiveRegenPerTurn,
  };
}
