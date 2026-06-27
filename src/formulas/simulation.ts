/**
 * 战斗数值模拟器（纯函数，零渲染 / 零随机）
 *
 * 目的：在不真实拖珠的前提下，按"低/中/高手"三种 Combo 模型估算每关的
 *   - 击杀回合（TTK）/ 是否通关 / 剩余血量 / 最大单次承伤 / 预计星数
 * 用来量化验证关卡设计意图（"乱打卡某关 / 换对队伍能过 / Boss 需搭配"），
 * 逻辑刻意对齐 game/battle/BattleController.ts 的结算管线，但用期望值替代随机：
 *   - 每回合形成 combo 组消除，按 6 种珠（5 元素 + 心珠）近似均匀分布
 *   - 仅队伍覆盖到的元素珠造成伤害；心珠回血；未覆盖元素珠浪费
 *   - 不计暴击（期望影响极小，且保持确定性）
 */
import { COMBAT, type Element } from '@/balance/combat';
import type { PetDef } from '@/balance/pets';
import type { StageDef } from '@/balance/stages';
import { STAGE_MAP } from '@/balance/stages';
import { resolveMechanics } from '@/balance/stageMechanics';
import type { SkillDef } from '@/balance/skills';
import { applyDamageReduction, calcHeal } from './damage';
import {
  petAtkInTeam,
  teamMaxHp,
  teamRcv,
  teamElements,
  teamEffectAggregate,
  petSelfCombatProfile,
  type TeamMember,
} from './team';
import {
  runChargedAttack,
  runSkill,
  skillCdForPet,
  skillForEnemy,
  skillForPet,
  type SkillResult,
  type SkillRuntimeContext,
} from '@/game/battle/SkillEngine';
import { orbGroupDamage } from './simulationDamage';
import { spawnSimEnemy, type SimEnemy } from './simulationEnemy';
import {
  COMBO_MODELS,
  simulateMatrixWith,
  type ComboModel,
  type SimResult,
  type StageReportRow,
} from './simulationReport';

export {
  buildTeam,
  COMBO_MODELS,
  formatResult,
  type ComboModel,
  type SimResult,
  type StageReportRow,
} from './simulationReport';

interface SimPet {
  def: PetDef;
  skill: SkillDef;
  atk: number;
  /** 个体暴击率（仅作用自身消珠/主动技） */
  critRate: number;
  /** 个体额外暴击伤害 */
  critDamage: number;
  skillCdLeft: number;
}

/** 超过该回合仍未通关，按卡关处理；避免弱队无限磨死自疗怪 */
const TURN_CAP = 55;

/**
 * 模拟一场战斗。
 * 对齐 BattleController：宠物技 CD 从 def.cd 起算，每回合（首回合除外）-1，就绪即放。
 */
export function simulateBattle(
  members: readonly TeamMember[],
  stageId: string,
  model: ComboModel,
): SimResult {
  const found = STAGE_MAP.get(stageId);
  if (!found) throw new Error(`未知关卡: ${stageId}`);
  const stage: StageDef = found;

  const team: SimPet[] = members.map((m) => {
    const profile = petSelfCombatProfile(m.def, m.star);
    return {
      def: m.def,
      skill: skillForPet(m.def, m.star),
      atk: petAtkInTeam(members, m),
      critRate: profile.critRate,
      critDamage: profile.critDamage,
      skillCdLeft: skillCdForPet(m.def, m.star),
    };
  });
  const heroMaxHp = teamMaxHp(members);
  const rcvTotal = teamRcv(members);
  const covered = teamElements(members);

  const teamFx = teamEffectAggregate(members);
  const passiveRegenPerTurn = Math.floor(heroMaxHp * teamFx.regenPct);
  const teamDamageMult = teamFx.teamDamageMult;
  const teamDmgReduction = teamFx.damageReduction;
  const teamHealBonus = teamFx.healBonus;

  /** 每元素出手宠（首个该元素，口径同 BattleController.resolveTurn 的 findIndex） */
  const firstPetOf = (el: Element): SimPet | undefined =>
    team.find((p) => p.def.element === el);

  let heroHp = heroMaxHp;
  let shield = Math.floor(heroMaxHp * teamFx.startShieldPct);
  let tookDamage = false;
  let maxEnemyHit = 0;
  let turnsUsed = 0;
  let enemyReduction = 0;
  let buffMult = 1;
  let dmgToEnemy = 0;
  let healThisTurn = 0;
  // 阶段八新增状态（增伤/点燃/眩晕/破防）。
  // 用持有对象而非散落 let：闭包内外读写统一为属性访问，避免 TS 把闭包内赋值的
  // let 在外层窄化为 never（运行期逻辑不变，纯类型修正）。
  let enemyStun = 0;
  const st: {
    dmgBuff: { mult: number; turnsLeft: number } | null;
    enemyDefBreak: { pct: number; turnsLeft: number } | null;
    enemyDot: { amount: number; turnsLeft: number } | null;
    heroDot: { amount: number; turnsLeft: number } | null;
  } = { dmgBuff: null, enemyDefBreak: null, enemyDot: null, heroDot: null };
  const effEnemyDef = (): number =>
    st.enemyDefBreak ? Math.floor(enemy.def_ * (1 - st.enemyDefBreak.pct)) : enemy.def_;

  let waveIndex = 0;
  let enemy = spawnSimEnemy(stage, waveIndex);

  // 关卡规则机制：禁心（心珠不回血）、禁用属性珠（消除无伤害）
  const mech = resolveMechanics(stage.mechanics);
  const bannedSet = new Set<Element>(mech.bannedElements);

  const groupsPerType = model.combo / 6;

  for (let turn = 1; turn <= TURN_CAP; turn++) {
    turnsUsed = turn;

    // ── 玩家回合：技能 CD 推进（首回合不减，对齐 beginPlayerTurn 时序）──
    if (turn > 1) {
      for (const p of team) if (p.skillCdLeft > 0) p.skillCdLeft--;
    }

    enemyReduction = enemy.dmgReduction?.reduction ?? 0;
    buffMult = (st.dmgBuff?.mult ?? 1.0) * teamDamageMult;
    dmgToEnemy = 0;
    healThisTurn = passiveRegenPerTurn;

    // ── 主动技（中/高手）──
    if (model.useSkills) {
      for (const p of team) {
        if (p.skillCdLeft > 0) continue;
        if (p.skill.effects.some((e) => e.kind === 'heal' && e.source !== 'enemyMaxHp') && heroHp >= heroMaxHp * 0.85) {
          continue;
        }
        const skillResult = runSkill(
          p.skill,
          { kind: 'pet', atk: p.atk, element: p.def.element, petDef: p.def, critRate: p.critRate, critDamage: p.critDamage },
          runtimeContext(),
        );
        if (!skillResult) continue;
        applySkillResult(skillResult);
        p.skillCdLeft = p.skill.cd;
      }
    }

    // ── 转珠消除：覆盖元素造伤，心珠回血 ──
    for (const el of covered) {
      if (bannedSet.has(el)) continue; // 禁用属性珠：消除无伤害
      const pet = firstPetOf(el);
      if (!pet) continue;
      dmgToEnemy += groupsPerType * orbGroupDamage(
        pet.atk, el, enemy, effEnemyDef(), model, buffMult, enemyReduction,
        { critRate: pet.critRate, critDamage: pet.critDamage },
      );
    }
    // 持续伤害（点燃）：每回合对敌人结算
    if (st.enemyDot) dmgToEnemy += st.enemyDot.amount;
    const heartOrbs = mech.noHeartHeal ? 0 : groupsPerType * model.matchCount;
    healThisTurn += calcHeal(rcvTotal, heartOrbs, model.combo, teamHealBonus);

    heroHp = Math.min(heroMaxHp, heroHp + healThisTurn);
    enemy.hp = Math.max(0, enemy.hp - Math.floor(dmgToEnemy));

    // ── 敌人死亡 → 进波；新敌人当回合不行动 ──
    if (enemy.hp <= 0) {
      if (waveIndex + 1 < stage.encounters.length) {
        waveIndex++;
        enemy = spawnSimEnemy(stage, waveIndex);
        decayStatuses();
        continue;
      }
      return finish(true);
    }

    // ── 敌人回合 ──
    const hit = enemyAct();
    if (hit > 0) {
      // 受击顺序（镜像 BattleController.applyEnemyDamage）：减伤 → 护盾 → 扣血
      const reduced = applyDamageReduction(hit, teamDmgReduction);
      maxEnemyHit = Math.max(maxEnemyHit, reduced);
      const absorbed = Math.min(shield, reduced);
      shield -= absorbed;
      const dmg = reduced - absorbed;
      heroHp = Math.max(0, heroHp - dmg);
      if (dmg > 0) tookDamage = true;
    }
    // 持续伤害（敌方施加于英雄）
    if (st.heroDot) {
      heroHp = Math.max(0, heroHp - st.heroDot.amount);
      if (st.heroDot.amount > 0) tookDamage = true;
    }
    decayStatuses();
    if (heroHp <= 0) return finish(false);
  }

  // 回合用尽仍未通关 = 卡关
  return finish(false);

  // ════════ 内部闭包 ════════

  function decayStatuses(): void {
    if (st.dmgBuff) {
      st.dmgBuff.turnsLeft--;
      if (st.dmgBuff.turnsLeft <= 0) st.dmgBuff = null;
    }
    if (enemy.dmgReduction) {
      enemy.dmgReduction.turnsLeft--;
      if (enemy.dmgReduction.turnsLeft <= 0) enemy.dmgReduction = null;
    }
    if (enemyStun > 0) enemyStun--;
    if (st.enemyDefBreak) {
      st.enemyDefBreak.turnsLeft--;
      if (st.enemyDefBreak.turnsLeft <= 0) st.enemyDefBreak = null;
    }
    if (st.enemyDot) {
      st.enemyDot.turnsLeft--;
      if (st.enemyDot.turnsLeft <= 0) st.enemyDot = null;
    }
    if (st.heroDot) {
      st.heroDot.turnsLeft--;
      if (st.heroDot.turnsLeft <= 0) st.heroDot = null;
    }
  }

  function runtimeContext(): SkillRuntimeContext {
    return {
      enemy: {
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        atk: enemy.atk,
        def_: effEnemyDef(),
        element: enemy.def.element,
      },
      heroHp,
      heroMaxHp,
      teamRcvTotal: rcvTotal,
      teamAtkTotal: team.reduce((sum, p) => sum + p.atk, 0),
      teamDamageBuffMult: (st.dmgBuff?.mult ?? 1) * teamDamageMult,
      enemyDamageReduction: enemy.dmgReduction?.reduction ?? 0,
      teamHealBonus,
    };
  }

  function applySkillResult(result: SkillResult): void {
    for (const event of result.damageEvents) {
      if (event.target === 'enemy') {
        dmgToEnemy += event.amount;
      } else {
        // 敌方技能直伤英雄：镜像 applyEnemyDamage（减伤 → 护盾 → 扣血）
        const reduced = applyDamageReduction(event.amount, teamDmgReduction);
        const absorbed = Math.min(shield, reduced);
        shield -= absorbed;
        const dmg = reduced - absorbed;
        heroHp = Math.max(0, heroHp - dmg);
        if (dmg > 0) tookDamage = true;
        maxEnemyHit = Math.max(maxEnemyHit, reduced);
      }
    }

    for (const event of result.healEvents) {
      if (event.target === 'team') {
        healThisTurn += event.amount;
      } else {
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + event.amount);
      }
    }

    for (const event of result.statusEvents) {
      if (event.status === 'shield') {
        shield = Math.max(shield, event.value);
      } else if (event.status === 'teamDamageBuff') {
        st.dmgBuff = { mult: event.value, turnsLeft: event.turns ?? 0 };
      } else if (event.status === 'enemyDamageReduction') {
        if (!enemy.dmgReduction) enemy.dmgReduction = { reduction: event.value, turnsLeft: event.turns ?? 0 };
      } else if (event.status === 'charge') {
        enemy.charging = { mult: event.value, skillId: result.skill.id, releaseVfx: event.vfx };
      } else if (event.status === 'dot') {
        if (event.target === 'enemy') {
          st.enemyDot = { amount: event.value, turnsLeft: event.turns ?? 0 };
        } else {
          st.heroDot = { amount: event.value, turnsLeft: event.turns ?? 0 };
        }
      } else if (event.status === 'stun') {
        enemyStun = Math.max(enemyStun, event.turns ?? 0);
      } else if (event.status === 'enemyDefenseBreak') {
        st.enemyDefBreak = { pct: Math.max(st.enemyDefBreak?.pct ?? 0, event.value), turnsLeft: event.turns ?? 0 };
      }
    }

    for (const req of result.boardRequests) {
      // 近似：转出的珠当回合即转化为伤害/回血（shape 仅近似为 count 颗）
      if (req.to === 'heart') {
        healThisTurn += calcHeal(rcvTotal, req.count, model.combo, teamHealBonus);
      } else if (covered.has(req.to as Element)) {
        const pet = firstPetOf(req.to as Element);
        if (pet) {
          const extraGroups = req.count / model.matchCount;
          dmgToEnemy += extraGroups * orbGroupDamage(
            pet.atk, req.to as Element, enemy, effEnemyDef(), model, (st.dmgBuff?.mult ?? 1) * teamDamageMult, enemy.dmgReduction?.reduction ?? enemyReduction,
            { critRate: pet.critRate, critDamage: pet.critDamage },
          );
        }
      }
    }
  }

  /** 返回本回合对英雄的原始伤害（0 = 未攻击） */
  function enemyAct(): number {
    if (enemy.hp <= 0) return 0;
    // 眩晕：跳过行动（蓄力中的敌人不受眩晕影响）
    if (enemyStun > 0 && !enemy.charging) return 0;

    if (enemy.charging) {
      const charging = enemy.charging;
      enemy.charging = null;
      enemy.attackCountdown = enemy.def.attackInterval;
      const skill = skillForEnemy(charging.skillId);
      const result = runChargedAttack(
        skill,
        { kind: 'enemy', atk: enemy.atk, element: enemy.def.element },
        runtimeContext(),
        charging.mult,
        charging.releaseVfx,
      );
      return result.damageEvents[0]?.amount ?? 0;
    }

    const skillIds = enemy.def.skillIds ?? [];
    for (let i = 0; i < skillIds.length; i++) {
      if (enemy.skillCds[i] > 0) enemy.skillCds[i]--;
    }
    for (let i = 0; i < skillIds.length; i++) {
      if (enemy.skillCds[i] > 0) continue;
      const skill = skillForEnemy(skillIds[i]);
      if (enemy.dmgReduction && skill.effects.some((e) => e.kind === 'status' && e.status === 'enemyDamageReduction')) {
        continue;
      }
      const result = runSkill(skill, { kind: 'enemy', atk: enemy.atk, element: enemy.def.element }, runtimeContext());
      if (result) {
        applySkillResult(result);
        enemy.skillCds[i] = skill.cd;
        return 0;
      }
    }

    enemy.attackCountdown--;
    if (enemy.attackCountdown > 0) return 0;
    enemy.attackCountdown = enemy.def.attackInterval;
    return enemy.atk;
  }

  function finish(win: boolean): SimResult {
    let stars = 0;
    if (win) {
      stars = 1;
      if (turnsUsed <= stage.starTurnLimit) stars++;
      if (!tookDamage) stars++;
    }
    return {
      win,
      turnsUsed,
      heroHpRemaining: win ? heroHp : 0,
      heroMaxHp,
      maxEnemyHit,
      tookDamage,
      stars,
    };
  }
}

// ════════════ 报告辅助（调参 / 测试共用） ════════════

/** 跑一支队伍在一组关卡上的三模型矩阵 */
export function simulateMatrix(
  members: readonly TeamMember[],
  stageIds: readonly string[],
): StageReportRow[] {
  return simulateMatrixWith(simulateBattle, members, stageIds);
}
