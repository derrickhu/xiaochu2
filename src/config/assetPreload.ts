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
  UI_SHOP_IMAGES,
  UI_SCENE_IMAGES,
  UI_PANEL_IMAGES,
  UI_BATTLE_IMAGES,
  RARITY_BADGE_IMAGES,
  battleBgImage,
  enemyImage,
  petAvatarLoadPaths,
  petFrameImage,
} from '@/config/Assets';
import { loadSubpackagesForPaths } from '@/config/Subpackages';
import { preloadPetAvatarTextures } from '@/config/petAvatarTexture';

/** 灵宠池系页面共用壳（背景 + 标题匾） */
export const PET_POOL_SHELL_IMAGES: readonly string[] = [
  BACKGROUND_IMAGES.petPool,
  UI_IMAGES.titlePlaque,
  UI_IMAGES.rarityBadgeSheet,
  ...Object.values(RARITY_BADGE_IMAGES),
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
  BACKGROUND_IMAGES.shop,
  UI_IMAGES.titlePlaque,
  UI_IMAGES.rarityBadgeSheet,
  ...Object.values(RARITY_BADGE_IMAGES),
  ...Object.values(UI_SHOP_IMAGES),
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

export interface PetAvatarPreloadEntry {
  petId: string;
  star?: number;
}

/** 图鉴：全部灵宠头像（已拥有用当前星级） */
export function codexPetAvatarEntries(): PetAvatarPreloadEntry[] {
  return PETS.map((pet) => ({
    petId: pet.id,
    star: PlayerData.isOwned(pet.id) ? PlayerData.petStar(pet.id) : 1,
  }));
}

/** 编队页：已拥有灵宠 + 可选本关敌人 */
export function teamPreloadImages(stageId?: string): readonly string[] {
  const paths = [...TEAM_SHELL_IMAGES];
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

export function teamPetAvatarEntries(): PetAvatarPreloadEntry[] {
  return PlayerData.ownedPets.map((id) => ({
    petId: id,
    star: PlayerData.petStar(id),
  }));
}

/** 战斗页：本关背景 + 本关敌人 + 上阵灵宠（棋盘/珠子已在主包预加载） */
export function battlePreloadImages(stageId: string, teamPetIds: readonly string[]): readonly string[] {
  const stage = STAGE_MAP.get(stageId) ?? STAGES[0];
  const paths: string[] = [
    ...Object.values(BOARD_IMAGES),
    ...Object.values(ORB_IMAGES),
    ...Object.values(PET_FRAME_IMAGES),
    ...Object.values(UI_BATTLE_IMAGES),
    UI_PANEL_IMAGES.battleVictory,
    battleBgImage(stage.element),
  ];
  for (const ref of stage.encounters) {
    const { def } = resolveEncounter(ref);
    paths.push(def.image ?? enemyImage(def.id));
  }
  return unique(paths);
}

export function battlePetAvatarEntries(stageId: string, teamPetIds: readonly string[]): PetAvatarPreloadEntry[] {
  const entries: PetAvatarPreloadEntry[] = teamPetIds.map((id) => ({
    petId: id,
    star: PlayerData.petStar(id),
  }));
  const table = getDropTable((STAGE_MAP.get(stageId) ?? STAGES[0]).dropTableId);
  if (table) {
    for (const drop of table.shards) {
      entries.push({ petId: drop.petId, star: 1 });
    }
  }
  return entries;
}

/** 召唤页：壳 + 全部普通头像（抽卡 reveal 用） */
export function gachaPreloadImages(): readonly string[] {
  return [...GACHA_SHELL_IMAGES];
}

export function gachaPetAvatarEntries(): PetAvatarPreloadEntry[] {
  return PETS.map((pet) => ({ petId: pet.id, star: 1 }));
}

/** 商店页：壳 + 全部普通头像 */
export function shopPreloadImages(): readonly string[] {
  return [...SHOP_SHELL_IMAGES];
}

export function shopPetAvatarEntries(): PetAvatarPreloadEntry[] {
  return PlayerData.ownedPets.map((petId) => ({
    petId,
    star: PlayerData.petStar(petId),
  }));
}

/** 灵宠详情：壳 + 当前灵宠头像与相框 */
export function petDetailPreloadImages(petId: string): readonly string[] {
  const pet = PET_MAP.get(petId);
  const paths = [...PET_DETAIL_SHELL_IMAGES];
  if (pet) {
    paths.push(petFrameImage(pet.element));
  }
  return unique(paths);
}

export function petDetailAvatarEntry(petId: string): PetAvatarPreloadEntry | null {
  if (!PET_MAP.has(petId)) return null;
  return { petId, star: PlayerData.petStar(petId) };
}

/** 主界面：预加载编队队长头像（地图「从这里出发」标记） */
export function titleLeadPetAvatarEntry(): PetAvatarPreloadEntry | null {
  const lead = PlayerData.team[0];
  if (!lead) return null;
  return { petId: lead, star: PlayerData.petStar(lead) };
}

/** 预加载灵宠头像（含 ID 迁移 fallback + 限并发） */
export async function ensurePetAvatars(entries: readonly PetAvatarPreloadEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const paths = entries.flatMap(({ petId, star = 1 }) => [...petAvatarLoadPaths(petId, star)]);
  await loadSubpackagesForPaths(paths);
  await preloadPetAvatarTextures(entries);
}
