/**
 * 新手引导进度 flag（单一真源）。
 *
 * 设计前提见 docs/06-新手引导.md：手势必须教；连击 / 克制 / 珠色
 * 只在做对或连续打不好时点破一句。**这里不许长成跨页引导链。**
 *
 * xiao_chu 第一版把引导做成了跨界面队列（首页 → 战斗 → 灵宠池 → 修炼 → 通天塔），
 * 结果两套完整实现（4 步试炼 / 序章爽局）最后没有任何调用入口，成了没人敢删的死代码。
 * 新增 flag 前先问：它教的东西是不是真的无法从盘面与反馈里自己看懂？
 */

import { FEATURE_NOTICE_FLAGS } from '@/balance/featureGates';

/** 引导 flag id（存档 key，改名等于丢进度，勿改） */
export const TUTORIAL_FLAGS = {
  /**
   * 首页「点这一关」已了结。
   * 新号一进章节地图是蒙的：底栏五个口、左栏一排按钮，不知道该点哪。
   * 点进第一关详情就算会了，不必等打完。
   */
  homeStart: 'homeStart',
  /**
   * 1-1 首战长拖示意已了结。
   * 「了结」= 玩家自己成功消除过一次。播了几轮不算学会，别再自动标完成。
   */
  dragHint: 'dragHint',
  /** 连击规则已点破（做对了或连续只消 1 组） */
  comboHint: 'comboHint',
  /** 五行克制已点破（消到克制色或连续消被克色） */
  counterHint: 'counterHint',
  /** 编队页「珠色=上阵属性」已说过一次 */
  teamOrb: 'teamOrb',
} as const;

export type TeachingFlag = (typeof TUTORIAL_FLAGS)[keyof typeof TUTORIAL_FLAGS];

/**
 * 教学 flag：教的是操作与规则，「老玩家早就会了」这个豁免对它们成立。
 */
export const ALL_TEACHING_FLAGS: readonly TeachingFlag[] = Object.values(TUTORIAL_FLAGS);

/**
 * 解锁通告 flag（秘境 / 通天塔），登记在此但**不吃老档豁免**。
 *
 * 它们放进 tutorial 存档是因为需求完全一样——一次性、布尔、跟着存档走。
 * 也过了本文件开头那道自问：底栏凭空多出一格，玩家**无法**从盘面和反馈里看懂发生了什么，
 * 他既不知道那是什么模式，也不知道自己是因为通了哪一关才拿到的。
 * 而且各自单页、点一下就没、彼此无顺序依赖，不是本文件警告的那种跨页引导链。
 *
 * ⚠️ 但它们与教学 flag 有一处关键区别，踩过一次别再踩：
 * 老档豁免的判据是「有任何通关记录」，对教学是对的（推到十几章的人当然会拖珠了），
 * 对解锁通告是**错的** —— 通到 1-6 的玩家按这个判据算老玩家，可他根本还没有通天塔，
 * 结果通告在他解锁之前就被标成看过，等他真通了第 1 章，底栏多一格而没有任何交代。
 * 正确判据是「这个存档里该功能当时是否已经开着」，见 balance/featureGates.featureNoticeSeed。
 */
export const ALL_FEATURE_NOTICE_FLAGS: readonly string[] = FEATURE_NOTICE_FLAGS;

export type TutorialFlag = TeachingFlag | string;

const TEACHING_SET = new Set<string>(ALL_TEACHING_FLAGS);
const FLAG_SET = new Set<string>([...ALL_TEACHING_FLAGS, ...ALL_FEATURE_NOTICE_FLAGS]);

/** 是否为已登记的 flag（未登记的 key 在清洗时丢弃） */
export function isTutorialFlag(id: string): boolean {
  return FLAG_SET.has(id);
}

/** 是否为吃老档豁免的教学 flag */
export function isTeachingFlag(id: string): id is TeachingFlag {
  return TEACHING_SET.has(id);
}

/** 全部教学 flag 已完成（老玩家豁免用；刻意不含解锁通告） */
export function allTeachingFlagsDone(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const id of ALL_TEACHING_FLAGS) out[id] = true;
  return out;
}

/**
 * 存档清洗：只保留已登记且为 true 的 flag。
 *
 * `veteran` = 老档已有通关记录。老档没有 tutorial 字段时**不能**等同于「新手」，
 * 否则已推到十几章的玩家回来会被弹 1-1 的拖珠示意。第一版就是靠云同步补写
 * introDone / tutorialDone 等 4 个 key 来救这个场，说明这坑踩过一次了。
 *
 * `featureNoticeSeen` 是解锁通告的独立种子（按功能是否已开放逐个判定），
 * 不能让 veteran 一把盖掉——原因见 ALL_FEATURE_NOTICE_FLAGS 上的警告。
 */
export function sanitizeTutorial(
  raw: unknown,
  veteran: boolean,
  featureNoticeSeen: Readonly<Record<string, boolean>> = {},
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  // 已经存下来的一律保留：玩家真看过的通告不该因为迁移逻辑变动而重弹
  if (raw && typeof raw === 'object') {
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v === true && isTutorialFlag(id)) out[id] = true;
    }
  }
  if (veteran) for (const id of ALL_TEACHING_FLAGS) out[id] = true;
  for (const [id, seen] of Object.entries(featureNoticeSeen)) {
    if (seen && isTutorialFlag(id)) out[id] = true;
  }
  return out;
}
