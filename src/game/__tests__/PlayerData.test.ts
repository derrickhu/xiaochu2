/**
 * 养成闭环存档测试：无 wx/tt 环境下 Platform 存储为 no-op，PlayerData 纯内存运行。
 * 单文件内共享单例状态，断言均为相对变化，保证顺序无关。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { PlayerData } from '../PlayerData';
import { DEFAULT_TEAM } from '@/balance/pets';

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

describe('图鉴里程碑', () => {
  it('达成可领且仅能领一次', () => {
    expect(PlayerData.codexCount).toBeGreaterThanOrEqual(3);
    const coinsBefore = PlayerData.coins;
    expect(PlayerData.claimCodexMilestone(3, 100)).toBe(true);
    expect(PlayerData.coins).toBe(coinsBefore + 100);
    expect(PlayerData.claimCodexMilestone(3, 100)).toBe(false);
  });
});
