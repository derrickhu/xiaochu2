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
import { PETS, DEMO_TEAM_LEVEL, DEMO_TEAM_STAR, type PetDef } from '@/balance/pets';
import { ENEMY_MAP, type EnemyDef } from '@/balance/enemies';
import { STAGE_MAP, type StageDef } from '@/balance/stages';
import { calcDamage, calcHeal, comboMultiplier } from '@/formulas/damage';
import { petAtk, enemyStats } from '@/formulas/growth';
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
}

export interface EnemyUnit {
  def: EnemyDef;
  maxHp: number;
  hp: number;
  atk: number;
  def_: number;
  /** 距离下次攻击的剩余回合 */
  attackCountdown: number;
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

  state: BattleState = 'playerTurn';

  heroMaxHp: number = COMBAT.heroBaseHp;
  heroHp: number = COMBAT.heroBaseHp;

  /** 当前波次（0 起） */
  waveIndex = 0;
  enemy: EnemyUnit;

  /** 已用回合数（拖珠并发生交换记 1 回合） */
  turnsUsed = 0;
  /** 英雄是否受过伤（无伤星判定） */
  tookDamage = false;

  private _rng: () => number;

  constructor(stageId: string, rng: () => number = Math.random) {
    const stage = STAGE_MAP.get(stageId);
    if (!stage) throw new Error(`未知关卡: ${stageId}`);
    this.stage = stage;
    this._rng = rng;

    this.team = PETS.map((def) => ({
      def,
      atk: petAtk(def, DEMO_TEAM_LEVEL, DEMO_TEAM_STAR),
    }));

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
      const damage = calcDamage({
        atk: pet.atk,
        matchCount: group.cells.length,
        combo,
        attackerElement: element,
        defenderElement: this.enemy.def.element,
        defenderDef: this.enemy.def_,
        isCrit,
      });
      attacks.push({
        petIndex,
        element,
        damage,
        isCrit,
        counter: this._counterRelation(element, this.enemy.def.element),
      });
    }

    const heal = healOrbs > 0 ? calcHeal(this.heroMaxHp, healOrbs) : 0;
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
   * 敌人回合：攻击倒计时 -1，归零则反击。
   * 返回本回合敌人造成的伤害（0 = 蓄力未出手）
   */
  enemyAct(): { damage: number; heroDead: boolean } {
    if (this.enemy.hp <= 0) return { damage: 0, heroDead: false };
    this.enemy.attackCountdown--;
    if (this.enemy.attackCountdown > 0) {
      return { damage: 0, heroDead: false };
    }
    this.enemy.attackCountdown = this.enemy.def.attackInterval;
    const damage = this.enemy.atk;
    this.heroHp = Math.max(0, this.heroHp - damage);
    if (damage > 0) this.tookDamage = true;
    return { damage, heroDead: this.heroHp <= 0 };
  }

  /** ── enemyTurn → playerTurn ── */
  beginPlayerTurn(): void {
    this.state = 'playerTurn';
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
    };
  }

  private _counterRelation(attacker: Element, defender: Element): 1 | 0 | -1 {
    if (ELEMENT_COUNTERS[attacker] === defender) return 1;
    if (ELEMENT_COUNTERS[defender] === attacker) return -1;
    return 0;
  }
}
