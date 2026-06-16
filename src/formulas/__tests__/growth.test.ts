import { describe, it, expect } from 'vitest';
import { petAtk, petHp, petRcv, petExpToNext, enemyStats } from '../growth';
import { PETS } from '@/balance/pets';
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

  it('同 role 同星级基础三维完全一致', () => {
    const star = 1;
    const lv = 1;
    for (const role of ['attacker', 'healer', 'tank', 'support'] as const) {
      const group = PETS.filter((p) => p.role === role);
      if (group.length < 2) continue;
      const ref = group[0];
      for (const p of group.slice(1)) {
        expect(petAtk(p, lv, star)).toBe(petAtk(ref, lv, star));
        expect(petHp(p, lv, star)).toBe(petHp(ref, lv, star));
        expect(petRcv(p, lv, star)).toBe(petRcv(ref, lv, star));
      }
    }
  });

  it('角色定位体现在三维分布上：坦克 hp 最高 / 治疗 rcv 最高', () => {
    const tank = PETS.find((p) => p.id === 'pet_earth_001')!;
    const healer = PETS.find((p) => p.id === 'pet_wood_001')!;
    const attacker = PETS.find((p) => p.id === 'pet_fire_001')!;
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

describe('petExpToNext', () => {
  it('1 级所需经验 = expBase', () => {
    expect(petExpToNext(1)).toBe(100);
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
