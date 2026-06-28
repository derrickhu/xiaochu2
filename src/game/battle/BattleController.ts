/**
 * 战斗控制器（状态机 + 结算，零渲染）
 *
 * 状态流转：
 *   playerTurn(拖珠) → resolving(消除/下落连锁) → petAttack(宠物依次攻击)
 *   → enemyTurn(敌人计数/反击) → playerTurn；敌人全灭 → victory；英雄 HP=0 → defeat
 *
 * 所有数值只走 formulas + balance，本层禁止 magic number。
 */
import { ELEMENT_COUNTERS, type Element, type OrbType } from '@/balance/combat';
import {
  PET_MAP, DEFAULT_TEAM, INITIAL_PET_LEVEL, INITIAL_PET_STAR,
  type PetDef,
} from '@/balance/pets';
import { resolveEncounter, type ResolvedEncounter } from '@/balance/enemies';
import { STAGE_MAP, type StageDef } from '@/balance/stages';
import { resolveMechanics } from '@/balance/stageMechanics';
import { ECONOMY } from '@/balance/economy';
import { stageDrops } from '@/formulas/economyOutput';
import { teamMaxHp, teamRcv, teamElements, petAtkInTeam, teamEffectAggregate, petSelfCombatProfile, type TeamMember } from '@/formulas/team';
import { applyDamageReduction } from '@/formulas/damage';
import type { MatchGroup } from '@/game/board/BoardModel';
import { BattleStatusStore } from './BattleStatus';
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
  /** 心珠是否不回血（禁心） */
  readonly noHeartHeal: boolean;
  /** 被禁用的属性珠（消除无伤害） */
  readonly bannedElements: ReadonlySet<Element>;
  /** 机制战前提示（UI 展示） */
  readonly mechanicHints: readonly string[];

  state: BattleState = 'playerTurn';

  heroMaxHp: number;
  heroHp: number;

  /** 被动：每回合回血绝对值（队伍 regen 被动 × 最大生命） */
  readonly passiveRegenPerTurn: number;
  /** 被动：常驻全队增伤总乘区（合并 ladder + 招牌/星级 teamDamageBonus） */
  readonly teamDamageMult: number;

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

  private _statuses = new BattleStatusStore();

  /** 本关解析后的各波遭遇（战斗模板 + 收录元信息） */
  private _waves: ResolvedEncounter[];

  private _rng: () => number;

  /**
   * @param levelStarOf 按宠物 id 取真实养成进度；默认用初始等级/星级（测试与脱离存档场景）
   */
  constructor(
    stageId: string,
    teamIds?: readonly string[],
    rng: () => number = Math.random,
    levelStarOf: (petId: string) => { level: number; star: number } =
      () => ({ level: INITIAL_PET_LEVEL, star: INITIAL_PET_STAR }),
  ) {
    const stage = STAGE_MAP.get(stageId);
    if (!stage) throw new Error(`未知关卡: ${stageId}`);
    this.stage = stage;
    this._waves = stage.encounters.map((ref) => resolveEncounter(ref));
    this._rng = rng;

    const ids = teamIds && teamIds.length > 0 ? teamIds : DEFAULT_TEAM;
    const members: TeamMember[] = ids
      .map((id) => PET_MAP.get(id))
      .filter((def): def is PetDef => !!def)
      .map((def) => ({ def, ...levelStarOf(def.id) }));

    this.team = members.map((m) => {
      const profile = petSelfCombatProfile(m.def, m.star);
      return {
        def: m.def,
        star: m.star,
        skill: skillForPet(m.def, m.star),
        atk: petAtkInTeam(members, m),
        critRate: profile.critRate,
        critDamage: profile.critDamage,
        skillCdLeft: skillCdForPet(m.def, m.star),
      };
    });
    this.heroMaxHp = teamMaxHp(members);
    this.heroHp = this.heroMaxHp;
    this.teamRcvTotal = teamRcv(members);
    this.teamElementSet = teamElements(members);

    const teamFx = teamEffectAggregate(members);
    this.passiveRegenPerTurn = Math.floor(this.heroMaxHp * teamFx.regenPct);
    this.teamDamageMult = teamFx.teamDamageMult;
    this.teamDamageReduction = teamFx.damageReduction;
    this.teamHealBonus = teamFx.healBonus;
    const startShield = Math.floor(this.heroMaxHp * teamFx.startShieldPct);
    if (startShield > 0) {
      this._statuses.add({
        id: 'team_shield', kind: 'shield', owner: 'team',
        value: startShield, sourceSkillId: 'passive_start_shield', stack: 'add',
      });
    }

    const mech = resolveMechanics(stage.mechanics);
    this.sealOrbCount = mech.sealOrbs;
    this.noHeartHeal = mech.noHeartHeal;
    this.bannedElements = new Set(mech.bannedElements);
    this.mechanicHints = mech.hints;

    this.enemy = spawnBattleEnemy(this.stage, this._waves, 0);
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
    return resolvePlayerTurnDamage({
      groups,
      team: this.team,
      enemy: this.enemy,
      bannedElements: this.bannedElements,
      enemyDefEffective: this._enemyDefEffective,
      teamRcvTotal: this.teamRcvTotal,
      noHeartHeal: this.noHeartHeal,
      passiveRegenPerTurn: this.passiveRegenPerTurn,
      teamDamageMult: (this.dmgBuff?.mult ?? 1.0) * this.teamDamageMult,
      teamHealBonus: this.teamHealBonus,
      rng: this._rng,
      elementTraitDamageMult: (pet, defender) => this._elementTraitDamageMult(pet.def, defender),
      counterRelation: (attacker, defender) => this._counterRelation(attacker, defender),
    });
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
    this.enemy.hp = Math.max(0, this.enemy.hp - attack.damage);
    return { enemyDead: this.enemy.hp <= 0 };
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
    return this.enemy;
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
    const result = this._enemyTurnAction();
    const dotTicks = this._statuses.tickTurnEnd();
    for (const tick of dotTicks) {
      if (tick.owner === 'enemy') {
        this.enemy.hp = Math.max(0, this.enemy.hp - tick.amount);
      } else {
        this.heroHp = Math.max(0, this.heroHp - tick.amount);
        if (tick.amount > 0) this.tookDamage = true;
      }
    }
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
    return { damage, absorbed, heroDead: this.heroHp <= 0 };
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

  /** 技能是否可释放（玩家回合 + CD 就绪） */
  canCastSkill(petIndex: number): boolean {
    const pet = this.team[petIndex];
    return !!pet && this.state === 'playerTurn' && pet.skillCdLeft <= 0;
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
    pet.skillCdLeft = skill.cd;

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
      applyEnemyDamage: (amount) => this.applyEnemyDamage(amount),
      applyHeal: (amount) => this.applyHeal(amount),
      addStatus: (status) => this._statuses.add(status),
      setEnemyCharge: (charge) => { this.enemy.charging = charge; },
      syncEnemyStatusMirrors: () => this._syncEnemyStatusMirrors(),
    }, result);
  }

  /** 当前敌人有效防御（破防后） */
  private get _enemyDefEffective(): number {
    const break_ = this._statuses.defenseBreakPct('enemy');
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
