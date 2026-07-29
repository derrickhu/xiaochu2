/**
 * 100 宠金字塔契约：锁住「五行各 20 只，R6 / SR8 / SSR4 / UR2」的对称结构。
 *
 * 这些断言是名录设计的红线——加宠 / 改档位时如果 diff，说明破坏了以下任一意图：
 * - 抽卡池五行对称（否则某属性的克制解法会缺档）
 * - 稀有度金字塔（低档多、高档少；旧版 UR 10 只 > R 9 只是倒金字塔）
 * - 定位配额（每属性都凑得出「输出 + 治疗 + 坦克 + 辅助」的完整队）
 * - 一宠一技（同 element × rarity 内蓝图不重复，换宠必有手感差异）
 */
import { describe, it, expect } from 'vitest';
import { CREATURES } from '@/balance/creatures';
import { MATRIX_ROSTER, matrixSkillId } from '@/balance/creatureRoster';
import { ELEMENTS } from '@/balance/combat';
import { RARITIES } from '@/balance/rarity';
import { SKILL_MAP } from '@/balance/skills';
import type { PetRole } from '@/balance/petRoles';

/** 每属性的目标档位配额 */
const RARITY_QUOTA: Readonly<Record<number, number>> = { 1: 6, 2: 8, 3: 4, 4: 2 };
/** 每属性的目标定位配额 */
const ROLE_QUOTA: Readonly<Record<PetRole, number>> = {
  attacker: 8, support: 5, tank: 4, healer: 3,
};

describe('100 宠金字塔：规模与对称', () => {
  it('总数 100 只，id 从 pet_001 连续到 pet_100', () => {
    expect(CREATURES).toHaveLength(100);
    const ids = CREATURES.map((c) => c.id).sort();
    const expected = Array.from({ length: 100 }, (_, i) => `pet_${String(i + 1).padStart(3, '0')}`);
    expect(ids).toEqual(expected);
  });

  it('五行各 20 只', () => {
    for (const el of ELEMENTS) {
      expect(CREATURES.filter((c) => c.element === el), el).toHaveLength(20);
    }
  });

  it('每属性档位配额 R6 / SR8 / SSR4 / UR2', () => {
    for (const el of ELEMENTS) {
      const byEl = CREATURES.filter((c) => c.element === el);
      for (const r of RARITIES) {
        expect(byEl.filter((c) => c.rarity === r), `${el} @r${r}`).toHaveLength(RARITY_QUOTA[r]);
      }
    }
  });

  it('全局档位为正金字塔：R30 > SR40 ... 高档必少于低档', () => {
    const counts = RARITIES.map((r) => CREATURES.filter((c) => c.rarity === r).length);
    expect(counts).toEqual([30, 40, 20, 10]);
    // SR 是主力池所以最多；SSR / UR 必须逐档收窄
    expect(counts[2]).toBeLessThan(counts[1]);
    expect(counts[3]).toBeLessThan(counts[2]);
    expect(counts[3]).toBeLessThan(counts[0]);
  });

  it('每属性定位配额：输出 8 / 辅助 5 / 坦克 4 / 治疗 3', () => {
    for (const el of ELEMENTS) {
      const byEl = CREATURES.filter((c) => c.element === el);
      for (const [role, quota] of Object.entries(ROLE_QUOTA)) {
        expect(byEl.filter((c) => c.role === role), `${el} ${role}`).toHaveLength(quota);
      }
    }
  });
});

describe('100 宠金字塔：技能唯一性与可解析', () => {
  it('每只宠的 skillId 都能在 SKILLS 里解析到', () => {
    for (const c of CREATURES) {
      expect(SKILL_MAP.get(c.skillId), `${c.id} → ${c.skillId}`).toBeDefined();
    }
  });

  it('一宠一技：100 只宠对应 100 个互不相同的 skillId', () => {
    const ids = CREATURES.map((c) => c.skillId);
    expect(new Set(ids).size, '存在复用技能的宠物').toBe(CREATURES.length);
  });

  it('矩阵技 id 由 element + blueprint + 稀有度派生，且与名录行一一对应', () => {
    for (const row of MATRIX_ROSTER) {
      const creature = CREATURES.find((c) => c.id === row.id)!;
      expect(creature.skillId, row.id).toBe(matrixSkillId(row));
    }
  });

  it('同一 element × rarity 内蓝图不重复（矩阵行）', () => {
    const seen = new Set<string>();
    for (const row of MATRIX_ROSTER) {
      const key = `${row.element}/${row.rarity}/${row.blueprint}`;
      expect(seen.has(key), `蓝图撞车: ${key}（${row.id}）`).toBe(false);
      seen.add(key);
    }
  });
});

describe('100 宠金字塔：高稀有专属修饰', () => {
  it('SSR / UR 全部带 skillTraits，R / SR 一律不带', () => {
    for (const c of CREATURES) {
      if (c.rarity >= 3) expect(c.skillTraits?.length, `${c.id} 缺 skillTraits`).toBeGreaterThan(0);
      else expect(c.skillTraits, `${c.id} 不该有 skillTraits`).toBeUndefined();
    }
  });

  it('UR 的招牌技修饰指向自己的 skillId（不会写错宠）', () => {
    for (const c of CREATURES.filter((x) => x.rarity === 4)) {
      const mod = c.skillTraits!.find((t) => t.type === 'skillModifier');
      expect(mod, `${c.id} 缺 skillModifier`).toBeDefined();
      if (mod?.type === 'skillModifier') expect(mod.skillId, c.id).toBe(c.skillId);
    }
  });
});
