import { afterEach, describe, expect, it } from 'vitest';

import { PET_SKINS, SKIN_AD_COST, petSkinsOf } from '@/balance/petSkins';
import { petAvatarPath, petBaseAvatarPath, petBaseShowcaseImage, petShowcaseImage } from '@/config/Assets';
import { syncEquippedPetSkins } from '@/game/equippedPetSkin';
import { buyPetSkin, equipPetSkin, noteSkinAdWatch, unequipPetSkin } from '@/game/petSkinSave';
import { initialData, parseSaveData } from '@/game/playerSave';

const SKIN = PET_SKINS.find((skin) => skin.id === 'skin_pet_003_moonvine')!;

afterEach(() => {
  syncEquippedPetSkins({});
});

describe('灵宠外观', () => {
  it('老档没有皮肤字段时当成没买过', () => {
    const data = parseSaveData({ version: 8, coins: 3 });
    expect(data.ownedSkins).toEqual([]);
    expect(data.equippedSkins).toEqual({});
    expect(data.skinAdWatched).toEqual({});
  });

  it('看满 2 次广告才入账，中间进度留着，灵玉购买会清掉进度', () => {
    const data = initialData();
    const lingyu = data.lingyu;
    expect(SKIN_AD_COST).toBe(2);
    expect(noteSkinAdWatch(data, SKIN.id)).toBe('progress');
    expect(data.skinAdWatched[SKIN.id]).toBe(1);
    expect(data.ownedSkins).toEqual([]);
    expect(data.lingyu).toBe(lingyu);
    expect(noteSkinAdWatch(data, SKIN.id)).toBe('owned');
    expect(data.ownedSkins).toEqual([SKIN.id]);
    expect(data.equippedSkins[SKIN.petId]).toBe(SKIN.id);
    expect(data.skinAdWatched[SKIN.id]).toBeUndefined();
    expect(data.lingyu).toBe(lingyu);

    const partial = initialData();
    noteSkinAdWatch(partial, SKIN.id);
    partial.lingyu = 500;
    expect(buyPetSkin(partial, SKIN.id)).toBe('ok');
    expect(partial.skinAdWatched[SKIN.id]).toBeUndefined();
    expect(partial.lingyu).toBe(0);
  });

  it('广告看到一半的档能读回来，凑够却没入账的次数读档时补发', () => {
    const halfway = parseSaveData({
      version: 9,
      skinAdWatched: { [SKIN.id]: 1, mystery: 3 },
    });
    expect(halfway.skinAdWatched).toEqual({ [SKIN.id]: 1 });

    const stuck = parseSaveData({
      version: 10,
      skinAdWatched: { [SKIN.id]: SKIN_AD_COST },
    });
    expect(stuck.ownedSkins).toContain(SKIN.id);
    expect(stuck.equippedSkins[SKIN.petId]).toBe(SKIN.id);
    expect(stuck.skinAdWatched[SKIN.id]).toBeUndefined();
  });

  it('500 灵玉买下月华藤弓并穿上，头像和立绘换成皮肤', () => {
    const data = initialData();
    data.lingyu = 500;
    expect(buyPetSkin(data, SKIN.id)).toBe('ok');
    expect(data.lingyu).toBe(0);
    expect(data.equippedSkins[SKIN.petId]).toBe(SKIN.id);
    syncEquippedPetSkins(data.equippedSkins);
    expect(petAvatarPath(SKIN.petId, 1)).toContain('skin_pet_003_portrait');
    expect(petShowcaseImage(SKIN.petId, 3)).toContain('skin_pet_003_body');
  });

  it('灵玉不够不扣费，卸下后回到原来的头像', () => {
    const data = initialData();
    data.lingyu = 499;
    expect(buyPetSkin(data, SKIN.id)).toBe('poor');
    expect(data.lingyu).toBe(499);
    data.lingyu = 500;
    buyPetSkin(data, SKIN.id);
    expect(buyPetSkin(data, SKIN.id)).toBe('already');
    expect(unequipPetSkin(data, SKIN.petId)).toBe(true);
    syncEquippedPetSkins(data.equippedSkins);
    expect(petAvatarPath(SKIN.petId, 1)).toContain('pet_003.png');
    expect(equipPetSkin(data, SKIN.id)).toBe(true);
  });

  it('穿皮肤时原貌仍按星级，选择条只出现在有皮肤的宠上', () => {
    syncEquippedPetSkins({ [SKIN.petId]: SKIN.id });
    expect(petBaseAvatarPath(SKIN.petId, 1)).toContain('/pet_003.png');
    expect(petBaseAvatarPath(SKIN.petId, 3)).toContain('pet_003_s3');
    expect(petBaseShowcaseImage(SKIN.petId, 1)).toContain('/pet_003.png');
    expect(petBaseShowcaseImage(SKIN.petId, 3)).toContain('_awakened');
    expect(petAvatarPath(SKIN.petId, 1)).toContain('skin_pet_003_portrait');
    expect(petSkinsOf(SKIN.petId).map((skin) => skin.id)).toEqual([SKIN.id]);
    expect(petSkinsOf('pet_001').map((skin) => skin.id)).toEqual(['skin_pet_001_charge']);
    expect(petSkinsOf('pet_005').map((skin) => skin.id)).toEqual(['skin_pet_005_dawn']);
    expect(petSkinsOf('pet_007').map((skin) => skin.id)).toEqual(['skin_pet_007_opera']);
    expect(petSkinsOf('pet_009').map((skin) => skin.id)).toEqual(['skin_pet_009_temple']);
    expect(petSkinsOf('pet_002')).toEqual([]);
  });
});
