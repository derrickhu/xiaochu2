/**
 * 关卡平衡回归测试：用 simulation 模拟器断言「平滑养成」数值体系的设计意图。
 *
 * 这些断言是关卡设计的"契约"：改 balance/(combat|pets|enemies|stages|growth|powerBudget)
 * 后若 diff，说明难度曲线偏离了预期，需要确认是有意调整还是引入了失衡。
 *
 * 设计意图（平滑养成，见 balance/powerBudget.ts）：
 *  - 1-1~1-4 教学段：默认队中手可稳过并拿不错星级，低手也能通关
 *  - 铺垫关（1~3 章）：初始队也会明显掉血，但不应形成「不升级过不去」的劝退墙
 *  - 1-5 Boss：低手也能通关（但拿不到三星），中手 8~12 回合——不再是 7 倍血量断崖
 *  - 跨章：达标（预算锚点）队伍可通关本章；欠养成的标准队在新章 Boss 处卡住
 *  - Boss 波次受 powerBudget 护栏约束：首波 ≤ 前关最大单波 2.5 倍、总量 ≈ 前关 2~4.2 倍
 *  - 操作熟练度(低/中/高手)与队伍质量都应显著影响结果
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_TEAM, INITIAL_PET_LEVEL, INITIAL_PET_STAR, PET_MAP } from '@/balance/pets';
import { STAGES, stageWaveCount } from '@/balance/stages';
import { resolveEncounter } from '@/balance/enemies';
import { CHAPTER_BUDGET, getChapterBudget } from '@/balance/growth';
import { BUDGET_GUARDRAIL, CHAPTER_POWER, stageTtk } from '@/balance/powerBudget';
import { enemyStats, petExpToNext, petHp as petHpOf } from '../growth';
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

describe('铺垫关攻压：初始队会受伤（1~3 章）', () => {
  it('L1/1★ 默认队中手打 1~3 章铺垫关：敌人有效出刀且能通关', () => {
    for (const ch of [1, 2, 3]) {
      for (const s of STAGES.filter((x) => x.chapter === ch && !x.isBoss)) {
        const r = sim(TEAMS.default, s.id, COMBO_MODELS.mid);
        expect(r.win, s.id).toBe(true);
        expect(r.maxEnemyHit, s.id).toBeGreaterThan(50);
        if (ch >= 2) {
          expect(r.tookDamage, s.id).toBe(true);
        }
        if (ch === 3) {
          // v0.4 敌人攻压曲线放缓后阈值放宽至 96%（仍要求可感知掉血）
          expect(r.heroHpRemaining / r.heroMaxHp, s.id).toBeLessThan(0.96);
        }
      }
    }
  });
});

describe('1-5 Boss：平滑养成（低手可过不三星，中手节奏适中）', () => {
  it('低手默认队可通关 1-5，但拿不到三星', () => {
    const r = sim(TEAMS.default, 'stage_1_5', COMBO_MODELS.low);
    expect(r.win).toBe(true);
    expect(r.stars).toBeLessThan(3);
  });

  it('中手默认队约 8~12 回合通 1-5（允许 ±2 回合契约容差）', () => {
    const r = sim(TEAMS.default, 'stage_1_5', COMBO_MODELS.mid);
    expect(r.win).toBe(true);
    expect(r.turnsUsed).toBeGreaterThanOrEqual(6);
    expect(r.turnsUsed).toBeLessThanOrEqual(14);
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

const ALL_CHAPTERS = Object.keys(CHAPTER_POWER).map(Number).sort((a, b) => a - b);

describe('功率预算：达标队伍可通关本章（1~8 章全量）', () => {
  for (const ch of ALL_CHAPTERS) {
    it(`第 ${ch} 章：进章预算队（L${CHAPTER_BUDGET[ch].enterLevel}/${CHAPTER_BUDGET[ch].enterStar}★）中手可通关全部关卡`, () => {
      const team = teamAtBudget(ch);
      for (const id of stagesOf(ch)) {
        expect(simulateBattle(team, id, COMBO_MODELS.mid).win, id).toBe(true);
      }
    });
  }
});

describe('功率预算：欠养成会卡在新章（不能跳章碾压）', () => {
  it('停留在第 1 章预算（L1/1★）的默认队打不穿第 3 章 Boss', () => {
    const under = buildTeam(TEAMS.default, CHAPTER_BUDGET[1].enterLevel, CHAPTER_BUDGET[1].enterStar);
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

// ════════════════════════════════════════════════════════════════
// 功率预算护栏（powerBudget.ts BUDGET_GUARDRAIL）：波次平滑 + 预算符合性 + 跨章单调
// ════════════════════════════════════════════════════════════════

/** 关卡各波实际 HP（口径同 BattleController：enemyStats 缩放） */
function stageWaveHps(stageId: string): number[] {
  const s = STAGES.find((x) => x.id === stageId)!;
  return s.encounters.map((e) => enemyStats(resolveEncounter(e).def, s.chapter, s.difficulty).hp);
}

const stageTotalHp = (stageId: string): number =>
  stageWaveHps(stageId).reduce((a, b) => a + b, 0);

describe('预算护栏：Boss 波次平滑（消灭 HP 断崖）', () => {
  const bosses = STAGES.filter((s) => s.isBoss);

  it('每章 Boss 首波 ≤ 前一关最大单波 × 护栏倍率', () => {
    for (const boss of bosses) {
      const prev = STAGES.find((s) => s.chapter === boss.chapter && s.index === boss.index - 1)!;
      const firstWave = stageWaveHps(boss.id)[0];
      const prevMaxWave = Math.max(...stageWaveHps(prev.id));
      expect(firstWave, `${boss.id} 首波 ${firstWave} vs 前关最大波 ${prevMaxWave}`)
        .toBeLessThanOrEqual(prevMaxWave * BUDGET_GUARDRAIL.bossFirstWaveMaxRatio);
    }
  });

  it('每章 Boss 总量 ≈ 前一关总量 × 目标倍率（±预算容差）', () => {
    const g = BUDGET_GUARDRAIL;
    for (const boss of bosses) {
      const prev = STAGES.find((s) => s.chapter === boss.chapter && s.index === boss.index - 1)!;
      const total = stageTotalHp(boss.id);
      const prevTotal = stageTotalHp(prev.id);
      const target = prevTotal * g.bossTotalTargetRatio;
      expect(total, `${boss.id} 总量 ${total} vs 目标 ${Math.round(target)}`)
        .toBeGreaterThanOrEqual(target * (1 - g.budgetTolerance));
      expect(total, `${boss.id} 总量 ${total} vs 目标 ${Math.round(target)}`)
        .toBeLessThanOrEqual(target * (1 + g.budgetTolerance));
    }
  });

  it('1-5 具体锚点：总量约 5000（旧版 12078 断崖已消除）', () => {
    const total = stageTotalHp('stage_1_5');
    expect(total).toBeGreaterThanOrEqual(4200);
    expect(total).toBeLessThanOrEqual(5800);
  });
});

describe('预算护栏：跨章单调性（1~8 章）', () => {
  it('章 Boss 总 HP 随章节严格递增', () => {
    const totals = ALL_CHAPTERS.map((ch) => {
      const boss = STAGES.find((s) => s.chapter === ch && s.isBoss)!;
      return stageTotalHp(boss.id);
    });
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i], `第 ${ALL_CHAPTERS[i]} 章 Boss`).toBeGreaterThan(totals[i - 1]);
    }
  });

  it('章敌方总 HP（全关卡合计）随章节严格递增', () => {
    const totals = ALL_CHAPTERS.map((ch) =>
      STAGES.filter((s) => s.chapter === ch).reduce((sum, s) => sum + stageTotalHp(s.id), 0));
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i], `第 ${ALL_CHAPTERS[i]} 章`).toBeGreaterThan(totals[i - 1]);
    }
  });
});

describe('预算符合性：达标队伍 TTK 落在目标带内（中手口径）', () => {
  for (const ch of ALL_CHAPTERS) {
    it(`第 ${ch} 章：各关用时 ≤ 类型 TTK 上限，Boss 至少 2 回合`, () => {
      const team = teamAtBudget(ch);
      for (const s of STAGES.filter((x) => x.chapter === ch)) {
        const r = simulateBattle(team, s.id, COMBO_MODELS.mid);
        const band = stageTtk(s.type);
        expect(r.win, s.id).toBe(true);
        expect(r.turnsUsed, `${s.id}(${s.type})`).toBeLessThanOrEqual(band.max);
        if (s.isBoss) expect(r.turnsUsed, s.id).toBeGreaterThanOrEqual(2);
      }
    });
  }
});

describe('预算符合性：多波关波次数量与分配可用', () => {
  it('所有 Boss 关均为 3 波（prep + tier1 + tier2）', () => {
    for (const s of STAGES.filter((x) => x.isBoss)) {
      expect(stageWaveCount(s)).toBe(3);
    }
  });
});

// ════════════════════════════════════════════════════════════════
// v0.4 真实首通路径契约（玩家实测反馈修复：默认队按产出节奏推进应有真实压力）
//
// 背景：v0.3 锚点（8 章 L82/5★）远超首通产出（约 L44），契约拿爆发队在虚高锚点验关，
// 真实玩家 L44/2★ 却能无伤平推 4~8 章。v0.4 锚点 = 首通产出，用「默认 5R + 各章 Boss
// 掉落宠」这条真实阵容路径直接验：Boss 有压力、欠养成有墙、铺垫关不劝退。
// ════════════════════════════════════════════════════════════════

describe('v0.4 首通路径：Boss 有真实压力，碾压不复存在', () => {
  /** 默认 5R 队 + 已通章节的 Boss 掉落宠按同元素换入（真实白嫖阵容） */
  const BOSS_DROPS: Record<number, string> = {
    1: 'pet_017', 3: 'pet_028', 5: 'pet_011', 6: 'pet_010',
  };
  function firstRunTeamIds(chapter: number): string[] {
    const ids = [...TEAMS.default];
    for (let ch = 1; ch < chapter; ch++) {
      const dropId = BOSS_DROPS[ch];
      if (!dropId) continue;
      const drop = PET_MAP.get(dropId)!;
      const idx = ids.findIndex((id) => PET_MAP.get(id)!.element === drop.element);
      if (idx >= 0) ids[idx] = dropId;
    }
    return ids;
  }
  const firstRunTeam = (ch: number) => {
    const b = getChapterBudget(ch);
    return buildTeam(firstRunTeamIds(ch), b.enterLevel, b.enterStar);
  };

  it('锚点首通队中手可通 4~8 章 Boss，但用时 ≥ 8 回合（不是秒推）', () => {
    for (const ch of [4, 5, 6, 7, 8]) {
      const boss = STAGES.find((s) => s.chapter === ch && s.isBoss)!;
      const r = simulateBattle(firstRunTeam(ch), boss.id, COMBO_MODELS.mid);
      expect(r.win, boss.id).toBe(true);
      expect(r.turnsUsed, `${boss.id} 应有真实战斗时长`).toBeGreaterThanOrEqual(8);
    }
  });

  it('升星门槛章（4/8 章）：欠一章锚点的队伍被明显拦截', () => {
    // 4 章（2★→3★）与 8 章（3★→4★）为升星门槛章：
    // - 终章 8：欠养成中手直接打不过（硬墙）；
    // - 4 章：中手要么打不过、要么被磨到 TTK ≥ 12 回合（软墙），且低手必败。
    // 5~7 章锚点只差 4~5 级（平滑推进段），不设墙，由 TTK 变长体现压力。
    const underAt = (ch: number) => {
      const prev = getChapterBudget(ch - 1);
      return buildTeam(firstRunTeamIds(ch), prev.enterLevel, prev.enterStar);
    };
    const bossOf = (ch: number) => STAGES.find((s) => s.chapter === ch && s.isBoss)!;

    const r8 = simulateBattle(underAt(8), bossOf(8).id, COMBO_MODELS.mid);
    expect(r8.win, '8 章 Boss 欠一章养成不应能过').toBe(false);

    const r4mid = simulateBattle(underAt(4), bossOf(4).id, COMBO_MODELS.mid);
    if (r4mid.win) {
      expect(r4mid.turnsUsed, '4 章 Boss 欠养成即便能过也应被明显磨长').toBeGreaterThanOrEqual(12);
    }
    const r4low = simulateBattle(underAt(4), bossOf(4).id, COMBO_MODELS.low);
    expect(r4low.win, '4 章 Boss 欠养成低手必败').toBe(false);
  });

  it('操作水平有意义：首通队低手在 3/4/7 章 Boss 打不过（需练级或提升操作）', () => {
    for (const ch of [3, 4, 7]) {
      const boss = STAGES.find((s) => s.chapter === ch && s.isBoss)!;
      const r = simulateBattle(firstRunTeam(ch), boss.id, COMBO_MODELS.low);
      expect(r.win, boss.id).toBe(false);
    }
  });

  it('锚点首通队中手可通本章全部铺垫关（墙只设在 Boss）', () => {
    for (const ch of [4, 5, 6, 7, 8]) {
      const team = firstRunTeam(ch);
      for (const s of STAGES.filter((x) => x.chapter === ch && !x.isBoss)) {
        expect(simulateBattle(team, s.id, COMBO_MODELS.mid).win, s.id).toBe(true);
      }
    }
  });
});

describe('v0.4 面板膨胀护栏：2★ 上限不破万血', () => {
  it('任意宠 2★ 满级（L60）单体 HP < 6000（玩家反馈的 1 万血 2★ 已消除）', () => {
    // 上限由 UR 坦克顶格（statMult 1.75 × tank 高 HP 成长），当前实测 ~5.5k
    for (const [, pet] of PET_MAP) {
      const hp = petHpOf(pet, 60, 2);
      expect(hp, `${pet.id} 2★L60 HP=${hp}`).toBeLessThan(6000);
    }
  });

  it('5★ 满级（L99）单体 HP < 6 万（长线上限可控）', () => {
    for (const [, pet] of PET_MAP) {
      const hp = petHpOf(pet, 99, 5);
      expect(hp, `${pet.id} 5★L99 HP=${hp}`).toBeLessThan(60000);
    }
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
