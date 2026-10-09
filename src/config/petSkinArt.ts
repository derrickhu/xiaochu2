import { SUBPACKAGE_ROOT } from '@/config/Subpackages';

/** 皮肤图在 pkg-shop，随包，不走 CDN。 */
const SHOP = `${SUBPACKAGE_ROOT.shop}/images/ui/shop`;

export interface PetSkinArt {
  portrait: string;
  body: string;
}

export const PET_SKIN_ART: Readonly<Record<string, PetSkinArt>> = {
  skin_pet_001_charge: {
    portrait: `${SHOP}/skin_pet_001_portrait.png`,
    body: `${SHOP}/skin_pet_001_body.png`,
  },
  skin_pet_003_moonvine: {
    portrait: `${SHOP}/skin_pet_003_portrait.png`,
    body: `${SHOP}/skin_pet_003_body.png`,
  },
  skin_pet_005_dawn: {
    portrait: `${SHOP}/skin_pet_005_portrait.png`,
    body: `${SHOP}/skin_pet_005_body.png`,
  },
  skin_pet_007_opera: {
    portrait: `${SHOP}/skin_pet_007_portrait.png`,
    body: `${SHOP}/skin_pet_007_body.png`,
  },
  skin_pet_009_temple: {
    portrait: `${SHOP}/skin_pet_009_portrait.png`,
    body: `${SHOP}/skin_pet_009_body.png`,
  },
};

export function petSkinArt(skinId: string): PetSkinArt | null {
  return PET_SKIN_ART[skinId] ?? null;
}

export function petSkinArtPaths(): readonly string[] {
  return Object.values(PET_SKIN_ART).flatMap((art) => [art.portrait, art.body]);
}
