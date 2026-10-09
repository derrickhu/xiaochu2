/**
 * 灵宠外观（纯数据）。
 *
 * 皮肤只换头像和详情立绘，不改属性、技能、克制。
 * 价格用灵玉，对齐单抽 100：500 = 五次单抽，买的是外观不是战力。
 * 也可以看完 SKIN_AD_COST 次广告兑换，两次之间的进度记在存档里。
 */

/** 一套外观用广告兑换需要看完的次数 */
export const SKIN_AD_COST = 2;

/** 广告按钮文案，带上已经看完的次数 */
export function skinAdLabel(watched: number): string {
  const done = Math.max(0, Math.min(SKIN_AD_COST, Math.floor(watched)));
  return `广告 ${done}/${SKIN_AD_COST}`;
}
export interface PetSkinDef {
  id: string;
  petId: string;
  name: string;
  /** 灵玉 */
  priceLingyu: number;
  /** 卡片卖点，短句 */
  tagline: string;
  blurb: string;
}

export const PET_SKINS: readonly PetSkinDef[] = [
  {
    id: 'skin_pet_001_charge',
    petId: 'pet_001',
    name: '绛云铁骑',
    priceLingyu: 500,
    tagline: '赤锦披风 · 冲锋 · 战旗',
    blurb: '裂甲铁犀的赤锦战装。只换外观，卸下后仍按星级显示原来的脸。',
  },
  {
    id: 'skin_pet_003_moonvine',
    petId: 'pet_003',
    name: '月华藤弓',
    priceLingyu: 500,
    tagline: '银月冠 · 月光箭 · 月夜礼装',
    blurb: '青藤连弩手的月夜礼装。只换外观，卸下后仍按星级显示原来的脸。',
  },
  {
    id: 'skin_pet_005_dawn',
    petId: 'pet_005',
    name: '霞羽仙鹤',
    priceLingyu: 500,
    tagline: '桃绶羽衣 · 起舞 · 丝带',
    blurb: '冰魄仙鹤的桃绶舞装。只换外观，卸下后仍按星级显示原来的脸。',
  },
  {
    id: 'skin_pet_007_opera',
    petId: 'pet_007',
    name: '墨金舞狐',
    priceLingyu: 500,
    tagline: '墨金戏袍 · 跃起 · 折扇',
    blurb: '炽羽火狐的墨金戏装。只换外观，卸下后仍按星级显示原来的脸。',
  },
  {
    id: 'skin_pet_009_temple',
    petId: 'pet_009',
    name: '朱漆神将',
    priceLingyu: 500,
    tagline: '朱漆神甲 · 踏步 · 披风',
    blurb: '磐石守卫的朱漆神甲。只换外观，卸下后仍按星级显示原来的脸。',
  },
];

export const PET_SKIN_MAP: ReadonlyMap<string, PetSkinDef> = new Map(
  PET_SKINS.map((skin) => [skin.id, skin]),
);

export function petSkinById(id: string): PetSkinDef | null {
  return PET_SKIN_MAP.get(id) ?? null;
}

/** 这只灵宠在商店里卖的外观。没有的宠不出现选择条。 */
export function petSkinsOf(petId: string): readonly PetSkinDef[] {
  return PET_SKINS.filter((skin) => skin.petId === petId);
}
