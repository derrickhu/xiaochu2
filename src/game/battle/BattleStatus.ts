/**
 * 战斗状态系统：统一管理护盾、增伤、减伤、蓄力等持续效果。
 */

export type StatusOwner = 'team' | 'enemy';
export type StatusKind =
  | 'shield'
  | 'teamDamageBuff'
  | 'enemyDamageReduction'
  | 'charge'
  | 'dot'
  | 'stun'
  | 'enemyDefenseBreak';
export type StatusStackPolicy = 'replace' | 'max' | 'add' | 'ignoreIfPresent';

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
