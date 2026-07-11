/**
 * 图片资源路径映射表（单一真源）
 *
 * 主包：board / orb / scene_home / 基础 UI（导航、货币图标等）
 * 分包：见 config/Subpackages.ts（构建后由 scripts/organize-subpackages.mjs 整理目录）
 */
import type { Element, OrbType } from '@/balance/combat';
import type { Rarity } from '@/balance/rarity';
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
  /** 碎片商店专用背景（9:16 商铺内景） */
  shop: `${PKG.scene}/images/bg/scene_shop.jpg`,
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
  /** 底栏当前 tab 选中光晕 + 底部祥云（pkg-fx） */
  navTabActiveFx: `${PKG.fx}/images/ui/fx/nav_tab_active.png`,
  navPet: `${IMG}/ui/icon/nav_pet.png`,
  navShop: `${IMG}/ui/icon/nav_shop.png`,
  navTeam: `${IMG}/ui/icon/nav_team.png`,
  iconCoin: `${IMG}/ui/icon/currency_coin.png`,
  iconExp: `${IMG}/ui/icon/currency_exp.png`,
  iconLingyu: `${IMG}/ui/icon/currency_lingyu.png`,
  iconRecruit: `${IMG}/ui/icon/action_recruit.png`,
  titlePlaque: `${IMG}/ui/plaque/title.png`,
  /** R/SR/SSR/UR 角标雪碧图（pkg-scene，优先读单张 rarity_*.png） */
  rarityBadgeSheet: `${PKG.scene}/images/ui/badge/rarity_sheet.png`,
} as const;

/** 战斗 HUD 专用贴图（pkg-battle，对齐 battle_ui_mockup；进战斗按需加载） */
export const UI_BATTLE_IMAGES = {
  stageBanner: `${PKG.battle}/images/ui/battle/battle_stage_banner.png`,
  petPanel: `${PKG.battle}/images/ui/battle/battle_pet_panel.png`,
  /** 棋盘 cream 外框（对齐 mockup_v2） */
  boardPanel: `${PKG.battle}/images/ui/battle/battle_board_panel.png`,
  /** 转珠倒计时左侧时钟图标 */
  dragClock: `${PKG.battle}/images/ui/battle/battle_drag_clock.png`,
  shieldBadge: `${PKG.battle}/images/ui/battle/battle_shield_badge.png`,
  /** 敌人血条外框（短、两端卷饰，无圆点锚点） */
  hpFrameEnemy: `${PKG.battle}/images/ui/battle/battle_hp_frame_enemy.png`,
  /** 英雄血条外框（长、干净金边，连宠物板） */
  hpFrameHero: `${PKG.battle}/images/ui/battle/battle_hp_frame_hero.png`,
  /** Q 版宠物星级单星图标 */
  petStar: `${PKG.battle}/images/ui/battle/battle_pet_star.png`,
  /** 敌人名独立匾（关卡匾下方） */
  enemyNamePlaque: `${PKG.battle}/images/ui/battle/battle_enemy_name_plaque.png`,
  /** 克制/抵抗标签羊皮纸底板 */
  counterTag: `${PKG.battle}/images/ui/battle/battle_counter_tag.png`,
} as const;

/** 碎片商店专用 UI 贴图（pkg-shop） */
export const UI_SHOP_IMAGES = {
  titlePlaque: `${PKG.shop}/images/ui/shop/shop_title_plaque.png`,
  coinPill: `${PKG.shop}/images/ui/shop/shop_coin_pill.png`,
  rowPanel: `${PKG.shop}/images/ui/shop/shop_row_panel.png`,
  buyPanel: `${PKG.shop}/images/ui/shop/shop_buy_panel.png`,
  sectionBar: `${PKG.shop}/images/ui/shop/shop_section_bar.png`,
} as const;

/** 稀有度角标单张（pkg-scene） */
export const RARITY_BADGE_IMAGES: Readonly<Record<Rarity, string>> = {
  1: `${PKG.scene}/images/ui/badge/rarity_r.png`,
  2: `${PKG.scene}/images/ui/badge/rarity_sr.png`,
  3: `${PKG.scene}/images/ui/badge/rarity_ssr.png`,
  4: `${PKG.scene}/images/ui/badge/rarity_ur.png`,
};

/** 战斗/UI 面板（pkg-scene，战斗结算按需加载） */
export const UI_PANEL_IMAGES = {
  battleVictory: `${PKG.scene}/images/ui/panel/battle_victory.png`,
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
  /** 属性普攻刃 / 命中（对齐水刃样例节奏） */
  metalBlade: `${PKG.fx}/images/ui/fx/fx_metal_blade.png`,
  metalImpact: `${PKG.fx}/images/ui/fx/fx_metal_impact.png`,
  woodBlade: `${PKG.fx}/images/ui/fx/fx_wood_blade.png`,
  woodImpact: `${PKG.fx}/images/ui/fx/fx_wood_impact.png`,
  waterBlade: `${PKG.fx}/images/ui/fx/fx_water_blade.png`,
  waterImpact: `${PKG.fx}/images/ui/fx/fx_water_impact.png`,
  fireBlade: `${PKG.fx}/images/ui/fx/fx_fire_blade.png`,
  fireImpact: `${PKG.fx}/images/ui/fx/fx_fire_impact.png`,
  earthBlade: `${PKG.fx}/images/ui/fx/fx_earth_blade.png`,
  earthImpact: `${PKG.fx}/images/ui/fx/fx_earth_impact.png`,
} as const;

/** 属性普攻刃贴图 */
export const ELEMENT_BLADE_IMAGES: Readonly<Record<Element, string>> = {
  metal: UI_FX_IMAGES.metalBlade,
  wood: UI_FX_IMAGES.woodBlade,
  water: UI_FX_IMAGES.waterBlade,
  fire: UI_FX_IMAGES.fireBlade,
  earth: UI_FX_IMAGES.earthBlade,
};

/** 属性普攻命中贴图 */
export const ELEMENT_IMPACT_IMAGES: Readonly<Record<Element, string>> = {
  metal: UI_FX_IMAGES.metalImpact,
  wood: UI_FX_IMAGES.woodImpact,
  water: UI_FX_IMAGES.waterImpact,
  fire: UI_FX_IMAGES.fireImpact,
  earth: UI_FX_IMAGES.earthImpact,
};

/** 启动主包预加载（Title + 导航 + 棋盘珠） */
export const MAIN_PRELOAD_IMAGES: readonly string[] = [
  BOARD_IMAGES.dark,
  BOARD_IMAGES.light,
  BACKGROUND_IMAGES.home,
  BACKGROUND_IMAGES.titleScreen,
  ...Object.values(MAP_UI_IMAGES),
  ...Object.values(UI_IMAGES),
  ...Object.values(PET_FRAME_IMAGES),
  ...Object.values(ORB_IMAGES),
];
