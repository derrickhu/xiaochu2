/**
 * 图片资源路径映射表（单一真源）
 *
 * ## 目录与命名规范（minigame/images/）
 *
 * | 目录 | 用途 | 文件名规则 | 示例 |
 * |------|------|-----------|------|
 * | bg/ | 场景全屏背景 | scene_{场景}.jpg | scene_home.jpg |
 * | board/ | 棋盘格底 | tile_{dark\|light}.jpg | tile_dark.jpg |
 * | orb/ | 消除珠 | orb_{element}.png | orb_metal.png |
 * | pet/ | 灵宠头像 | {pets.id}.png / {pets.id}_s3.png（★4 觉醒灵相） | pet_fire_003.png |
 * | enemy/ | 敌人立绘 | {enemies.id}.png | enemy_slime_wood.png |
 * | ui/icon/ | 图标（导航/货币/操作） | {类别}_{名称}.png | nav_pet, currency_coin |
 * | ui/frame/ | 相框/边框 | pet_{element}.png | pet_metal.png |
 * | ui/card/ | 卡片底图 | {用途}.png | pet_portrait, pet_team_row |
 * | ui/bar/ | 条形容器 | {用途}.png | nav_bottom |
 * | ui/logo/ | Logo | {名称}.png | title |
 * | ui/plaque/ | 标题匾 | {名称}.png | title |
 *
 * 新增资源：按上表目录 + 命名放入，再在本文件注册常量；禁止场景内硬编码路径。
 * 灵宠/敌人贴图文件名必须与 balance 表 id 一致，便于 petImage()/enemyImage() 自动解析。
 */
import type { Element, OrbType } from '@/balance/combat';
import { PETS } from '@/balance/pets';
import { ENEMIES } from '@/balance/enemies';
import { CREATURES } from '@/balance/creatures';

const IMG = 'images';

/** 灵宠五行相框 */
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

/** 棋盘格贴图（深浅交替铺格） */
export const BOARD_IMAGES = {
  dark: `${IMG}/board/tile_dark.jpg`,
  light: `${IMG}/board/tile_light.jpg`,
} as const;

/** 消除珠贴图 */
export const ORB_IMAGES: Readonly<Record<OrbType, string>> = {
  metal: `${IMG}/orb/orb_metal.png`,
  wood: `${IMG}/orb/orb_wood.png`,
  water: `${IMG}/orb/orb_water.png`,
  fire: `${IMG}/orb/orb_fire.png`,
  earth: `${IMG}/orb/orb_earth.png`,
  heart: `${IMG}/orb/orb_heart.png`,
};

/** 敌人立绘（路径 = enemy/{enemies.id}.png） */
export function enemyImage(enemyId: string): string {
  return `${IMG}/enemy/${enemyId}.png`;
}

/** 灵宠初始头像（路径 = pet/{pets.id}.png） */
export function petImage(petId: string): string {
  return `${IMG}/pet/${petId}.png`;
}

/** 灵宠觉醒头像（路径 = pet/{pets.id}_s3.png，素材源自 xiao_chu 同位灵兽） */
export function petImageAwakened(petId: string): string {
  return `${IMG}/pet/${petId}_s3.png`;
}

/**
 * ★4 灵相觉醒阈值（对齐 xiao_chu getPetAvatarPath）。
 * 达成后战斗/编队/图鉴/详情等全场景切换觉醒头像。
 */
export const PET_AWAKEN_STAR = 4;

/** 按养成星级选取头像路径 */
export function petAvatarPath(petId: string, star = 1): string {
  return star >= PET_AWAKEN_STAR ? petImageAwakened(petId) : petImage(petId);
}

/**
 * 生物宠物面头像（与 petAvatarPath 同义，语义化别名）：初始/觉醒头像按 star 切换。
 */
export function creaturePetAvatar(creatureId: string, star = 1): string {
  return petAvatarPath(creatureId, star);
}

/**
 * 生物怪物面全身立绘：tier1 初级 = enemy/{id}.png，tier2 高级 = enemy/{id}_awakened.png。
 */
export function creatureMonsterImage(creatureId: string, tier: 'tier1' | 'tier2'): string {
  return tier === 'tier2'
    ? `${IMG}/enemy/${creatureId}_awakened.png`
    : `${IMG}/enemy/${creatureId}.png`;
}

/** 场景背景 */
export const BACKGROUND_IMAGES = {
  home: `${IMG}/bg/scene_home.jpg`,
  petDetail: `${IMG}/bg/scene_pet_detail.jpg`,
  petPool: `${IMG}/bg/scene_pet_pool.jpg`,
} as const;

/** 战斗敌人区背景（按敌人五行属性匹配） */
export const BATTLE_BG_IMAGES: Readonly<Record<Element, string>> = {
  metal: `${IMG}/bg/battle_metal.jpg`,
  wood: `${IMG}/bg/battle_wood.jpg`,
  water: `${IMG}/bg/battle_water.jpg`,
  fire: `${IMG}/bg/battle_fire.jpg`,
  earth: `${IMG}/bg/battle_earth.jpg`,
};

export function battleBgImage(element: Element): string {
  return BATTLE_BG_IMAGES[element];
}

/** UI 贴图（框架/图标/卡片） */
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
  petCardPortrait: `${IMG}/ui/card/pet_portrait.png`,
  petCardTeamRow: `${IMG}/ui/card/pet_team_row.png`,
} as const;

/**
 * UI 特效贴图（光效/粒子）。
 * 均为纯黑底，引擎用叠加（ADD）混合呈现，黑色即透明，无需抠图。
 * 光柱/法阵/星爆/光环用于抽卡演出；粒子点/星芒供 SceneFx 通用粒子复用。
 */
export const UI_FX_IMAGES = {
  lightPillar: `${IMG}/ui/fx/fx_light_pillar.png`,
  summonCircle: `${IMG}/ui/fx/fx_summon_circle.png`,
  starburst: `${IMG}/ui/fx/fx_starburst.png`,
  auraRing: `${IMG}/ui/fx/fx_aura_ring.png`,
  particleSpark: `${IMG}/ui/fx/p_spark.png`,
} as const;

/** 启动时需要预加载的资源 */
export const PRELOAD_IMAGES: readonly string[] = [
  BOARD_IMAGES.dark,
  BOARD_IMAGES.light,
  BACKGROUND_IMAGES.home,
  UI_FX_IMAGES.particleSpark,
  ...Object.values(UI_IMAGES),
  ...Object.values(ORB_IMAGES),
  ...Object.values(PET_FRAME_IMAGES),
  ...ENEMIES.map((e) => enemyImage(e.id)),
  ...PETS.map((p) => petImage(p.id)),
  ...PETS.map((p) => petImageAwakened(p.id)),
  // 生物怪物面（初级/高级全身），战斗历练关需要
  ...CREATURES.map((c) => creatureMonsterImage(c.id, 'tier1')),
  ...CREATURES.map((c) => creatureMonsterImage(c.id, 'tier2')),
  ...Object.values(BATTLE_BG_IMAGES),
];

/** 灵宠页按需预加载 */
export const CODEX_PRELOAD_IMAGES: readonly string[] = [
  BACKGROUND_IMAGES.petPool,
  UI_IMAGES.titlePlaque,
  UI_IMAGES.petCardPortrait,
];

/** 编队页按需预加载 */
export const TEAM_PRELOAD_IMAGES: readonly string[] = [
  BACKGROUND_IMAGES.petPool,
  UI_IMAGES.titlePlaque,
  UI_IMAGES.petCardTeamRow,
];

/** 抽卡页按需预加载（召唤台背景 + 演出光效） */
export const GACHA_PRELOAD_IMAGES: readonly string[] = [
  BACKGROUND_IMAGES.petPool,
  UI_IMAGES.titlePlaque,
  UI_FX_IMAGES.lightPillar,
  UI_FX_IMAGES.summonCircle,
  UI_FX_IMAGES.starburst,
  UI_FX_IMAGES.auraRing,
];

/** 商店页按需预加载 */
export const SHOP_PRELOAD_IMAGES: readonly string[] = [
  BACKGROUND_IMAGES.petPool,
  UI_IMAGES.titlePlaque,
];

/** 养成页按需预加载 */
export const PET_DETAIL_PRELOAD_IMAGES: readonly string[] = [
  BACKGROUND_IMAGES.petDetail,
  UI_IMAGES.titlePlaque,
  UI_FX_IMAGES.starburst,
  UI_FX_IMAGES.auraRing,
];
