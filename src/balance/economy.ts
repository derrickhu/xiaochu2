/**
 * 经济数值表（纯数据，零逻辑）
 *
 * 货币收敛为三种：灵宠币（主货币，只做招募）+ 体力 + 碎片（自动转化，不展示为货币）。
 */
import { POWER_CURVE } from './powerBudget';

export const ECONOMY = {
  /** ── 灵宠币产出 ── */
  coin: {
    /** 单关基础产出（第 1 章基准） */
    stageBase: 30,
    /** 章节产出成长系数（复利）；单一真源在 powerBudget.ts，与敌人曲线成对校准 */
    chapterGrowth: POWER_CURVE.economyChapterGrowth,
    /** 三星追加：每颗星额外产出比例 */
    perStarBonus: 0.2,
    /** Boss 关产出倍率 */
    bossMultiplier: 2.0,
  },

  /** ── 招募定价 ── */
  recruit: {
    /** 首只灵宠定价 */
    basePrice: 100,
    /** 每多招募一只，价格增长系数（复利，前期快后期稳由分段控制） */
    priceGrowth: 1.35,
    /** 价格增长封顶倍数（相对 basePrice） */
    priceCapMultiplier: 50,
    /** 重复招募 → 自动转化碎片数 */
    duplicateShards: 10,
  },

  /**
   * ── 升星碎片消耗：目标星级 → 所需碎片（升星成本的唯一真源）──
   * growth.ts 的 StarProfile 不再重复定义 upgradeCost，统一读这里。
   */
  starUpShards: { 2: 20, 3: 50, 4: 120, 5: 300 } as Readonly<Record<number, number>>,

  /** ── 体力 ── */
  stamina: {
    max: 100,
    perStage: 6,
    /** 恢复 1 点所需秒数 */
    regenSeconds: 360,
  },

  /** ── 抽卡（灵玉货币 + 招募券）── */
  gacha: {
    /** 单抽灵玉价 */
    singleCost: 100,
    /** 十连灵玉价（含 1 抽折扣） */
    tenCost: 1000,
    /** 硬保底：连续未出 SSR+ 达此次数，本抽必出 SSR+（rarity≥3） */
    pitySSR: 50,
    /** 十连保底最低稀有（rarity≥2 = SR+） */
    tenPullFloorRarity: 2,
    /** 重复宠转碎片数（按稀有度，越稀有越多） */
    duplicateShards: { 1: 5, 2: 10, 3: 20, 4: 40, 5: 80 } as Readonly<Record<number, number>>,
    /** 新号初始赠送灵玉（够一发十连体验） */
    starterLingyu: 1000,
    /** 已收录（图鉴 UP）宠在档内的出货权重倍数；未收录 = 1 */
    discoveryUpWeight: 2,
    /**
     * 高稀有护航包：NEW SSR/UR 出货附赠本体碎片 + 通用经验，
     * 保证「抽到强宠 → 立刻升 2★/拉等级 → 上阵可感知提升」的闭环。
     * 碎片数恰好覆盖 1★→2★ 升星成本（starUpShards[2] = 20）。
     */
    escort: {
      3: { shards: 20, exp: 300 },
      4: { shards: 40, exp: 800 },
    } as Readonly<Record<number, { shards: number; exp: number }>>,
  },

  /** ── 灵玉里程碑产出（首通奖励）── */
  milestone: {
    /** 普通/精英关首通灵玉 */
    firstClearLingyu: 20,
    /** Boss 关首通灵玉 */
    bossFirstClearLingyu: 60,
    /** 图鉴收录里程碑：每收录 codexEvery 只发一次灵玉（仅在图鉴页领取） */
    codexEvery: 5,
    codexLingyu: 100,
  },

  /** ── 战斗失败兜底（避免死局）：按理论经验产出的比例返还 ── */
  defeat: {
    /** 失败仍给「若通关 1★ 经验」的该比例，保证卡关也有成长 */
    expRefundPct: 0.25,
  },

  /** ── 商店（灵宠币定向兑换碎片，作为抽卡的保底补充）── */
  shop: {
    /** 每个碎片包的碎片数 */
    packSize: 10,
    /** 每包灵宠币基础价（按稀有度，越稀有越贵） */
    shardPackCost: { 1: 300, 2: 600, 3: 1200, 4: 2400, 5: 4800 } as Readonly<Record<number, number>>,
    /** 每日轮换的宠数量 */
    dailyRotationCount: 4,
    /** 推荐属性展示的宠数量上限 */
    recommendCount: 3,
  },
} as const;
