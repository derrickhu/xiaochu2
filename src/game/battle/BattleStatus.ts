/**
 * 战斗状态系统：统一管理护盾、增伤、减伤、蓄力等持续效果。
 */
import type { Element } from '@/balance/combat';

export type StatusOwner = 'team' | 'enemy';
export type StatusKind =
  | 'shield'
  | 'teamDamageBuff'
  | 'enemyDamageReduction'
  | 'charge'
  | 'dot'
  | 'stun'
  | 'enemyDefenseBreak'
  // ── 目标十三新增 ──
  | 'extraDragTime'     // team：转珠时限 +value 秒
  | 'guaranteedCrit'    // team：消珠出手必暴击
  | 'elementDamageBuff' // team：指定属性伤害 ×value（element 字段）
  | 'timeSqueeze'       // team(debuff)：转珠时限 -value 秒
  | 'healBlock'         // team(debuff)：心珠回复 ×value（如 0.5）
  | 'skillSeal'         // team(debuff)：value = 被封印宠物 index
  | 'enrage';           // enemy：狂暴中（value = atkMult，无 turns = 永久）
export type StatusStackPolicy = 'replace' | 'max' | 'add' | 'ignoreIfPresent';

/** 我方可被净化技清除的 debuff */
export const TEAM_DEBUFF_KINDS: readonly StatusKind[] = [
  'dot', 'timeSqueeze', 'healBlock', 'skillSeal',
];

/** 回合结束时 dot 造成的伤害（owner = 承伤方） */
export interface DotTick {
  owner: StatusOwner;
  amount: number;
}

export interface StatusInstance {
  id: string;
  kind: StatusKind;
  owner: StatusOwner;
  value: number;
  turnsLeft?: number;
  sourceSkillId: string;
  stack: StatusStackPolicy;
  /** elementDamageBuff 的目标属性 */
  element?: Element;
}

export class BattleStatusStore {
  private _statuses: StatusInstance[] = [];

  get all(): readonly StatusInstance[] {
    return this._statuses;
  }

  add(next: StatusInstance): void {
    const idx = this._statuses.findIndex((s) => s.owner === next.owner && s.kind === next.kind);
    if (idx < 0) {
      this._statuses.push({ ...next });
      return;
    }

    const cur = this._statuses[idx];
    switch (next.stack) {
      case 'ignoreIfPresent':
        return;
      case 'add':
        cur.value += next.value;
        cur.turnsLeft = next.turnsLeft ?? cur.turnsLeft;
        cur.sourceSkillId = next.sourceSkillId;
        return;
      case 'max':
        cur.value = Math.max(cur.value, next.value);
        cur.turnsLeft = next.turnsLeft ?? cur.turnsLeft;
        cur.sourceSkillId = next.sourceSkillId;
        return;
      case 'replace':
        this._statuses[idx] = { ...next };
        return;
    }
  }

  get(owner: StatusOwner, kind: StatusKind): StatusInstance | null {
    return this._statuses.find((s) => s.owner === owner && s.kind === kind) ?? null;
  }

  remove(owner: StatusOwner, kind: StatusKind): void {
    this._statuses = this._statuses.filter((s) => !(s.owner === owner && s.kind === kind));
  }

  clearOwner(owner: StatusOwner): void {
    this._statuses = this._statuses.filter((s) => s.owner !== owner);
  }

  consumeShield(raw: number): number {
    const shield = this.get('team', 'shield');
    if (!shield) return 0;
    const absorbed = Math.min(shield.value, raw);
    shield.value -= absorbed;
    if (shield.value <= 0) this.remove('team', 'shield');
    return absorbed;
  }

  /** 敌人是否被眩晕（跳过行动） */
  isStunned(owner: StatusOwner): boolean {
    return !!this.get(owner, 'stun');
  }

  /** 破防比例（0~1），无则 0 */
  defenseBreakPct(owner: StatusOwner): number {
    return this.get(owner, 'enemyDefenseBreak')?.value ?? 0;
  }

  // ── 目标十三新增查询 ──

  /** 转珠时限增减（秒）：加时 buff − 时间压缩 debuff */
  dragTimeDelta(): number {
    const extra = this.get('team', 'extraDragTime')?.value ?? 0;
    const squeeze = this.get('team', 'timeSqueeze')?.value ?? 0;
    return extra - squeeze;
  }

  /** 消珠出手是否必暴击 */
  hasGuaranteedCrit(): boolean {
    return !!this.get('team', 'guaranteedCrit');
  }

  /** 指定属性的增伤乘区（无则 1） */
  elementBuffMult(element: Element): number {
    const s = this.get('team', 'elementDamageBuff');
    return s && s.element === element ? s.value : 1;
  }

  /** 心珠回复乘区（禁疗 debuff，无则 1） */
  heartHealMult(): number {
    return this.get('team', 'healBlock')?.value ?? 1;
  }

  /** 被封印主动技的宠物 index（无则 null） */
  sealedPetIndex(): number | null {
    const s = this.get('team', 'skillSeal');
    return s ? s.value : null;
  }

  /** 敌人狂暴攻击乘区（无则 1） */
  enrageAtkMult(): number {
    return this.get('enemy', 'enrage')?.value ?? 1;
  }

  /** 净化：清除我方全部 debuff，返回被清除的状态（用于演出） */
  cleanseTeamDebuffs(): StatusInstance[] {
    const removed = this._statuses.filter(
      (s) => s.owner === 'team' && TEAM_DEBUFF_KINDS.includes(s.kind),
    );
    if (removed.length > 0) {
      this._statuses = this._statuses.filter((s) => !removed.includes(s));
    }
    return removed;
  }

  /**
   * 回合结束结算：先收集 dot 伤害，再统一对所有计时状态 -1 并清除过期。
   * 返回本回合 dot 造成的伤害列表，由调用方落地到对应 HP。
   */
  tickTurnEnd(): DotTick[] {
    const ticks: DotTick[] = [];
    for (const s of this._statuses) {
      if (s.kind === 'dot' && s.value > 0) {
        ticks.push({ owner: s.owner, amount: Math.floor(s.value) });
      }
    }
    const expired: StatusInstance[] = [];
    for (const s of this._statuses) {
      if (s.turnsLeft == null) continue;
      s.turnsLeft--;
      if (s.turnsLeft <= 0) expired.push(s);
    }
    if (expired.length > 0) {
      this._statuses = this._statuses.filter((s) => !expired.includes(s));
    }
    return ticks;
  }
}
