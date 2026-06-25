import type { SkillResult } from './SkillEngine';
import type { StatusInstance } from './BattleStatus';
import type { SkillVfxId } from '@/balance/skills';
import type { SkillCastResult } from './battleTypes';

export interface BattleSkillApplyContext {
  getEnemyHp: () => number;
  getEnemyMaxHp: () => number;
  setEnemyHp: (hp: number) => void;
  applyEnemyDamage: (amount: number) => { damage: number; absorbed: number; heroDead: boolean };
  applyHeal: (amount: number) => void;
  addStatus: (status: StatusInstance) => void;
  setEnemyCharge: (charge: { mult: number; skillId: string; releaseVfx: SkillVfxId }) => void;
  syncEnemyStatusMirrors: () => void;
}

export function applySkillResult(
  ctx: BattleSkillApplyContext,
  result: SkillResult,
): void {
  for (const event of result.damageEvents) {
    if (event.target === 'enemy') {
      ctx.setEnemyHp(Math.max(0, ctx.getEnemyHp() - event.amount));
    } else {
      ctx.applyEnemyDamage(event.amount);
    }
  }

  for (const event of result.healEvents) {
    if (event.target === 'team') {
      ctx.applyHeal(event.amount);
    } else {
      ctx.setEnemyHp(Math.min(ctx.getEnemyMaxHp(), ctx.getEnemyHp() + event.amount));
    }
  }

  for (const event of result.statusEvents) {
    if (event.status === 'charge') {
      ctx.setEnemyCharge({
        mult: event.value,
        skillId: result.skill.id,
        releaseVfx: event.vfx,
      });
      continue;
    }
    const status = statusFromEvent(result, event);
    if (status) ctx.addStatus(status);
  }

  ctx.syncEnemyStatusMirrors();
}

export function buildPetSkillCastResult(
  result: SkillResult,
  shield: number,
  enemyHp: number,
): SkillCastResult {
  const enemyHits = result.damageEvents.filter((e) => e.target === 'enemy');
  const damage = enemyHits.reduce((sum, e) => sum + e.amount, 0) || undefined;
  const heal = result.healEvents.find((e) => e.target === 'team')?.amount;
  const shieldEvent = result.statusEvents.find((e) => e.status === 'shield');
  const buff = result.statusEvents.find((e) => e.status === 'teamDamageBuff');
  const dot = result.statusEvents.find((e) => e.status === 'dot');
  const stun = result.statusEvents.find((e) => e.status === 'stun');
  const defBreak = result.statusEvents.find((e) => e.status === 'enemyDefenseBreak');
  const board = result.boardRequests[0];

  return {
    ...result,
    type: result.action,
    element: result.caster.element,
    damage,
    healed: heal,
    mult: buff?.value,
    turns: buff?.turns ?? dot?.turns ?? stun?.turns ?? defBreak?.turns,
    value: shieldEvent ? shield : (dot?.value ?? defBreak?.value),
    to: board?.to,
    count: board?.count,
    shape: board?.shape,
    enemyDead: enemyHp <= 0,
  };
}

function statusFromEvent(
  result: SkillResult,
  event: SkillResult['statusEvents'][number],
): StatusInstance | null {
  if (event.status === 'shield') {
    return {
      id: 'team_shield',
      kind: 'shield',
      owner: 'team',
      value: event.value,
      sourceSkillId: result.skill.id,
      stack: event.stack,
    };
  }
  if (event.status === 'teamDamageBuff') {
    return {
      id: 'team_damage_buff',
      kind: 'teamDamageBuff',
      owner: 'team',
      value: event.value,
      turnsLeft: event.turns,
      sourceSkillId: result.skill.id,
      stack: event.stack,
    };
  }
  if (event.status === 'enemyDamageReduction') {
    return {
      id: 'enemy_damage_reduction',
      kind: 'enemyDamageReduction',
      owner: 'enemy',
      value: event.value,
      turnsLeft: event.turns,
      sourceSkillId: result.skill.id,
      stack: event.stack,
    };
  }
  if (event.status === 'dot') {
    return {
      id: event.target === 'enemy' ? 'enemy_dot' : 'team_dot',
      kind: 'dot',
      owner: event.target === 'enemy' ? 'enemy' : 'team',
      value: event.value,
      turnsLeft: event.turns,
      sourceSkillId: result.skill.id,
      stack: event.stack,
    };
  }
  if (event.status === 'stun') {
    return {
      id: 'enemy_stun',
      kind: 'stun',
      owner: 'enemy',
      value: event.value,
      turnsLeft: event.turns,
      sourceSkillId: result.skill.id,
      stack: event.stack,
    };
  }
  if (event.status === 'enemyDefenseBreak') {
    return {
      id: 'enemy_def_break',
      kind: 'enemyDefenseBreak',
      owner: 'enemy',
      value: event.value,
      turnsLeft: event.turns,
      sourceSkillId: result.skill.id,
      stack: event.stack,
    };
  }
  return null;
}
