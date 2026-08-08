/**
 * 通天塔难度审计（v0.8）
 *
 * 主线 difficultyAudit 只管 STAGES；塔走 registerExtraStage，必须单独验收。
 * 阈值真源在 balance/difficultyBudget.TOWER_WALL。
 */
import { DEFAULT_TEAM, PET_MAP } from '@/balance/pets';
import { TOWER_WALL } from '@/balance/difficultyBudget';
import { TOWER, buildTowerStage, isMilestoneFloor } from '@/balance/tower';
import { resolveEncounter } from '@/balance/enemies';
import { enemyStats } from '@/formulas/growth';
import { genericTeam } from '@/formulas/difficultyAudit';
import { simulateBattle } from '@/formulas/simulation';
import { COMBO_MODELS, type ComboModel } from '@/formulas/simulationReport';
import type { TeamMember } from '@/formulas/team';

export interface TowerViolation {
  rule: 'towerLv1Wall' | 'towerChapterWall' | 'towerSoftFloor';
  floor?: number;
  chapter?: number;
  detail: string;
}

export interface TowerDifficultyReport {
  violations: readonly TowerViolation[];
  lv1: { mid: number; high: number };
  chapterMidDepth: Readonly<Record<number, number>>;
}

function starterTeam(): TeamMember[] {
  return DEFAULT_TEAM.map((id) => ({ def: PET_MAP.get(id)!, level: 1, star: 1 }));
}

/** 单场满血、无灵机，连续通关到的最深层（卡关前一层） */
export function towerDeepest(team: TeamMember[], model: ComboModel, maxFloor = TOWER_WALL.probeMaxFloor): number {
  let last = 0;
  for (let floor = 1; floor <= maxFloor; floor++) {
    const stage = buildTowerStage(floor);
    if (!simulateBattle(team, stage.id, model).win) return last;
    last = floor;
  }
  return last;
}

function floorTotalHp(floor: number): number {
  const stage = buildTowerStage(floor);
  let hp = 0;
  for (const ref of stage.encounters) {
    const def = resolveEncounter(ref).def;
    hp += enemyStats(def, stage.chapter, stage.difficulty).hp;
  }
  return hp;
}

function checkLv1Wall(): { violations: TowerViolation[]; mid: number; high: number } {
  const team = starterTeam();
  const mid = towerDeepest(team, COMBO_MODELS.mid);
  const high = towerDeepest(team, COMBO_MODELS.high);
  const violations: TowerViolation[] = [];
  if (mid > TOWER_WALL.lv1MidMaxDepth) {
    violations.push({
      rule: 'towerLv1Wall',
      floor: mid,
      detail: `Lv1★1 中手可推到第 ${mid} 层，超过上限 ${TOWER_WALL.lv1MidMaxDepth}`,
    });
  }
  if (high > TOWER_WALL.lv1HighMaxDepth) {
    violations.push({
      rule: 'towerLv1Wall',
      floor: high,
      detail: `Lv1★1 高手可推到第 ${high} 层，超过上限 ${TOWER_WALL.lv1HighMaxDepth}（应在 F20 守关前撞墙）`,
    });
  }
  return { violations, mid, high };
}

function checkChapterWall(): { violations: TowerViolation[]; depth: Record<number, number> } {
  const violations: TowerViolation[] = [];
  const depth: Record<number, number> = {};
  for (const ch of TOWER_WALL.chapterAnchors) {
    const cap = ch * TOWER.floorsPerChapter + TOWER_WALL.chapterMidSlack;
    const d = towerDeepest(genericTeam(ch), COMBO_MODELS.mid);
    depth[ch] = d;
    if (d > cap) {
      violations.push({
        rule: 'towerChapterWall',
        chapter: ch,
        floor: d,
        detail: `第 ${ch} 章锚点中手可推到第 ${d} 层，超过上限 ${cap}（塔应比同进度主线更硬）`,
      });
    }
  }
  return { violations, depth };
}

/**
 * 非守关层若比邻域中位血量低一截，就是「软段」——旧 F28 的病根。
 * 邻域取前后各 2 个非守关层，避免被守关尖峰拉高中位数。
 */
function checkSoftFloors(): TowerViolation[] {
  const samples: { floor: number; hp: number }[] = [];
  for (let f = 1; f <= TOWER_WALL.softFloorScanTo; f++) {
    if (isMilestoneFloor(f)) continue;
    samples.push({ floor: f, hp: floorTotalHp(f) });
  }
  const out: TowerViolation[] = [];
  for (let i = 0; i < samples.length; i++) {
    const neighbors = samples
      .slice(Math.max(0, i - 2), Math.min(samples.length, i + 3))
      .map((s) => s.hp)
      .sort((a, b) => a - b);
    const median = neighbors[Math.floor(neighbors.length / 2)] ?? 0;
    if (median <= 0) continue;
    const ratio = samples[i].hp / median;
    if (ratio < TOWER_WALL.softFloorHpRatio) {
      out.push({
        rule: 'towerSoftFloor',
        floor: samples[i].floor,
        detail: `第 ${samples[i].floor} 层合计 HP=${samples[i].hp}，`
          + `仅为邻域中位 ${median} 的 ${(ratio * 100).toFixed(0)}%`
          + `（下限 ${TOWER_WALL.softFloorHpRatio * 100}%）`,
      });
    }
  }
  return out;
}

export function auditTowerDifficulty(): TowerDifficultyReport {
  const lv1 = checkLv1Wall();
  const chapter = checkChapterWall();
  return {
    violations: [...lv1.violations, ...chapter.violations, ...checkSoftFloors()],
    lv1: { mid: lv1.mid, high: lv1.high },
    chapterMidDepth: chapter.depth,
  };
}

export function formatTowerDifficultyReport(report: TowerDifficultyReport): string {
  const lines = [
    `通天塔难度审计：Lv1 mid=${report.lv1.mid} high=${report.lv1.high}`,
    `章节中手深度：${Object.entries(report.chapterMidDepth).map(([c, d]) => `ch${c}=${d}`).join(' ')}`,
  ];
  if (report.violations.length === 0) {
    lines.push('违规：无');
  } else {
    lines.push(`违规 ${report.violations.length} 条：`);
    for (const v of report.violations) lines.push(`  [${v.rule}] ${v.detail}`);
  }
  return lines.join('\n');
}
