/**
 * 关卡平衡回归测试：用 simulation 模拟器断言第一章"挑战版(v0.3)"的设计意图。
 *
 * 这些断言是关卡设计的"契约"：改 balance/(combat|pets|enemies|stages|growth) 后若 diff，
 * 说明难度曲线偏离了预期，需要确认是有意调整还是引入了失衡。
 *
 * 设计意图：
 *  - 1-1~1-4 教学段：默认队中手可稳过并拿不错星级，低手也能通关
 *  - 1-5+ 技能怪段：乱带/弱队会卡关或被拖死，带对解法(克制/爆发/护盾/续航)才顺
 *  - Boss 1-8：综合考，弱队几乎打不过，强队也难满星
 *  - 操作熟练度(低/中/高手)与队伍质量都应显著影响结果
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_TEAM, INITIAL_PET_LEVEL, INITIAL_PET_STAR, PET_MAP } from '@/balance/pets';
import { STAGES } from '@/balance/stages';
import { CHAPTER_BUDGET, getChapterBudget } from '@/balance/growth';
import { petExpToNext } from '../growth';
import { stageDrops } from '../economyOutput';
import {
  COMBO_MODELS, buildTeam, simulateBattle, simulateMatrix, type SimResult,
} from '../simulation';

const L = INITIAL_PET_LEVEL;
const S = INITIAL_PET_STAR;
const ALL_STAGES = STAGES.map((s) => s.id);
/**
 * 第一章关卡：这些「挑战版 v0.3」契约针对入门期（初始 L1/1★）队伍设计。
 * 第二、三章为后期内容，按更高养成水平（升级/升星后）调优，不纳入入门期可达性断言。
 */
const CH1_STAGES = STAGES.filter((s) => s.chapter === 1).map((s) => s.id);

/**
 * 典型队伍原型（阶段九统一生物体系 30 只花名册）。
 * 用于验证「搭配差异」：高稀有输出 vs 低稀有坦奶辅。
 */
const TEAMS = {
  default: [...DEFAULT_TEAM],
  /** 爆发队：高稀有多属性输出，DPS-check 关的解法 */
  burst: ['pet_002', 'pet_016', 'pet_006', 'pet_026', 'pet_008'],
  /** 弱队：双坦 + 奶 + 双辅助，无直伤爆发 */
  weak: ['pet_019', 'pet_027', 'pet_015', 'pet_005', 'pet_001'],
  /** 含土克制的队（1-6 自疗水怪解法：土珠克水） */
  earthCounter: ['pet_009', 'pet_028', 'pet_008', 'pet_002', 'pet_016'],
} as const;

function sim(teamIds: readonly string[], stageId: string, model = COMBO_MODELS.mid): SimResult {
  return simulateBattle(buildTeam(teamIds, L, S), stageId, model);
}

describe('模拟器自洽性', () => {
  it('每关三模型都能跑出结果且不抛错', () => {
    const rows = simulateMatrix(buildTeam(TEAMS.default, L, S), ALL_STAGES);
    expect(rows).toHaveLength(STAGES.length);
    for (const r of rows) {
      expect(r.low.turnsUsed).toBeGreaterThan(0);
      expect(r.high.turnsUsed).toBeGreaterThan(0);
    }
  });

  it('操作越熟练击杀越快：默认队 high 用时 <= low（第一章）', () => {
    for (const stageId of CH1_STAGES) {
      const low = sim(TEAMS.default, stageId, COMBO_MODELS.low);
      const high = sim(TEAMS.default, stageId, COMBO_MODELS.high);
      expect(high.turnsUsed).toBeLessThanOrEqual(low.turnsUsed);
    }
  });
});

describe('1-1~1-4 教学段：可达性', () => {
  it('默认队中手稳过前四关', () => {
    for (const id of ['stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4']) {
      expect(sim(TEAMS.default, id).win).toBe(true);
    }
  });

  it('默认队低手也能通关前四关（不强求星级）', () => {
    for (const id of ['stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4']) {
      expect(sim(TEAMS.default, id, COMBO_MODELS.low).win).toBe(true);
    }
  });

  it('1-1 高手快攻（教学关手感）', () => {
    const r = sim(TEAMS.default, 'stage_1_1', COMBO_MODELS.high);
    expect(r.win).toBe(true);
    expect(r.turnsUsed).toBeLessThanOrEqual(2);
    expect(r.stars).toBe(3);
  });
});

describe('新手 5R 阵容：教学段可达性', () => {
  it('初始赠送阵容恰为 5 只 R（rarity 1）宠', () => {
    expect(DEFAULT_TEAM).toHaveLength(5);
    for (const id of DEFAULT_TEAM) {
      expect(PET_MAP.get(id)?.rarity, id).toBe(1);
    }
  });

  it('5 只 R 初始队（L1/1★）中手 / 低手均可稳过 1-1~1-4 教学段', () => {
    for (const id of ['stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4']) {
      expect(sim(TEAMS.default, id, COMBO_MODELS.mid).win, `${id} mid`).toBe(true);
      expect(sim(TEAMS.default, id, COMBO_MODELS.low).win, `${id} low`).toBe(true);
    }
  });
});

describe('1-5 Boss：弱队受罚 / 强队顺畅', () => {
  it('低手默认队打不过 1-5 收录 Boss', () => {
    expect(sim(TEAMS.default, 'stage_1_5', COMBO_MODELS.low).win).toBe(false);
  });

  it('爆发队中手可零失误清完第一章', () => {
    for (const id of CH1_STAGES) {
      expect(sim(TEAMS.burst, id).win).toBe(true);
    }
  });

  it('爆发队 > 弱队：1-5 Boss 星级更高、用时更短（中手）', () => {
    const burst = sim(TEAMS.burst, 'stage_1_5');
    const weak = sim(TEAMS.weak, 'stage_1_5');
    expect(burst.win).toBe(true);
    expect(burst.stars).toBeGreaterThan(weak.stars);
    expect(burst.turnsUsed).toBeLessThan(weak.turnsUsed);
  });

  it('1-5 多波 Boss：爆发队高手可冲三星', () => {
    expect(sim(TEAMS.burst, 'stage_1_5', COMBO_MODELS.high).stars).toBe(3);
  });
});

describe('换对队才能过：自疗挑战', () => {
  it('爆发队中手可过 6-1 自疗关', () => {
    expect(sim(TEAMS.burst, 'stage_6_1', COMBO_MODELS.mid).win).toBe(true);
  });

  it('低稀有弱队低手难过 6-1 自疗关', () => {
    expect(sim(TEAMS.weak, 'stage_6_1', COMBO_MODELS.low).win).toBe(false);
  });
});

describe('Boss 是硬墙', () => {
  it('弱队中手打 1-5 明显比爆发队吃力（用时更长）', () => {
    const weak = sim(TEAMS.weak, 'stage_1_5');
    const burst = sim(TEAMS.burst, 'stage_1_5');
    expect(burst.win).toBe(true);
    expect(weak.turnsUsed).toBeGreaterThan(burst.turnsUsed);
  });
});

// ════════════════════════════════════════════════════════════════
// 阶段八：循序渐进养成契约（功率预算 CHAPTER_BUDGET 锚点）
// ════════════════════════════════════════════════════════════════

const stagesOf = (ch: number): string[] =>
  STAGES.filter((s) => s.chapter === ch).map((s) => s.id);

function teamAtBudget(ch: number) {
  const b = getChapterBudget(ch);
  return buildTeam(TEAMS.burst, b.enterLevel, b.enterStar);
}

describe('功率预算：达标队伍可通关本章', () => {
  for (const ch of [1, 2, 3]) {
    it(`第 ${ch} 章：进章预算队（L${CHAPTER_BUDGET[ch].enterLevel}/${CHAPTER_BUDGET[ch].enterStar}★）中手可通关全部关卡`, () => {
      const team = teamAtBudget(ch);
      for (const id of stagesOf(ch)) {
        expect(simulateBattle(team, id, COMBO_MODELS.mid).win).toBe(true);
      }
    });
  }
});

describe('功率预算：欠养成会卡在新章（不能跳章碾压）', () => {
  it('停留在第 1 章预算（L1/1★）的队伍打不穿第 3 章 Boss', () => {
    const under = buildTeam(TEAMS.burst, CHAPTER_BUDGET[1].enterLevel, CHAPTER_BUDGET[1].enterStar);
    expect(simulateBattle(under, 'stage_3_6', COMBO_MODELS.mid).win).toBe(false);
  });

  it('只到第 2 章预算（L12/2★）的主队低手打不穿第 3 章 Boss，需继续养成', () => {
    const ch2Budget = buildTeam(TEAMS.default, CHAPTER_BUDGET[2].enterLevel, CHAPTER_BUDGET[2].enterStar);
    expect(simulateBattle(ch2Budget, 'stage_3_6', COMBO_MODELS.low).win).toBe(false);
  });

  it('初始 L1/1★ 默认队无法全清第 3 章（终章 Boss 卡关）', () => {
    expect(sim(TEAMS.default, 'stage_3_6', COMBO_MODELS.mid).win).toBe(false);
  });
});

describe('经验产出与升级节奏同量级（消除数量级脱节）', () => {
  /** 单宠从 1 升到 N 级累计经验 */
  const cumExp = (toLevel: number): number => {
    let s = 0;
    for (let l = 1; l < toLevel; l++) s += petExpToNext(l);
    return s;
  };
  /** 某章一轮首通（按 2★）经验产出合计 */
  const chapterFirstClearExp = (ch: number): number =>
    STAGES.filter((s) => s.chapter === ch)
      .reduce((sum, s) => sum + stageDrops(s.dropTableId, s.chapter, 2, s.type).exp, 0);

  it('第 1 章首通产出 ≥ 单宠升到 L10 所需（不再脱节）', () => {
    expect(chapterFirstClearExp(1)).toBeGreaterThanOrEqual(cumExp(10));
  });

  it('两轮第 1 章产出足以把 5 宠主队推进到通关预算 L12', () => {
    const need = 5 * cumExp(CHAPTER_BUDGET[1].clearLevel);
    expect(chapterFirstClearExp(1) * 2).toBeGreaterThanOrEqual(need);
  });

  it('各章首通产出随章节递增（产出曲线单调）', () => {
    expect(chapterFirstClearExp(2)).toBeGreaterThan(chapterFirstClearExp(1));
    expect(chapterFirstClearExp(3)).toBeGreaterThan(chapterFirstClearExp(2));
  });
});
