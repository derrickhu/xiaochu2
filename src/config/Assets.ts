/**
 * 图片资源路径映射表（单一真源）
 *
 * 主包：board / orb / scene_home / 基础 UI
 * 分包：见 config/Subpackages.ts（构建后由 scripts/organize-subpackages.mjs 整理目录）
 */
import type { Element, OrbType } from '@/balance/combat';
import {
  creatureUsesCrSubpackage,
  legacyCreatureId,
  migrateCreatureId,
} from '@/balance/creatureIdMigration';
import { SUBPACKAGE_ROOT } from '@/config/Subpackages';

const IMG = 'images';
const PKG = SUBPACKAGE_ROOT;

/** 灵宠五行相框（主包） */
export const PET_FRAME_IMAGES: Readonly<Record<Element, string>> = {
  metal: `${IMG}/ui/frame/pet_metal.png`,
  wood: `${IMG}/ui/frame/pet_wood.png`,
  water: `${IMG}/ui/frame/pet_water.png`,
  fire: `${IMG}/ui/frame/pet_fire.png`,
  earth: `${IMG}/ui/frame/pet_earth.png`,
};

export function petFrameImage(element: Element): string {
  return PET_FRAME_IMAGES[element];
}

/** 棋盘格贴图（主包） */
export const BOARD_IMAGES = {
  dark: `${IMG}/board/tile_dark.jpg`,
  light: `${IMG}/board/tile_light.jpg`,
} as const;

/** 消除珠贴图（主包） */
export const ORB_IMAGES: Readonly<Record<OrbType, string>> = {
  metal: `${IMG}/orb/orb_metal.png`,
  wood: `${IMG}/orb/orb_wood.png`,
  water: `${IMG}/orb/orb_water.png`,
  fire: `${IMG}/orb/orb_fire.png`,
  earth: `${IMG}/orb/orb_earth.png`,
  heart: `${IMG}/orb/orb_heart.png`,
};

/** 敌人立绘根目录（pet_011+ 收录怪单独分包） */
function enemyImageRoot(id: string): string {
  const pkg = creatureUsesCrSubpackage(id) ? PKG.enemyCr : PKG.enemy;
  return `${pkg}/images/enemy`;
}

/** 敌人立绘（pkg-enemy / pkg-enemy-cr） */
export function enemyImage(enemyId: string): string {
  return `${enemyImageRoot(enemyId)}/${enemyId}.png`;
}

/** ★4 及以上使用觉醒灵相头像（*_s3.png） */
export const PET_AWAKEN_STAR = 4;

function canonicalCreatureId(id: string): string {
  return migrateCreatureId(id) ?? id;
}

/** 灵宠初始头像（pkg-pet） */
export function petImage(petId: string): string {
  return `${PKG.pet}/images/pet/${canonicalCreatureId(petId)}.png`;
}

/** 灵宠觉醒头像（pkg-pet） */
export function petImageAwakened(petId: string): string {
  return `${PKG.pet}/images/pet/${canonicalCreatureId(petId)}_s3.png`;
}

/**
 * 预加载候选路径：新 ID 文件名 + 旧 ID 文件名（迁移过渡期，见 scripts/rename-creature-assets.mjs）
 */
export function petAvatarLoadPaths(petId: string, star = 1): readonly string[] {
  const id = canonicalCreatureId(petId);
  const primary = star >= PET_AWAKEN_STAR ? petImageAwakened(id) : petImage(id);
  const legacy = legacyCreatureId(id);
  if (!legacy) return [primary];
  const suffix = star >= PET_AWAKEN_STAR ? '_s3' : '';
  const fallback = `${PKG.pet}/images/pet/${legacy}${suffix}.png`;
  return fallback === primary ? [primary] : [primary, fallback];
}

export function petAvatarPath(petId: string, star = 1): string {
  return star >= PET_AWAKEN_STAR ? petImageAwakened(petId) : petImage(petId);
}

export function creaturePetAvatar(creatureId: string, star = 1): string {
  return petAvatarPath(creatureId, star);
}

export function creatureMonsterImage(creatureId: string, tier: 'tier1' | 'tier2'): string {
  const root = enemyImageRoot(creatureId);
  return tier === 'tier2'
    ? `${root}/${creatureId}_awakened.png`
    : `${root}/${creatureId}.png`;
}

/** 章节路径地图 UI（主包） */
export const MAP_UI_IMAGES = {
  nodesSheet: `${IMG}/ui/map/nodes_sheet.png`,
} as const;

/** 场景背景 */
export const BACKGROUND_IMAGES = {
  home: `${IMG}/bg/scene_home.jpg`,
  /** 首屏全屏背景（9:16，含顶栏区域 + 章节路径） */
  titleScreen: `${IMG}/bg/title_screen.jpg`,
  /** 与 titleScreen 同源 */
  chapterMap: `${IMG}/bg/title_screen.jpg`,
  petDetail: `${PKG.scene}/images/bg/scene_pet_detail.jpg`,
  petPool: `${PKG.scene}/images/bg/scene_pet_pool.jpg`,
} as const;

/** 战斗背景（pkg-scene） */
export const BATTLE_BG_IMAGES: Readonly<Record<Element, string>> = {
  metal: `${PKG.scene}/images/bg/battle_metal.jpg`,
  wood: `${PKG.scene}/images/bg/battle_wood.jpg`,
  water: `${PKG.scene}/images/bg/battle_water.jpg`,
  fire: `${PKG.scene}/images/bg/battle_fire.jpg`,
  earth: `${PKG.scene}/images/bg/battle_earth.jpg`,
};

export function battleBgImage(element: Element): string {
  return BATTLE_BG_IMAGES[element];
}

/** 主包 UI 贴图 */
export const UI_IMAGES = {
  titleLogo: `${IMG}/ui/logo/title.png`,
  navBar: `${IMG}/ui/bar/nav_bottom.png`,
  navPet: `${IMG}/ui/icon/nav_pet.png`,
  navTeam: `${IMG}/ui/icon/nav_team.png`,
  iconCoin: `${IMG}/ui/icon/currency_coin.png`,
  iconExp: `${IMG}/ui/icon/currency_exp.png`,
  iconLingyu: `${IMG}/ui/icon/currency_lingyu.png`,
  iconRecruit: `${IMG}/ui/icon/action_recruit.png`,
  titlePlaque: `${IMG}/ui/plaque/title.png`,
} as const;

/** 战斗/UI 面板（主包） */
export const UI_PANEL_IMAGES = {
  battleVictory: `${IMG}/ui/panel/battle_victory.png`,
} as const;

/** 场景卡片 UI（pkg-scene） */
export const UI_SCENE_IMAGES = {
  petCardPortrait: `${PKG.scene}/images/ui/card/pet_portrait.png`,
  petCardTeamRow: `${PKG.scene}/images/ui/card/pet_team_row.png`,
} as const;

/** UI 特效（pkg-fx） */
export const UI_FX_IMAGES = {
  lightPillar: `${PKG.fx}/images/ui/fx/fx_light_pillar.png`,
  summonCircle: `${PKG.fx}/images/ui/fx/fx_summon_circle.png`,
  starburst: `${PKG.fx}/images/ui/fx/fx_starburst.png`,
  auraRing: `${PKG.fx}/images/ui/fx/fx_aura_ring.png`,
  particleSpark: `${PKG.fx}/images/ui/fx/p_spark.png`,
} as const;

/** 启动主包预加载（Title + 导航 + 棋盘珠） */
export const MAIN_PRELOAD_IMAGES: readonly string[] = [
  BOARD_IMAGES.dark,
  BOARD_IMAGES.light,
  BACKGROUND_IMAGES.home,
  BACKGROUND_IMAGES.titleScreen,
  ...Object.values(MAP_UI_IMAGES),
  ...Object.values(UI_IMAGES),
  ...Object.values(UI_PANEL_IMAGES),
  ...Object.values(PET_FRAME_IMAGES),
  ...Object.values(ORB_IMAGES),
];
