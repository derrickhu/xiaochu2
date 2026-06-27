import { describe, it, expect } from 'vitest';
import { STAGES, CHAPTERS, stagesOfChapter } from '../stages';
import { DROP_TABLES, getDropTable } from '../drops';
import { STAGE_TYPE_PROFILES, getStageType } from '../stageTypes';
import { MECHANICS, resolveMechanics } from '../stageMechanics';
import { ENEMY_MAP } from '../enemies';
import { CREATURE_MAP } from '../creatures';
import { PET_MAP } from '../pets';
import { stageDrops } from '@/formulas/economyOutput';

describe('关卡数据完整性（单一真源约束）', () => {
  it('每关引用的掉落表 / 遭遇 / 类型 / 机制均存在', () => {
    for (const s of STAGES) {
      expect(getDropTable(s.dropTableId), `掉落表 ${s.dropTableId} @ ${s.id}`).toBeDefined();
      expect(STAGE_TYPE_PROFILES[s.type], `类型 ${s.type} @ ${s.id}`).toBeDefined();
      for (const e of s.encounters) {
        if (e.kind === 'mob') {
          expect(ENEMY_MAP.has(e.id), `杂怪 ${e.id} @ ${s.id}`).toBe(true);
        } else {
          expect(CREATURE_MAP.has(e.id), `生物 ${e.id} @ ${s.id}`).toBe(true);
        }
      }
      for (const m of s.mechanics ?? []) {
        expect(MECHANICS[m], `机制 ${m} @ ${s.id}`).toBeDefined();
      }
    }
  });

  it('掉落表碎片指向真实灵宠', () => {
    for (const table of Object.values(DROP_TABLES)) {
      for (const drop of table.shards) {
        expect(PET_MAP.has(drop.petId), `碎片宠 ${drop.petId} @ ${table.id}`).toBe(true);
      }
    }
  });

  it('章节连续且每章首关 index=1', () => {
    expect(CHAPTERS.length).toBeGreaterThanOrEqual(3);
    for (const ch of CHAPTERS) {
      const list = stagesOfChapter(ch);
      expect(list.length).toBeGreaterThan(0);
      expect(list[0].index).toBe(1);
    }
  });

  it('每章恰有一个 Boss 关', () => {
    for (const ch of CHAPTERS) {
      const bosses = stagesOfChapter(ch).filter((s) => s.isBoss);
      expect(bosses.length, `章节 ${ch} Boss 数`).toBe(1);
    }
  });
});

describe('机制节奏', () => {
  it('每 3~5 关至少首现一个新机制（机制密度）', () => {
    // 统计每关引入的「首次出现」机制
    const seen = new Set<string>();
    let gapSinceNew = 0;
    let maxGap = 0;
    for (const s of STAGES) {
      let introducedNew = false;
      for (const m of s.mechanics ?? []) {
        if (!seen.has(m)) {
          seen.add(m);
          introducedNew = true;
        }
      }
      gapSinceNew = introducedNew ? 0 : gapSinceNew + 1;
      maxGap = Math.max(maxGap, gapSinceNew);
    }
    // 任意连续无新机制的关卡数不超过 5
    expect(maxGap).toBeLessThanOrEqual(5);
  });

  it('resolveMechanics 正确聚合禁心 / 禁属性 / 封印珠', () => {
    const eff = resolveMechanics(['rule_no_heal', 'rule_ban_water', 'orb_sealed']);
    expect(eff.noHeartHeal).toBe(true);
    expect(eff.bannedElements).toContain('water');
    expect(eff.sealOrbs).toBeGreaterThan(0);
    expect(eff.hints.length).toBe(3);
  });

  it('未知机制 id 被忽略', () => {
    const eff = resolveMechanics(['nope']);
    expect(eff.sealOrbs).toBe(0);
    expect(eff.noHeartHeal).toBe(false);
    expect(eff.bannedElements).toHaveLength(0);
  });
});

describe('stageDrops 产出公式', () => {
  it('未知掉落表返回空产出', () => {
    expect(stageDrops(undefined, 1, 3)).toEqual({ exp: 0, shards: [] });
    expect(stageDrops('not_exist', 1, 3)).toEqual({ exp: 0, shards: [] });
  });

  it('星数越高经验越多', () => {
    const s0 = stageDrops('dt_forest_metal', 1, 0).exp;
    const s3 = stageDrops('dt_forest_metal', 1, 3).exp;
    expect(s3).toBeGreaterThan(s0);
  });

  it('章节越深经验越多（同表同星）', () => {
    const c1 = stageDrops('dt_forest_metal', 1, 1).exp;
    const c3 = stageDrops('dt_forest_metal', 3, 1).exp;
    expect(c3).toBeGreaterThan(c1);
  });

  it('常规关不掉碎片', () => {
    const drops = stageDrops('dt_forest_metal', 1, 3, 'normal');
    expect(drops.shards).toEqual([]);
  });

  it('Boss 类型碎片倍率高于精英', () => {
    const elite = stageDrops('dt_forest_elite', 1, 1, 'elite');
    const boss = stageDrops('dt_forest_elite', 1, 1, 'boss');
    const eSum = elite.shards.reduce((a, s) => a + s.count, 0);
    const bSum = boss.shards.reduce((a, s) => a + s.count, 0);
    expect(bSum).toBeGreaterThan(eSum);
  });

  it('关卡类型表覆盖所有引用类型', () => {
    for (const s of STAGES) expect(getStageType(s.type).type).toBe(s.type);
  });
});
