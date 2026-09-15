/**
 * 难度门禁（v0.7 新测试体系的核心，替代被整体废弃的旧配平测试）
 *
 * ── 为什么旧体系必须废掉 ──
 *
 * 旧的 57 个测试文件里，凡是与难度相关的断言都只有一个方向：**上限**。
 * 「达标队必须能通关」「回合数不能超过 max」「Boss 血量不能超过预算」。
 * 这套尺子有个致命的结构性缺陷——数值往「更简单」的方向漂多远，它都是全绿的。
 * 于是主线一路软到玩家五色一队无脑推到第八章，而 CI 从头到尾没有报过一次警。
 * `STAGE_TTK.min` 字段甚至从定义之日起就没有被任何一条断言读过。
 *
 * 这个文件补上缺失的另一半：每一条断言都在问「是不是太简单了」。
 * 护栏的定义与阈值在 balance/difficultyBudget.ts，此处只负责把它们钉进 CI。
 *
 * ── v1.0 补的那条方向相反的护栏 ──
 *
 * 上面这段说的仍然对，但它自己也踩了同一个坑：所有断言都朝一个方向，
 * 于是「太难」同样测不出来。抖音首发日 4476 个新号里 94.5% 一关没过，
 * 而当天这份门禁是**全绿**的——因为没有任何一条断言在问「新玩家过得去吗」。
 * ①c 早期下限（`earlyFloor`）就是那条反方向的护栏，它和其余几条一起把难度夹成一个区间。
 *
 * ── 失败了该怎么办 ──
 *
 * 报错信息里带完整审计报告（哪一关、什么口径、差多少）。修的方向是**改数值或改机制**，
 * 不是回来调松这里的阈值。真要动阈值，先去 difficultyBudget.ts 改并写清理由——
 * 那份文件是难度契约的真源，这里只是它的执行者。
 */
import { describe, expect, it } from 'vitest';
import { auditDifficulty, formatDifficultyReport } from '@/formulas/difficultyAudit';
import {
  EARLY_FLOOR,
  MECHANIC_DENSITY,
  MINDLESS_MAX_DEPTH,
  TEAM_SWAP_EDGE_FROM_CHAPTER,
  TEAM_SWAP_EDGE_MIN,
  type PlayerProfile,
} from '@/balance/difficultyBudget';

const report = auditDifficulty();
const summary = (): string => `\n${formatDifficultyReport(report)}\n`;

describe('难度门禁', () => {
  it('全部护栏满足', () => {
    expect(report.violations, summary()).toEqual([]);
  });

  it('① 中手达标队不会秒推，也不会被磨死', () => {
    const ttk = report.violations.filter((v) => v.rule === 'ttkFloor' || v.rule === 'ttkCeiling');
    expect(ttk, summary()).toEqual([]);
  });

  it('①c 开局关卡真新手过得去，且不是磨赢也不是惨胜', () => {
    const early = report.violations.filter((v) => v.rule === 'earlyFloor');
    expect(early, summary()).toEqual([]);
  });

  it('①c 逐关下限表与关卡表同步，画像逐段放宽而非收紧', () => {
    const order: readonly PlayerProfile[] = ['newbie', 'rookie', 'mindless', 'low', 'mid', 'high'];
    const byId = new Map(report.audits.map((a) => [a.stageId, a]));
    let prev = -1;
    for (const spec of EARLY_FLOOR) {
      expect(byId.get(spec.stageId), `EARLY_FLOOR 里的 ${spec.stageId} 不在 STAGES 中`).toBeTruthy();
      /*
       * 要求的画像只能越来越宽松（newbie → rookie → mindless），不能回头。
       * 若哪天有人把某关的要求从 mindless 改回 newbie，等于要求玩家在第 5 关
       * 反而比第 1 关更菜也能过；那不是护栏，是把整章拍平。
       */
      const rank = order.indexOf(spec.profile);
      expect(rank, `${spec.stageId} 用了未知画像 ${spec.profile}`).toBeGreaterThanOrEqual(0);
      expect(rank, `${spec.stageId} 的下限画像比前一关更严，逐段放宽被打破`)
        .toBeGreaterThanOrEqual(prev);
      prev = rank;
    }
  });

  it('② 无脑基线撞得到墙', () => {
    expect(report.mindlessDepth, summary()).toBeLessThanOrEqual(MINDLESS_MAX_DEPTH);
    const wall = report.violations.filter(
      (v) => v.rule === 'mindlessWall' || v.rule === 'mindlessDepth',
    );
    expect(wall, summary()).toEqual([]);
  });

  it('③ 每个章末 Boss 换队都有实质收益', () => {
    const swap = report.violations.filter((v) => v.rule === 'teamSwapEdge');
    expect(swap, summary()).toEqual([]);
    for (const [chapter, edge] of Object.entries(report.swapEdgeByChapter)) {
      if (Number(chapter) < TEAM_SWAP_EDGE_FROM_CHAPTER) continue;
      expect(edge, `第 ${chapter} 章换队收益不足${summary()}`).toBeGreaterThanOrEqual(
        TEAM_SWAP_EDGE_MIN,
      );
    }
  });

  it('④ 机制密度达标，纯数值关不成片', () => {
    const density = report.violations.filter(
      (v) => v.rule === 'mechanicDensity' || v.rule === 'plainStages',
    );
    expect(density, summary()).toEqual([]);
    expect(report.plainStageCount, summary()).toBeLessThanOrEqual(MECHANIC_DENSITY.maxPlainStages);
  });
});
