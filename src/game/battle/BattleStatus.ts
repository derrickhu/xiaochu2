/**
 * 战斗状态系统：统一管理护盾、增伤、减伤、蓄力等持续效果。
 */

export type StatusOwner = 'team' | 'enemy';
export type StatusKind = 'shield' | 'teamDamageBuff' | 'enemyDamageReduction' | 'charge';
export type StatusStackPolicy = 'replace' | 'max' | 'add' | 'ignoreIfPresent';

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

  tickTurnEnd(): void {
    const expired: StatusInstance[] = [];
    for (const s of this._statuses) {
      if (s.turnsLeft == null) continue;
      s.turnsLeft--;
      if (s.turnsLeft <= 0) expired.push(s);
    }
    if (expired.length === 0) return;
    this._statuses = this._statuses.filter((s) => !expired.includes(s));
  }
}
