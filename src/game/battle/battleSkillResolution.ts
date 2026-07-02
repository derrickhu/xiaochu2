import type { SkillResult } from './SkillEngine';
import type { StatusInstance, StatusKind } from './BattleStatus';
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
  /** haste：全队其他宠物技能 CD -amount（exceptIndex = 施法者） */
  reducePetCds: (amount: number, exceptIndex?: number) => void;
  /** purify：清除我方全部 debuff，返回被清除的状态 */
  cleanseTeamDebuffs: () => StatusInstance[];
  /** delayEnemyAttack：敌人普攻倒计时 +turns */
  delayEnemyAttack: (turns: number) => void;
  /** enrage：敌人攻击永久 ×mult（每场一次，与 enrage 状态同时落地） */
  applyEnrage: (mult: number) => void;
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
    if (event.status === 'enrage') {
      ctx.applyEnrage(event.value);
    }
    ctx.addStatus(statusFromEvent(result, event));
  }

  if (result.teamCdDelta && result.teamCdDelta > 0) {
    ctx.reducePetCds(result.teamCdDelta, result.caster.petIndex);
  }
  if (result.cleanseTeam) {
    ctx.cleanseTeamDebuffs();
  }
  if (result.enemyAttackDelay && result.enemyAttackDelay > 0) {
    ctx.delayEnemyAttack(result.enemyAttackDelay);
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
  const extraTime = result.statusEvents.find((e) => e.status === 'extraDragTime');
  const critBoost = result.statusEvents.find((e) => e.status === 'guaranteedCrit');
  const elementBuff = result.statusEvents.find((e) => e.status === 'elementDamageBuff');
  const board = result.boardRequests.find(
    (b): b is Extract<SkillResult['boardRequests'][number], { type: 'convertOrbs' }> =>
      b.type === 'convertOrbs',
  );

  return {
    ...result,
    type: result.action,
    element: elementBuff?.element ?? result.caster.element,
    damage,
    healed: heal,
    mult: buff?.value ?? elementBuff?.value,
    turns: buff?.turns ?? dot?.turns ?? stun?.turns ?? defBreak?.turns
      ?? extraTime?.turns ?? critBoost?.turns ?? elementBuff?.turns,
    value: shieldEvent ? shield : (dot?.value ?? defBreak?.value ?? extraTime?.value),
    to: board?.to,
    count: board?.count,
    shape: board?.shape,
    enemyDead: enemyHp <= 0,
  };
}

/** owner+kind → 稳定实例 id（同 owner 同 kind 单实例，叠加策略见 BattleStatusStore.add） */
function statusId(owner: 'team' | 'enemy', kind: StatusKind): string {
  return `${owner}_${kind}`;
}

function statusFromEvent(
  result: SkillResult,
  event: SkillResult['statusEvents'][number],
): StatusInstance {
  const kind = event.status as StatusKind;
  // 状态归属：事件带 target；敌方专属状态强制 owner=enemy
  const owner: 'team' | 'enemy' =
    kind === 'enemyDamageReduction' || kind === 'stun'
      || kind === 'enemyDefenseBreak' || kind === 'enrage'
      ? 'enemy'
      : event.target;
  return {
    id: statusId(owner, kind),
    kind,
    owner,
    value: event.value,
    turnsLeft: event.turns,
    sourceSkillId: result.skill.id,
    stack: event.stack,
    element: event.element,
  };
}
