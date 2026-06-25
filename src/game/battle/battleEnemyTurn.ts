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

  const heal = result.healEvents.find((e) => e.target === 'enemy');
  if (heal) return { action: 'heal', damage: 0, absorbed: 0, heroDead: false, healed: heal.amount };

  if (result.statusEvents.find((e) => e.status === 'charge')) {
    return { action: 'charge', damage: 0, absorbed: 0, heroDead: false, healed: 0 };
  }
  if (result.statusEvents.find((e) => e.status === 'enemyDamageReduction')) {
    return { action: 'shield', damage: 0, absorbed: 0, heroDead: false, healed: 0 };
  }
  return idle();
}
