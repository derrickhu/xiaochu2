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
import { DEFAULT_TEAM, DEMO_TEAM_LEVEL, DEMO_TEAM_STAR } from '@/balance/pets';
import { STAGES } from '@/balance/stages';
import {
  COMBO_MODELS, buildTeam, simulateBattle, simulateMatrix, type SimResult,
} from '../simulation';

const L = DEMO_TEAM_LEVEL;
const S = DEMO_TEAM_STAR;
const ALL_STAGES = STAGES.map((s) => s.id);

/** 典型队伍原型（用于验证"搭配"差异） */
const TEAMS = {
  default: [...DEFAULT_TEAM],
  /** 爆发队：三输出 + 增伤 + 全队齐射，DPS-check 关的解法 */
  burst: ['pet_metal_001', 'pet_water_002', 'pet_fire_001', 'pet_fire_002', 'pet_wood_002'],
  /** 弱队：双坦 + 奶 + 双转珠辅助，无直伤爆发 */
  weak: ['pet_earth_001', 'pet_water_001', 'pet_wood_001', 'pet_earth_002', 'pet_metal_002'],
  /** 含土克制的队（1-6 水怪解法） */
  earthCounter: ['pet_earth_001', 'pet_earth_002', 'pet_metal_001', 'pet_fire_001', 'pet_wood_001'],
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

  it('操作越熟练击杀越快：默认队 high 用时 <= low', () => {
    for (const stageId of ALL_STAGES) {
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

  it('1-1 高手秒过且无伤（教学关手感）', () => {
    const r = sim(TEAMS.default, 'stage_1_1', COMBO_MODELS.high);
    expect(r.win).toBe(true);
    expect(r.turnsUsed).toBeLessThanOrEqual(2);
    expect(r.stars).toBe(3);
  });
});

describe('1-5+ 技能怪段：弱队受罚 / 强队顺畅', () => {
  it('低手默认队会在后段关卡翻车（至少 1-8 打不过）', () => {
    expect(sim(TEAMS.default, 'stage_1_8', COMBO_MODELS.low).win).toBe(false);
  });

  it('爆发队中手可零失误清完整章', () => {
    for (const id of ALL_STAGES) {
      expect(sim(TEAMS.burst, id).win).toBe(true);
    }
  });

  it('爆发队 > 弱队：1-8 Boss 星级更高、用时更短（中手）', () => {
    const burst = sim(TEAMS.burst, 'stage_1_8');
    const weak = sim(TEAMS.weak, 'stage_1_8');
    expect(burst.win).toBe(true);
    expect(burst.stars).toBeGreaterThan(weak.stars);
    expect(burst.turnsUsed).toBeLessThan(weak.turnsUsed);
  });

  it('1-5 高防关：爆发队高手可冲三星（爆发破防有效）', () => {
    expect(sim(TEAMS.burst, 'stage_1_5', COMBO_MODELS.high).stars).toBe(3);
  });
});

describe('换对队才能过：1-6 自疗水怪的土克制', () => {
  it('默认队(缺土)低手打不过 1-6，带土克制队则能过', () => {
    expect(sim(TEAMS.default, 'stage_1_6', COMBO_MODELS.low).win).toBe(false);
    expect(sim(TEAMS.earthCounter, 'stage_1_6', COMBO_MODELS.low).win).toBe(true);
  });
});

describe('Boss 是硬墙', () => {
  it('弱队中手即使能过 1-8 也明显吃力（用时远超爆发队）', () => {
    const weak = sim(TEAMS.weak, 'stage_1_8');
    const burst = sim(TEAMS.burst, 'stage_1_8');
    expect(weak.turnsUsed).toBeGreaterThan(burst.turnsUsed + 10);
  });
});
