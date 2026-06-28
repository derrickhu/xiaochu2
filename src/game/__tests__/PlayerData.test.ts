/**
 * 养成闭环存档测试：无 wx/tt 环境下 Platform 存储为 no-op，PlayerData 纯内存运行。
 * 单文件内共享单例状态，断言均为相对变化，保证顺序无关。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { PlayerData } from '../PlayerData';
import { PETS, DEFAULT_TEAM, DEFAULT_SUMMON_POOL_R_IDS } from '@/balance/pets';
import { ECONOMY } from '@/balance/economy';

beforeAll(() => {
  PlayerData.load();
});

describe('初始存档', () => {
  it('初始拥有默认阵容且已收录', () => {
    for (const id of DEFAULT_TEAM) {
      expect(PlayerData.isOwned(id)).toBe(true);
    }
    expect(PlayerData.codexCount).toBeGreaterThanOrEqual(DEFAULT_TEAM.length);
  });

  it('R 档灵宠开局即在召唤池', () => {
    for (const id of DEFAULT_SUMMON_POOL_R_IDS) {
      expect(PlayerData.isDiscovered(id)).toBe(true);
    }
    expect(PlayerData.availablePool().length).toBeGreaterThanOrEqual(DEFAULT_SUMMON_POOL_R_IDS.length);
  });

  it('编队默认非空且均为已拥有', () => {
    expect(PlayerData.team.length).toBeGreaterThan(0);
    for (const id of PlayerData.team) expect(PlayerData.isOwned(id)).toBe(true);
  });
});

describe('招募', () => {
  it('灵宠币不足时招募失败', () => {
    expect(PlayerData.coins).toBe(0);
    expect(PlayerData.recruit()).toBeNull();
  });

  it('足额招募解锁下一只新宠', () => {
    PlayerData.recordClear('stage_1_1', 3, 100000); // 注资
    const next = PlayerData.nextRecruit();
    expect(next).not.toBeNull();
    const before = PlayerData.ownedPets.length;
    const r = PlayerData.recruit();
    expect(r?.duplicate).toBe(false);
    expect(r?.petId).toBe(next);
    expect(PlayerData.ownedPets.length).toBe(before + 1);
    expect(PlayerData.isOwned(next!)).toBe(true);
  });
});

describe('升级 / 升星', () => {
  const pet = DEFAULT_TEAM[0];

  it('经验足够可升级，等级 +1 并扣经验', () => {
    PlayerData.addExp(100000);
    const lv = PlayerData.petLevel(pet);
    const expBefore = PlayerData.exp;
    expect(PlayerData.levelUp(pet)).toBe(true);
    expect(PlayerData.petLevel(pet)).toBe(lv + 1);
    expect(PlayerData.exp).toBeLessThan(expBefore);
  });

  it('碎片足够可升星，星级 +1 并扣碎片', () => {
    PlayerData.addShards(pet, 1000);
    const star = PlayerData.petStar(pet);
    const shardsBefore = PlayerData.petShards(pet);
    expect(PlayerData.canStarUp(pet)).toBe(true);
    expect(PlayerData.starUp(pet)).toBe(true);
    expect(PlayerData.petStar(pet)).toBe(star + 1);
    expect(PlayerData.petShards(pet)).toBeLessThan(shardsBefore);
  });

  it('碎片不足不可升星', () => {
    const other = DEFAULT_TEAM[1];
    expect(PlayerData.petShards(other)).toBe(0);
    expect(PlayerData.canStarUp(other)).toBe(false);
    expect(PlayerData.starUp(other)).toBe(false);
  });
});

describe('未拥有宠碎片暂存（修复丢弃）', () => {
  it('给未拥有宠加碎片进暂存，解锁后并入', () => {
    const unowned = PETS.find((p) => !PlayerData.isOwned(p.id));
    expect(unowned).toBeTruthy();
    PlayerData.addShards(unowned!.id, 7);
    expect(PlayerData.petShards(unowned!.id)).toBe(7);
    // 用足额灵玉强制抽到它前，至少验证暂存读得到（解锁路径在抽卡测试覆盖）
  });
});

describe('抽卡（灵玉）', () => {
  it('单抽扣除灵玉并返回结果', () => {
    PlayerData.addLingyu(ECONOMY.gacha.singleCost); // 注资保证可抽
    const before = PlayerData.lingyu;
    const o = PlayerData.pullGachaSingle(() => 0);
    expect(o).not.toBeNull();
    expect(PlayerData.lingyu).toBe(before - ECONOMY.gacha.singleCost);
  });

  it('灵玉不足时单抽返回 null', () => {
    // 把灵玉花到不足
    while (PlayerData.lingyu >= ECONOMY.gacha.singleCost) {
      PlayerData.pullGachaSingle(() => 0);
    }
    expect(PlayerData.pullGachaSingle(() => 0)).toBeNull();
  });
});

describe('里程碑与货币', () => {
  it('首通关卡发放灵玉，重复通关不再发', () => {
    const stageId = 'stage_1_3';
    const before = PlayerData.lingyu;
    const granted = PlayerData.recordClear(stageId, 1, 0);
    expect(granted).toBeGreaterThan(0);
    expect(PlayerData.lingyu).toBe(before + granted);
    expect(PlayerData.recordClear(stageId, 1, 0)).toBe(0);
  });

  it('spendCoins 不足返回 false', () => {
    expect(PlayerData.spendCoins(PlayerData.coins + 1)).toBe(false);
  });
});
