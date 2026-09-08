/**
 * 失败结算的「怎么过」指路（纯函数，便于回归测试）。
 *
 * 兑现 docs/01-核心玩法循环.md §修正 2 早就写下的承诺：
 *   「卡关时明确提示：这关是水属性，招募 / 上场土系灵宠」
 * 在此之前代码对所有关卡固定显示同一句「消除克制属性珠子伤害更高」，
 * 且与失败次数无关 —— _failCounts 只计数不分支。等于文档承诺了、代码没兑现。
 *
 * 为什么第 1 次不直接指名：第一次失败往往只是手生或运气差，立刻教「换队」显得聒噪；
 * 连着输两次才说明是搭配问题，此时指名道姓才有说服力。这也是
 * docs/00-体验目标.md 审视清单第 1 条要的东西 —— 让换队成为比纯升级更短的路径。
 */
import { COMBAT, counterElementOf, type Element } from '@/balance/combat';
import { ELEMENT_NAME } from '@/balance/ui';

/** 连败到第几次开始指名克制属性 */
export const COACH_FAIL_THRESHOLD = 2;

export interface DefeatCoaching {
  /** 失败弹窗的提示行 */
  tip: string;
  /** 战力引导框标题 */
  guideHead: string;
  /**
   * 是否把「编队」摆进引导入口首位。
   * 卡关的第一反应应该是换队，而不是被推去召唤 / 商店掏钱。
   */
  offerTeam: boolean;
}

export function defeatCoaching(opts: {
  /** 关卡主属性（与入场弹窗/编队页敌情口径一致） */
  element: Element;
  /** 含本次的连败次数 */
  fails: number;
  /** 主线 = true；塔 / 秘境有自己的收场文案，不走指路 */
  isMainline: boolean;
}): DefeatCoaching {
  const generic: DefeatCoaching = {
    tip: '提示：消除克制属性珠子伤害更高',
    guideHead: '卡关了？试试提升战力',
    offerTeam: false,
  };
  if (!opts.isMainline || opts.fails < COACH_FAIL_THRESHOLD) return generic;

  const stageEl = ELEMENT_NAME[opts.element];
  const counterEl = ELEMENT_NAME[counterElementOf(opts.element)];
  // 倍率跟随数值表：设计文档里写的 1.6 早就被调成 1.75，写死会当场说谎
  return {
    tip: `这关是${stageEl}属性，上阵${counterEl}系灵宠伤害 ×${COMBAT.counterMultiplier}`,
    guideHead: `换上${counterEl}系灵宠再试一次`,
    offerTeam: true,
  };
}
