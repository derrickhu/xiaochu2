/**
 * 变现配置（纯数据，零逻辑）
 *
 * ── IAA（激励视频）──
 * 之前只有「战败复活」与「塔额外重置」两处，且复活**无日限** —— 等于把难度曲线送掉：
 * 任何一关都可以无限复活硬过，Boss 与体力门控同时失效。
 * 这里把广告位收敛成一张表，每个位都必须声明日限，扣减与曝光统计统一走 game/adGate.ts。
 *
 * 位点选择原则：广告只放在「玩家自己想要更多」的地方（回体、翻倍、加次数），
 * 不做强制前置贴片 —— 小游戏留存对强制广告极其敏感。
 *
 * ── IAP ──
 * 首发不开（`ECONOMY_IAP.enabled = false`），但 SKU 结构与 MonetizationService 桩先落地，
 * 免得开付费时再回来改一遍存档与结算口径。
 */

/** 广告位 id（analytics scene 字段直接用它，保证埋点与配置同名） */
export type AdPlacementId =
  | 'battle_revive'
  | 'tower_reset'
  | 'stamina_refill'
  | 'victory_double'
  | 'checkin_double'
  | 'quest_double'
  | 'realm_extra_run'
  | 'free_gacha_pull';

export interface AdPlacementDef {
  id: AdPlacementId;
  /** 面向玩家的位点名（Toast 与按钮文案取此） */
  name: string;
  /** 每日可看次数上限 */
  dailyLimit: number;
  /**
   * 是否由别处的次数门控代管日限（true 时 adGate 只做曝光统计与播放，不再单独计数）。
   * 通天塔属于这种：重置次数本身有上限，广告只是「第 2 次重置」的解锁方式。
   */
  gatedElsewhere?: boolean;
}

export const AD_PLACEMENTS: Readonly<Record<AdPlacementId, AdPlacementDef>> = {
  battle_revive: { id: 'battle_revive', name: '原地复活', dailyLimit: 3 },
  tower_reset: { id: 'tower_reset', name: '通天塔重置', dailyLimit: 1, gatedElsewhere: true },
  stamina_refill: { id: 'stamina_refill', name: '补充体力', dailyLimit: 3 },
  victory_double: { id: 'victory_double', name: '结算奖励翻倍', dailyLimit: 5 },
  checkin_double: { id: 'checkin_double', name: '签到奖励翻倍', dailyLimit: 1 },
  quest_double: { id: 'quest_double', name: '日常奖励翻倍', dailyLimit: 3 },
  realm_extra_run: { id: 'realm_extra_run', name: '秘境额外次数', dailyLimit: 2 },
  free_gacha_pull: { id: 'free_gacha_pull', name: '免费单抽', dailyLimit: 1 },
};

export const AD_PLACEMENT_IDS = Object.keys(AD_PLACEMENTS) as AdPlacementId[];

export function getAdPlacement(id: AdPlacementId): AdPlacementDef {
  return AD_PLACEMENTS[id];
}

/** 广告奖励倍率（翻倍位统一口径，避免各处各写一个 2） */
export const AD_REWARD_MULT = 2;

/** 内购商品类型：月卡按日发放，其余一次性 */
export type IapKind = 'monthly' | 'firstPay' | 'pack';

export interface IapSku {
  id: string;
  kind: IapKind;
  name: string;
  /** 人民币分（避免浮点） */
  priceFen: number;
  /** 立即到账 */
  instant: { lingyu?: number; universal?: number; stamina?: number; coins?: number };
  /** 每日可领（仅月卡；durationDays 天内每天一份） */
  daily?: { lingyu?: number; stamina?: number };
  durationDays?: number;
  desc: string;
}

/**
 * IAP 预留。首发 enabled=false：小游戏开付费需要资质与审核，
 * 但**数值必须先定**，否则等到能开付费时，免费经济已经按无付费校准过一轮，
 * 再塞付费只能靠打折扣，最后变成「付费不值钱」。
 */
export const ECONOMY_IAP = {
  enabled: false,
  skus: [
    {
      id: 'iap_first_pay',
      kind: 'firstPay',
      name: '首充礼包',
      priceFen: 600,
      instant: { lingyu: 1000, universal: 60 },
      desc: '首次充值双倍：灵玉 1000 + 通用碎片 60',
    },
    {
      id: 'iap_monthly',
      kind: 'monthly',
      name: '月卡 · 灵宠之约',
      priceFen: 3000,
      instant: { lingyu: 300 },
      daily: { lingyu: 100, stamina: 60 },
      durationDays: 30,
      desc: '立得 300 灵玉，此后 30 天每日领灵玉 100 + 体力 60',
    },
    {
      id: 'iap_pack_universal',
      kind: 'pack',
      name: '通用碎片礼包',
      priceFen: 1800,
      instant: { universal: 200, coins: 6000 },
      desc: '通用碎片 200 + 灵宠币 6000',
    },
  ] as readonly IapSku[],
} as const;
