import { describe, it, expect } from 'vitest';
import { petAtk, petHp, petRcv, petExpToNext, enemyStats } from '../growth';
import { PETS, type PetDef } from '@/balance/pets';
import { resolvePetPassiveBundle } from '@/balance/passiveEffects';
import { ENEMIES } from '@/balance/enemies';
import { skillForPet } from '@/game/battle/SkillEngine';

const samplePet = PETS[0];
const sampleEnemy = ENEMIES[0];

describe('petAtk', () => {
  it('1 级 1 星 = role 模板 × 个体修正后的攻击', () => {
    expect(petAtk(samplePet, 1, 1)).toBeGreaterThan(0);
  });

  it('等级提升攻击单调递增', () => {
    const a10 = petAtk(samplePet, 10, 1);
    const a20 = petAtk(samplePet, 20, 1);
    expect(a20).toBeGreaterThan(a10);
    expect(a10).toBeGreaterThan(petAtk(samplePet, 1, 1));
  });

  it('星级倍率生效', () => {
    const star1 = petAtk(samplePet, 1, 1);
    const star5 = petAtk(samplePet, 1, 5);
    expect(star5).toBeGreaterThan(star1 * 2.7);
    expect(star5).toBeLessThan(star1 * 2.9);
  });

  it('成长曲线快照（全宠物 Lv1/10/30/50 攻击一览）', () => {
    const table = PETS.map((p) => ({
      id: p.id,
      lv1: petAtk(p, 1, 1),
      lv10: petAtk(p, 10, 1),
      lv30: petAtk(p, 30, 1),
      lv50max: petAtk(p, 50, 5),
    }));
    expect(table).toMatchSnapshot();
  });
});

describe('petHp / petRcv（三维模型）', () => {
  it('1 级 1 星三维值有效', () => {
    expect(petHp(samplePet, 1, 1)).toBeGreaterThan(0);
    expect(petRcv(samplePet, 1, 1)).toBeGreaterThan(0);
  });

  it('等级提升单调递增', () => {
    expect(petHp(samplePet, 20, 1)).toBeGreaterThan(petHp(samplePet, 10, 1));
    expect(petRcv(samplePet, 20, 1)).toBeGreaterThan(petRcv(samplePet, 10, 1));
  });

  it('同 role + 同 rarity + 同星级基础三维完全一致（排除带个体 statBonus 修饰的宠）', () => {
    const star = 1;
    const lv = 1;
    // 个体 statBonus(self) 是专属面板修饰，会改写自身三维，不纳入「role+rarity 基线一致」断言
    const hasSelfStatBonus = (p: PetDef): boolean => {
      const bundle = resolvePetPassiveBundle(p.role, p.rarity, star);
      return bundle.statEffects.some((e) => e.kind === 'statBonus' && e.statScope === 'self');
    };
    const seen = new Map<string, PetDef>();
    for (const p of PETS) {
      if (p.statProfile || hasSelfStatBonus(p)) continue;
      const key = `${p.role}_${p.rarity}`;
      const ref = seen.get(key);
      if (!ref) { seen.set(key, p); continue; }
      expect(petAtk(p, lv, star)).toBe(petAtk(ref, lv, star));
      expect(petHp(p, lv, star)).toBe(petHp(ref, lv, star));
      expect(petRcv(p, lv, star)).toBe(petRcv(ref, lv, star));
    }
  });

  it('R 稀有度宠 = role 模板基准（statMult = 1）', () => {
    const r1Attacker = PETS.find((p) => p.role === 'attacker' && p.rarity === 1)!;
    // attacker 模板 atk 53 / hp 185 / rcv 11
    expect(petAtk(r1Attacker, 1, 1)).toBe(53);
    expect(petHp(r1Attacker, 1, 1)).toBe(185);
    expect(petRcv(r1Attacker, 1, 1)).toBe(11);
  });

  it('同 role 下高稀有初始三维明显更高', () => {
    // attacker：R(metal_001) < SR? 取实际存在的多档对比
    const rAtk = PETS.find((p) => p.role === 'attacker' && p.rarity === 1)!;
    const ssrAtk = PETS.find((p) => p.role === 'attacker' && p.rarity === 3)!;
    const urAtk = PETS.find((p) => p.role === 'attacker' && p.rarity === 4)!;
    expect(petAtk(ssrAtk, 1, 1)).toBeGreaterThan(petAtk(rAtk, 1, 1));
    expect(petAtk(urAtk, 1, 1)).toBeGreaterThan(petAtk(ssrAtk, 1, 1));
  });

  it('角色定位体现在三维分布上：同稀有下坦克 hp 最高 / 治疗 rcv 最高', () => {
    // 统一取 1★ 1级，并按各自稀有度计算（定位差异在权重，不被稀有度抹平时成立）
    const tank = PETS.find((p) => p.id === 'cr_stone_ape')!;       // R 坦克（玄岩石猿）
    const healer = PETS.find((p) => p.id === 'cr_jadehorn_goat')!; // R 治疗（玉角灵羊）
    const attacker = PETS.find((p) => p.id === 'cr_red_crow')!;    // R 输出（赤日金乌）
    expect(petHp(tank, 1, 1)).toBeGreaterThan(petHp(attacker, 1, 1));
    expect(petRcv(healer, 1, 1)).toBeGreaterThan(petRcv(attacker, 1, 1));
    expect(petAtk(attacker, 1, 1)).toBeGreaterThan(petAtk(healer, 1, 1));
  });

  it('三维快照（全宠物 Lv1 三围一览）', () => {
    const table = PETS.map((p) => ({
      id: p.id,
      role: p.role,
      atk: petAtk(p, 1, 1),
      hp: petHp(p, 1, 1),
      rcv: petRcv(p, 1, 1),
      skill: skillForPet(p).id,
    }));
    expect(table).toMatchSnapshot();
  });
});

describe('星级成长档案', () => {
  // R 稀有度攻击位（statMult = 1），与 role 模板基线一致
  const pet = PETS.find((p) => p.id === 'cr_red_crow')!;

  it('1★ 为恒等档：与不带星级倍率的基线一致（hp 不变）', () => {
    // 1★ baseMult/growthMult = 1，Lv1 = role 模板基础
    expect(petHp(pet, 1, 1)).toBe(185);
    expect(petAtk(pet, 1, 1)).toBe(53);
  });

  it('星级提升同时影响三维（不只攻击）', () => {
    expect(petAtk(pet, 1, 2)).toBeGreaterThan(petAtk(pet, 1, 1));
    expect(petHp(pet, 1, 2)).toBeGreaterThan(petHp(pet, 1, 1));
    expect(petRcv(pet, 1, 2)).toBeGreaterThan(petRcv(pet, 1, 1));
  });

  it('等级上限：超过星级 maxLevel 按上限计算（1★ 封顶 50）', () => {
    expect(petAtk(pet, 999, 1)).toBe(petAtk(pet, 50, 1));
    // 5★ 上限更高（99），故 999 级等于 99 级而非 50 级
    expect(petAtk(pet, 999, 5)).toBe(petAtk(pet, 99, 5));
    expect(petAtk(pet, 99, 5)).toBeGreaterThan(petAtk(pet, 50, 5));
  });

  it('高星成长更快：5★ 的等级增益倍数高于 1★', () => {
    const star1Scale = petAtk(pet, 50, 1) / petAtk(pet, 1, 1);
    const star5Scale = petAtk(pet, 50, 5) / petAtk(pet, 1, 5);
    expect(star5Scale).toBeGreaterThan(star1Scale);
  });
});

describe('petExpToNext', () => {
  it('1 级所需经验 = expBase', () => {
    expect(petExpToNext(1)).toBe(30);
  });

  it('经验需求单调递增', () => {
    expect(petExpToNext(10)).toBeGreaterThan(petExpToNext(5));
  });
});

describe('enemyStats', () => {
  it('第 1 章难度 1.0 = 模板基值', () => {
    const s = enemyStats(sampleEnemy, 1, 1.0);
    expect(s).toEqual({ hp: sampleEnemy.baseHp, atk: sampleEnemy.baseAtk, def: sampleEnemy.baseDef });
  });

  it('章节越深数值越高', () => {
    const c1 = enemyStats(sampleEnemy, 1, 1.0);
    const c3 = enemyStats(sampleEnemy, 3, 1.0);
    expect(c3.hp).toBeGreaterThan(c1.hp);
    expect(c3.atk).toBeGreaterThan(c1.atk);
  });

  it('敌人曲线快照（1~5 章基准数值）', () => {
    const table = Array.from({ length: 5 }, (_, i) => ({
      chapter: i + 1,
      ...enemyStats(sampleEnemy, i + 1, 1.0),
    }));
    expect(table).toMatchSnapshot();
  });
});
