import { describe, it, expect } from 'vitest';
import {
  STAGES, CHAPTERS, stagesOfChapter, CHAPTER_BOSS_CHALLENGE, CHAPTER_REWARD_PET,
  CHAPTER_CAPTURE_RARITY, MAIN_CHAPTER_COUNT,
} from '../stages';
import { chapterCaptureRarityMatches } from '../chapterGoal';
import { DROP_TABLES, getDropTable } from '../drops';
import { STAGE_TYPE_PROFILES, getStageType } from '../stageTypes';
import { MECHANICS, resolveMechanics } from '../stageMechanics';
import { ENEMY_MAP, MOBS } from '../enemies';
import { CREATURE_MAP, CREATURES } from '../creatures';
import { PET_MAP } from '../pets';
import { SKILL_MAP } from '../skills';
import {
  BOSS_CHALLENGE_LABEL, bossChallengeConfig, bossChallengeLabel,
  recipeForChallenge, stageMatchesChallenge, type BossChallengeKind,
} from '../bossChallenge';

const ALL_CHALLENGE_KINDS = Object.keys(BOSS_CHALLENGE_LABEL) as BossChallengeKind[];
import { stageDrops } from '@/formulas/economyOutput';

describe('关卡数据完整性（单一真源约束）', () => {
  it('共 128 关（16 章 × 每章 8 关）', () => {
    expect(STAGES.length).toBe(MAIN_CHAPTER_COUNT * 8);
  });

  it('每章恰好 8 关', () => {
    for (const ch of CHAPTERS) {
      expect(stagesOfChapter(ch).length, `章节 ${ch}`).toBe(8);
    }
  });

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
    expect(CHAPTERS.length).toBe(MAIN_CHAPTER_COUNT);
    expect(CHAPTERS).toEqual(Array.from({ length: MAIN_CHAPTER_COUNT }, (_, i) => i + 1));
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

  it('每章恰有一个 tier2 Boss 掉落点', () => {
    for (const ch of CHAPTERS) {
      const dropCount = stagesOfChapter(ch).flatMap((s) => s.encounters).filter(
        (e) => e.kind === 'creature' && e.tier === 'tier2' && e.bossDrop,
      ).length;
      expect(dropCount, `章节 ${ch} Boss 掉落点`).toBe(1);
    }
  });

  it('Boss 直掉灵宠每章 1 只且互不重复（不含开局赠送）', () => {
    const ids = new Set<string>();
    for (const s of STAGES) {
      for (const e of s.encounters) {
        if (e.kind === 'creature' && e.tier === 'tier2' && e.bossDrop) ids.add(e.id);
      }
    }
    expect(ids.size).toBe(MAIN_CHAPTER_COUNT);
    for (const petId of Object.values(CHAPTER_REWARD_PET)) {
      expect(ids.has(petId)).toBe(true);
    }
    // 掉落宠不复用：16 章 16 只不同的宠，否则「打完这章能拿新宠」的承诺会落空
    expect(new Set(Object.values(CHAPTER_REWARD_PET)).size).toBe(MAIN_CHAPTER_COUNT);
  });
});

describe('灵宠 ID 规范', () => {
  it('CREATURES 均为 pet_XXX 且连续编号', () => {
    expect(CREATURES.length).toBeGreaterThan(0);
    for (const c of CREATURES) {
      expect(c.id).toMatch(/^pet_\d{3}$/);
    }
    const nums = CREATURES.map((c) => Number(c.id.slice(4))).sort((a, b) => a - b);
    for (let i = 0; i < nums.length; i++) {
      expect(nums[i]).toBe(i + 1);
    }
  });
});

describe('Boss 挑战 archetype', () => {
  it('每章 Boss 对应 CHAPTER_BOSS_CHALLENGE 且遭遇一致', () => {
    for (const ch of CHAPTERS) {
      const boss = stagesOfChapter(ch).find((s) => s.isBoss)!;
      const kind = CHAPTER_BOSS_CHALLENGE[ch];
      expect(kind, `章 ${ch}`).toBeDefined();
      expect(
        stageMatchesChallenge(kind, boss.encounters, boss.mechanics ? [...boss.mechanics] : undefined),
        `${boss.id} vs ${kind}`,
      ).toBe(true);
    }
  });

  it('Boss 掉落宠与 CHAPTER_REWARD_PET 一致', () => {
    for (const ch of CHAPTERS) {
      const boss = stagesOfChapter(ch).find((s) => s.isBoss)!;
      const drop = boss.encounters.find(
        (e) => e.kind === 'creature' && e.tier === 'tier2' && e.bossDrop,
      );
      expect(drop?.kind === 'creature' && drop.id).toBe(CHAPTER_REWARD_PET[ch]);
    }
  });

  it('各章 Boss 掉落稀有度递进且不含 UR', () => {
    for (const ch of CHAPTERS) {
      expect(chapterCaptureRarityMatches(ch), `章节 ${ch} 掉落稀有度`).toBe(true);
      const petId = CHAPTER_REWARD_PET[ch];
      const pet = PET_MAP.get(petId);
      expect(pet?.rarity).toBe(CHAPTER_CAPTURE_RARITY[ch]);
      expect(pet!.rarity, `章节 ${ch} Boss 掉落`).toBeGreaterThanOrEqual(2);
      expect(pet!.rarity, `章节 ${ch} 不含 UR`).toBeLessThanOrEqual(3);
    }
    // 1~2 章 SR，3 章起 SSR
    expect(PET_MAP.get(CHAPTER_REWARD_PET[1])!.rarity).toBe(2);
    expect(PET_MAP.get(CHAPTER_REWARD_PET[2])!.rarity).toBe(2);
    expect(PET_MAP.get(CHAPTER_REWARD_PET[3])!.rarity).toBe(3);
  });

  it('各章 Boss 掉落宠定位与属性均不连续重复', () => {
    const pets = CHAPTERS.map((ch) => PET_MAP.get(CHAPTER_REWARD_PET[ch])!);
    for (let i = 1; i < pets.length; i++) {
      expect(pets[i].role, `章节 ${i + 1} 与 ${i} 定位`).not.toBe(pets[i - 1].role);
      // 属性不重复只约束第 9 章起：第 1、2 章都掉木宠是既有编排（新手连续拿同色更好上手），
      // 不为了一条新规则去改动老玩家已经打过的前两章奖励。
      if (i + 1 <= 9) continue;
      expect(pets[i].element, `章节 ${i + 1} 与 ${i} 属性`).not.toBe(pets[i - 1].element);
    }
    /*
     * 第 1~8 章沿用原轮替；第 9 章起可用的 SSR 里已无治疗
     * （未占用的 14 只 SSR 是 5 辅助 / 5 输出 / 4 坦克），
     * 故后半程改走 坦克→辅助→输出 的三档轮替。
     * 治疗在第 2、6 章已各给一只，不至于后期没治疗可用。
     */
    expect(pets.map((p) => p.role)).toEqual([
      'attacker', 'healer', 'tank', 'support',
      'attacker', 'healer', 'support', 'attacker',
      'tank', 'support', 'attacker', 'tank',
      'attacker', 'support', 'tank', 'attacker',
    ]);
  });

  it('第 8 章 Boss 首教封木（rule_ban_wood）', () => {
    const boss = stagesOfChapter(8).find((s) => s.isBoss)!;
    expect(CHAPTER_BOSS_CHALLENGE[8]).toBe('banElement');
    expect(boss.mechanics).toContain('rule_ban_wood');
  });

  /*
   * 挑战种类是「保鲜轴」的单一真源：加一种 kind 却漏配方 / 漏机制定义 / 引用不存在的怪，
   * 都要等排到那一章才在关卡里炸出来。下面三条把这条链在数据层就闭合。
   */
  it('每种挑战都能产出可用的铺垫关配方（怪与机制都必须存在）', () => {
    for (const kind of ALL_CHALLENGE_KINDS) {
      const recipe = recipeForChallenge(kind);
      expect(recipe.encounters.length, `${kind} 无遭遇`).toBeGreaterThan(0);
      for (const e of recipe.encounters) {
        if (e.kind === 'mob') expect(ENEMY_MAP.has(e.id), `${kind} 引用杂怪 ${e.id}`).toBe(true);
        else expect(CREATURE_MAP.has(e.id), `${kind} 引用生物 ${e.id}`).toBe(true);
      }
      for (const m of recipe.mechanics ?? []) {
        expect(MECHANICS[m], `${kind} 引用机制 ${m}`).toBeDefined();
      }
      expect(
        stageMatchesChallenge(kind, recipe.encounters, recipe.mechanics ? [...recipe.mechanics] : undefined),
        `${kind} 自身配方未通过 stageMatchesChallenge`,
      ).toBe(true);
    }
  });

  it('每种挑战的 Boss 关配置同样闭合（prepMob 与机制存在）', () => {
    for (const kind of ALL_CHALLENGE_KINDS) {
      const cfg = bossChallengeConfig(kind, { ruleBanElement: 'wood' });
      expect(ENEMY_MAP.has(cfg.prepMob), `${kind} 铺垫怪 ${cfg.prepMob}`).toBe(true);
      for (const m of cfg.mechanics ?? []) {
        expect(MECHANICS[m], `${kind} Boss 机制 ${m}`).toBeDefined();
      }
    }
  });

  it('每种挑战都有中文标签', () => {
    for (const kind of ALL_CHALLENGE_KINDS) {
      expect(bossChallengeLabel(kind), `${kind} 缺标签`).toBeTruthy();
    }
  });
});

describe('杂怪引用的技能与立绘', () => {
  it('每只杂怪的技能与阶段追加技都能查到定义', () => {
    for (const mob of MOBS) {
      for (const id of mob.skillIds ?? []) {
        expect(SKILL_MAP.has(id), `${mob.id} 的技能 ${id}`).toBe(true);
      }
      for (const phase of mob.phases ?? []) {
        for (const id of phase.addSkillIds ?? []) {
          expect(SKILL_MAP.has(id), `${mob.id} 阶段追加技 ${id}`).toBe(true);
        }
        if (phase.onEnterSkillId) {
          expect(SKILL_MAP.has(phase.onEnterSkillId), `${mob.id} 切入技`).toBe(true);
        }
      }
    }
  });
});

describe('resolveMechanics 聚合', () => {
  it('正确聚合禁心 / 禁属性 / 封印珠', () => {
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
    expect(stageDrops(undefined, 1, 3)).toEqual({ exp: 0, shards: [], universal: 0 });
    expect(stageDrops('not_exist', 1, 3)).toEqual({ exp: 0, shards: [], universal: 0 });
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

  it('所有关卡类型不掉碎片（防无限刷）', () => {
    const types = ['normal', 'elite', 'boss', 'dailyResource', 'event'] as const;
    for (const type of types) {
      expect(stageDrops('dt_forest_boss', 1, 3, type).shards).toEqual([]);
      expect(stageDrops('dt_daily_shard', 1, 3, type).shards).toEqual([]);
    }
  });

  it('关卡类型表覆盖所有引用类型', () => {
    for (const s of STAGES) expect(getStageType(s.type).type).toBe(s.type);
  });
});
