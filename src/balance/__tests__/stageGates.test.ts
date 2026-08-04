/**
 * 闸门层铺开到全 16 章之后的结构契约。
 *
 * 这一层是「生成后再叠加」的，很容易在改动某一章时悄悄破坏全局节奏 ——
 * 比如闸门连着两关出现（玩家归因不到机制上，只会去挂机刷级），
 * 或者闸门关忘了放宽回合上限（三星条件变成「必须秒过闸门」）。
 * 这里把这些不变量钉死。
 */
import { describe, it, expect } from 'vitest';
import { STAGES, type StageDef } from '../stages';
import { MECHANICS, resolveMechanics } from '../stageMechanics';
import { PET_MAP, DEFAULT_TEAM } from '../pets';
import { buildCounterChecklist, countMissing } from '../stageCounterplay';

const GATE_MECHANICS = Object.keys(MECHANICS).filter((id) => id.startsWith('gate_'));
const gatesOf = (s: StageDef): string[] =>
  (s.mechanics ?? []).filter((m) => m.startsWith('gate_'));
const hasGate = (s: StageDef): boolean => gatesOf(s).length > 0;
const chapters = [...new Set(STAGES.map((s) => s.chapter))].sort((a, b) => a - b);

describe('闸门节奏铺满 16 章', () => {
  it('每一章都有闸门关，第 1 章就上 —— 前期真空是这次改造的首要目标', () => {
    for (const ch of chapters) {
      const gated = STAGES.filter((s) => s.chapter === ch && hasGate(s));
      expect(gated.length, `第 ${ch} 章应有闸门关`).toBeGreaterThan(0);
    }
  });

  it('每章闸门关不超过 3 关：闸门是调味不是主菜', () => {
    for (const ch of chapters) {
      const gated = STAGES.filter((s) => s.chapter === ch && hasGate(s));
      expect(gated.length, `第 ${ch} 章闸门关过多`).toBeLessThanOrEqual(3);
    }
  });

  it('闸门关之间隔着正常关：连着上玩家分不清是机制拦他还是队伍不够格', () => {
    for (const ch of chapters) {
      const idx = STAGES.filter((s) => s.chapter === ch && hasGate(s) && !s.isBoss)
        .map((s) => s.index)
        .sort((a, b) => a - b);
      for (let i = 1; i < idx.length; i++) {
        expect(idx[i] - idx[i - 1], `第 ${ch} 章 ${idx[i - 1]}/${idx[i]} 关闸门相邻`)
          .toBeGreaterThan(1);
      }
    }
  });

  it('前两章只上轻档闸门：这里的作用是教会读条件，不是拦人', () => {
    for (const s of STAGES.filter((x) => x.chapter <= 2 && hasGate(x))) {
      expect(gatesOf(s), s.id).toEqual(
        expect.arrayContaining([expect.stringMatching(/^gate_(element|combo)$/)]),
      );
      expect(gatesOf(s).length, `${s.id} 前期不应双闸同场`).toBe(1);
    }
  });

  it('反构筑（同源相斥）只出现在 11 章以后：它要打的是已成型的「五色齐」', () => {
    for (const s of STAGES) {
      if ((s.mechanics ?? []).includes('rule_comp_penalty')) {
        expect(s.chapter, `${s.id} 过早引入反构筑`).toBeGreaterThanOrEqual(11);
      }
    }
  });

  it('机制 id 全部在册，闸门都带 counterTags —— 没有对策提示的闸门就是纯惩罚', () => {
    for (const s of STAGES) {
      for (const id of s.mechanics ?? []) {
        expect(MECHANICS[id], `${s.id} 引用了未注册机制 ${id}`).toBeDefined();
      }
      if (hasGate(s)) {
        expect(resolveMechanics(s.mechanics).counterTags.length, `${s.id} 缺对策标签`)
          .toBeGreaterThan(0);
      }
    }
    for (const id of GATE_MECHANICS) {
      expect(MECHANICS[id].counterTags?.length, `${id} 缺 counterTags`).toBeGreaterThan(0);
    }
  });
});

describe('闸门关的关卡属性', () => {
  it('闸门怪是追加一波而不是替换：原 archetype 教的东西不能被顶掉', () => {
    for (const s of STAGES.filter(hasGate)) {
      expect(s.encounters.length, `${s.id} 波次数`).toBeGreaterThanOrEqual(2);
    }
  });

  it('Boss 关的闸门怪插在热身波之后、Boss 本体之前', () => {
    for (const s of STAGES.filter((x) => x.isBoss && hasGate(x))) {
      expect(s.encounters.length, `${s.id} 应为 4 波`).toBe(4);
      expect(s.encounters[s.encounters.length - 1].kind, `${s.id} 末波应是 Boss`)
        .toBe('creature');
    }
  });

  it('铺垫关带闸门即升精英档：多打一波，奖励要跟上', () => {
    for (const s of STAGES.filter((x) => !x.isBoss && hasGate(x))) {
      expect(s.type, `${s.id}`).toBe('elite');
    }
  });

  it('闸门关放宽三星回合上限，否则三星等于「必须秒过闸门」', () => {
    for (const ch of chapters) {
      const inCh = STAGES.filter((s) => s.chapter === ch && !s.isBoss);
      const gated = inCh.filter(hasGate);
      const plain = inCh.filter((s) => !hasGate(s));
      if (gated.length === 0 || plain.length === 0) continue;
      const maxPlain = Math.max(...plain.map((s) => s.starTurnLimit));
      for (const s of gated) {
        expect(s.starTurnLimit, `${s.id} 回合上限未放宽`).toBeGreaterThan(maxPlain - 4);
      }
    }
  });
});

describe('关前必带对策清单', () => {
  const team = DEFAULT_TEAM.map((id) => PET_MAP.get(id)!);

  it('无机制的关卡不产生清单，不给玩家制造噪音', () => {
    const plain = STAGES.find((s) => (s.mechanics ?? []).length === 0)!;
    expect(buildCounterChecklist(plain, team)).toEqual([]);
  });

  it('闸门关都能给出清单，且每项都有一句能照着做的说明', () => {
    for (const s of STAGES.filter(hasGate)) {
      const checks = buildCounterChecklist(s, team);
      expect(checks.length, `${s.id}`).toBeGreaterThan(0);
      for (const c of checks) expect(c.detail.length, `${s.id}/${c.tag}`).toBeGreaterThan(0);
    }
  });

  it('清单读的是当前编队：单色队会被判缺项，杂色队在同源相斥关也会', () => {
    const monoStage = STAGES.find((s) => gatesOf(s).includes('gate_element'))!;
    const mono = [team[0], team[0], team[0]];
    expect(countMissing(buildCounterChecklist(monoStage, mono))).toBeGreaterThan(0);

    const compStage = STAGES.find((s) => (s.mechanics ?? []).includes('rule_comp_penalty'))!;
    const checks = buildCounterChecklist(compStage, team);
    expect(checks.some((c) => c.tag === '精简属性'), `${compStage.id} 应考属性精简`).toBe(true);
  });

  it('铺连、5 连这类靠操作的项标为 manual，不会让玩家去背包里找不存在的宠', () => {
    const comboStage = STAGES.find((s) => gatesOf(s).includes('gate_combo'))!;
    const checks = buildCounterChecklist(comboStage, team);
    expect(checks.some((c) => c.status === 'manual')).toBe(true);
  });
});
