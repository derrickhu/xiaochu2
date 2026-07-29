/**
 * 杂怪池契约：五行各档齐备、秘境三波不重怪、塔循环周期足够长、引用不悬空。
 *
 * 防的是「配表看起来很满、实际玩起来在打同一只怪」这类问题 ——
 * 它不会报错，只会让秘境与塔的重复度悄悄变高。
 */
import { describe, it, expect } from 'vitest';
import { MOBS, MOB_MAP, resolveEncounter } from '../enemies';
import { ELEMENTS } from '../combat';
import { REALMS, buildRealmStage, REALM_TIERS } from '../secretRealm';
import { TOWER, buildTowerStage } from '../tower';
import { SKILL_MAP } from '../skills';
import { getChapterBudget } from '../growth';
import { simulateBattle } from '@/formulas/simulation';
import { buildTeam, COMBO_MODELS } from '@/formulas/simulationReport';

describe('杂怪池规模与配比', () => {
  it('池子 ≥ 20 只，id 唯一', () => {
    expect(MOBS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(MOBS.map((m) => m.id)).size).toBe(MOBS.length);
  });

  it('五行每属性至少 3 只，且覆盖「杂兵/精英 + 守关」两个身份档', () => {
    for (const el of ELEMENTS) {
      const pool = MOBS.filter((m) => m.element === el);
      expect(pool.length, `${el} 系杂怪数`).toBeGreaterThanOrEqual(3);
      expect(pool.some((m) => m.displayTier === 'mob' || m.displayTier === 'elite'), el).toBe(true);
      expect(pool.some((m) => m.displayTier === 'miniBoss'), `${el} 缺守关档`).toBe(true);
    }
  });

  it('技能引用不悬空（配了不存在的技能会在开打时才炸）', () => {
    for (const mob of MOBS) {
      for (const id of mob.skillIds ?? []) {
        expect(SKILL_MAP.get(id), `${mob.id} → ${id}`).toBeDefined();
      }
      for (const phase of mob.phases ?? []) {
        for (const id of [...(phase.addSkillIds ?? []), phase.onEnterSkillId ?? '']) {
          if (id) expect(SKILL_MAP.get(id), `${mob.id} phase → ${id}`).toBeDefined();
        }
      }
    }
  });

  it('立绘复用只在同属性内借图（跨属性借图会让配色与属性对不上）', () => {
    for (const mob of MOBS) {
      if (!mob.image) continue;
      const borrowed = [...MOB_MAP.values()]
        .find((m) => mob.image!.endsWith(`/${m.id}.png`));
      if (!borrowed) continue;
      expect(borrowed.element, `${mob.id} 借了 ${borrowed.id} 的图`).toBe(mob.element);
    }
  });
});

describe('五行秘境三波构成', () => {
  it('三波互不相同：同怪三连等于同一场战斗打三遍', () => {
    for (const realm of REALMS) {
      expect(new Set(realm.waveMobs).size, `${realm.name} 波次去重`).toBe(3);
    }
  });

  it('全波敌人与副本同属性（否则「带克制队」的提示会骗人）', () => {
    for (const realm of REALMS) {
      for (const id of realm.waveMobs) {
        expect(MOB_MAP.get(id)?.element, `${realm.name} → ${id}`).toBe(realm.element);
      }
    }
  });

  it('末波是守关档，前两波不是（三波要有强度递进）', () => {
    for (const realm of REALMS) {
      const tiers = realm.waveMobs.map((id) => MOB_MAP.get(id)!.displayTier);
      expect(tiers[2], `${realm.name} 末波`).toBe('miniBoss');
      expect(tiers.slice(0, 2), `${realm.name} 前两波`).not.toContain('miniBoss');
    }
  });

  it('关卡可正常构造，遭遇引用全部可解析', () => {
    for (const realm of REALMS) {
      for (const t of REALM_TIERS) {
        const stage = buildRealmStage(realm, t.tier);
        expect(stage.encounters.length).toBe(3);
        for (const ref of stage.encounters) {
          expect(() => resolveEncounter(ref)).not.toThrow();
        }
      }
    }
  });
});

describe('通天塔杂兵轮换', () => {
  /** 某层的杂兵组合签名（不含里程碑守关） */
  const waveSig = (floor: number): string =>
    buildTowerStage(floor).encounters
      .slice(0, TOWER.wavesPerFloor)
      .map((e) => (e.kind === 'mob' ? e.id : e.id))
      .join('|');

  it('连续 8 层不出现重复组合（池子扩容前 6 层就会回头）', () => {
    const sigs = Array.from({ length: 8 }, (_, i) => waveSig(i + 1));
    expect(new Set(sigs).size).toBe(sigs.length);
  });

  it('前 10 层覆盖五行全部属性，逼玩家换队而不是一套万能队爬到顶', () => {
    const els = new Set<string>();
    for (let f = 1; f <= 10; f++) {
      for (const ref of buildTowerStage(f).encounters) {
        if (ref.kind === 'mob') els.add(MOB_MAP.get(ref.id)!.element);
      }
    }
    expect([...els].sort()).toEqual([...ELEMENTS].sort());
  });

  it('层数无上限：第 65 层（等效第 9 章）仍能构造出合法关卡', () => {
    const stage = buildTowerStage(65);
    expect(stage.encounters.length).toBeGreaterThan(0);
    for (const ref of stage.encounters) {
      expect(() => resolveEncounter(ref)).not.toThrow();
    }
  });

  it('里程碑守关按池子轮换，前几个里程碑不重复', () => {
    const guards = [1, 2, 3, 4].map((n) => {
      const floor = n * TOWER.milestoneEvery;
      const encounters = buildTowerStage(floor).encounters;
      const last = encounters[encounters.length - 1];
      return last.kind === 'mob' ? last.id : '';
    });
    expect(new Set(guards).size).toBe(guards.length);
    for (const id of guards) {
      expect(MOB_MAP.get(id)?.displayTier, id).toBe('miniBoss');
    }
  });
});

/**
 * 副玩法此前完全没有模拟器覆盖：主线有 128 关的 TTK 门禁，秘境与塔却只靠人肉试打。
 * 改杂怪池最容易在这里出事 —— 换一只带后期技的怪进第二波，新号就打不动了。
 */
describe('副玩法难度符合性（模拟器口径）', () => {
  const BUDGET_TEAM_IDS = ['pet_002', 'pet_016', 'pet_006', 'pet_026', 'pet_008'];
  /** 「刚够解锁该档」的队伍：用解锁章的通关产出，而不是满养成队 */
  const teamAt = (chapter: number) => {
    const b = getChapterBudget(chapter);
    return buildTeam(BUDGET_TEAM_IDS, b.clearLevel, b.enterStar);
  };

  it('各秘境各档：达标队伍可通，且用时在三星回合上限内', () => {
    for (const realm of REALMS) {
      for (const t of REALM_TIERS) {
        const stage = buildRealmStage(realm, t.tier);
        const r = simulateBattle(teamAt(t.unlockChapter), stage.id, COMBO_MODELS.mid);
        expect(r.win, `${stage.name} 应可通`).toBe(true);
        expect(r.turnsUsed, `${stage.name} 用时 ${r.turnsUsed}`)
          .toBeLessThanOrEqual(t.starTurnLimit);
      }
    }
  });

  it('秘境难度随档位递增（中阶不比初阶轻松）', () => {
    for (const realm of REALMS) {
      const team = teamAt(REALM_TIERS[2].unlockChapter);
      const turns = REALM_TIERS.map(
        (t) => simulateBattle(team, buildRealmStage(realm, t.tier).id, COMBO_MODELS.mid).turnsUsed,
      );
      expect(turns[1], `${realm.name} 中阶`).toBeGreaterThanOrEqual(turns[0]);
      expect(turns[2], `${realm.name} 高阶`).toBeGreaterThanOrEqual(turns[1]);
    }
  });

  it('通天塔：等效章节匹配的队伍能过对应层（含里程碑守关层）', () => {
    for (const floor of [1, 9, 10, 33, 65]) {
      const stage = buildTowerStage(floor);
      const r = simulateBattle(teamAt(Math.ceil(stage.chapter)), stage.id, COMBO_MODELS.mid);
      expect(r.win, `第 ${floor} 层应可通`).toBe(true);
      expect(r.turnsUsed, `第 ${floor} 层用时 ${r.turnsUsed}`)
        .toBeLessThanOrEqual(TOWER.starTurnLimit);
    }
  });
});
