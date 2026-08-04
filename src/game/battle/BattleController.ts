/**
 * 战斗控制器（状态机 + 结算，零渲染）
 *
 * 状态流转：
 *   playerTurn(拖珠) → resolving(消除/下落连锁) → petAttack(宠物依次攻击)
 *   → enemyTurn(敌人计数/反击) → playerTurn；敌人全灭 → victory；英雄 HP=0 → defeat
 *
 * 所有数值只走 formulas + balance，本层禁止 magic number。
 */
import { COMBAT, ELEMENT_COUNTERS, type Element, type OrbType } from '@/balance/combat';
import {
  PET_MAP, DEFAULT_TEAM, INITIAL_PET_LEVEL, INITIAL_PET_STAR,
  type PetDef,
} from '@/balance/pets';
import { resolveEncounter, type ResolvedEncounter } from '@/balance/enemies';
import { STAGE_MAP, type StageDef } from '@/balance/stages';
import { resolveMechanics } from '@/balance/stageMechanics';
import {
  evaluateCompPenalty,
  NO_COMP_PENALTY,
  type CompPenalty,
} from '@/balance/damageGates';
import { ECONOMY } from '@/balance/economy';
import { stageDrops } from '@/formulas/economyOutput';
import {
  teamMaxHp, teamRcv, teamElements, petAtkInTeam, teamEffectAggregate, petSelfCombatProfile,
  teamLeaderSkill, leaderComboBonus, leaderTurnMods,
  type LeaderTurnMods, type TeamMember,
} from '@/formulas/team';
import type { ResolvedLeaderSkill } from '@/balance/leaderSkill';
import { applyDamageReduction } from '@/formulas/damage';
import type { MatchGroup } from '@/game/board/BoardModel';
import {
  emptyRunModifiers,
  BIG_MATCH_COUNT, COMBO_MASTER_THRESHOLD, HUNTER_HP_PCT,
  LAST_STAND_HP_PCT, REAPER_HP_PCT, REVENGE_MAX_STACK,
  type TowerRunModifiers,
} from '@/balance/towerBless';
import { BattleStatusStore, type StatusInstance } from './BattleStatus';
import {
  runSkill,
  skillCdForPet,
  skillForPet,
  type SkillResult,
} from './SkillEngine';
import type {
  BattleResult,
  BattleState,
  EnemyActResult,
  EnemyUnit,
  PetAttack,
  SkillCastResult,
  TeamPet,
  TurnResolution,
} from './battleTypes';
import { applySkillResult, buildPetSkillCastResult } from './battleSkillResolution';
import { buildBattleResult, spawnBattleEnemy } from './battleLifecycle';
import { resolvePlayerTurnDamage } from './battleTurnResolution';
import { runEnemyTurnAction } from './battleEnemyTurn';
import { makeEnemyCaster, makePetCaster, makeSkillRuntimeContext } from './battleRuntimeContext';

export type {
  BattleResult,
  BattleState,
  EnemyActResult,
  EnemyUnit,
  PetAttack,
  SkillCastResult,
  TeamPet,
  TurnResolution,
} from './battleTypes';

export class BattleController {
  readonly stage: StageDef;
  readonly team: TeamPet[];
  /** 队伍总回复（心珠回血基数） */
  readonly teamRcvTotal: number;
  /** 队伍属性覆盖（不在集合内的属性珠 = 无效珠，消除无伤害） */
  readonly teamElementSet: ReadonlySet<Element>;

  // ── 关卡机制（机制节奏表 stageMechanics.ts 解析） ──
  /** 开局封印珠数量（0 = 无） */
  readonly sealOrbCount: number;
  /** 开局整列封印的列数（0 = 无） */
  readonly sealColumnCount: number;
  /** 心珠是否不回血（禁心） */
  readonly noHeartHeal: boolean;
  /** 被禁用的属性珠（消除无伤害） */
  readonly bannedElements: ReadonlySet<Element>;
  /** 机制战前提示（UI 展示） */
  readonly mechanicHints: readonly string[];
  /** 战前「必带对策」清单标签（编队界面逐条比对当前阵容） */
  readonly counterTags: readonly string[];
  /** 同源相斥的结算结果（无该机制时为中性值） */
  readonly compPenalty: CompPenalty;

  state: BattleState = 'playerTurn';

  heroMaxHp: number;
  heroHp: number;

  /** 被动：每回合回血绝对值（队伍 regen 被动 × 最大生命） */
  readonly passiveRegenPerTurn: number;
  /** 被动：常驻全队增伤总乘区（合并 ladder + 招牌/星级 teamDamageBonus） */
  readonly teamDamageMult: number;
  /** 队长技：辅助队长的每连额外倍率（其余 role 的队长技走三维乘区，已含在 atk/hp/rcv 里） */
  readonly leaderComboBonus: number;
  /** 队长技解析结果（战斗内 UI 展示用；无人上阵为 null） */
  readonly leaderSkill: ResolvedLeaderSkill | null;
  /** 队长技里需要看盘面的部分（专精令 / 连锋令 / 疾锋令） */
  private readonly _leaderTurnMods: LeaderTurnMods;

  // ── 战斗属性（阶段十二，构造时定值，全队属性聚合后封顶） ──
  readonly teamDamageReduction: number;
  readonly teamHealBonus: number;

  /** 当前波次（0 起） */
  waveIndex = 0;
  enemy: EnemyUnit;

  /** 已用回合数（拖珠并发生交换记 1 回合） */
  turnsUsed = 0;
  /** 英雄是否受过伤（统计用，不影响星级） */
  tookDamage = false;
  /** 不灭刚刚挡下一次致死伤害（表现层播「不灭」横幅后由场景清零） */
  undyingTriggered = false;

  /** 通天塔灵机聚合修正（主线/秘境为空修正） */
  readonly runMods: TowerRunModifiers;
  /** 复仇栈：每受一次敌人攻击 +1，玩家回合结算后清零 */
  private _revengeStacks = 0;

  private _statuses = new BattleStatusStore();

  /** 本关解析后的各波遭遇（战斗模板 + 收录元信息） */
  private _waves: ResolvedEncounter[];

  /** 队伍攻击总和（雷霆真伤基数） */
  private _teamAtkTotal = 0;

  private _rng: () => number;

  /**
   * @param levelStarOf 按宠物 id 取真实养成进度；默认用初始等级/星级（测试与脱离存档场景）
   * @param runMods 通天塔灵机修正；缺省为空修正，主线与秘境不受影响
   */
  constructor(
    stageId: string,
    teamIds?: readonly string[],
    rng: () => number = Math.random,
    levelStarOf: (petId: string) => { level: number; star: number } =
      () => ({ level: INITIAL_PET_LEVEL, star: INITIAL_PET_STAR }),
    runMods: TowerRunModifiers = emptyRunModifiers(),
  ) {
    const stage = STAGE_MAP.get(stageId);
    if (!stage) throw new Error(`未知关卡: ${stageId}`);
    this.stage = stage;
    this._waves = stage.encounters.map((ref) => resolveEncounter(ref));
    this._rng = rng;
    this.runMods = runMods;

    const ids = teamIds && teamIds.length > 0 ? teamIds : DEFAULT_TEAM;
    const members: TeamMember[] = ids
      .map((id) => PET_MAP.get(id))
      .filter((def): def is PetDef => !!def)
      .map((def) => ({ def, ...levelStarOf(def.id) }));

    // 灵机的开局冷却减免（速咏 + 势如破竹）叠在初始 CD 上，至少留 1 回合
    const startCdCut = runMods.skillCdReduce + runMods.floorStartCdReduce;
    this.team = members.map((m) => {
      const profile = petSelfCombatProfile(m.def, m.star, m.level);
      return {
        def: m.def,
        level: m.level,
        star: m.star,
        skill: skillForPet(m.def, m.star, m.level),
        atk: Math.floor(petAtkInTeam(members, m) * runMods.atkMult),
        critRate: profile.critRate + runMods.critRateAdd,
        critDamage: profile.critDamage + runMods.critDamageAdd,
        skillCdLeft: Math.max(
          0,
          skillCdForPet(m.def, m.star, m.level) - startCdCut,
        ),
      };
    });
    this.heroMaxHp = Math.floor(teamMaxHp(members) * runMods.hpMult);
    this.heroHp = this.heroMaxHp;
    this.teamRcvTotal = teamRcv(members);
    this.teamElementSet = teamElements(members);
    this._teamAtkTotal = this.team.reduce((sum, p) => sum + p.atk, 0);

    const teamFx = teamEffectAggregate(members);
    this.passiveRegenPerTurn = Math.floor(this.heroMaxHp * teamFx.regenPct);
    this.teamDamageMult = teamFx.teamDamageMult;
    this.leaderSkill = teamLeaderSkill(members);
    this.leaderComboBonus = leaderComboBonus(members);
    this._leaderTurnMods = leaderTurnMods(members);
    this.teamDamageReduction = teamFx.damageReduction + runMods.damageReductionAdd;
    this.teamHealBonus = teamFx.healBonus + runMods.healBonusAdd;
    const startShield = Math.floor(this.heroMaxHp * teamFx.startShieldPct);
    if (startShield > 0) {
      this._statuses.add({
        id: 'team_shield', kind: 'shield', owner: 'team',
        value: startShield, sourceSkillId: 'passive_start_shield', stack: 'add',
      });
    }

    const mech = resolveMechanics(stage.mechanics);
    this.sealOrbCount = mech.sealOrbs;
    this.sealColumnCount = mech.sealColumns;
    this.noHeartHeal = mech.noHeartHeal;
    this.bannedElements = new Set(mech.bannedElements);
    this.mechanicHints = mech.hints;
    this.counterTags = mech.counterTags;

    // 同源相斥：开场读一次队伍属性种类数。属性铺太宽敌人变强、收太窄敌人减伤，
    // 中间才是甜点区——这条直接拆掉「五色齐 + 总攻最高」的恒定最优解。
    this.compPenalty = mech.compPenalty
      ? evaluateCompPenalty(this.teamElementSet.size)
      : NO_COMP_PENALTY;

    this.enemy = spawnBattleEnemy(this.stage, this._waves, 0);
    this._applyCompPenaltyToEnemy();
  }

  /** 当前护盾值（吸收敌人伤害，先于 HP 扣减） */
  get shield(): number {
    return this._statuses.get('team', 'shield')?.value ?? 0;
  }

  /** 全队增伤 buff（dmgBoost 技能），null = 无 */
  get dmgBuff(): { mult: number; turnsLeft: number } | null {
    const s = this._statuses.get('team', 'teamDamageBuff');
    if (!s) return null;
    return { mult: s.value, turnsLeft: s.turnsLeft ?? 0 };
  }

  /** 全部持续状态（HUD 状态图标行读取） */
  get statuses(): readonly StatusInstance[] {
    return this._statuses.all;
  }

  /** 是否有硬闸门生效（表现层据此判断该播「闸门破解」还是常规命中音） */
  get hasActiveGate(): boolean {
    return this._statuses.hasActiveGate();
  }

  /** 当前拖珠时限（秒）：基础 ± 加时/时间压缩，夹在 [dragTimeMin, dragTimeMax] */
  get dragTimeLimit(): number {
    const t = COMBAT.dragTimeLimit + this._statuses.dragTimeDelta() + this.runMods.dragTimeAdd;
    return Math.min(COMBAT.dragTimeMax, Math.max(COMBAT.dragTimeMin, t));
  }

  /** 被封印主动技的宠物 index（技能封印 debuff，无则 null） */
  get sealedPetIndex(): number | null {
    return this._statuses.sealedPetIndex();
  }

  get totalWaves(): number {
    return this._waves.length;
  }

  /** 战斗是否已分出胜负 */
  get isFinished(): boolean {
    return this.state === 'victory' || this.state === 'defeat';
  }

  /** ── playerTurn → resolving ── */
  beginResolve(): void {
    this.state = 'resolving';
    this.turnsUsed++;
  }

  /** 空拖（未发生交换）不计回合，直接回到玩家回合 */
  cancelResolve(): void {
    this.state = 'playerTurn';
  }

  /**
   * 盘面连锁结束后结算本回合：
   * groups 为整个连锁过程累计的所有消除组（顺序即 Combo 顺序）
   */
  resolveTurn(groups: MatchGroup[]): TurnResolution {
    this.state = 'petAttack';
    const mods = this.runMods;
    const resolution = resolvePlayerTurnDamage({
      groups,
      team: this.team,
      enemy: this.enemy,
      bannedElements: this.bannedElements,
      enemyDefEffective: this._enemyDefEffective,
      teamRcvTotal: this.teamRcvTotal,
      noHeartHeal: this.noHeartHeal,
      passiveRegenPerTurn: this.passiveRegenPerTurn,
      teamDamageMult: (this.dmgBuff?.mult ?? 1.0)
        * this.teamDamageMult
        * this._statuses.teamAtkDebuffMult(),
      leaderComboBonus: this.leaderComboBonus,
      teamHealBonus: this.teamHealBonus,
      guaranteedCrit: this._statuses.hasGuaranteedCrit(),
      heartHealMult: this._statuses.heartHealMult(),
      elementBuffMult: (el) => this._statuses.elementBuffMult(el) * (mods.elementMult[el] ?? 1),
      elementAbsorbMult: (el) => this._statuses.elementAbsorbMult(el),
      rng: this._rng,
      elementTraitDamageMult: (pet, defender) => this._elementTraitDamageMult(pet.def, defender),
      counterRelation: (attacker, defender) => this._counterRelation(attacker, defender),
      runDamageMult: this._runDamageMult(),
      comboMaster: mods.comboMasterMult > 1
        ? { threshold: COMBO_MASTER_THRESHOLD, mult: mods.comboMasterMult }
        : undefined,
      heartFirePerOrb: mods.heartFirePerOrb,
      thunderTrueDamagePct: mods.thunderTrueDamagePct,
      thunderMatchCount: BIG_MATCH_COUNT,
      teamAtkTotal: this._teamAtkTotal,
      firstMatchCrit: mods.firstMatchCrit,
      gates: this._statuses.gateSnapshot(),
      leader: this._leaderTurnMods,
    });
    // 复仇是「受击攒、下回合放」，本回合用掉即清
    this._revengeStacks = 0;
    return resolution;
  }

  /**
   * 与血线相关的灵机增伤（背水 / 猎手 / 收割 / 复仇）。
   *
   * 这几条都只依赖结算瞬间的血量快照，故在这里一次算完再传进纯函数，
   * 避免把「灵机」这个概念漏进伤害结算层。
   */
  private _runDamageMult(): number {
    const mods = this.runMods;
    let mult = 1;
    if (mods.lastStandMult > 1 && this.heroHp <= this.heroMaxHp * LAST_STAND_HP_PCT) {
      mult *= mods.lastStandMult;
    }
    const enemyHpPct = this.enemy.hp / Math.max(1, this.enemy.maxHp);
    if (mods.hunterMult > 1 && enemyHpPct > HUNTER_HP_PCT) mult *= mods.hunterMult;
    if (mods.reaperMult > 1 && enemyHpPct < REAPER_HP_PCT) mult *= mods.reaperMult;
    if (mods.revengePerStack > 0 && this._revengeStacks > 0) {
      mult *= 1 + mods.revengePerStack * this._revengeStacks;
    }
    // 队长技的血线条件档（昂扬令 / 血战令）与灵机同为「看结算瞬间血量」，并在此
    const hp = this._leaderTurnMods.hpConditional;
    if (hp) {
      const pct = this.heroHp / Math.max(1, this.heroMaxHp);
      const met = hp.mode === 'high' ? pct >= hp.threshold : pct <= hp.threshold;
      if (met) mult *= hp.mult;
    }
    return mult;
  }

  /** 应用回血（petAttack 阶段开头调用） */
  applyHeal(heal: number): number {
    const before = this.heroHp;
    this.heroHp = Math.min(this.heroMaxHp, this.heroHp + heal);
    return this.heroHp - before;
  }

  /**
   * 应用单次宠物攻击伤害。
   * 返回敌人是否死亡（死亡后由场景决定调用 nextWave 或结束战斗）
   */
  applyPetAttack(attack: PetAttack): { enemyDead: boolean } {
    const enemyDead = this.damageEnemy(attack.damage);
    // 余烬：击败敌人回一口血（跨波累计，是塔内 HP 经济的主要补充）
    if (enemyDead && this.runMods.killHealPct > 0) {
      this.applyHeal(Math.floor(this.heroMaxHp * this.runMods.killHealPct));
    }
    return { enemyDead };
  }

  /**
   * 对敌人扣血的唯一入口（消珠 / 主动技 / DoT 都必须走这里），返回是否死亡。
   *
   * 不灭（根性）在此拦截：血线以上的致死伤害留 1 血并消耗掉状态。
   * 三条致死路径统一收口是必须的——只挡消珠会让「用技能补最后一下」白嫖过根性。
   */
  damageEnemy(amount: number): boolean {
    const next = this.enemy.hp - amount;
    if (next <= 0 && this._statuses.consumeUndying()) {
      this.enemy.hp = 1;
      this.undyingTriggered = true;
      return false;
    }
    this.enemy.hp = Math.max(0, next);
    return this.enemy.hp <= 0;
  }

  /**
   * 反击结算：敌人处于反击态时，按本回合我方出手次数一次性反弹。
   * 逐次反弹在表现上会和错峰起飞的攻击动画搅在一起（多次受击闪烁），
   * 故合并为一击结算，数值口径不变（hits × 敌攻 × 乘区），也便于模拟器镜像。
   */
  applyCounterStrike(hits: number): { damage: number; absorbed: number; heroDead: boolean } | null {
    const mult = this._statuses.counterStrikeMult();
    if (mult <= 0 || hits <= 0) return null;
    return this.applyEnemyDamage(Math.floor(this.enemy.atk * mult * hits));
  }

  /** 是否还有下一波敌人 */
  hasNextWave(): boolean {
    return this.waveIndex + 1 < this.totalWaves;
  }

  /** 推进到下一波 */
  nextWave(): EnemyUnit {
    this.waveIndex++;
    this._statuses.clearOwner('enemy');
    this.enemy = spawnBattleEnemy(this.stage, this._waves, this.waveIndex);
    this._applyCompPenaltyToEnemy();
    return this.enemy;
  }

  /**
   * 同源相斥落到当前波敌人身上：攻击乘区直接改 atk，减伤挂成无限期状态。
   * 每次换波都要重新施加——clearOwner('enemy') 会把上一波的减伤一并清掉。
   */
  private _applyCompPenaltyToEnemy(): void {
    const { enemyAtkMult, enemyReduction } = this.compPenalty;
    if (enemyAtkMult !== 1) {
      this.enemy.atk = Math.floor(this.enemy.atk * enemyAtkMult);
    }
    if (enemyReduction > 0) {
      this._statuses.add({
        id: 'enemy_comp_penalty',
        kind: 'enemyDamageReduction',
        owner: 'enemy',
        value: enemyReduction,
        sourceSkillId: 'rule_comp_penalty',
        stack: 'max',
      });
      this._syncEnemyStatusMirrors();
    }
  }

  /** ── petAttack → enemyTurn ── */
  beginEnemyTurn(): void {
    this.state = 'enemyTurn';
  }

  /**
   * 敌人回合：技能优先（蓄力释放 > 蓄力起手 > 自疗 > 减伤），否则普攻倒计时。
   * 伤害先被护盾吸收，溢出部分才扣 HP。
   */
  enemyAct(): EnemyActResult {
    const stunnedBefore = this._statuses.isStunned('enemy') && !this.enemy.charging;
    const result = this._enemyTurnAction();
    if (stunnedBefore && result.action === 'idle') result.stunnedSkip = true;
    const dotTicks = this._statuses.tickTurnEnd();
    for (const tick of dotTicks) {
      if (tick.owner === 'enemy') {
        // 走统一入口：DoT 补上最后一刀同样会被不灭挡下，否则毒能白嫖过根性
        this.damageEnemy(tick.amount);
      } else {
        this.heroHp = Math.max(0, this.heroHp - tick.amount);
        if (tick.amount > 0) this.tookDamage = true;
      }
    }
    if (dotTicks.length > 0) result.dotTicks = dotTicks;
    this._syncEnemyStatusMirrors();
    if (this.heroHp <= 0) result.heroDead = true;
    return result;
  }

  private _enemyTurnAction(): EnemyActResult {
    return runEnemyTurnAction({
      enemy: this.enemy,
      isStunned: () => this._statuses.isStunned('enemy'),
      enemyCaster: () => makeEnemyCaster(this.enemy),
      runtimeContext: () => this._runtimeContext(),
      applyEnemyDamage: (raw) => this.applyEnemyDamage(raw),
      applySkillResult: (result) => this._applySkillResult(result),
    });
  }

  /** 对英雄结算一次伤害：减伤 → 护盾吸收 → 扣血（阶段十二受击顺序） */
  applyEnemyDamage(raw: number): { damage: number; absorbed: number; heroDead: boolean } {
    const reduced = applyDamageReduction(raw, this.teamDamageReduction);
    const absorbed = this._statuses.consumeShield(reduced);
    const damage = reduced - absorbed;
    this.heroHp = Math.max(0, this.heroHp - damage);
    if (damage > 0) this.tookDamage = true;
    if (this.runMods.revengePerStack > 0 && reduced > 0) {
      this._revengeStacks = Math.min(REVENGE_MAX_STACK, this._revengeStacks + 1);
    }
    return { damage, absorbed, heroDead: this.heroHp <= 0 };
  }

  /** 当前复仇栈（HUD 展示用） */
  get revengeStacks(): number {
    return this._revengeStacks;
  }

  /** ── enemyTurn → playerTurn ── */
  beginPlayerTurn(): void {
    this.state = 'playerTurn';
    // 新回合开始：全队技能 CD -1
    for (const pet of this.team) {
      if (pet.skillCdLeft > 0) pet.skillCdLeft--;
    }
  }

  // ════════════ 宠物主动技 ════════════

  /** 技能是否可释放（玩家回合 + CD 就绪 + 未被技能封印） */
  canCastSkill(petIndex: number): boolean {
    const pet = this.team[petIndex];
    return !!pet
      && this.state === 'playerTurn'
      && pet.skillCdLeft <= 0
      && this._statuses.sealedPetIndex() !== petIndex;
  }

  /**
   * 释放主动技（不消耗回合）。
   * convertOrbs 只返回请求，由场景操作 BoardModel/BoardView 落地。
   */
  castSkill(petIndex: number): SkillCastResult {
    if (!this.canCastSkill(petIndex)) {
      throw new Error(`技能未就绪: petIndex=${petIndex}`);
    }
    const pet = this.team[petIndex];
    const skill = pet.skill;
    // 速咏压缩的是「每次进 CD 的长度」，至少留 1 回合，否则技能可无限连放
    pet.skillCdLeft = Math.max(1, skill.cd - this.runMods.skillCdReduce);

    const result = runSkill(skill, makePetCaster(this.team, petIndex), this._runtimeContext());
    if (!result) throw new Error(`技能未触发: ${skill.id}`);
    return this._applyPetSkillResult(result);
  }

  private _applyPetSkillResult(result: SkillResult): SkillCastResult {
    this._applySkillResult(result);
    return buildPetSkillCastResult(result, this.shield, this.enemy.hp);
  }

  private _applySkillResult(result: SkillResult): void {
    applySkillResult({
      getEnemyHp: () => this.enemy.hp,
      getEnemyMaxHp: () => this.enemy.maxHp,
      setEnemyHp: (hp) => { this.enemy.hp = hp; },
      damageEnemy: (amount) => this.damageEnemy(amount),
      applyEnemyDamage: (amount) => this.applyEnemyDamage(amount),
      applyHeal: (amount) => this.applyHeal(amount),
      addStatus: (status) => this._statuses.add(status),
      setEnemyCharge: (charge) => { this.enemy.charging = charge; },
      syncEnemyStatusMirrors: () => this._syncEnemyStatusMirrors(),
      reducePetCds: (amount, exceptIndex) => {
        for (let i = 0; i < this.team.length; i++) {
          if (i === exceptIndex) continue;
          const pet = this.team[i];
          if (pet.skillCdLeft > 0) pet.skillCdLeft = Math.max(0, pet.skillCdLeft - amount);
        }
      },
      cleanseTeamDebuffs: () => this._statuses.cleanseTeamDebuffs(),
      delayEnemyAttack: (turns) => {
        this.enemy.attackCountdown += turns;
      },
      applyEnrage: (mult) => {
        this.enemy.atk = Math.floor(this.enemy.atk * mult);
      },
    }, result);
  }

  /** 当前敌人有效防御（破防后） */
  private get _enemyDefEffective(): number {
    const break_ = Math.min(0.9, this._statuses.defenseBreakPct('enemy') + this.runMods.enemyDefBreak);
    return break_ > 0 ? Math.floor(this.enemy.def_ * (1 - break_)) : this.enemy.def_;
  }

  private _runtimeContext() {
    return makeSkillRuntimeContext({
      enemy: this.enemy,
      enemyDefEffective: this._enemyDefEffective,
      heroHp: this.heroHp,
      heroMaxHp: this.heroMaxHp,
      team: this.team,
      teamRcvTotal: this.teamRcvTotal,
      teamDamageBuffMult: this.dmgBuff?.mult ?? 1,
      teamDamageMult: this.teamDamageMult,
      teamHealBonus: this.teamHealBonus,
      enemyEnraged: !!this._statuses.get('enemy', 'enrage'),
      enemyResolute: this._statuses.isResolute(),
      enemyUndying: this._statuses.undyingThreshold() > 0,
      teamAtkDebuffMult: this._statuses.teamAtkDebuffMult(),
      rng: this._rng,
    });
  }
  private _syncEnemyStatusMirrors(): void {
    const reduction = this._statuses.get('enemy', 'enemyDamageReduction');
    this.enemy.dmgReduction = reduction
      ? { reduction: reduction.value, turnsLeft: reduction.turnsLeft ?? 0 }
      : null;
  }

  /** 失败兜底奖励：返还「1★ 通关经验」的固定比例，避免卡关零成长（不发碎片/灵宠币） */
  defeatExpRefund(): number {
    const drops = stageDrops(this.stage.dropTableId, this.stage.chapter, 1, this.stage.type);
    return Math.floor(drops.exp * ECONOMY.defeat.expRefundPct);
  }

  /** 战斗结束，生成结果（胜利时计算星数、灵宠币与掉落经验/碎片） */
  finish(win: boolean): BattleResult {
    this.state = win ? 'victory' : 'defeat';
    return buildBattleResult({
      win,
      stage: this.stage,
      turnsUsed: this.turnsUsed,
      tookDamage: this.tookDamage,
      waves: this._waves,
    });
  }

  /** 指定属性对当前敌人的克制关系（UI 提示用） */
  counterRelationOf(orb: OrbType): 1 | 0 | -1 {
    if (orb === 'heart') return 0;
    return this._counterRelation(orb, this.enemy.def.element);
  }

  private _elementTraitDamageMult(pet: PetDef, defender: Element): number {
    let mult = 1;
    for (const trait of pet.skillTraits ?? []) {
      if (trait.type !== 'elementDamageBonus') continue;
      if (trait.element !== pet.element) continue;
      if (trait.vs !== defender) continue;
      mult *= 1 + trait.pct;
    }
    return mult;
  }

  private _counterRelation(attacker: Element, defender: Element): 1 | 0 | -1 {
    if (ELEMENT_COUNTERS[attacker] === defender) return 1;
    if (ELEMENT_COUNTERS[defender] === attacker) return -1;
    return 0;
  }
}
