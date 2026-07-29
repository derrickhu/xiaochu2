/**
 * R / SR 量产技矩阵 —— 由 creatureRoster 的 MATRIX_ROSTER 批量生成 SkillDef
 *
 * 设计意图：100 只宠不可能逐只手写独占技（70 个新技的创意 + 文案 + 测试成本不可控），
 * 也不该让低稀有共享同一 skillId（会让「换宠」失去手感差异）。折中方案是
 * 「蓝图 × 属性」矩阵：每只 R/SR 宠仍有独占 skillId，但数值只由
 * MATRIX_TUNING 的一档决定，创意成本收敛到起名。SSR/UR 才逐只手写招牌技。
 *
 * ## 伤害类目的稀有度阶梯（硬约束）
 * monotonic.test.ts 会审计 nuke / multiNuke / dot / teamNuke 四个纯输出类目：
 * 同类目内任意两只宠，高稀有的 basePower × RARITY_SKILL_POWER 必须不低于低稀有。
 * 因此这四类的数值**按稀有度固定一档**（不做属性差异），并且必须与 creatures.ts
 * 手写宠的既有数值对齐：
 * - nuke：R 5.0（手写 pet_024 为 7.0 是 R 上界）→ SR 6.5（×1.12 = 7.28 ≥ 7.0）→ UR 6.0（×1.48 = 8.88）
 * - multiNuke：R 2.2×3 = 6.6 → SR 2.6×3 = 7.8（×1.12 = 8.74）→ UR 12~17.5
 * - dot：R 1.8×3 = 5.4 → SR 2.2×3 = 6.6（×1.12 = 7.39）→ UR 3.0×4 = 12
 * - teamNuke：SR 1.4（×1.12 = 1.57）→ SSR 1.4（×1.28 = 1.79）
 * 改这里的数值前先确认不会与手写宠的同类目档位倒挂。
 */
import type { SkillDef } from './types';
import {
  makeConvert,
  makeDamageBuff,
  makeDefenseBreak,
  makeDelayAttack,
  makeDot,
  makeElementBuff,
  makeExtraTime,
  makeGravity,
  makeHeal,
  makeMultiHit,
  makeNuke,
  makeShield,
  makeStun,
  makeTeamNuke,
} from './blueprints';
import {
  MATRIX_ROSTER,
  matrixSkillId,
  type MatrixBlueprint,
  type MatrixRosterRow,
} from '../creatureRoster';

/** 每档蓝图在 R / SR 两个稀有度上的数值（缺省档 = 该蓝图不在该稀有度出现） */
const MATRIX_TUNING: Readonly<Record<MatrixBlueprint, Partial<Record<1 | 2, Record<string, number>>>>> = {
  // ── 纯输出类目（受跨稀有倒挂审计约束）──
  nuke: { 1: { multiplier: 5, cd: 5 }, 2: { multiplier: 6.5, cd: 5 } },
  multiHit: { 1: { multiplier: 2.2, hits: 3, cd: 5 }, 2: { multiplier: 2.6, hits: 3, cd: 6 } },
  dot: { 1: { multiplier: 1.8, turns: 3, cd: 5 }, 2: { multiplier: 2.2, turns: 3, cd: 5 } },
  teamNuke: { 2: { multiplier: 1.4, cd: 7 } },
  // ── 续航 / 功能类目 ──
  heal: { 1: { healPct: 0.3, cd: 5 }, 2: { healPct: 0.4, cd: 6 } },
  shield: { 1: { shieldPct: 0.25, cd: 6 }, 2: { shieldPct: 0.3, cd: 6 } },
  convert: { 1: { count: 5, cd: 6 } },
  defenseBreak: { 1: { pct: 0.35, turns: 3, cd: 5 } },
  stun: { 2: { turns: 1, damage: 4.5, cd: 6 } },
  delayAttack: { 2: { turns: 1, damage: 3, cd: 6 } },
  gravity: { 2: { pct: 0.18, cd: 8 } },
  damageBuff: { 2: { mult: 1.4, turns: 2, cd: 6 } },
  elementBuff: { 2: { mult: 1.4, turns: 2, cd: 6 } },
  extraTime: { 2: { seconds: 2, turns: 3, cd: 6 } },
};

function buildMatrixSkill(row: MatrixRosterRow): SkillDef {
  const t = MATRIX_TUNING[row.blueprint][row.rarity];
  if (!t) {
    throw new Error(`矩阵技缺数值档: ${row.id} ${row.blueprint} @r${row.rarity}`);
  }
  const base = { id: matrixSkillId(row), name: row.skillName, flavor: row.flavor, cd: t.cd };

  switch (row.blueprint) {
    case 'nuke':
      return makeNuke({ ...base, element: row.element, multiplier: t.multiplier });
    case 'multiHit':
      return makeMultiHit({ ...base, element: row.element, multiplier: t.multiplier, hits: t.hits });
    case 'dot':
      return makeDot({ ...base, element: row.element, multiplier: t.multiplier, turns: t.turns });
    case 'teamNuke':
      return makeTeamNuke({ ...base, multiplier: t.multiplier });
    case 'heal':
      return makeHeal({ ...base, healPct: t.healPct });
    case 'shield':
      return makeShield({ ...base, shieldPct: t.shieldPct });
    case 'convert':
      return makeConvert({ ...base, to: row.element, count: t.count });
    case 'defenseBreak':
      return makeDefenseBreak({ ...base, pct: t.pct, turns: t.turns });
    case 'stun':
      return makeStun({
        ...base, turns: t.turns,
        damage: { element: row.element, multiplier: t.damage },
      });
    case 'delayAttack':
      return makeDelayAttack({
        ...base, turns: t.turns,
        damage: { element: row.element, multiplier: t.damage },
      });
    case 'gravity':
      return makeGravity({ ...base, pct: t.pct });
    case 'damageBuff':
      return makeDamageBuff({ ...base, mult: t.mult, turns: t.turns });
    case 'elementBuff':
      return makeElementBuff({ ...base, element: row.element, mult: t.mult, turns: t.turns });
    case 'extraTime':
      return makeExtraTime({ ...base, seconds: t.seconds, turns: t.turns });
  }
}

/** 57 个量产技（21 R + 36 SR），与 MATRIX_ROSTER 一一对应 */
export const MATRIX_SKILLS: readonly SkillDef[] = MATRIX_ROSTER.map(buildMatrixSkill);
