/**
 * 场景按需预加载（避免首进拉全表 enemy/pet 纹理）。
 *
 * 配合 SubpackageWarmup：首页后台下载分包，进场景只 preload 本屏所需路径。
 */
import { getDropTable } from '@/balance/drops';
import { resolveEncounter } from '@/balance/enemies';
import { PET_MAP, PETS } from '@/balance/pets';
import { STAGE_MAP, STAGES, CHAPTER_REWARD_PET } from '@/balance/stages';
import { PlayerData } from '@/game/PlayerData';
import {
  BACKGROUND_IMAGES,
  BOARD_IMAGES,
  ORB_IMAGES,
  PET_FRAME_IMAGES,
  ENEMY_PORTRAIT_FRAME,
  UI_FX_IMAGES,
  UI_IMAGES,
  UI_SHOP_IMAGES,
  UI_CODEX_IMAGES,
  UI_SCENE_IMAGES,
  UI_PANEL_IMAGES,
  UI_BATTLE_IMAGES,
  RARITY_PET_CARD_IMAGES,
  RARITY_BADGE_IMAGES,
  COMBO_TEXT_PATHS,
  battleBgImage,
  enemyImage,
  petAvatarLoadPaths,
  petFrameImage,
  petShowcaseImage,
  petShowcaseLoadPaths,
  skillIconImage,
  passiveIconImage,
} from '@/config/Assets';
import { resolvePetPassiveBundle } from '@/balance/passiveEffects';
import { loadSubpackagesForPaths } from '@/config/Subpackages';
import { preloadPetAvatarTextures } from '@/config/petAvatarTexture';
import { CdnAssetService } from '@/core/CdnAssetService';

/** 灵宠池系页面共用壳（背景 + 标题匾） */
export const PET_POOL_SHELL_IMAGES: readonly string[] = [
  BACKGROUND_IMAGES.petPool,
  UI_IMAGES.titlePlaque,
  UI_IMAGES.iconStatHp,
  UI_IMAGES.iconStatAtk,
  UI_IMAGES.iconStatRcv,
  UI_IMAGES.rarityBadgeSheet,
  ...Object.values(RARITY_BADGE_IMAGES),
];

export const CODEX_SHELL_IMAGES: readonly string[] = [
  BACKGROUND_IMAGES.codex,
  ...PET_POOL_SHELL_IMAGES.filter((p) => p !== BACKGROUND_IMAGES.petPool),
  ...Object.values(RARITY_PET_CARD_IMAGES),
  ...Object.values(UI_CODEX_IMAGES),
  UI_IMAGES.iconExp,
  UI_IMAGES.iconCoin,
  UI_IMAGES.iconLingyu,
  UI_BATTLE_IMAGES.petStar,
];

export const TEAM_SHELL_IMAGES: readonly string[] = [
  ...PET_POOL_SHELL_IMAGES,
  UI_SCENE_IMAGES.petCardTeamRow,
  UI_IMAGES.btnPlateSuccess,
  UI_IMAGES.btnPlateCream,
  UI_IMAGES.btnPlateGold,
  UI_IMAGES.teamPedestalStone,
  UI_IMAGES.teamPedestalGold,
  UI_IMAGES.teamLeaderRibbon,
  UI_IMAGES.iconStatHp,
  UI_IMAGES.iconStatAtk,
  UI_BATTLE_IMAGES.petStar,
  ...Object.values(PET_FRAME_IMAGES),
];

export const GACHA_SHELL_IMAGES: readonly string[] = [
  BACKGROUND_IMAGES.gachaEgg,
  UI_IMAGES.titlePlaque,
  UI_IMAGES.textBanner,
  UI_IMAGES.modalTitlePlaque,
  UI_IMAGES.btnPlateGold,
  UI_IMAGES.btnPlateCream,
  UI_IMAGES.btnPlateSuccess,
  UI_IMAGES.progressFrame,
  UI_IMAGES.iconLingyu,
  UI_IMAGES.iconStatHp,
  UI_IMAGES.iconStatAtk,
  UI_IMAGES.iconStatRcv,
  UI_IMAGES.rarityBadgeSheet,
  UI_IMAGES.gachaResultCard,
  UI_IMAGES.gachaResultNameBand,
  UI_IMAGES.gachaResultComparePanel,
  UI_IMAGES.gachaResultNewBadge,
  UI_IMAGES.gachaShardCrystal,
  UI_IMAGES.gachaShardAvatarFrame,
  ...Object.values(RARITY_BADGE_IMAGES),
  UI_FX_IMAGES.lightPillar,
  UI_FX_IMAGES.summonCircle,
  UI_FX_IMAGES.starburst,
  UI_FX_IMAGES.auraRing,
  UI_FX_IMAGES.particleSpark,
  UI_FX_IMAGES.gachaRays,
  UI_FX_IMAGES.gachaPetal,
];

/**
 * 商店首屏壳层（仅当前双列页实际用到的贴图）。
 * 勿再 Object.values 全量：只预热壳层实际用到的键；废弃匾/行板已迁 game_assets/bak_shop_unused_*。
 */
export const SHOP_SHELL_IMAGES: readonly string[] = [
  BACKGROUND_IMAGES.shop,
  UI_IMAGES.rarityBadgeSheet,
  ...Object.values(RARITY_BADGE_IMAGES),
  UI_SHOP_IMAGES.coinPill,
  UI_SHOP_IMAGES.buyPanel,
  UI_SHOP_IMAGES.cardPanel,
  UI_SHOP_IMAGES.tabOn,
  UI_SHOP_IMAGES.tabOff,
  UI_SHOP_IMAGES.tabIconShard,
  UI_SHOP_IMAGES.tabIconHonor,
  UI_SHOP_IMAGES.tabIconRealm,
  UI_SHOP_IMAGES.tabIconLingyu,
  UI_FX_IMAGES.particleSpark,
];

export const PET_DETAIL_SHELL_IMAGES: readonly string[] = [
  /** 与灵宠图鉴/编队页共用 scene_pet_pool，详情页视觉连贯 */
  BACKGROUND_IMAGES.petPool,
  UI_IMAGES.titlePlaque,
  UI_IMAGES.btnPlateCream,
  UI_IMAGES.btnPlateSuccess,
  UI_IMAGES.iconStatHp,
  UI_IMAGES.iconStatAtk,
  UI_IMAGES.iconStatRcv,
  UI_BATTLE_IMAGES.petStar,
  ENEMY_PORTRAIT_FRAME,
  ...Object.values(ORB_IMAGES),
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

/** 图鉴：全部灵宠头像（已拥有优先，用当前星级）—— 真机 CDN 并发有限，先保可见卡 */
export function codexPetAvatarEntries(): PetAvatarPreloadEntry[] {
  const owned = new Set(PlayerData.ownedPets);
  const toEntry = (pet: (typeof PETS)[number]): PetAvatarPreloadEntry => ({
    petId: pet.id,
    star: owned.has(pet.id) ? PlayerData.petStar(pet.id) : 1,
  });
  return [
    ...PETS.filter((p) => owned.has(p.id)).map(toEntry),
    ...PETS.filter((p) => !owned.has(p.id)).map(toEntry),
  ];
}

/** 编队页：已拥有灵宠 + 可选本关敌人（含敌技图标） */
export function teamPreloadImages(stageId?: string): readonly string[] {
  const paths = [...TEAM_SHELL_IMAGES];
  for (const petId of PlayerData.team) {
    paths.push(...petShowcaseLoadPaths(petId, PlayerData.petStar(petId)));
  }
  if (stageId) {
    const stage = STAGE_MAP.get(stageId);
    if (stage) {
      for (const ref of stage.encounters) {
        const { def } = resolveEncounter(ref);
        paths.push(def.image ?? enemyImage(def.id));
        for (const sid of def.skillIds ?? []) {
          paths.push(skillIconImage(sid));
        }
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
    // 连击「连击」+ 数字全档色（不在 UI_BATTLE_IMAGES 常量字段里，需显式并入）
    ...COMBO_TEXT_PATHS,
    UI_PANEL_IMAGES.battleVictory,
    UI_PANEL_IMAGES.battleVictoryPeek,
    UI_PANEL_IMAGES.battleDefeatMascot,
    battleBgImage(stage.element),
  ];
  for (const ref of stage.encounters) {
    const { def } = resolveEncounter(ref);
    paths.push(def.image ?? enemyImage(def.id));
  }
  for (const petId of teamPetIds) {
    const pet = PET_MAP.get(petId);
    if (pet) paths.push(skillIconImage(pet.skillId));
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

/** 灵宠详情：壳 + 全身立绘框 + 当前宠秀场立绘 + 技能图标 */
export function petDetailPreloadImages(petId: string, starOverride?: number): readonly string[] {
  const pet = PET_MAP.get(petId);
  const paths = [...PET_DETAIL_SHELL_IMAGES];
  if (pet) {
    const star = starOverride ?? PlayerData.petStar(petId);
    paths.push(petShowcaseImage(petId, star), skillIconImage(pet.skillId));
    const lines = resolvePetPassiveBundle(pet.role, pet.rarity, star, { includeStarInDisplay: true }).displayLines;
    for (const line of lines) {
      if (line.iconKey) paths.push(passiveIconImage(line.iconKey));
    }
  }
  return unique(paths);
}

/** @deprecated 详情页已改秀场立绘，保留给旧调用方 */
export function petDetailAvatarEntry(petId: string): PetAvatarPreloadEntry | null {
  if (!PET_MAP.has(petId)) return null;
  return { petId, star: PlayerData.petStar(petId) };
}

/** 主界面：编队队长头像 + 本章守关灵宠（Boss 节点） */
export function titleHomePetAvatarEntries(chapter: number): PetAvatarPreloadEntry[] {
  const entries: PetAvatarPreloadEntry[] = [];
  const lead = PlayerData.team[0];
  if (lead && PET_MAP.has(lead)) {
    entries.push({ petId: lead, star: PlayerData.petStar(lead) });
  }
  const bossPetId = CHAPTER_REWARD_PET[chapter];
  if (bossPetId && PET_MAP.has(bossPetId) && bossPetId !== lead) {
    entries.push({ petId: bossPetId, star: 1 });
  }
  return entries;
}

/** @deprecated 用 titleHomePetAvatarEntries */
export function titleLeadPetAvatarEntry(): PetAvatarPreloadEntry | null {
  const lead = PlayerData.team[0];
  if (!lead) return null;
  return { petId: lead, star: PlayerData.petStar(lead) };
}

/** 预加载灵宠头像（CDN 先下 + 分包 + 纹理解码；entries 顺序即优先级） */
export async function ensurePetAvatars(entries: readonly PetAvatarPreloadEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const paths = entries.flatMap(({ petId, star = 1 }) => [...petAvatarLoadPaths(petId, star)]);
  await Promise.all([
    CdnAssetService.preloadPaths(paths).catch((e) => {
      console.warn('[ensurePetAvatars] CDN 预热失败', e);
    }),
    loadSubpackagesForPaths(paths).catch((e) => {
      console.warn('[ensurePetAvatars] 分包加载失败', e);
    }),
  ]);
  await preloadPetAvatarTextures(entries);
}
