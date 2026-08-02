/**
 * 经济数值表（纯数据，零逻辑）
 *
 * 货币收敛为三种：灵宠币（主货币，只做招募）+ 体力 + 碎片（自动转化，不展示为货币）。
 */
import { POWER_CURVE } from './powerBudget';

export const ECONOMY = {
  /** ── 灵宠币产出 ── */
  coin: {
    /** 单关基础产出（第 1 章基准）；v0.5 收紧 30→24 */
    stageBase: 24,
    /**
     * 章节产出成长系数（复利）。
     *
     * 刻意比经验侧的 economyChapterGrowth(1.18) 缓：灵宠币的出口是**按稀有度定价的固定档**
     * （招募封顶 5000、碎片包 300~2400、通用碎片包 1800），并不随章节膨胀。
     * 若币产跟着 1.22 复利走，第 16 章日产会是第 1 章的 20 倍而消耗端只涨 4~8 倍，
     * 后期灵宠币直接贬成废纸。这里让币产主要靠**场次成长**（体力上限随章提升）撑，
     * 单关只给温和的 1.12 复利，日产曲线见 powerBudget.DAILY_TARGET。
     */
    chapterGrowth: 1.12,
    /** 三星追加：每颗星额外产出比例 */
    perStarBonus: 0.2,
    /**
     * 重复通关产出比例：主线不耗体力，全额发币等于开放无限刷，
     * 资源与秘境/任务产出会同时失去意义。量级对齐 defeat.expRefundPct。
     */
    repeatClearPct: 0.25,
  },

  /**
   * ── 经验产出 ──
   *
   * 与币产分开：经验必须追着敌人强度走（升级是过关的前置），
   * 故沿用与敌人曲线成对校准的 economyChapterGrowth。
   */
  exp: {
    chapterGrowth: POWER_CURVE.economyChapterGrowth,
    /** 三星追加（与币产同口径，保持结算面板体感一致） */
    perStarBonus: 0.2,
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
  /** v0.5：2★/3★ 轻度加压，拉长第 2/4 章升星门槛；4★/5★ 不动 */
  starUpShards: { 2: 25, 3: 65, 4: 120, 5: 300 } as Readonly<Record<number, number>>,

  /** ── 抖音侧边栏复访（必接） ── */
  sidebar: {
    /** 每日从侧边栏进入可领灵玉 */
    lingyuReward: 30,
  },

  /**
   * ── 体力 ──
   *
   * 上限随进度走（baseMax + perChapterBonus × 已通章数），让「打得越深、单次上线能玩越久」，
   * 不然后期高单价关卡会把一瓶体力压到只剩几场。
   * 日预算实测：2 次登录 × 满瓶 + 广告 3 × 50 ≈ 350 点，约 58 场普通关。
   */
  stamina: {
    /** 第 1 章时的上限 */
    baseMax: 100,
    /** 每多通一章的上限加成（第 16 章 = 130） */
    perChapterBonus: 2,
    /** 恢复 1 点所需秒数（满瓶约 8.3 小时） */
    regenSeconds: 300,
    /** 新手减免：章号 ≤ 此值的主线关不耗体力 */
    freeChapters: 1,
    /** 广告回体每次恢复量；日限见 balance/monetization.ts 的 AD_PLACEMENTS.stamina_refill */
    adRefill: 50,
    /** 签到 / 日常全清附带的体力 */
    checkinBonus: 30,
  },

  /** ── 抽卡（灵玉货币 + 招募券）── */
  gacha: {
    /** 单抽灵玉价 */
    singleCost: 100,
    /** 十连灵玉价（含 1 抽折扣） */
    tenCost: 1000,
    /** 硬保底：连续未出 SSR+ 达此次数，本抽必出 SSR+（rarity≥3） */
    pitySSR: 50,
    /**
     * UR 天井：连续未出 UR 达此次数，本抽必出 UR（rarity 4）。
     * 计数独立于 pitySSR —— SSR 出货不清空 UR 计数，否则天井会被 SSR 无限推后。
     */
    pityUR: 100,
    /** 十连保底最低稀有（rarity≥2 = SR+） */
    tenPullFloorRarity: 2,
    /** 重复宠转碎片数（按稀有度，越稀有越多；四档制，不留 LR 死键） */
    duplicateShards: { 1: 5, 2: 10, 3: 20, 4: 40 } as Readonly<Record<number, number>>,
    /**
     * 重复高稀有额外产出的通用碎片（本体碎片照给，这是附加）。
     * 只给 SSR/UR：低稀有本体碎片本来就好凑，通用碎片要留给「UR 升满星要 13 只重复」的死结。
     */
    duplicateUniversal: { 3: 8, 4: 25 } as Readonly<Record<number, number>>,
    /** 新号初始灵玉（0 = 不赠送，靠首通里程碑 / 侧边栏 / 图鉴等途径获取） */
    starterLingyu: 0,
  },

  /**
   * ── 通用碎片（万能碎片）──
   *
   * 解的是「UR 想升满星要 13 只重复」的死结：本体碎片只能靠抽到同一只，
   * 深池下这是数学上不可达的目标。通用碎片可折算成任意宠的本体碎片。
   * 折算按稀有度阶梯加税（R/SR=1、SSR=2、UR=3），避免高档升星被通用买穿；
   * R/SR 本体好出、商店定向也便宜，通常不靠通用，故与 SR 同档即可。
   */
  universal: {
    /** 折算率：目标宠稀有度 → 换 1 点本体碎片需要的通用碎片数（阶梯加税） */
    exchangeRate: { 1: 1, 2: 1, 3: 2, 4: 3 } as Readonly<Record<number, number>>,
    /**
     * 精英档及以上关卡的通用碎片基数，实际值 = 本数 × stageTypes.shardMult。
     * 精英 1.6 → 4 / Boss 2.2 → 5 / 秘境 2.0 → 5；普通关（shardMult 1.0）不产。
     */
    stageEliteBase: 3,
    /** 日常任务全清追加 */
    dailyAllClear: 6,
    /** 通天塔里程碑每档追加 */
    towerMilestone: 12,
  },

  /** ── 灵玉里程碑产出（首通奖励）── */
  milestone: {
    /** 普通/精英关首通灵玉 */
    firstClearLingyu: 20,
    /** Boss 关首通灵玉 */
    bossFirstClearLingyu: 60,
    /** 图鉴里程碑：每拥有 codexEvery 只发一次灵玉（仅在图鉴页领取） */
    codexEvery: 5,
    codexLingyu: 100,
  },

  /** ── 战斗失败兜底（避免死局）：按理论经验产出的比例返还 ── */
  defeat: {
    /** 失败仍给「若通关 1★ 经验」的该比例，保证卡关也有成长 */
    expRefundPct: 0.25,
  },

  /**
   * ── 商店（灵宠币定向兑换碎片，作为抽卡的保底补充）──
   *
   * 不做每日轮换：商店的全部价值就在「定向」——玩家为某只宠攒币，
   * 轮换会把它退化成第二个随机源，与抽卡重复。此前预留的 dailyRotationCount 已删除。
   */
  shop: {
    /** 每个碎片包的碎片数 */
    packSize: 10,
    /** 每包灵宠币基础价（按稀有度，越稀有越贵；四档制，不留 LR 死键） */
    shardPackCost: { 1: 300, 2: 600, 3: 1200, 4: 2400 } as Readonly<Record<number, number>>,
    /** 通用碎片兑换：每包灵宠币价（通用碎片可换任意宠，故单价高于定向包） */
    universalPackCost: 1800,
    universalPackSize: 20,
  },
} as const;
