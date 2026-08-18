/**
 * 主动技充能（v1.0：消珠充能取代回合 CD）
 *
 * ── 为什么换掉回合 CD ──
 *
 * 回合 CD 下技能频率与玩家操作**完全无关**：开局满 CD，之后每回合 -1，
 * 消 3 连还是 7 连、对色还是错色，第一次放技的时间点分毫不差。
 * 于是主动技在体感上只是「到点自动解锁的一次平 A」——玩家吐槽的
 * 「有技能没觉得更强」，根子在这里，而不在倍率表（倍率的取舍见 skills/petMatrix.ts 的 v0.9 记录）。
 *
 * 改成消珠充能后，「这一回合怎么消」直接决定「下一次技能什么时候到」：
 * - 消**本色**珠：每颗 CHARGE_SAME_ORB，是主要来源，也是「喂哪只宠」的操作抓手；
 * - 消其他珠 / 心珠：每颗 CHARGE_OTHER_ORB 的涓流，保证奶盾位与错色回合不完全空转；
 * - 每回合另有 CHARGE_TURN_BASE 保底，Combo 不单独计价（Combo 高 → 消掉的珠本就更多）。
 *
 * 单颗珠的本色 : 异色差了一个数量级，所以「消掉一组本色」时那一条会明显跳一截——
 * 这就是这套系统真正要买的东西：**每次消除都有即时、可归因的反馈**。
 *
 * ── 为什么保留 SkillDef.cd 字段 ──
 *
 * 100+ 技能的强度阶梯、跨稀有度倒挂审计、模拟器 TTK 预算全都锚在 cd 上。
 * 这里把 cd 重新解释为「需要几个回合的期望充能」，用 chargeMaxForCd 换算成充能上限：
 * 既不必重写技能表，也让速咏等既有灵机继续按回合口径生效。
 *
 * ── 定参过程（对齐 difficultyGate 契约）──
 *
 * 充能天然与「每回合消掉多少珠」成正比，而这个量在低手（3C×3=9 颗）与
 * 高手（7C×4=28 颗）之间差 3 倍。裸线性会同时坏两头：
 *   - 低手放技间隔被拉到 8 回合以上，比旧 CD 还慢 —— 最需要正反馈的人被惩罚；
 *   - 高手间隔压到 2.7 回合，第 3/6 章 Boss 掉到 7 回合，撞穿 ttkFloor（秒推下限 8）。
 * 故加了「保底 + 单回合上限」两道夹板。当前一组常数是在
 * (保底 × 换算系数 × 上限) 网格上扫出来的**零违规稳定区中段**（四邻皆零，不是刚好卡线）：
 *
 *   画像      每回合充能   cd5 放技间隔   首次放技
 *   低手 3C      28          5.7 回合       T5
 *   中手 5C      35          4.6 回合       T4
 *   高手 7C   50→封顶 38     4.2 回合       T4
 *
 * 对比旧 CD（间隔恒为 cd、首放恒在 T(cd+1)）：三档的首次放技都提早约 2 回合，
 * 低手间隔基本持平（不退步），中手与高手拿到梯度收益。
 * 全量审计口径：128 关中中手 59 关更快 / 49 关持平 / 17 关更慢，另有 1 关由打不过变打得过，
 * 没有任何一关由打得过变打不过。
 */

/** 消掉一颗**本色**珠为该宠提供的充能（主要来源） */
export const CHARGE_SAME_ORB = 5;

/** 消掉一颗其他属性珠 / 心珠提供的充能（涓流，防止奶盾位空转） */
export const CHARGE_OTHER_ORB = 0.4;

/** 每回合保底充能（这一回合只要消掉了有效珠就给），把低手的下限抬起来 */
export const CHARGE_TURN_BASE = 17;

/**
 * 「1 回合」在充能口径下的等价值：cd → 充能上限的换算系数，
 * 也是灵机速咏 / 势如破竹开局加充能的折算基准。
 * 连携技不再说「减冷却」，按条的百分比灌充能（见 HASTE_CHARGE_PCT）。
 *
 * 注意它不等于任何一档画像的实际每回合充能（中手约 35，比它高约一成，
 * 所以中手的放技间隔略短于 cd）。
 */
export const CHARGE_PER_TURN_BASELINE = 32;

/**
 * 单回合充能上限 = CHARGE_PER_TURN_BASELINE × 本值。
 *
 * 高手裸充能约是中手的 1.4 倍，不封顶会让 Boss 关掉到 7 回合、撞穿难度契约的
 * ttkFloor。封顶只在高强度回合生效（中手常态低于顶），所以它压的是「一次超大连锁
 * 直接充满」，不是压普通玩家的正反馈。
 */
export const CHARGE_TURN_CAP_MULT = 1.2;

/**
 * 开局起始充能比例。
 *
 * 取 0.35 而不是 0：满 CD 开局会让 3～6 回合的短关整场放不出技能。
 * 也不是 1：开场五宠齐射会把短 Boss 关直接秒推（扫参时 0.4 即已让第 16 章关卡越界）。
 * 折中成「开局就能看到充能条已经有一截」，第一次放技比旧 CD 早约 2 回合。
 */
export const CHARGE_START_PCT = 0.35;

/** cd（回合）→ 充能上限 */
export function chargeMaxForCd(cd: number): number {
  return Math.max(1, Math.round(Math.max(1, cd) * CHARGE_PER_TURN_BASELINE));
}

/** 回合数 → 等价充能（开局加成 / 速咏需求，不再给玩家看「减冷却」） */
export function chargeForTurns(turns: number): number {
  return Math.round(turns * CHARGE_PER_TURN_BASELINE);
}

/**
 * 连携电池：amount=1 → 充满条的 20%。
 * 对齐 FGO「NP+20%」/ 崩铁回能百分比——玩家看见的是条在涨，不是一张已经不存在的 CD 表。
 */
export const HASTE_CHARGE_PCT = 0.2;

export function hasteChargeGain(chargeMax: number, amount: number): number {
  if (amount <= 0 || chargeMax <= 0) return 0;
  return Math.round(chargeMax * HASTE_CHARGE_PCT * amount);
}

export function hasteChargePctLabel(amount: number): string {
  return `${Math.round(HASTE_CHARGE_PCT * Math.max(0, amount) * 100)}%`;
}

/** 单颗珠对某只宠的充能：本色为主要来源，其余是涓流 */
export function chargePerOrb(sameElement: boolean): number {
  return sameElement ? CHARGE_SAME_ORB : CHARGE_OTHER_ORB;
}

/**
 * 一回合的充能收益：保底 + 珠数收益，再压单回合上限。
 *
 * 实机（BattleController）与模拟器（formulas/simulation）必须共用本函数，
 * 否则难度审计看到的放技频率就不是玩家实际感受到的频率。
 */
export function turnChargeGain(sameOrbs: number, otherOrbs: number): number {
  if (sameOrbs <= 0 && otherOrbs <= 0) return 0;
  const raw = CHARGE_TURN_BASE
    + sameOrbs * CHARGE_SAME_ORB
    + otherOrbs * CHARGE_OTHER_ORB;
  return Math.round(Math.min(raw, CHARGE_PER_TURN_BASELINE * CHARGE_TURN_CAP_MULT));
}

/** 开局充能：起始比例 + 灵机折算的额外回合 */
export function startChargeFor(chargeMax: number, extraTurns = 0): number {
  const start = Math.round(chargeMax * CHARGE_START_PCT) + chargeForTurns(extraTurns);
  return Math.max(0, Math.min(chargeMax, start));
}
