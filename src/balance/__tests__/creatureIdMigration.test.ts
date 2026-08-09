/**
 * 灵宠 ID 迁移：量产宠 pet_031+ 必须 round-trip，否则召唤写入后下次读档会静默蒸发。
 */
import { describe, it, expect } from 'vitest';
import { migrateCreatureId } from '../creatureIdMigration';
import { parseSaveData } from '@/game/playerSave';

describe('migrateCreatureId', () => {
  it('透传现行 pet_XXX（含量产 031+）', () => {
    expect(migrateCreatureId('pet_001')).toBe('pet_001');
    expect(migrateCreatureId('pet_030')).toBe('pet_030');
    expect(migrateCreatureId('pet_031')).toBe('pet_031');
    expect(migrateCreatureId('pet_050')).toBe('pet_050');
    expect(migrateCreatureId('pet_100')).toBe('pet_100');
  });

  it('旧 cr_* / pet_metal_* 映射到 pet_001…030', () => {
    expect(migrateCreatureId('cr_star_deer')).toBe('pet_017');
    expect(migrateCreatureId('pet_metal_003')).toBe('pet_001');
  });

  it('未知旧 id 返回 null', () => {
    expect(migrateCreatureId('pet_metal_999')).toBeNull();
    expect(migrateCreatureId('cr_unknown')).toBeNull();
  });
});

describe('parseSaveData 保留量产宠', () => {
  it('ownedPets / team / pendingShards 中的 pet_031+ 不被剥离', () => {
    const parsed = parseSaveData({
      version: 7,
      ownedPets: {
        pet_001: { level: 1, star: 1, shards: 0 },
        pet_050: { level: 3, star: 2, shards: 12 },
        pet_100: { level: 1, star: 1, shards: 0 },
      },
      team: ['pet_001', 'pet_050', 'pet_100'],
      pendingShards: { pet_031: 8 },
    });
    expect(Object.keys(parsed.ownedPets).sort()).toEqual(
      ['pet_001', 'pet_050', 'pet_100'],
    );
    expect(parsed.ownedPets.pet_050).toMatchObject({ level: 3, star: 2, shards: 12 });
    expect(parsed.team).toEqual(['pet_001', 'pet_050', 'pet_100']);
    expect(parsed.pendingShards.pet_031).toBe(8);
  });
});
