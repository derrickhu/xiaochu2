import {
  runChargedAttack,
  runSkill,
  skillForEnemy,
  type SkillCaster,
  type SkillResult,
  type SkillRuntimeContext,
} from './SkillEngine';
import type { EnemyActResult, EnemyUnit } from './battleTypes';

const idle = (): EnemyActResult => ({
  action: 'idle',
  damage: 0,
  absorbed: 0,
  heroDead: false,
  healed: 0,
});

export interface EnemyTurnContext {
  enemy: EnemyUnit;
  isStunned: () => boolean;
  enemyCaster: () => SkillCaster;
  runtimeContext: () => SkillRuntimeContext;
  applyEnemyDamage: (raw: number) => { damage: number; absorbed: number; heroDead: boolean };
  applySkillResult: (result: SkillResult) => void;
}

export function runEnemyTurnAction(ctx: EnemyTurnContext): EnemyActResult {
  const enemy = ctx.enemy;
  if (enemy.hp <= 0) return idle();

  if (ctx.isStunned() && !enemy.charging) return idle();

  if (enemy.charging) {
    const charging = enemy.charging;
    const skill = skillForEnemy(charging.skillId);
    enemy.charging = null;
    enemy.attackCountdown = enemy.def.attackInterval;
    const skillResult = runChargedAttack(
      skill,
      ctx.enemyCaster(),
      ctx.runtimeContext(),
      charging.mult,
      charging.releaseVfx,
    );
    const hit = ctx.applyEnemyDamage(skillResult.damageEvents[0]?.amount ?? 0);
    return { action: 'chargedAttack', ...hit, healed: 0 };
  }

  const skillIds = enemy.def.skillIds ?? [];
  for (let i = 0; i < skillIds.length; i++) {
    if (enemy.skillCds[i] > 0) enemy.skillCds[i]--;
  }
  for (let i = 0; i < skillIds.length; i++) {
    if (enemy.skillCds[i] > 0) continue;
    const skill = skillForEnemy(skillIds[i]);
    const fired = runSkill(skill, ctx.enemyCaster(), ctx.runtimeContext());
    if (fired) {
      enemy.skillCds[i] = skill.cd;
      return applyEnemySkillResult(ctx, fired);
    }
  }

  enemy.attackCountdown--;
  if (enemy.attackCountdown > 0) return idle();
  enemy.attackCountdown = enemy.def.attackInterval;
  const hit = ctx.applyEnemyDamage(enemy.atk);
  return { action: 'attack', ...hit, healed: 0 };
}

function applyEnemySkillResult(ctx: EnemyTurnContext, result: SkillResult): EnemyActResult {
  if (
    result.statusEvents.some((e) => e.status === 'enemyDamageReduction' && e.stack === 'ignoreIfPresent')
    && ctx.enemy.dmgReduction
  ) {
    return idle();
  }

  const hit = result.damageEvents.find((e) => e.target === 'hero');
  if (hit) {
    const applied = ctx.applyEnemyDamage(hit.amount);
    return { action: result.action === 'chargedAttack' ? 'chargedAttack' : 'attack', ...applied, healed: 0 };
  }

  ctx.applySkillResult(result);
  const base = { damage: 0, absorbed: 0, heroDead: false, healed: 0, skillName: result.skill.name };

  const heal = result.healEvents.find((e) => e.target === 'enemy');
  if (heal) return { ...base, action: 'heal', healed: heal.amount };

  if (result.statusEvents.find((e) => e.status === 'charge')) {
    return { ...base, action: 'charge' };
  }
  if (result.statusEvents.find((e) => e.status === 'enemyDamageReduction')) {
    return { ...base, action: 'shield' };
  }

  // ── 目标十三新增敌人技能行动映射 ──
  const sealReq = result.boardRequests.find((b) => b.type === 'sealRandom');
  if (sealReq && sealReq.type === 'sealRandom') {
    return { ...base, action: 'sealOrbs', boardSealCount: sealReq.count };
  }
  const poison = result.statusEvents.find((e) => e.status === 'dot' && e.target === 'team');
  if (poison) {
    return { ...base, action: 'poison', value: poison.value, turns: poison.turns };
  }
  const squeeze = result.statusEvents.find((e) => e.status === 'timeSqueeze');
  if (squeeze) {
    return { ...base, action: 'timeSqueeze', value: squeeze.value, turns: squeeze.turns };
  }
  const healBlock = result.statusEvents.find((e) => e.status === 'healBlock');
  if (healBlock) {
    return { ...base, action: 'healBlock', value: healBlock.value, turns: healBlock.turns };
  }
  const enrage = result.statusEvents.find((e) => e.status === 'enrage');
  if (enrage) {
    return { ...base, action: 'enrage', value: enrage.value };
  }
  const skillSeal = result.statusEvents.find((e) => e.status === 'skillSeal');
  if (skillSeal) {
    return { ...base, action: 'skillSeal', sealedPetIndex: skillSeal.value, turns: skillSeal.turns };
  }
  return idle();
}
