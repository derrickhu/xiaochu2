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
  PET_MAP, DEFAULT_TEAM, DEMO_TEAM_LEVEL, DEMO_TEAM_STAR,
  type PetDef,
} from '@/balance/pets';
import { ENEMY_MAP, type EnemyDef } from '@/balance/enemies';
import type { SkillDef, SkillVfxId } from '@/balance/skills';
import { STAGE_MAP, type StageDef } from '@/balance/stages';
import { calcDamage, calcHeal, comboMultiplier } from '@/formulas/damage';
import { enemyStats } from '@/formulas/growth';
import { teamMaxHp, teamRcv, teamElements, petAtkInTeam, type TeamMember } from '@/formulas/team';
import { stageCoinReward } from '@/formulas/economyOutput';
import type { MatchGroup } from '@/game/board/BoardModel';
import { BattleStatusStore } from './BattleStatus';
import {
  runChargedAttack,
  runSkill,
  skillCdForPet,
  skillForEnemy,
  skillForPet,
  type SkillCaster,
  type SkillResult,
} from './SkillEngine';

export type BattleState =
  | 'playerTurn'
  | 'resolving'
  | 'petAttack'
  | 'enemyTurn'
  | 'victory'
  | 'defeat';

export interface TeamPet {
  def: PetDef;
  skill: SkillDef;
  atk: number;
  /** 主动技剩余冷却（0 = 就绪） */
  skillCdLeft: number;
}

/** 技能释放结果（场景据此播放演出） */
export type SkillCastResult = SkillResult & {
  type: SkillResult['action'];
  element?: Element;
  damage?: number;
  healed?: number;
  mult?: number;
  turns?: number;
  value?: number;
  to?: OrbType;
  count?: number;
  enemyDead?: boolean;
};

export interface EnemyUnit {
  def: EnemyDef;
  maxHp: number;
  hp: number;
  atk: number;
  def_: number;
  /** 距离下次攻击的剩余回合 */
  attackCountdown: number;
  /** 各技能剩余冷却（与 def.skillIds 一一对应） */
  skillCds: number[];
  /** 蓄力中（下个敌人回合打出 atk × mult 重击） */
  charging: { mult: number; skillId: string; releaseVfx: SkillVfxId } | null;
  /** 减伤状态：受到伤害 ×(1-reduction) */
  dmgReduction: { reduction: number; turnsLeft: number } | null;
}

/** 敌人回合行动结果（场景据此播放演出） */
export interface EnemyActResult {
  action: 'idle' | 'attack' | 'charge' | 'chargedAttack' | 'heal' | 'shield';
  damage: number;
  absorbed: number;
  heroDead: boolean;
  /** healSelf 的回复量 */
  healed: number;
}

/** 一次宠物出手（已含本回合 Combo/克制/暴击） */
export interface PetAttack {
  petIndex: number;
  element: Element;
  damage: number;
  isCrit: boolean;
  /** 克制关系：1 克制 / -1 被克 / 0 无 */
  counter: 1 | 0 | -1;
}

/** 一回合消除的结算结果 */
export interface TurnResolution {
  combo: number;
  comboMul: number;
  attacks: PetAttack[];
  heal: number;
}

export interface BattleResult {
  win: boolean;
  stars: number;
  coins: number;
  turnsUsed: number;
  noDamage: boolean;
}

export class BattleController {
  readonly stage: StageDef;
  readonly team: TeamPet[];
  /** 队伍总回复（心珠回血基数） */
  readonly teamRcvTotal: number;
  /** 队伍属性覆盖（不在集合内的属性珠 = 无效珠，消除无伤害） */
  readonly teamElementSet: ReadonlySet<Element>;

  state: BattleState = 'playerTurn';

  heroMaxHp: number;
  heroHp: number;

  /** 当前波次（0 起） */
  waveIndex = 0;
  enemy: EnemyUnit;

  /** 已用回合数（拖珠并发生交换记 1 回合） */
  turnsUsed = 0;
  /** 英雄是否受过伤（无伤星判定） */
  tookDamage = false;

  private _statuses = new BattleStatusStore();

  private _rng: () => number;

  constructor(stageId: string, teamIds?: readonly string[], rng: () => number = Math.random) {
    const stage = STAGE_MAP.get(stageId);
    if (!stage) throw new Error(`未知关卡: ${stageId}`);
    this.stage = stage;
    this._rng = rng;

    const ids = teamIds && teamIds.length > 0 ? teamIds : DEFAULT_TEAM;
    const members: TeamMember[] = ids
      .map((id) => PET_MAP.get(id))
      .filter((def): def is PetDef => !!def)
      .map((def) => ({ def, level: DEMO_TEAM_LEVEL, star: DEMO_TEAM_STAR }));

    this.team = members.map((m) => ({
      def: m.def,
      skill: skillForPet(m.def, m.star),
      atk: petAtkInTeam(members, m),
      skillCdLeft: skillCdForPet(m.def, m.star),
    }));
    this.heroMaxHp = teamMaxHp(members);
    this.heroHp = this.heroMaxHp;
    this.teamRcvTotal = teamRcv(members);
    this.teamElementSet = teamElements(members);

    this.enemy = this._spawnEnemy(0);
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
    return this.stage.enemies.length;
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
    const combo = groups.length;
    const comboMul = comboMultiplier(combo);

    const attacks: PetAttack[] = [];
    let healOrbs = 0;

    for (const group of groups) {
      if (group.orb === 'heart') {
        healOrbs += group.cells.length;
        continue;
      }
      const element = group.orb as Element;
      const petIndex = this.team.findIndex((p) => p.def.element === element);
      if (petIndex < 0) continue;
      const pet = this.team[petIndex];

      const isCrit = this._rng() < COMBAT.critChance;
      const raw = calcDamage({
        atk: pet.atk,
        matchCount: group.cells.length,
        combo,
        attackerElement: element,
        defenderElement: this.enemy.def.element,
        defenderDef: this.enemy.def_,
        isCrit,
        buffMult: this.dmgBuff?.mult ?? 1.0,
      }) * this._elementTraitDamageMult(pet.def, this.enemy.def.element);
      // 敌人减伤状态（shieldSelf）独立乘区
      const damage = Math.max(
        1,
        Math.floor(raw * (1 - (this.enemy.dmgReduction?.reduction ?? 0))),
      );
      attacks.push({
        petIndex,
        element,
        damage,
        isCrit,
        counter: this._counterRelation(element, this.enemy.def.element),
      });
    }

    const heal = healOrbs > 0 ? calcHeal(this.teamRcvTotal, healOrbs, combo) : 0;
    this.state = 'petAttack';
    return { combo, comboMul, attacks, heal };
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
    this.enemy = this._spawnEnemy(this.waveIndex);
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
    this._statuses.tickTurnEnd();
    this._syncEnemyStatusMirrors();
    return result;
  }

  private _enemyTurnAction(): EnemyActResult {
    const none: EnemyActResult = { action: 'idle', damage: 0, absorbed: 0, heroDead: false, healed: 0 };
    const enemy = this.enemy;
    if (enemy.hp <= 0) return none;

    // 1) 蓄力完成：打出重击（覆盖普攻）
    if (enemy.charging) {
      const charging = enemy.charging;
      const skill = skillForEnemy(charging.skillId);
      enemy.charging = null;
      enemy.attackCountdown = enemy.def.attackInterval;
      const skillResult = runChargedAttack(skill, this._enemyCaster(), this._runtimeContext(), charging.mult, charging.releaseVfx);
      const hit = this.applyEnemyDamage(skillResult.damageEvents[0]?.amount ?? 0);
      return { action: 'chargedAttack', ...hit, healed: 0 };
    }

    // 2) 技能 CD 推进，按声明顺序找一个可释放的
    const skillIds = enemy.def.skillIds ?? [];
    for (let i = 0; i < skillIds.length; i++) {
      if (enemy.skillCds[i] > 0) enemy.skillCds[i]--;
    }
    for (let i = 0; i < skillIds.length; i++) {
      if (enemy.skillCds[i] > 0) continue;
      const skill = skillForEnemy(skillIds[i]);
      const fired = runSkill(skill, this._enemyCaster(), this._runtimeContext());
      if (fired) {
        enemy.skillCds[i] = skill.cd;
        return this._applyEnemySkillResult(fired);
      }
    }

    // 3) 普攻倒计时
    enemy.attackCountdown--;
    if (enemy.attackCountdown > 0) return none;
    enemy.attackCountdown = enemy.def.attackInterval;
    const hit = this.applyEnemyDamage(enemy.atk);
    return { action: 'attack', ...hit, healed: 0 };
  }

  /** 对英雄结算一次伤害（护盾先吸收） */
  applyEnemyDamage(raw: number): { damage: number; absorbed: number; heroDead: boolean } {
    const absorbed = this._statuses.consumeShield(raw);
    const damage = raw - absorbed;
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

    const result = runSkill(skill, this._petCaster(petIndex), this._runtimeContext());
    if (!result) throw new Error(`技能未触发: ${skill.id}`);
    return this._applyPetSkillResult(result);
  }

  private _applyPetSkillResult(result: SkillResult): SkillCastResult {
    this._applySkillResult(result);
    const damage = result.damageEvents.find((e) => e.target === 'enemy')?.amount;
    const heal = result.healEvents.find((e) => e.target === 'team')?.amount;
    const shield = result.statusEvents.find((e) => e.status === 'shield');
    const buff = result.statusEvents.find((e) => e.status === 'teamDamageBuff');
    const board = result.boardRequests[0];

    return {
      ...result,
      type: result.action,
      element: result.caster.element,
      damage,
      healed: heal,
      mult: buff?.value,
      turns: buff?.turns,
      value: shield ? this.shield : undefined,
      to: board?.to,
      count: board?.count,
      enemyDead: this.enemy.hp <= 0,
    };
  }

  private _applyEnemySkillResult(result: SkillResult): EnemyActResult {
    if (
      result.statusEvents.some((e) => e.status === 'enemyDamageReduction' && e.stack === 'ignoreIfPresent')
      && this.enemy.dmgReduction
    ) {
      return { action: 'idle', damage: 0, absorbed: 0, heroDead: false, healed: 0 };
    }

    const hit = result.damageEvents.find((e) => e.target === 'hero');
    if (hit) {
      const applied = this.applyEnemyDamage(hit.amount);
      return { action: result.action === 'chargedAttack' ? 'chargedAttack' : 'attack', ...applied, healed: 0 };
    }

    this._applySkillResult(result);

    const heal = result.healEvents.find((e) => e.target === 'enemy');
    if (heal) {
      return { action: 'heal', damage: 0, absorbed: 0, heroDead: false, healed: heal.amount };
    }

    const charge = result.statusEvents.find((e) => e.status === 'charge');
    if (charge) {
      return { action: 'charge', damage: 0, absorbed: 0, heroDead: false, healed: 0 };
    }

    const reduction = result.statusEvents.find((e) => e.status === 'enemyDamageReduction');
    if (reduction) {
      return { action: 'shield', damage: 0, absorbed: 0, heroDead: false, healed: 0 };
    }

    return { action: 'idle', damage: 0, absorbed: 0, heroDead: false, healed: 0 };
  }

  private _applySkillResult(result: SkillResult): void {
    for (const event of result.damageEvents) {
      if (event.target === 'enemy') {
        this.enemy.hp = Math.max(0, this.enemy.hp - event.amount);
      } else {
        this.applyEnemyDamage(event.amount);
      }
    }

    for (const event of result.healEvents) {
      if (event.target === 'team') {
        this.applyHeal(event.amount);
      } else {
        this.enemy.hp = Math.min(this.enemy.maxHp, this.enemy.hp + event.amount);
      }
    }

    for (const event of result.statusEvents) {
      if (event.status === 'shield') {
        this._statuses.add({
          id: 'team_shield',
          kind: 'shield',
          owner: 'team',
          value: event.value,
          sourceSkillId: result.skill.id,
          stack: event.stack,
        });
      } else if (event.status === 'teamDamageBuff') {
        this._statuses.add({
          id: 'team_damage_buff',
          kind: 'teamDamageBuff',
          owner: 'team',
          value: event.value,
          turnsLeft: event.turns,
          sourceSkillId: result.skill.id,
          stack: event.stack,
        });
      } else if (event.status === 'enemyDamageReduction') {
        this._statuses.add({
          id: 'enemy_damage_reduction',
          kind: 'enemyDamageReduction',
          owner: 'enemy',
          value: event.value,
          turnsLeft: event.turns,
          sourceSkillId: result.skill.id,
          stack: event.stack,
        });
      } else if (event.status === 'charge') {
        this.enemy.charging = {
          mult: event.value,
          skillId: result.skill.id,
          releaseVfx: event.vfx,
        };
      }
    }

    this._syncEnemyStatusMirrors();
  }

  private _runtimeContext() {
    return {
      enemy: {
        hp: this.enemy.hp,
        maxHp: this.enemy.maxHp,
        atk: this.enemy.atk,
        def_: this.enemy.def_,
        element: this.enemy.def.element,
      },
      heroHp: this.heroHp,
      heroMaxHp: this.heroMaxHp,
      teamRcvTotal: this.teamRcvTotal,
      teamAtkTotal: this.team.reduce((sum, pet) => sum + pet.atk, 0),
      teamDamageBuffMult: this.dmgBuff?.mult ?? 1,
      enemyDamageReduction: this.enemy.dmgReduction?.reduction ?? 0,
    };
  }

  private _petCaster(petIndex: number): SkillCaster {
    const pet = this.team[petIndex];
    return { kind: 'pet', atk: pet.atk, element: pet.def.element, petIndex, petDef: pet.def };
  }

  private _enemyCaster(): SkillCaster {
    return { kind: 'enemy', atk: this.enemy.atk, element: this.enemy.def.element };
  }

  private _syncEnemyStatusMirrors(): void {
    const reduction = this._statuses.get('enemy', 'enemyDamageReduction');
    this.enemy.dmgReduction = reduction
      ? { reduction: reduction.value, turnsLeft: reduction.turnsLeft ?? 0 }
      : null;
  }

  /** 战斗结束，生成结果（胜利时计算星数与灵宠币） */
  finish(win: boolean): BattleResult {
    this.state = win ? 'victory' : 'defeat';
    if (!win) {
      return { win, stars: 0, coins: 0, turnsUsed: this.turnsUsed, noDamage: !this.tookDamage };
    }
    let stars = 1; // 通关
    if (this.turnsUsed <= this.stage.starTurnLimit) stars++;
    if (!this.tookDamage) stars++;
    const coins = stageCoinReward(this.stage.chapter, stars, this.stage.isBoss);
    return { win, stars, coins, turnsUsed: this.turnsUsed, noDamage: !this.tookDamage };
  }

  /** 指定属性对当前敌人的克制关系（UI 提示用） */
  counterRelationOf(orb: OrbType): 1 | 0 | -1 {
    if (orb === 'heart') return 0;
    return this._counterRelation(orb, this.enemy.def.element);
  }

  private _spawnEnemy(waveIndex: number): EnemyUnit {
    const enemyId = this.stage.enemies[waveIndex];
    const def = ENEMY_MAP.get(enemyId);
    if (!def) throw new Error(`未知敌人: ${enemyId}`);
    const stats = enemyStats(def, this.stage.chapter, this.stage.difficulty);
    return {
      def,
      maxHp: stats.hp,
      hp: stats.hp,
      atk: stats.atk,
      def_: stats.def,
      attackCountdown: def.attackInterval,
      skillCds: (def.skillIds ?? []).map((id) => skillForEnemy(id).cd),
      charging: null,
      dmgReduction: null,
    };
  }

  private _elementTraitDamageMult(pet: PetDef, defender: Element): number {
    let mult = 1;
    for (const trait of pet.traits ?? []) {
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
