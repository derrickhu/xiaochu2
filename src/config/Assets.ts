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

/** 编队敌情：怪物立绘奶油金框（透明窗 + 描金角饰） */
export const ENEMY_PORTRAIT_FRAME = `${IMG}/ui/frame/enemy_portrait.png`;

/** 棋盘格贴图（主包） */
export const BOARD_IMAGES = {
  dark: `${IMG}/board/tile_dark.jpg`,
  light: `${IMG}/board/tile_light.jpg`,
} as const;

/** 消除珠贴图（主包）—— UI 属性珠唯一真源，与棋盘共用；禁止另引入旧角标图 */
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
 * 预加载候选路径（仅 canonical 文件名）。
 * 存档旧 ID 经 migrateCreatureId 映射；磁盘/CDN 已统一为 pet_XXX，不再请求 pet_metal_* / cr_* 旧文件名。
 */
export function petAvatarLoadPaths(petId: string, star = 1): readonly string[] {
  return [petAvatarPath(petId, star)];
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
  /** 灵宠召唤：砸金蛋主视觉背景（9:16） */
  gachaEgg: `${PKG.scene}/images/bg/scene_gacha_egg.jpg`,
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
  /** 底栏「主线」= 首页章节地图 */
  navHome: `${IMG}/ui/icon/nav_home.png`,
  /** 左侧玩法栏：签到 / 通天塔 / 日常 / 活动（对齐 home_hub_v4） */
  railCheckin: `${IMG}/ui/icon/rail_checkin.png`,
  railTower: `${IMG}/ui/icon/rail_tower.png`,
  railDaily: `${IMG}/ui/icon/rail_daily.png`,
  railEvent: `${IMG}/ui/icon/rail_event.png`,
  iconCoin: `${IMG}/ui/icon/currency_coin.png`,
  iconExp: `${IMG}/ui/icon/currency_exp.png`,
  iconLingyu: `${IMG}/ui/icon/currency_lingyu.png`,
  iconRecruit: `${IMG}/ui/icon/action_recruit.png`,
  /** 三维属性图标：生命 / 攻击 / 回复（全局统一） */
  iconStatHp: `${IMG}/ui/icon/stat_hp.png`,
  iconStatAtk: `${IMG}/ui/icon/stat_atk.png`,
  iconStatRcv: `${IMG}/ui/icon/stat_rcv.png`,
  /** 通用左右导航箭头（主线章节切换等，可复用） */
  iconNavArrowLeft: `${IMG}/ui/icon/nav_arrow_left.png`,
  iconNavArrowRight: `${IMG}/ui/icon/nav_arrow_right.png`,
  titlePlaque: `${IMG}/ui/plaque/title.png`,
  /**
   * 文字背景匾（与战斗关卡匾同源）—— 主线章节名 / 战斗关卡标题等。
   */
  textBanner: `${IMG}/ui/plaque/text_banner.png`,
  /** 详情底栏行动按钮底板（奶油次按钮） */
  btnPlateCream: `${IMG}/ui/button/plate_cream.png`,
  /** 详情底栏行动按钮底板（翠绿主按钮） */
  btnPlateSuccess: `${IMG}/ui/button/plate_success.png`,
  /** 召唤单抽主按钮底板（金橙） */
  btnPlateGold: `${IMG}/ui/button/plate_gold.png`,
  /** 通用进度条外框（复用战斗英雄血条框） */
  progressFrame: `${IMG}/ui/bar/progress_frame.png`,
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
  /** 封印珠圆形叠层（金框 +「封」匾，盖在属性珠上） */
  orbSeal: `${PKG.battle}/images/ui/battle/battle_orb_seal.png`,
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
  /** 胜利页顶部趴宠（白+薄荷绿，对齐 battle_victory_ui_prototype_v2） */
  battleVictoryPeek: `${PKG.scene}/images/ui/panel/battle_victory_peek.png`,
  /** 失败页委屈宠（白+薄荷绿+泪+枯莲，对齐 battle_defeat_ui_prototype_v2） */
  battleDefeatMascot: `${PKG.scene}/images/ui/panel/battle_defeat_mascot.png`,
} as const;

/** 场景卡片 UI（pkg-scene） */
export const UI_SCENE_IMAGES = {
  /** @deprecated 统一底板；请用 RARITY_PET_CARD_IMAGES */
  petCardPortrait: `${PKG.scene}/images/ui/card/pet_portrait.png`,
  petCardTeamRow: `${PKG.scene}/images/ui/card/pet_team_row.png`,
} as const;

/** 灵宠图鉴竖卡底板（按稀有度：R 素雅 → UR 金辉） */
export const RARITY_PET_CARD_IMAGES: Readonly<Record<Rarity, string>> = {
  1: `${PKG.scene}/images/ui/card/pet_portrait_r.png`,
  2: `${PKG.scene}/images/ui/card/pet_portrait_sr.png`,
  3: `${PKG.scene}/images/ui/card/pet_portrait_ssr.png`,
  4: `${PKG.scene}/images/ui/card/pet_portrait_ur.png`,
};

export function petCardPortraitImage(rarity: Rarity): string {
  return RARITY_PET_CARD_IMAGES[rarity] ?? RARITY_PET_CARD_IMAGES[1];
}

/** 技能图标（pkg-fx，按 skillId 命名；未生成时 TextureCache 返回 null 走占位） */
export function skillIconImage(skillId: string): string {
  return `${PKG.fx}/images/ui/skill/${resolveSkillIconId(skillId)}.png`;
}

/**
 * 敌技尚未单独出图时，映射到主题接近的宠技图标，保证编队敌情/战斗预览有圆形图标。
 * 有独立 `enemy_*.png` 后从此表删除对应项即可。
 */
const SKILL_ICON_ALIASES: Readonly<Record<string, string>> = {
  enemy_golem_guard: 'pet_earth_shield',
  enemy_panda_guard: 'pet_frost_guard',
  enemy_serpent_heal: 'pet_wood_heal',
  enemy_panda_heal: 'pet_earth_heal',
  enemy_blade_charge: 'pet_metal_slash',
  enemy_lion_charge: 'pet_fire_burst',
  enemy_seal_orbs: 'pet_shadow_purify',
  enemy_poison_team: 'pet_fire_dot',
  enemy_time_squeeze: 'pet_abyss_delay',
  enemy_heal_block: 'pet_rift_shield',
  enemy_enrage: 'pet_chaos_haste',
  enemy_skill_seal: 'pet_skyfall_gravity',
};

function resolveSkillIconId(skillId: string): string {
  return SKILL_ICON_ALIASES[skillId] ?? skillId;
}

/** 被动图标（与主动技同目录，id 形如 passive_ruiyan） */
export function passiveIconImage(iconId: string): string {
  return `${PKG.fx}/images/ui/skill/${iconId}.png`;
}

/** @deprecated 锁定态改为原图标灰显叠锁，保留路径兼容旧资源 */
export const SKILL_LOCKED_ICON = `${PKG.fx}/images/ui/skill/skill_locked.png`;

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

/** 启动主包预加载（Title + 导航 + 棋盘珠 + 统一宠物星贴图） */
export const MAIN_PRELOAD_IMAGES: readonly string[] = [
  BOARD_IMAGES.dark,
  BOARD_IMAGES.light,
  BACKGROUND_IMAGES.home,
  BACKGROUND_IMAGES.titleScreen,
  ...Object.values(MAP_UI_IMAGES),
  ...Object.values(UI_IMAGES),
  ...Object.values(PET_FRAME_IMAGES),
  ...Object.values(ORB_IMAGES),
  UI_BATTLE_IMAGES.petStar,
];
