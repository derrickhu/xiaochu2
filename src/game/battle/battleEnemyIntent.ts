/**
 * 敌人出招挑选与推演（v0.7）
 *
 * 战斗 UI **不再**常驻「下回合打多少血」——把普攻伤害数字甩给玩家等于替他算完生存题。
 * 侧挂徽章报的是「几回合后放技能」（普攻间隔=1 时「N 回合后攻击」毫无决策价值）。
 * 本文件仍保留：
 * 1. `pickEnemySkill`：实机与模拟器共用的固定轮转选招
 * 2. `nextEnemySkillCountdown`：侧挂徽章 / 详情页读下次「真的会放」的技能
 *    （冷却到了但条件不成立的招不报，避免「即将放技能」却一直普攻）
 * 3. `predictEnemyIntent`：测试用推演，保证「轮转挑出来的」就是「真正打出来的」
 *
 * 蓄力预警仍走侧挂（「蓄力中」），那是动作本身的 telegraph。
 */
import { runSkill, skillForEnemy, type SkillCaster, type SkillResult, type SkillRuntimeContext } from './SkillEngine';
import { pendingBossPhase } from './bossPhase';
import type { SkillDef } from '@/balance/skills';
import type { StatusKind } from './BattleStatus';
import type { EnemyUnit } from './battleTypes';

export interface EnemySkillPick {
  index: number;
  skill: SkillDef;
  result: SkillResult;
  /**
   * 该技能只会上一层已经存在的减伤 —— 真实回合里它会消耗 CD 但什么也不做。
   * 预告必须如实说「这回合白放」，否则玩家会为一个不会发生的威胁做准备。
   */
  wasted: boolean;
}

/**
 * 挑出本回合（或下回合）会释放的技能：从轮转指针处起扫，冷却就绪且条件成立的第一个。
 *
 * 指针是「固定循环出招」的实现方式。改造前每回合都从 0 号技能扫起，短 CD 的招会反复
 * 抢占行动，一套三招的 Boss 实际打出来常常只见到前两招——技能表写得再丰富，玩家也
 * 感觉不到。改成轮转后每招都排得上队，CD 仍然生效（大招该慢还是慢），
 * 于是 Boss 的出招序列既稳定可背，又保留了长短 CD 的节奏差。
 *
 * @param cdOffset 0 = 结算当回合（CD 已扣）；1 = 预测下回合（CD 尚未扣）
 */
/**
 * 距离下次放技能还要几个敌人回合。
 * `turns === 0` = 下个敌人回合就会放（与回合开始先扣 CD 再选招的口径一致）。
 * 无技能表、或所有招当前都放不出来（血线/已触发/互斥）时返回 null。
 *
 * 智龙迷城 / 魔灵召唤同一口径：预告只报「下一动真会出手的」，
 * 条件技写在技能说明里，未满足时不当成即将释放。
 */
export function nextEnemySkillCountdown(
  enemy: EnemyUnit,
  caster: SkillCaster,
  runtime: SkillRuntimeContext,
): {
  turns: number;
  skillId: string;
  name: string;
} | null {
  const n = enemy.skillIds.length;
  if (n === 0) return null;
  let best: { turns: number; skillId: string; name: string } | null = null;
  for (let k = 0; k < n; k++) {
    const i = (enemy.skillRotation + k) % n;
    const skill = skillForEnemy(enemy.skillIds[i]);
    if (!runSkill(skill, caster, runtime)) continue;
    const turns = Math.max(0, enemy.skillCds[i]);
    if (best && turns >= best.turns) continue;
    best = { turns, skillId: skill.id, name: skill.name };
  }
  return best;
}

export function pickEnemySkill(
  enemy: EnemyUnit,
  caster: SkillCaster,
  runtime: SkillRuntimeContext,
  cdOffset: 0 | 1,
): EnemySkillPick | null {
  const n = enemy.skillIds.length;
  for (let k = 0; k < n; k++) {
    const i = (enemy.skillRotation + k) % n;
    if (enemy.skillCds[i] - cdOffset > 0) continue;
    const skill = skillForEnemy(enemy.skillIds[i]);
    const result = runSkill(skill, caster, runtime);
    if (!result) continue;
    const wasted = result.statusEvents.some(
      (e) => e.status === 'enemyDamageReduction' && e.stack === 'ignoreIfPresent',
    ) && enemy.dmgReduction !== null;
    return { index: i, skill, result, wasted };
  }
  return null;
}

/**
 * 敌人自身架势（自疗 / 减伤 / 凝意 / 三种闸门 / 吸收 / 反击）不占普攻——
 * 它们的代价是一个技能位，不是一回合输出；而对我方施加的骚扰（封珠、毒、禁疗、
 * 削攻、封技、克属封印）占满整回合。模拟器与实机共用这条判定，
 * 否则难度审计算出来的敌人输出会系统性偏高。
 */
const SELF_POSTURE_STATUS: readonly StatusKind[] = [
  'enemyDamageReduction', 'resolve', 'elementGate', 'comboGate',
  'damageVoid', 'undying', 'elementAbsorb', 'counterStrike',
];

export function skillFollowsUpWithAttack(result: SkillResult): boolean {
  if (result.damageEvents.some((e) => e.target === 'hero')) return false;
  if (result.statusEvents.some((e) => e.status === 'charge')) return false;
  if (result.healEvents.some((e) => e.target === 'enemy')) return true;
  return result.statusEvents.some((e) => SELF_POSTURE_STATUS.includes(e.status));
}

export type EnemyIntentKind = 'phase' | 'chargedHit' | 'skill' | 'attack' | 'idle';

export interface EnemyIntent {
  kind: EnemyIntentKind;
  /** 标题：技能名 / 阶段名 / 「普通攻击」 */
  label: string;
  /** 一句话说明会发生什么，玩家据此决定这一回合怎么打 */
  detail: string;
  /** 需要马上处理（重击、转阶段）：UI 用红色高亮 */
  urgent: boolean;
  skillId?: string;
}

export interface EnemyIntentContext {
  enemy: EnemyUnit;
  isStunned: () => boolean;
  enemyCaster: () => SkillCaster;
  runtimeContext: () => SkillRuntimeContext;
}

/** 推演敌人下一个回合会做什么。敌人已死或无从判断时返回 null（UI 隐藏预告） */
export function predictEnemyIntent(ctx: EnemyIntentContext): EnemyIntent | null {
  const enemy = ctx.enemy;
  if (enemy.hp <= 0) return null;

  // 顺序必须与 runEnemyTurnAction 完全一致：转阶段 > 眩晕 > 蓄力释放 > 技能 > 普攻
  const phase = pendingBossPhase(enemy);
  if (phase) {
    return {
      kind: 'phase',
      label: phase.label,
      detail: '血线已破，下回合变身',
      urgent: true,
    };
  }

  if (enemy.charging) {
    const skill = skillForEnemy(enemy.charging.skillId);
    return {
      kind: 'chargedHit',
      label: skill.name,
      detail: '下回合重击，护盾或治疗顶住',
      urgent: true,
      skillId: skill.id,
    };
  }

  // 蓄力中的敌人不受眩晕影响，故这一条排在蓄力之后
  if (ctx.isStunned()) {
    return { kind: 'idle', label: '眩晕中', detail: '下回合无法行动，抓紧输出', urgent: false };
  }

  const pick = pickEnemySkill(enemy, ctx.enemyCaster(), ctx.runtimeContext(), 1);
  if (pick && !pick.wasted) {
    return {
      kind: 'skill',
      label: pick.skill.name,
      detail: pick.skill.desc,
      urgent: pick.result.damageEvents.some((e) => e.target === 'hero')
        || pick.result.statusEvents.some((e) => e.status === 'charge'),
      skillId: pick.skill.id,
    };
  }

  // 技能位被占用（白放减伤）时真实回合会空过，普攻倒计时也不推进
  if (pick?.wasted) {
    return { kind: 'idle', label: '按兵不动', detail: '护壁已在，下回合不出手', urgent: false };
  }

  if (enemy.attackCountdown - 1 <= 0) {
    return {
      kind: 'attack',
      label: '普通攻击',
      detail: '下回合出手',
      urgent: false,
    };
  }
  return {
    kind: 'idle',
    label: '蓄势',
    detail: `再过 ${enemy.attackCountdown - 1} 回合出手`,
    urgent: false,
  };
}
