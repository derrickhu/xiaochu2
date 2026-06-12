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
  type PetDef, type PetSkillDef,
} from '@/balance/pets';
import { ENEMY_MAP, type EnemyDef, type EnemySkillDef } from '@/balance/enemies';
import { STAGE_MAP, type StageDef } from '@/balance/stages';
import { calcDamage, calcHeal, comboMultiplier, defenseReduction } from '@/formulas/damage';
import { petAtk, enemyStats } from '@/formulas/growth';
import { teamMaxHp, teamRcv, teamElements, type TeamMember } from '@/formulas/team';
import { stageCoinReward } from '@/formulas/economyOutput';
import type { MatchGroup } from '@/game/board/BoardModel';

export type BattleState =
  | 'playerTurn'
  | 'resolving'
  | 'petAttack'
  | 'enemyTurn'
  | 'victory'
  | 'defeat';

export interface TeamPet {
  def: PetDef;
  atk: number;
  /** 主动技剩余冷却（0 = 就绪） */
  skillCdLeft: number;
}

/** 技能释放结果（场景据此播放演出） */
export type SkillCastResult =
  | { type: 'instantDmg'; skill: PetSkillDef; element: Element; damage: number; enemyDead: boolean }
  | { type: 'healPct'; skill: PetSkillDef; healed: number }
  | { type: 'dmgBoost'; skill: PetSkillDef; mult: number; turns: number }
  | { type: 'shield'; skill: PetSkillDef; value: number }
  | { type: 'convertOrbs'; skill: PetSkillDef; to: OrbType; count: number }
  | { type: 'teamAttack'; skill: PetSkillDef; damage: number; enemyDead: boolean };

export interface EnemyUnit {
  def: EnemyDef;
  maxHp: number;
  hp: number;
  atk: number;
  def_: number;
  /** 距离下次攻击的剩余回合 */
  attackCountdown: number;
  /** 各技能剩余冷却（与 def.skills 一一对应） */
  skillCds: number[];
  /** 蓄力中（下个敌人回合打出 atk × mult 重击） */
  charging: { mult: number } | null;
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

  /** 当前护盾值（吸收敌人伤害，先于 HP 扣减） */
  shield = 0;
  /** 全队增伤 buff（dmgBoost 技能），null = 无 */
  dmgBuff: { mult: number; turnsLeft: number } | null = null;

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
      atk: petAtk(m.def, m.level, m.star),
      skillCdLeft: m.def.skill.cd,
    }));
    this.heroMaxHp = teamMaxHp(members);
    this.heroHp = this.heroMaxHp;
    this.teamRcvTotal = teamRcv(members);
    this.teamElementSet = teamElements(members);

    this.enemy = this._spawnEnemy(0);
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
      });
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
    // 敌人回合结束 = 一个完整回合过去：双方持续状态衰减
    if (this.dmgBuff) {
      this.dmgBuff.turnsLeft--;
      if (this.dmgBuff.turnsLeft <= 0) this.dmgBuff = null;
    }
    const er = this.enemy.dmgReduction;
    if (er) {
      er.turnsLeft--;
      if (er.turnsLeft <= 0) this.enemy.dmgReduction = null;
    }
    return result;
  }

  private _enemyTurnAction(): EnemyActResult {
    const none: EnemyActResult = { action: 'idle', damage: 0, absorbed: 0, heroDead: false, healed: 0 };
    const enemy = this.enemy;
    if (enemy.hp <= 0) return none;

    // 1) 蓄力完成：打出重击（覆盖普攻）
    if (enemy.charging) {
      const mult = enemy.charging.mult;
      enemy.charging = null;
      enemy.attackCountdown = enemy.def.attackInterval;
      const hit = this.applyEnemyDamage(Math.floor(enemy.atk * mult));
      return { action: 'chargedAttack', ...hit, healed: 0 };
    }

    // 2) 技能 CD 推进，按声明顺序找一个可释放的
    const skills = enemy.def.skills ?? [];
    for (let i = 0; i < skills.length; i++) {
      if (enemy.skillCds[i] > 0) enemy.skillCds[i]--;
    }
    for (let i = 0; i < skills.length; i++) {
      if (enemy.skillCds[i] > 0) continue;
      const skill = skills[i];
      const fired = this._tryCastEnemySkill(skill);
      if (fired) {
        enemy.skillCds[i] = skill.cd;
        return fired;
      }
    }

    // 3) 普攻倒计时
    enemy.attackCountdown--;
    if (enemy.attackCountdown > 0) return none;
    enemy.attackCountdown = enemy.def.attackInterval;
    const hit = this.applyEnemyDamage(enemy.atk);
    return { action: 'attack', ...hit, healed: 0 };
  }

  /** 条件不满足返回 null（CD 保持就绪，下回合再判） */
  private _tryCastEnemySkill(skill: EnemySkillDef): EnemyActResult | null {
    const enemy = this.enemy;
    switch (skill.type) {
      case 'chargeAttack': {
        enemy.charging = { mult: skill.mult };
        return { action: 'charge', damage: 0, absorbed: 0, heroDead: false, healed: 0 };
      }
      case 'healSelf': {
        if (enemy.hp >= enemy.maxHp) return null; // 满血不浪费
        const healed = Math.min(
          enemy.maxHp - enemy.hp,
          Math.floor(enemy.maxHp * skill.pct),
        );
        enemy.hp += healed;
        return { action: 'heal', damage: 0, absorbed: 0, heroDead: false, healed };
      }
      case 'shieldSelf': {
        if (enemy.dmgReduction) return null; // 已有减伤不叠加
        enemy.dmgReduction = { reduction: skill.reduction, turnsLeft: skill.turns };
        return { action: 'shield', damage: 0, absorbed: 0, heroDead: false, healed: 0 };
      }
    }
  }

  /** 对英雄结算一次伤害（护盾先吸收） */
  applyEnemyDamage(raw: number): { damage: number; absorbed: number; heroDead: boolean } {
    const absorbed = Math.min(this.shield, raw);
    this.shield -= absorbed;
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
    const skill = pet.def.skill;
    pet.skillCdLeft = skill.cd;

    switch (skill.type) {
      case 'instantDmg': {
        const damage = this._applySkillDamage(pet.atk * skill.multiplier);
        return {
          type: 'instantDmg', skill, element: pet.def.element,
          damage, enemyDead: this.enemy.hp <= 0,
        };
      }
      case 'healPct': {
        const healed = this.applyHeal(Math.floor(this.heroMaxHp * skill.pct));
        return { type: 'healPct', skill, healed };
      }
      case 'dmgBoost': {
        this.dmgBuff = { mult: skill.mult, turnsLeft: skill.turns };
        return { type: 'dmgBoost', skill, mult: skill.mult, turns: skill.turns };
      }
      case 'shield': {
        const value = Math.floor(this.heroMaxHp * skill.pct);
        // 不叠加，取较大值（防无限堆盾）
        this.shield = Math.max(this.shield, value);
        return { type: 'shield', skill, value: this.shield };
      }
      case 'convertOrbs': {
        return { type: 'convertOrbs', skill, to: skill.to, count: skill.count };
      }
      case 'teamAttack': {
        const totalAtk = this.team.reduce((s, p) => s + p.atk, 0);
        const damage = this._applySkillDamage(totalAtk * skill.multiplier);
        return { type: 'teamAttack', skill, damage, enemyDead: this.enemy.hp <= 0 };
      }
    }
  }

  /** 技能直伤：吃防御减伤、增伤 buff 与敌人减伤状态，无视克制/Combo */
  private _applySkillDamage(raw: number): number {
    const reduced = raw
      * (this.dmgBuff?.mult ?? 1.0)
      * (1 - defenseReduction(this.enemy.def_))
      * (1 - (this.enemy.dmgReduction?.reduction ?? 0));
    const damage = Math.max(1, Math.floor(reduced));
    this.enemy.hp = Math.max(0, this.enemy.hp - damage);
    return damage;
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
      skillCds: (def.skills ?? []).map((s) => s.cd),
      charging: null,
      dmgReduction: null,
    };
  }

  private _counterRelation(attacker: Element, defender: Element): 1 | 0 | -1 {
    if (ELEMENT_COUNTERS[attacker] === defender) return 1;
    if (ELEMENT_COUNTERS[defender] === attacker) return -1;
    return 0;
  }
}
