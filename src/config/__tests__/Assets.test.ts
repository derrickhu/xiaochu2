import { describe, it, expect } from 'vitest';
import { petImage, petImageAwakened, petAvatarPath, petAvatarLoadPaths, creatureMonsterImage, PET_AWAKEN_STAR } from '../Assets';

describe('灵宠头像路径', () => {
  it('初始头像与觉醒头像路径', () => {
    expect(petImage('pet_007')).toBe('subpackages/pkg-pet/images/pet/pet_007.png');
    expect(petImageAwakened('pet_007')).toBe('subpackages/pkg-pet/images/pet/pet_007_s3.png');
  });

  it('★4 及以上切换觉醒灵相', () => {
    expect(PET_AWAKEN_STAR).toBe(4);
    expect(petAvatarPath('pet_001', 3)).toBe(petImage('pet_001'));
    expect(petAvatarPath('pet_001', 4)).toBe(petImageAwakened('pet_001'));
    expect(petAvatarPath('pet_001', 5)).toBe(petImageAwakened('pet_001'));
  });

  it('预加载仅 canonical 文件名；旧存档 ID 映射到新路径', () => {
    expect(petAvatarLoadPaths('pet_007', 1)).toEqual([petImage('pet_007')]);
    expect(petAvatarLoadPaths('pet_fire_003', 1)).toEqual([petImage('pet_007')]);
    expect(petAvatarLoadPaths('cr_star_deer', 1)).toEqual([petImage('pet_017')]);
  });

  it('pet_011+ 怪物立绘进 pkg-enemy-cr', () => {
    expect(creatureMonsterImage('pet_001', 'tier1')).toContain('pkg-enemy/images/enemy/pet_001.png');
    expect(creatureMonsterImage('pet_011', 'tier2')).toContain('pkg-enemy-cr/images/enemy/pet_011_awakened.png');
  });
});
