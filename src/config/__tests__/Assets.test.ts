import { describe, it, expect } from 'vitest';
import {
  petImage, petImageAwakened, petAvatarPath, petAvatarLoadPaths,
  creatureMonsterImage, petShowcaseImage, PET_AWAKEN_STAR, resolveSkillIconId,
  chapterRegionBg, CHAPTER_REGION_COUNT, BACKGROUND_IMAGES,
} from '../Assets';
import { SKILLS } from '@/balance/skills';
import { CHAPTERS } from '@/balance/stages';

describe('灵宠头像路径', () => {
  it('初始头像与觉醒头像路径', () => {
    expect(petImage('pet_007')).toBe('subpackages/pkg-pet/images/pet/pet_007.png');
    expect(petImageAwakened('pet_007')).toBe('subpackages/pkg-pet/images/pet/pet_007_s3.png');
  });

  it('★3 及以上切换觉醒灵相', () => {
    expect(PET_AWAKEN_STAR).toBe(3);
    expect(petAvatarPath('pet_001', 2)).toBe(petImage('pet_001'));
    expect(petAvatarPath('pet_001', 3)).toBe(petImageAwakened('pet_001'));
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

  it('详情秀场立绘随星级切初级/觉醒全身', () => {
    expect(petShowcaseImage('pet_001', 2)).toBe(creatureMonsterImage('pet_001', 'tier1'));
    expect(petShowcaseImage('pet_001', 3)).toBe(creatureMonsterImage('pet_001', 'tier2'));
  });
});

describe('技能图标覆盖', () => {
  /*
   * 敌技目前没有独立出图，全靠 SKILL_ICON_ALIASES 借用宠技图标。
   * 漏一条别名不会报错，只会在编队敌情/战斗预览里静默显示空圆——所以用契约兜住：
   * 每个敌技都必须解析到 pet_* 图标。等真的出了 enemy_*.png，改这条断言即可。
   */
  it('每个敌人技能都有可用图标（未出独立图前必须走别名）', () => {
    const missing = SKILLS
      .filter((s) => s.owner === 'enemy')
      .map((s) => s.id)
      .filter((id) => !resolveSkillIconId(id).startsWith('pet_'));
    expect(missing).toEqual([]);
  });
});

describe('章节地图区域背景', () => {
  it('每 4 章换一区，且覆盖全部 16 章', () => {
    const byChapter = CHAPTERS.map(chapterRegionBg);
    expect(new Set(byChapter).size).toBe(CHAPTER_REGION_COUNT);
    expect(chapterRegionBg(1)).toBe(chapterRegionBg(4));
    expect(chapterRegionBg(4)).not.toBe(chapterRegionBg(5));
    expect(chapterRegionBg(13)).toBe(chapterRegionBg(16));
  });

  it('第 1 区必须留在主包（首屏同图），其余区走 pkg-scene 以免撑爆主包', () => {
    expect(chapterRegionBg(1)).toBe(BACKGROUND_IMAGES.titleScreen);
    expect(chapterRegionBg(1).startsWith('subpackages/')).toBe(false);
    for (const ch of [5, 9, 13]) {
      expect(chapterRegionBg(ch)).toContain('subpackages/pkg-scene/');
    }
  });

  it('超出已有章节时钳到末区，不会取到 undefined 路径', () => {
    expect(chapterRegionBg(99)).toBe(chapterRegionBg(16));
    expect(chapterRegionBg(0)).toBe(chapterRegionBg(1));
  });
});
