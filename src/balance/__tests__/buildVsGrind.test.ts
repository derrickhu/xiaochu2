/**
 * 数值契约：构筑收益必须压过肝度
 *
 * 难度门禁管的是「关卡够不够难」，这个文件管的是**玩家为什么不动脑**。
 * 这两件事是分开的：就算每一关都塞满机制，只要「多练十级」的收益仍然大于
 * 「换一套对位阵容」，理性玩家依然会选择挂机刷级，机制做得再花也只是绕路。
 *
 * 旧体系完全没有这一层断言。纵向跨度（等级 × 星级）曾经是 ×100，横向
 * （羁绊 + 队长 + 特攻）不到 ×1.5，比值 66:1——数据摆在那里，但没有任何测试在看它。
 */
import { describe, expect, it } from 'vitest';
import { BUILD_VS_GRIND, SINGLE_MECHANIC_STAGE_SHARE_CAP } from '@/balance/difficultyBudget';
import { PET_MAP, PETS } from '@/balance/pets';
import { STAGES } from '@/balance/stages';
import { resolveEncounter } from '@/balance/enemies';
import { petAtk } from '@/formulas/growth';
import { KILLER_MULT } from '@/balance/petTags';
import { COMBAT } from '@/balance/combat';

describe('纵向 vs 横向', () => {
  it('满养成相对初始的三维跨度落在目标区间', () => {
    // 取一只五星输出宠，比较 1★L1 与 5★L99 的攻击力
    const pet = PETS.find((p) => p.rarity >= 3 && p.role === 'attacker');
    expect(pet, '找不到用于校准的输出宠').toBeDefined();

    const span = petAtk(pet!, 99, 5) / petAtk(pet!, 1, 1);
    const { verticalSpanTarget: target, verticalSpanTolerance: tol } = BUILD_VS_GRIND;
    expect(
      span,
      `纵向跨度 ×${span.toFixed(1)}，目标 ×${target}±${(tol * 100).toFixed(0)}%。`
      + '偏高说明肝度压过了构筑，请调 petRoles.growth / growth.STAR_PROFILES',
    ).toBeGreaterThan(target * (1 - tol));
    expect(span).toBeLessThan(target * (1 + tol));
  });

  it('针对性配队的收益高于超额养成', () => {
    const pet = PETS.find((p) => p.rarity >= 3 && p.role === 'attacker')!;
    // 肝：在同一只宠上多练 10 级
    const grindEdge = petAtk(pet, 60, 4) / petAtk(pet, 50, 4) - 1;
    // 构筑：对位特攻 × 属性克制
    const buildEdge = KILLER_MULT * COMBAT.counterMultiplier - 1;

    expect(
      grindEdge,
      `超额养成 10 级带来 +${(grindEdge * 100).toFixed(0)}% 伤害，超出上限`,
    ).toBeLessThanOrEqual(BUILD_VS_GRIND.tenLevelEdgeMax);
    expect(
      buildEdge,
      `对位构筑仅 +${(buildEdge * 100).toFixed(0)}% 伤害，低于下限`,
    ).toBeGreaterThanOrEqual(BUILD_VS_GRIND.counterPickEdgeMin);
    expect(buildEdge, '构筑收益必须压过肝度，否则玩家理性选择挂机').toBeGreaterThan(grindEdge);
  });
});

describe('机制多样性', () => {
  it('没有任何一个敌方技能霸占关卡', () => {
    const count = new Map<string, number>();
    for (const stage of STAGES) {
      const seen = new Set<string>();
      for (const ref of stage.encounters) {
        for (const id of resolveEncounter(ref).def.skillIds ?? []) seen.add(id);
      }
      for (const id of seen) count.set(id, (count.get(id) ?? 0) + 1);
    }

    const over = [...count.entries()]
      .filter(([, n]) => n / STAGES.length > SINGLE_MECHANIC_STAGE_SHARE_CAP)
      .map(([id, n]) => `${id} 出现在 ${n}/${STAGES.length} 关`);

    // 这条直接针对改造前的具体问题：golemGuard 一招占了 128 关中的 64 关，
    // 「防高型 / 回复型 / 血厚型」在机制上其实是同两个技能换皮。
    expect(
      over,
      `以下技能占用关卡过多，四类 archetype 又在退化成换皮：\n  ${over.join('\n  ')}`,
    ).toEqual([]);
  });

  it('每章 Boss 都配了怪物形态与技能', () => {
    const bosses = STAGES.filter((s) => s.isBoss);
    expect(bosses.length).toBeGreaterThanOrEqual(16);
    for (const stage of bosses) {
      const last = resolveEncounter(stage.encounters[stage.encounters.length - 1]);
      expect(last.def.skillIds ?? [], `${stage.id} 的 Boss 波没有技能`).not.toHaveLength(0);
    }
  });

  it('章节奖励宠都能在宠物表里找到', () => {
    for (const stage of STAGES.filter((s) => s.isBoss)) {
      for (const ref of stage.encounters) {
        if (ref.kind !== 'creature') continue;
        expect(PET_MAP.get(ref.id), `${stage.id} 引用了不存在的生物 ${ref.id}`).toBeDefined();
      }
    }
  });
});
