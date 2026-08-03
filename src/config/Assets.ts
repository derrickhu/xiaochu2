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

/** ★3 及以上使用觉醒灵相头像（*_s3.png；文件名 s3 = star 3 形态） */
export const PET_AWAKEN_STAR = 3;

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
  const id = canonicalCreatureId(creatureId);
  const root = enemyImageRoot(id);
  return tier === 'tier2'
    ? `${root}/${id}_awakened.png`
    : `${root}/${id}.png`;
}

/** 详情秀场全身立绘：★3+ 用高级怪面，否则初级怪面 */
export function petShowcaseImage(petId: string, star = 1): string {
  return creatureMonsterImage(petId, star >= PET_AWAKEN_STAR ? 'tier2' : 'tier1');
}

/** 秀场加载候选：觉醒图缺失时回退初级（真机 CDN 常见） */
export function petShowcaseLoadPaths(petId: string, star = 1): readonly string[] {
  const primary = petShowcaseImage(petId, star);
  if (star < PET_AWAKEN_STAR) return [primary];
  const fallback = creatureMonsterImage(petId, 'tier1');
  return primary === fallback ? [primary] : [primary, fallback];
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
  /** 灵宠图鉴：青绿祥云满屏底（对齐 codex_panel_proto_v3_ring_entry） */
  codex: `${PKG.scene}/images/bg/scene_codex_cloud.jpg`,
  /** 灵宠召唤：砸金蛋主视觉背景（9:16） */
  gachaEgg: `${PKG.scene}/images/bg/scene_gacha_egg.jpg`,
  /** 碎片商店专用背景（9:16 商铺内景） */
  shop: `${PKG.scene}/images/bg/scene_shop.jpg`,
  /** 五行秘境专用背景（9:16 洞府山径，pkg-scene / CDN） */
  realm: `${PKG.scene}/images/bg/scene_realm.jpg`,
  /** 通天塔专用背景（9:16 云海浮岛，pkg-scene / CDN） */
  tower: `${PKG.scene}/images/bg/scene_tower.jpg`,
} as const;

/**
 * 章节地图区域背景：16 章按 4 章一区分成 4 大区。
 *
 * 第 1 区沿用主包内的 title_screen（首屏也用它，必须留在主包）；
 * 第 2~4 区的图落 pkg-scene（已配 CDN，不占微信主包体积），出图前 fallback 到第 1 区。
 */
export const CHAPTER_REGION_COUNT = 4;
export const CHAPTER_REGION_BG: readonly string[] = [
  BACKGROUND_IMAGES.titleScreen,
  `${PKG.scene}/images/bg/chapter_region_2.jpg`,
  `${PKG.scene}/images/bg/chapter_region_3.jpg`,
  `${PKG.scene}/images/bg/chapter_region_4.jpg`,
];

/** 章号 → 区域背景路径（每 4 章换一张；越界钳到末区） */
export function chapterRegionBg(chapter: number): string {
  const idx = Math.min(
    CHAPTER_REGION_BG.length - 1,
    Math.max(0, Math.ceil(chapter / CHAPTER_REGION_COUNT) - 1),
  );
  return CHAPTER_REGION_BG[idx];
}

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

/**
 * 启动 Loading 专用资源（主包，勿复用玩法内截图/场景图）
 * 底图：Gemini 独立 key-art；标题暂复用 logo，可后续单独出字。
 */
export const LOADING_IMAGES = {
  splash: `${IMG}/ui/loading/loading_splash.jpg`,
  title: `${IMG}/ui/logo/title.png`,
} as const;

/** 主包 UI 贴图 */
export const UI_IMAGES = {
  titleLogo: `${IMG}/ui/logo/title.png`,
  /** 全局返回：玉佩流苏左箭头 */
  btnBack: `${IMG}/ui/icon/btn_back.png`,
  navBar: `${IMG}/ui/bar/nav_bottom.png`,
  /** 底栏当前 tab 选中光晕 + 底部祥云（pkg-fx） */
  navTabActiveFx: `${PKG.fx}/images/ui/fx/nav_tab_active.png`,
  navPet: `${IMG}/ui/icon/nav_pet.png`,
  navShop: `${IMG}/ui/icon/nav_shop.png`,
  navTeam: `${IMG}/ui/icon/nav_team.png`,
  /** 底栏「主线」= 首页章节地图 */
  navHome: `${IMG}/ui/icon/nav_home.png`,
  /** 底栏「秘境」= 五行秘境洞府入口（勿复用礼物 rail_event） */
  navRealm: `${IMG}/ui/icon/nav_realm.png`,
  /** 五行秘境主卡洞府立绘（pkg-scene / CDN，勿进主包） */
  realmGateMetal: `${PKG.scene}/images/ui/realm/realm_gate_metal.png`,
  realmGateWood: `${PKG.scene}/images/ui/realm/realm_gate_wood.png`,
  realmGateWater: `${PKG.scene}/images/ui/realm/realm_gate_water.png`,
  realmGateFire: `${PKG.scene}/images/ui/realm/realm_gate_fire.png`,
  realmGateEarth: `${PKG.scene}/images/ui/realm/realm_gate_earth.png`,
  /** 秘境五行宝石钮（对齐 B 原型） */
  realmOrbMetal: `${PKG.scene}/images/ui/realm/realm_orb_metal.png`,
  realmOrbWood: `${PKG.scene}/images/ui/realm/realm_orb_wood.png`,
  realmOrbWater: `${PKG.scene}/images/ui/realm/realm_orb_water.png`,
  realmOrbFire: `${PKG.scene}/images/ui/realm/realm_orb_fire.png`,
  realmOrbEarth: `${PKG.scene}/images/ui/realm/realm_orb_earth.png`,
  /** 秘境难度 pill（对齐 B 原型）；出战 CTA 复用 towerBtnCta */
  realmDiffIdle: `${PKG.scene}/images/ui/realm/realm_diff_idle.png`,
  realmDiffSelected: `${PKG.scene}/images/ui/realm/realm_diff_selected.png`,
  /** @deprecated 编队出战已改用 towerBtnCta，保留路径以免旧包缺图 */
  realmBtnCta: `${PKG.scene}/images/ui/realm/realm_btn_cta.png`,
  /** 左侧玩法栏：签到 / 通天塔 / 日常 / 活动（对齐 home_hub_v4） */
  railCheckin: `${IMG}/ui/icon/rail_checkin.png`,
  railTower: `${IMG}/ui/icon/rail_tower.png`,
  /** 通天塔主视觉宝塔立绘（pkg-scene / CDN） */
  towerPagoda: `${PKG.scene}/images/ui/tower/tower_pagoda.png`,
  /** 通天塔暖金杏渐变挑战匾钮（pkg-scene / CDN） */
  towerBtnCta: `${PKG.scene}/images/ui/tower/tower_btn_cta.png`,
  /** 机缘三选一：标题匾（对齐 implemented-02） */
  towerBlessTitlePlaque: `${PKG.scene}/images/ui/tower/bless_title_plaque.png`,
  /** 机缘卡底板：寻常 / 罕有 / 奇珍 */
  towerBlessCardCommon: `${PKG.scene}/images/ui/tower/bless_card_common.png`,
  towerBlessCardRare: `${PKG.scene}/images/ui/tower/bless_card_rare.png`,
  towerBlessCardEpic: `${PKG.scene}/images/ui/tower/bless_card_epic.png`,
  /** 品质六角角标底板 */
  towerBlessBadgeCommon: `${PKG.scene}/images/ui/tower/bless_badge_common.png`,
  towerBlessBadgeRare: `${PKG.scene}/images/ui/tower/bless_badge_rare.png`,
  towerBlessBadgeEpic: `${PKG.scene}/images/ui/tower/bless_badge_epic.png`,
  /** 重掷：骰子图标 + 暖金按钮板 */
  towerBlessDice: `${PKG.scene}/images/ui/tower/bless_dice.png`,
  towerBlessRerollBtn: `${PKG.scene}/images/ui/tower/bless_reroll_btn.png`,
  /** 择路卡底插画（对齐 implemented-01-path） */
  towerPathArtBattle: `${PKG.scene}/images/ui/tower/path_art_battle.png`,
  towerPathArtElite: `${PKG.scene}/images/ui/tower/path_art_elite.png`,
  towerPathArtEvent: `${PKG.scene}/images/ui/tower/path_art_event.png`,
  towerPathArtRest: `${PKG.scene}/images/ui/tower/path_art_rest.png`,
  towerPathArtGuard: `${PKG.scene}/images/ui/tower/path_art_guard.png`,
  /** 传承面板卷轴底板（金玉角饰已画进底板，外沿透明；pkg-scene / CDN） */
  towerLegacyPanelBg: `${PKG.scene}/images/ui/tower/tower_legacy_panel_bg.png`,
  /** 三列列头卷云匾（自 legacy-ui-v1 裁切，已抹掉字，列名由代码渲染） */
  towerLegacyPlaqueInsight: `${PKG.scene}/images/ui/tower/tower_legacy_plaque_insight.png`,
  towerLegacyPlaqueRoot: `${PKG.scene}/images/ui/tower/tower_legacy_plaque_root.png`,
  towerLegacyPlaqueLegacy: `${PKG.scene}/images/ui/tower/tower_legacy_plaque_legacy.png`,
  /** 登塔印记玉印币标 */
  towerCurrencySeal: `${PKG.scene}/images/ui/tower/tower_currency_seal.png`,
  /** 传承节点圆形图标 */
  towerLegacyPickWide: `${PKG.scene}/images/ui/tower/tower_legacy_pick_wide.png`,
  towerLegacyReroll: `${PKG.scene}/images/ui/tower/tower_legacy_reroll.png`,
  towerLegacyInsight: `${PKG.scene}/images/ui/tower/tower_legacy_insight.png`,
  towerLegacyStartBless: `${PKG.scene}/images/ui/tower/tower_legacy_start_bless.png`,
  towerLegacyCheckpoint: `${PKG.scene}/images/ui/tower/tower_legacy_checkpoint.png`,
  towerLegacySecondWind: `${PKG.scene}/images/ui/tower/tower_legacy_second_wind.png`,
  towerLegacyRegen: `${PKG.scene}/images/ui/tower/tower_legacy_regen.png`,
  towerLegacyCoin: `${PKG.scene}/images/ui/tower/tower_legacy_coin.png`,
  railDaily: `${IMG}/ui/icon/rail_daily.png`,
  /** 日常任务全清宝箱（pkg-scene / CDN） */
  questChest: `${PKG.scene}/images/ui/icon/quest_chest.png`,
  railEvent: `${IMG}/ui/icon/rail_event.png`,
  /** 首页右下：桌面快捷方式 / 侧边栏复访入口 */
  homeDesktop: `${IMG}/ui/icon/home_desktop.png`,
  homeSidebar: `${IMG}/ui/icon/home_sidebar.png`,
  /** 首页顶栏默认玩家头像（仙灵小萌新） */
  playerAvatarDefault: `${IMG}/ui/avatar/player_default.png`,
  iconCoin: `${IMG}/ui/icon/currency_coin.png`,
  iconExp: `${IMG}/ui/icon/currency_exp.png`,
  iconLingyu: `${IMG}/ui/icon/currency_lingyu.png`,
  /** 体力（仙桃） */
  iconStamina: `${IMG}/ui/icon/currency_stamina.png`,
  /** 十连券（签到大奖 / 召唤扣券） */
  iconTicket: `${IMG}/ui/icon/currency_ticket.png`,
  /** 灵宠碎片袋（签到 / 任务碎片奖励展示） */
  iconShard: `${IMG}/ui/icon/currency_shard.png`,
  /** 七日签到：普通日卡 / 今日高亮卡 / 第7天金光大奖条（pkg-scene / CDN） */
  checkinCardNormal: `${PKG.scene}/images/ui/checkin/checkin_card_normal.png`,
  checkinCardToday: `${PKG.scene}/images/ui/checkin/checkin_card_today.png`,
  checkinBannerDay7: `${PKG.scene}/images/ui/checkin/checkin_banner_day7.png`,
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
  /** 弹窗标题匾（签到 / 日常等）—— 奶油祥云横匾；pkg-scene / CDN */
  modalTitlePlaque: `${PKG.scene}/images/ui/plaque/modal_title.png`,
  /** 全屏场景顶栏匾（秘境等）—— 拱顶金边祥云横匾；pkg-scene / CDN */
  sceneTitlePlaque: `${PKG.scene}/images/ui/plaque/scene_title.png`,
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
  /** 召唤结果：描金卡框（pkg-scene） */
  gachaResultCard: `${PKG.scene}/images/ui/frame/gacha_result_card.png`,
  /** 召唤结果：卡名金匾 */
  gachaResultNameBand: `${PKG.scene}/images/ui/frame/gacha_result_name_band.png`,
  /** 召唤结果：对比信息面板框 */
  gachaResultComparePanel: `${PKG.scene}/images/ui/frame/gacha_result_compare_panel.png`,
  /** 召唤结果：NEW 玉石胶囊底 */
  gachaResultNewBadge: `${PKG.scene}/images/ui/badge/gacha_result_new.png`,
  /** 碎片转化：碎晶主视觉（pkg-scene） */
  gachaShardCrystal: `${PKG.scene}/images/ui/fx/gacha_shard_crystal_cluster.png`,
  /** 碎片转化：专属圆形头像框 */
  gachaShardAvatarFrame: `${PKG.scene}/images/ui/frame/gacha_shard_avatar_frame.png`,
} as const;

/**
 * 机缘圆形水墨图标（id 与 balance/towerBless 一一对应）。
 * 路径：pkg-scene/images/ui/tower/{blessId}.png
 */
export function towerBlessIcon(blessId: string): string {
  return `${PKG.scene}/images/ui/tower/${blessId}.png`;
}

/** 机缘三选一进场预加载清单（标题匾 + 卡板 + 骰子 + 当前候选图标） */
export function towerBlessPickerAssets(blessIds: readonly string[] = []): string[] {
  return [
    UI_IMAGES.towerBlessTitlePlaque,
    UI_IMAGES.towerBlessCardCommon,
    UI_IMAGES.towerBlessCardRare,
    UI_IMAGES.towerBlessCardEpic,
    UI_IMAGES.towerBlessBadgeCommon,
    UI_IMAGES.towerBlessBadgeRare,
    UI_IMAGES.towerBlessBadgeEpic,
    UI_IMAGES.towerBlessDice,
    UI_IMAGES.towerBlessRerollBtn,
    ...blessIds.map(towerBlessIcon),
  ];
}

const TOWER_PATH_ART: Readonly<Record<string, string>> = {
  battle: UI_IMAGES.towerPathArtBattle,
  elite: UI_IMAGES.towerPathArtElite,
  event: UI_IMAGES.towerPathArtEvent,
  rest: UI_IMAGES.towerPathArtRest,
  guard: UI_IMAGES.towerPathArtGuard,
};

/** 择路卡底水墨插画路径 */
export function towerPathArt(kind: string): string {
  return TOWER_PATH_ART[kind] ?? UI_IMAGES.towerPathArtBattle;
}

/** 择路浮层进场预加载（当前可选路径插画） */
export function towerPathPickerAssets(kinds: readonly string[] = []): string[] {
  const set = new Set(kinds.map(towerPathArt));
  return [...set];
}

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
  /** 攻击倒计时圆形底框（怪右侧侧挂） */
  attackCdBadge: `${PKG.battle}/images/ui/battle/battle_attack_cd_badge.png`,
  /** 技能就绪：底部「技能」匾底板 */
  skillReadyBadge: `${PKG.battle}/images/ui/battle/battle_skill_ready_badge.png`,
  /** 技能就绪：头顶双箭头 */
  skillReadyArrow: `${PKG.battle}/images/ui/battle/battle_skill_ready_arrow.png`,
  /** 技能就绪：边框闪点 */
  skillReadySpark: `${PKG.battle}/images/ui/battle/battle_skill_ready_spark.png`,
  /** 封印珠圆形叠层（金框 +「封」匾，盖在属性珠上） */
  orbSeal: `${PKG.battle}/images/ui/battle/battle_orb_seal.png`,
} as const;

/**
 * 碎片商店专用 UI 贴图（pkg-shop，随包；非 CDN）
 * 原型：game_assets/xiaochu2/assets/prototypes/ui/shop_dual_col_no_banner_v1.png
 */
export const UI_SHOP_IMAGES = {
  coinPill: `${PKG.shop}/images/ui/shop/shop_coin_pill.png`,
  buyPanel: `${PKG.shop}/images/ui/shop/shop_buy_panel.png`,
  /** 双列商品卡底板 */
  cardPanel: `${PKG.shop}/images/ui/shop/shop_card_panel.png`,
  /** 左栏 Tab 选中 / 未选 */
  tabOn: `${PKG.shop}/images/ui/shop/shop_tab_on.png`,
  tabOff: `${PKG.shop}/images/ui/shop/shop_tab_off.png`,
  tabIconShard: `${PKG.shop}/images/ui/shop/shop_tab_icon_shard.png`,
  tabIconHonor: `${PKG.shop}/images/ui/shop/shop_tab_icon_honor.png`,
  tabIconRealm: `${PKG.shop}/images/ui/shop/shop_tab_icon_realm.png`,
  tabIconLingyu: `${PKG.shop}/images/ui/shop/shop_tab_icon_lingyu.png`,
} as const;

/**
 * 灵宠图鉴壳层贴图（pkg-scene / CDN）
 * 原型：game_assets/xiaochu2/assets/prototypes/ui/codex_panel_proto_v3_ring_entry.png
 */
export const UI_CODEX_IMAGES = {
  headerCanopy: `${PKG.scene}/images/ui/codex/codex_header_canopy.png`,
  rewardRing: `${PKG.scene}/images/ui/codex/codex_reward_ring.png`,
  claimBtn: `${PKG.scene}/images/ui/codex/codex_claim_btn.png`,
  filterRail: `${PKG.scene}/images/ui/codex/codex_filter_rail.png`,
  filterSelected: `${PKG.scene}/images/ui/codex/codex_filter_selected.png`,
  titleLingchong: `${PKG.scene}/images/ui/codex/codex_title_lingchong.png`,
  rewardPanel: `${PKG.scene}/images/ui/codex/codex_reward_panel.png`,
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
  enemy_panda_heal: 'pet_wood_heal',
  enemy_blade_charge: 'pet_fire_burst',
  enemy_lion_charge: 'pet_fire_burst',
  enemy_seal_orbs: 'pet_shadow_purify',
  enemy_poison_team: 'pet_fire_dot',
  enemy_time_squeeze: 'pet_abyss_delay',
  enemy_heal_block: 'pet_rift_shield',
  enemy_enrage: 'pet_chaos_haste',
  enemy_skill_seal: 'pet_skyfall_gravity',
  // 后期章节梯度变体复用同机制的图标（同一招换档，视觉上不该换个东西）
  enemy_seal_orbs_heavy: 'pet_shadow_purify',
  enemy_poison_team_heavy: 'pet_fire_dot',
  enemy_time_squeeze_heavy: 'pet_abyss_delay',
  enemy_heal_block_heavy: 'pet_rift_shield',
  enemy_skill_seal_heavy: 'pet_skyfall_gravity',
  enemy_golem_guard_heavy: 'pet_earth_shield',
  enemy_serpent_heal_heavy: 'pet_wood_heal',
  enemy_charge_heavy: 'pet_fire_burst',
  enemy_enrage_heavy: 'pet_chaos_haste',
  enemy_atk_debuff: 'pet_metal_def_break',
  enemy_atk_debuff_heavy: 'pet_metal_def_break',
  enemy_resolve: 'pet_earth_shield',
  enemy_element_absorb: 'pet_shadow_purify',
  enemy_counter_strike: 'pet_metal_multi_hit',
  // 招牌技（SSR/UR）尚未独立出图 → 借机制接近的手写宠技图
  pet_sig_metal_ruin: 'pet_metal_slash',
  pet_sig_metal_bastion: 'pet_frost_guard',
  pet_sig_wood_lance: 'pet_wood_volley',
  pet_sig_wood_bloom: 'pet_wood_big_heal',
  pet_sig_wood_aegis: 'pet_earth_shield',
  pet_sig_wood_worldtree: 'pet_chaos_haste',
  pet_sig_water_maelstrom: 'pet_skyfall_gravity',
  pet_sig_water_bulwark: 'pet_water_shield',
  pet_sig_fire_warhymn: 'pet_fire_boost',
  pet_sig_fire_emberflow: 'pet_chaos_haste',
  pet_sig_fire_magmaward: 'pet_rift_shield',
  pet_sig_earth_quake: 'pet_metal_def_break',
  pet_sig_earth_genesis: 'pet_void_resonance',
};

/**
 * 量产矩阵技 id = pet_{element}_{blueprint}_{r|sr}，尚未按 id 出图时
 * 按「蓝图 × 属性」落到已有手写宠技图标（同目录 pet_*.png）。
 */
const MATRIX_BLUEPRINT_ICONS: Readonly<Record<string, Readonly<Partial<Record<Element, string>> & { _: string }>>> = {
  nuke: {
    _: 'pet_star_cross',
    metal: 'pet_metal_slash',
    wood: 'pet_wood_volley',
    water: 'pet_water_pierce',
    fire: 'pet_fire_burst',
    earth: 'pet_star_cross',
  },
  multi_hit: {
    _: 'pet_metal_multi_hit',
    metal: 'pet_metal_multi_hit',
    wood: 'pet_wood_multi_hit',
    water: 'pet_water_multi_hit',
    fire: 'pet_fire_burst',
    earth: 'pet_metal_multi_hit',
  },
  dot: {
    _: 'pet_fire_dot',
    fire: 'pet_fire_dot',
    metal: 'pet_fire_dot',
    wood: 'pet_fire_dot',
    water: 'pet_fire_dot',
    earth: 'pet_fire_dot',
  },
  team_nuke: {
    _: 'pet_star_cross',
    metal: 'pet_metal_slash',
    wood: 'pet_wood_volley',
    water: 'pet_water_pierce',
    fire: 'pet_fire_burst',
    earth: 'pet_star_cross',
  },
  heal: {
    _: 'pet_wood_heal',
    wood: 'pet_wood_heal',
    earth: 'pet_earth_heal',
    metal: 'pet_wood_heal',
    water: 'pet_wood_heal',
    fire: 'pet_earth_heal',
  },
  shield: {
    _: 'pet_earth_shield',
    earth: 'pet_earth_shield',
    water: 'pet_water_shield',
    metal: 'pet_frost_guard',
    wood: 'pet_earth_shield',
    fire: 'pet_rift_shield',
  },
  convert: {
    _: 'pet_earth_convert_row',
    metal: 'pet_transmute_metal',
    wood: 'pet_earth_heart_convert',
    water: 'pet_earth_heart_convert',
    fire: 'pet_earth_convert_row',
    earth: 'pet_earth_convert_row',
  },
  defense_break: { _: 'pet_metal_def_break', metal: 'pet_metal_def_break', earth: 'pet_metal_def_break' },
  stun: { _: 'pet_water_stun', water: 'pet_water_stun', metal: 'pet_water_stun' },
  delay_attack: { _: 'pet_abyss_delay' },
  gravity: { _: 'pet_skyfall_gravity' },
  damage_buff: { _: 'pet_fire_boost', fire: 'pet_fire_boost', wood: 'pet_fire_boost', earth: 'pet_fire_boost' },
  element_buff: { _: 'pet_void_resonance' },
  extra_time: { _: 'pet_earth_time', earth: 'pet_earth_time' },
};

const MATRIX_SKILL_RE = /^pet_(metal|wood|water|fire|earth)_(.+?)_(r|sr)$/;

export function resolveSkillIconId(skillId: string): string {
  const aliased = SKILL_ICON_ALIASES[skillId];
  if (aliased) return aliased;
  const m = MATRIX_SKILL_RE.exec(skillId);
  if (m) {
    const element = m[1] as Element;
    const blueprint = m[2];
    const table = MATRIX_BLUEPRINT_ICONS[blueprint];
    if (table) return table[element] ?? table._;
  }
  return skillId;
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
  /** 召唤结果：卡后金色放射光（ADD；落 pkg-scene 以免撑爆 pkg-fx） */
  gachaRays: `${PKG.scene}/images/ui/fx/fx_gacha_rays.png`,
  /** 召唤结果：飘落花瓣粒子 */
  gachaPetal: `${PKG.scene}/images/ui/fx/fx_gacha_petal.png`,
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
  // 主包预加载仅本地首屏资源；CDN 路径由场景/面板按需拉取
  ...Object.values(UI_IMAGES).filter((p) => !p.startsWith('subpackages/')),
  ...Object.values(PET_FRAME_IMAGES),
  ...Object.values(ORB_IMAGES),
  UI_BATTLE_IMAGES.petStar,
];
