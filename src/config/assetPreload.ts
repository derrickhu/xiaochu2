/**
 * 场景按需预加载（避免首进拉全表 enemy/pet 纹理）。
 *
 * 配合 SubpackageWarmup：首页后台下载分包，进场景只 preload 本屏所需路径。
 */
import { getDropTable } from '@/balance/drops';
import { resolveEncounter } from '@/balance/enemies';
import { PET_MAP, PETS } from '@/balance/pets';
import { STAGE_MAP, STAGES } from '@/balance/stages';
import { PlayerData } from '@/game/PlayerData';
import {
  BACKGROUND_IMAGES,
  BOARD_IMAGES,
  ORB_IMAGES,
  PET_FRAME_IMAGES,
  UI_FX_IMAGES,
  UI_IMAGES,
  UI_SCENE_IMAGES,
  battleBgImage,
  enemyImage,
  petAvatarPath,
  petFrameImage,
  petImage,
} from '@/config/Assets';

/** 灵宠池系页面共用壳（背景 + 标题匾） */
export const PET_POOL_SHELL_IMAGES: readonly string[] = [
  BACKGROUND_IMAGES.petPool,
  UI_IMAGES.titlePlaque,
];

export const CODEX_SHELL_IMAGES: readonly string[] = [
  ...PET_POOL_SHELL_IMAGES,
  UI_SCENE_IMAGES.petCardPortrait,
];

export const TEAM_SHELL_IMAGES: readonly string[] = [
  ...PET_POOL_SHELL_IMAGES,
  UI_SCENE_IMAGES.petCardTeamRow,
];

export const GACHA_SHELL_IMAGES: readonly string[] = [
  ...PET_POOL_SHELL_IMAGES,
  UI_FX_IMAGES.lightPillar,
  UI_FX_IMAGES.summonCircle,
  UI_FX_IMAGES.starburst,
  UI_FX_IMAGES.auraRing,
  UI_FX_IMAGES.particleSpark,
];

export const SHOP_SHELL_IMAGES: readonly string[] = [
  ...PET_POOL_SHELL_IMAGES,
  UI_FX_IMAGES.particleSpark,
];

export const PET_DETAIL_SHELL_IMAGES: readonly string[] = [
  BACKGROUND_IMAGES.petDetail,
  UI_IMAGES.titlePlaque,
  UI_FX_IMAGES.starburst,
  UI_FX_IMAGES.auraRing,
  UI_FX_IMAGES.particleSpark,
];

function unique(paths: Iterable<string>): string[] {
  return [...new Set(paths)];
}

/** 图鉴列表：已拥有用当前星级头像，其余只用普通头像 */
export function codexPetPreloadImages(): readonly string[] {
  const paths: string[] = [];
  for (const pet of PETS) {
    if (PlayerData.isOwned(pet.id)) {
      paths.push(petAvatarPath(pet.id, PlayerData.petStar(pet.id)));
    } else {
      paths.push(petImage(pet.id));
    }
  }
  return paths;
}

/** 编队页：已拥有灵宠 + 可选本关敌人 */
export function teamPreloadImages(stageId?: string): readonly string[] {
  const paths = [...TEAM_SHELL_IMAGES];
  for (const id of PlayerData.ownedPets) {
    paths.push(petAvatarPath(id, PlayerData.petStar(id)));
  }
  if (stageId) {
    const stage = STAGE_MAP.get(stageId);
    if (stage) {
      for (const ref of stage.encounters) {
        const { def } = resolveEncounter(ref);
        paths.push(def.image ?? enemyImage(def.id));
      }
    }
  }
  return unique(paths);
}

/** 战斗页：本关背景 + 本关敌人 + 上阵灵宠（棋盘/珠子已在主包预加载） */
export function battlePreloadImages(stageId: string, teamPetIds: readonly string[]): readonly string[] {
  const stage = STAGE_MAP.get(stageId) ?? STAGES[0];
  const paths: string[] = [
    ...Object.values(BOARD_IMAGES),
    ...Object.values(ORB_IMAGES),
    ...Object.values(PET_FRAME_IMAGES),
    battleBgImage(stage.element),
  ];
  for (const ref of stage.encounters) {
    const { def } = resolveEncounter(ref);
    paths.push(def.image ?? enemyImage(def.id));
  }
  for (const id of teamPetIds) {
    paths.push(petAvatarPath(id, PlayerData.petStar(id)));
  }
  const table = getDropTable(stage.dropTableId);
  if (table) {
    for (const drop of table.shards) {
      paths.push(petAvatarPath(drop.petId, 1));
    }
  }
  return unique(paths);
}

/** 召唤页：壳 + 全部普通头像（抽卡 reveal 用） */
export function gachaPreloadImages(): readonly string[] {
  return unique([...GACHA_SHELL_IMAGES, ...PETS.map((p) => petImage(p.id))]);
}

/** 商店页：壳 + 全部普通头像 */
export function shopPreloadImages(): readonly string[] {
  return unique([...SHOP_SHELL_IMAGES, ...PETS.map((p) => petImage(p.id))]);
}

/** 灵宠详情：壳 + 当前灵宠头像与相框 */
export function petDetailPreloadImages(petId: string): readonly string[] {
  const pet = PET_MAP.get(petId);
  const paths = [...PET_DETAIL_SHELL_IMAGES];
  if (pet) {
    paths.push(petFrameImage(pet.element));
    paths.push(petAvatarPath(petId, PlayerData.petStar(petId)));
  }
  return unique(paths);
}
