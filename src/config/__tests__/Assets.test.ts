import { describe, it, expect } from 'vitest';
import { petImage, petImageAwakened, petAvatarPath, PET_AWAKEN_STAR } from '../Assets';

describe('灵宠头像路径', () => {
  it('初始头像与觉醒头像命名对齐 xiao_chu', () => {
    expect(petImage('pet_fire_003')).toBe('subpackages/pkg-pet/images/pet/pet_fire_003.png');
    expect(petImageAwakened('pet_fire_003')).toBe('subpackages/pkg-pet/images/pet/pet_fire_003_s3.png');
  });

  it('★4 及以上切换觉醒灵相', () => {
    expect(PET_AWAKEN_STAR).toBe(4);
    expect(petAvatarPath('pet_metal_003', 3)).toBe(petImage('pet_metal_003'));
    expect(petAvatarPath('pet_metal_003', 4)).toBe(petImageAwakened('pet_metal_003'));
    expect(petAvatarPath('pet_metal_003', 5)).toBe(petImageAwakened('pet_metal_003'));
  });
});
