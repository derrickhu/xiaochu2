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
import { PET_MAP } from '@/balance/pets';
import type { EnemyDef } from '@/balance/enemies';
import { ENEMY_MAP } from '@/balance/enemies';
import type { StageDef } from '@/balance/stages';
import { STAGE_MAP } from '@/balance/stages';
import type { SkillDef, SkillVfxId } from '@/balance/skills';
import { calcDamage, calcHeal } from './damage';
import { enemyStats } from './growth';
import {
  petAtkInTeam,
  teamMaxHp,
  teamRcv,
  teamElements,
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

/** 玩家操作熟练度模型 */
export interface ComboModel {
  name: string;
  /** 每回合形成的消除组数（总 Combo） */
  combo: number;
  /** 每组平均珠数（3 连 / 4 连…） */
  matchCount: number;
  /** 是否会用主动技（低手不主动放技能） */
  useSkills: boolean;
}

export const COMBO_MODELS: Readonly<Record<'low' | 'mid' | 'high', ComboModel>> = {
  low: { name: '低手3C', combo: 3, matchCount: 3, useSkills: false },
  mid: { name: '中手5C', combo: 5, matchCount: 3, useSkills: true },
  high: { name: '高手7C', combo: 7, matchCount: 4, useSkills: true },
};

export interface SimResult {
  win: boolean;
  /** 已用回合（达到上限仍未通关 = 卡关） */
  turnsUsed: number;
  /** 通关时英雄剩余血量（未通关 = 0） */
  heroHpRemaining: number;
  heroMaxHp: number;
  /** 单波最高承伤（评估是否被蓄力一击带走） */
  maxEnemyHit: number;
  /** 是否受过伤（无伤星判定） */
  tookDamage: boolean;
  /** 预计星数（口径同 BattleController.finish） */
  stars: number;
}

interface SimPet {
  def: PetDef;
  skill: SkillDef;
  atk: number;
  skillCdLeft: number;
}

interface SimEnemy {
  def: EnemyDef;
  maxHp: number;
  hp: number;
  atk: number;
  def_: number;
  attackCountdown: number;
  skillCds: number[];
  charging: { mult: number; skillId: string; releaseVfx: SkillVfxId } | null;
  dmgReduction: { reduction: number; turnsLeft: number } | null;
}

/** 超过该回合仍未通关，按卡关处理；避免弱队无限磨死自疗怪 */
const TURN_CAP = 55;

function spawnEnemy(stage: StageDef, waveIndex: number): SimEnemy {
  const def = ENEMY_MAP.get(stage.enemies[waveIndex]);
  if (!def) throw new Error(`未知敌人: ${stage.enemies[waveIndex]}`);
  const stats = enemyStats(def, stage.chapter, stage.difficulty);
  return {
    def,
    maxHp: stats.hp,
    hp: stats.hp,
    atk: stats.atk,
    def_: stats.def,
    attackCountdown: def.attackInterval,
    skillCds: (def.skillIds ?? []).map((id) => skillForEnemy(id).cd),
    charging: null,
    dmgReduction: null,
  };
}

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

  const team: SimPet[] = members.map((m) => ({
    def: m.def,
    skill: skillForPet(m.def, m.star),
    atk: petAtkInTeam(members, m),
    skillCdLeft: skillCdForPet(m.def, m.star),
  }));
  const heroMaxHp = teamMaxHp(members);
  const rcvTotal = teamRcv(members);
  const covered = teamElements(members);

  /** 每元素出手宠（首个该元素，口径同 BattleController.resolveTurn 的 findIndex） */
  const firstPetOf = (el: Element): SimPet | undefined =>
    team.find((p) => p.def.element === el);

  let heroHp = heroMaxHp;
  let shield = 0;
  let dmgBuff: { mult: number; turnsLeft: number } | null = null;
  let tookDamage = false;
  let maxEnemyHit = 0;
  let turnsUsed = 0;
  let enemyReduction = 0;
  let buffMult = 1;
  let dmgToEnemy = 0;
  let healThisTurn = 0;

  let waveIndex = 0;
  let enemy = spawnEnemy(stage, waveIndex);

  const groupsPerType = model.combo / 6;

  for (let turn = 1; turn <= TURN_CAP; turn++) {
    turnsUsed = turn;

    // ── 玩家回合：技能 CD 推进（首回合不减，对齐 beginPlayerTurn 时序）──
    if (turn > 1) {
      for (const p of team) if (p.skillCdLeft > 0) p.skillCdLeft--;
    }

    enemyReduction = enemy.dmgReduction?.reduction ?? 0;
    buffMult = dmgBuff?.mult ?? 1.0;
    dmgToEnemy = 0;
    healThisTurn = 0;

    // ── 主动技（中/高手）──
    if (model.useSkills) {
      for (const p of team) {
        if (p.skillCdLeft > 0) continue;
        if (p.skill.effects.some((e) => e.kind === 'heal' && e.source !== 'enemyMaxHp') && heroHp >= heroMaxHp * 0.85) {
          continue;
        }
        const skillResult = runSkill(
          p.skill,
          { kind: 'pet', atk: p.atk, element: p.def.element, petDef: p.def },
          runtimeContext(),
        );
        if (!skillResult) continue;
        applySkillResult(skillResult);
        p.skillCdLeft = p.skill.cd;
      }
    }

    // ── 转珠消除：覆盖元素造伤，心珠回血 ──
    for (const el of covered) {
      const pet = firstPetOf(el);
      if (!pet) continue;
      dmgToEnemy += groupsPerType * orbGroupDamage(pet.atk, el, enemy, model, buffMult, enemyReduction);
    }
    const heartOrbs = groupsPerType * model.matchCount;
    healThisTurn += calcHeal(rcvTotal, heartOrbs, model.combo);

    heroHp = Math.min(heroMaxHp, heroHp + healThisTurn);
    enemy.hp = Math.max(0, enemy.hp - Math.floor(dmgToEnemy));

    // ── 敌人死亡 → 进波；新敌人当回合不行动 ──
    if (enemy.hp <= 0) {
      if (waveIndex + 1 < stage.enemies.length) {
        waveIndex++;
        enemy = spawnEnemy(stage, waveIndex);
        decayStatuses();
        continue;
      }
      return finish(true);
    }

    // ── 敌人回合 ──
    const hit = enemyAct();
    if (hit > 0) {
      maxEnemyHit = Math.max(maxEnemyHit, hit);
      const absorbed = Math.min(shield, hit);
      shield -= absorbed;
      const dmg = hit - absorbed;
      heroHp = Math.max(0, heroHp - dmg);
      if (dmg > 0) tookDamage = true;
    }
    decayStatuses();
    if (heroHp <= 0) return finish(false);
  }

  // 回合用尽仍未通关 = 卡关
  return finish(false);

  // ════════ 内部闭包 ════════

  function decayStatuses(): void {
    if (dmgBuff) {
      dmgBuff.turnsLeft--;
      if (dmgBuff.turnsLeft <= 0) dmgBuff = null;
    }
    if (enemy.dmgReduction) {
      enemy.dmgReduction.turnsLeft--;
      if (enemy.dmgReduction.turnsLeft <= 0) enemy.dmgReduction = null;
    }
  }

  function runtimeContext(): SkillRuntimeContext {
    return {
      enemy: {
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        atk: enemy.atk,
        def_: enemy.def_,
        element: enemy.def.element,
      },
      heroHp,
      heroMaxHp,
      teamRcvTotal: rcvTotal,
      teamAtkTotal: team.reduce((sum, p) => sum + p.atk, 0),
      teamDamageBuffMult: dmgBuff?.mult ?? 1,
      enemyDamageReduction: enemy.dmgReduction?.reduction ?? 0,
    };
  }

  function applySkillResult(result: SkillResult): void {
    for (const event of result.damageEvents) {
      if (event.target === 'enemy') {
        dmgToEnemy += event.amount;
      } else {
        const absorbed = Math.min(shield, event.amount);
        shield -= absorbed;
        const dmg = event.amount - absorbed;
        heroHp = Math.max(0, heroHp - dmg);
        if (dmg > 0) tookDamage = true;
        maxEnemyHit = Math.max(maxEnemyHit, event.amount);
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
        dmgBuff = { mult: event.value, turnsLeft: event.turns ?? 0 };
      } else if (event.status === 'enemyDamageReduction') {
        if (!enemy.dmgReduction) enemy.dmgReduction = { reduction: event.value, turnsLeft: event.turns ?? 0 };
      } else if (event.status === 'charge') {
        enemy.charging = { mult: event.value, skillId: result.skill.id, releaseVfx: event.vfx };
      }
    }

    for (const req of result.boardRequests) {
      // 近似：转出的珠当回合即转化为伤害/回血
      if (req.to === 'heart') {
        healThisTurn += calcHeal(rcvTotal, req.count, model.combo);
      } else if (covered.has(req.to as Element)) {
        const pet = firstPetOf(req.to as Element);
        if (pet) {
          const extraGroups = req.count / model.matchCount;
          dmgToEnemy += extraGroups * orbGroupDamage(
            pet.atk, req.to as Element, enemy, model, dmgBuff?.mult ?? buffMult, enemy.dmgReduction?.reduction ?? enemyReduction,
          );
        }
      }
    }
  }

  /** 返回本回合对英雄的原始伤害（0 = 未攻击） */
  function enemyAct(): number {
    if (enemy.hp <= 0) return 0;

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

/** 单组属性珠期望伤害（含克制/防御/增伤/敌减伤） */
function orbGroupDamage(
  atk: number,
  el: Element,
  enemy: SimEnemy,
  model: ComboModel,
  buffMult: number,
  enemyReduction: number,
): number {
  const raw = calcDamage({
    atk,
    matchCount: model.matchCount,
    combo: model.combo,
    attackerElement: el,
    defenderElement: enemy.def.element,
    defenderDef: enemy.def_,
    buffMult,
  });
  return raw * (1 - enemyReduction);
}

// ════════════ 报告辅助（调参 / 测试共用） ════════════

/** 由宠物 id 构造固定 level/star 的队伍 */
export function buildTeam(
  ids: readonly string[],
  level: number,
  star: number,
): TeamMember[] {
  return ids
    .map((id) => PET_MAP.get(id))
    .filter((def): def is PetDef => !!def)
    .map((def) => ({ def, level, star }));
}

export interface StageReportRow {
  stageId: string;
  low: SimResult;
  mid: SimResult;
  high: SimResult;
}

/** 跑一支队伍在一组关卡上的三模型矩阵 */
export function simulateMatrix(
  members: readonly TeamMember[],
  stageIds: readonly string[],
): StageReportRow[] {
  return stageIds.map((stageId) => ({
    stageId,
    low: simulateBattle(members, stageId, COMBO_MODELS.low),
    mid: simulateBattle(members, stageId, COMBO_MODELS.mid),
    high: simulateBattle(members, stageId, COMBO_MODELS.high),
  }));
}

/** 人类可读的一行摘要（调参时 console 打印用） */
export function formatResult(r: SimResult): string {
  const hp = r.win ? `${Math.round((r.heroHpRemaining / r.heroMaxHp) * 100)}%hp` : 'DEAD';
  return `${r.win ? `WIN ${r.stars}★` : 'LOSE'} t=${r.turnsUsed} ${hp} maxHit=${r.maxEnemyHit}`;
}
