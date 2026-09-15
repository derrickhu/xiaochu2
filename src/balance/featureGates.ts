/**
 * 一级功能入口的解锁门（纯数据 + 纯函数，零运行时依赖）
 *
 * ── 为什么需要这张表 ──
 *
 * 抖音首发日，底栏的秘境与通天塔对新号是**完全敞开**的：一个还没通过第 1 关的人
 * 可以直接点进去。当天有 171 人进了秘境、78 人进了通天塔，秘境 0 通关、塔 4 通关——
 * 这两处的数值是按「已经推完若干章」配的，新号进去只有一个结局：秒死。
 *
 * 抖音信息流的玩家是被算法推来的，没有「先看看攻略」的前置。底栏摆着五个格子，
 * 他就会挨个点。所以入口本身就是引导的一部分：**在玩家还不该去的地方，入口不该存在。**
 *
 * 采用「不可见」而不是「可见但点了提示未解锁」：
 * 后者要求新玩家读懂提示、理解自己该先干什么，等于又加了一层认知负担；
 * 前者让第一屏只剩「灵宠 / 召唤 / 主线」，动线唯一。
 *
 * ── 为什么这张表在 balance 层，判定却在 game/featureGate.ts ──
 *
 * 存档迁移（game/playerSave.ts）要按「这个存档里该功能当时是否已经开着」来决定
 * 补不补解锁通告，也就是说**存档层必须读到这张表**。而判定函数依赖 PlayerData，
 * PlayerData 又依赖 playerSave —— 把表和判定放在一起就会成环。
 * 所以这里只放数据与纯函数，凡是要读玩家状态的都在 game/featureGate.ts。
 */
import { STAGE_MAP } from './stages';

export type GatedFeatureId = 'realm' | 'tower';

export interface FeatureGateDef {
  id: GatedFeatureId;
  name: string;
  /** 通关这一关之后开放 */
  requiresStageId: string;
  /** 解锁通告「已看过」的引导 flag（登记在 game/tutorialFlags.ts） */
  noticeFlag: string;
  /**
   * 解锁通告正文。
   *
   * 必须说清「这是什么、去了能拿到什么、多久能来一次」这三件事。
   * 只写一句「秘境已解锁！」等于没说 —— 玩家点开一个不知道是干什么的新模式，
   * 结果还是白跑一趟，和不通告的区别只是多了一次打断。
   */
  notice: string;
}

export const FEATURE_GATES: Readonly<Record<GatedFeatureId, FeatureGateDef>> = {
  /*
   * 秘境是日循环，进去要有一支能打的队，卡在第 1 章中段：
   * 到 1-4 时玩家已经打过 4 场、见过换波与属性克制，具备最低限度的理解。
   */
  realm: {
    id: 'realm',
    name: '秘境',
    requiresStageId: 'stage_1_4',
    noticeFlag: 'realmUnlockNotice',
    notice: '秘境开啦！\n那儿每天能打 3 次，拿灵玉和灵宠币。\n每天开放的属性会换，记得回来看看～',
  },
  /*
   * 通天塔是长线爬层内容，跨层续战、灵机构筑都建立在「已经会玩」之上，
   * 卡到第 1 章通关（章 Boss）为止。
   */
  tower: {
    id: 'tower',
    name: '通天塔',
    requiresStageId: 'stage_1_8',
    noticeFlag: 'towerUnlockNotice',
    notice: '通天塔开啦！\n一层层往上爬，爬得越高奖励越好。\n路上还能捡机缘，让这一轮越打越强～',
  },
};

export const ALL_FEATURE_GATES: readonly FeatureGateDef[] = Object.values(FEATURE_GATES);

/** 全部解锁通告 flag（供 tutorialFlags 登记，不要另抄一份字符串） */
export const FEATURE_NOTICE_FLAGS: readonly string[] = ALL_FEATURE_GATES.map((g) => g.noticeFlag);

/** 解锁条件的人话描述，用于解锁弹窗与（万一走到的）拦截提示 */
export function featureUnlockHint(id: GatedFeatureId): string {
  const gate = FEATURE_GATES[id];
  const stage = STAGE_MAP.get(gate.requiresStageId);
  const label = stage ? `${stage.chapter}-${stage.index} ${stage.name}` : gate.requiresStageId;
  return `通关 ${label} 后开启${gate.name}`;
}

/**
 * 存档迁移用：哪些解锁通告应当**视为已经看过**。
 *
 * 规则是「这个存档载入时该功能是否已经开着」，而不是「这个玩家是不是老玩家」。
 * 这两者的区别就是首发后那个 bug 的全部内容：老档豁免按「有任何通关记录」判定，
 * 于是一个通到 1-6 的玩家被算作老玩家，通天塔的通告在他**还没有**通天塔的时候
 * 就被标成看过了，等他真的通关第 1 章，底栏凭空多一格而没有任何交代。
 *
 * 按功能逐个判定就不会错：
 * - 已经通过前置关（旧版本里这个入口一直摆在他底栏）→ 视为看过，别弹；
 * - 还没通过 → 留着，等他真正解锁的那一刻再说。
 */
export function featureNoticeSeed(
  isCleared: (stageId: string) => boolean,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const gate of ALL_FEATURE_GATES) {
    if (isCleared(gate.requiresStageId)) out[gate.noticeFlag] = true;
  }
  return out;
}
