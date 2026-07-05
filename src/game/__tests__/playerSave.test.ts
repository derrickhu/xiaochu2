import { describe, it, expect } from 'vitest';
import { parseSaveData, initialData, SAVE_VERSION } from '../playerSave';
import { DEFAULT_TEAM } from '@/balance/pets';

describe('存档 v4 灵宠 ID 迁移', () => {
  it('旧 ID owned/team 迁移为新 ID（忽略已移除的 discovered）', () => {
    const data = parseSaveData({
      version: 2,
      ownedPets: {
        pet_metal_003: { level: 1, star: 1, shards: 0 },
        pet_metal_004: { level: 10, star: 2, shards: 3 },
        cr_red_crow: { level: 5, star: 1, shards: 0 },
      },
      team: ['pet_metal_003', 'pet_metal_004', 'cr_red_crow'],
      discovered: ['pet_metal_003', 'cr_red_crow'],
      pendingShards: { cr_guixu_turtle: 4 },
    });
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.ownedPets.pet_002).toEqual({ level: 10, star: 2, shards: 3 });
    expect(data.ownedPets.pet_024).toEqual({ level: 5, star: 1, shards: 0 });
    expect(data.team).toContain('pet_001');
    expect(data.team).toContain('pet_002');
    expect(data.team).toContain('pet_024');
    expect(data.pendingShards.pet_028).toBe(4);
    expect('discovered' in data).toBe(false);
  });

  it('已是新 ID 则原样保留', () => {
    const data = parseSaveData({
      ownedPets: { pet_001: { level: 1, star: 1, shards: 0 } },
      team: ['pet_001'],
    });
    expect(data.ownedPets.pet_001).toBeDefined();
    expect(data.team[0]).toBe('pet_001');
  });

  it('空 owned 回退默认队（新 ID）', () => {
    const data = parseSaveData({});
    expect(data.team).toEqual([...DEFAULT_TEAM]);
  });

  it('新档 milestones 从初始阵容数量起算', () => {
    const data = initialData();
    expect(data.codexRewarded).toBe(DEFAULT_TEAM.length);
  });
});
