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

export type TutorialFlag = (typeof TUTORIAL_FLAGS)[keyof typeof TUTORIAL_FLAGS];

export const ALL_TUTORIAL_FLAGS: readonly TutorialFlag[] = Object.values(TUTORIAL_FLAGS);

const FLAG_SET = new Set<string>(ALL_TUTORIAL_FLAGS);

export function isTutorialFlag(id: string): id is TutorialFlag {
  return FLAG_SET.has(id);
}

/** 全部已完成（老玩家豁免用） */
export function allTutorialFlagsDone(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const id of ALL_TUTORIAL_FLAGS) out[id] = true;
  return out;
}

/**
 * 存档清洗：只保留已登记且为 true 的 flag。
 *
 * `veteran` = 老档已有通关记录。老档没有 tutorial 字段时**不能**等同于「新手」，
 * 否则已推到十几章的玩家回来会被弹 1-1 的拖珠示意。第一版就是靠云同步补写
 * introDone / tutorialDone 等 4 个 key 来救这个场，说明这坑踩过一次了。
 */
export function sanitizeTutorial(raw: unknown, veteran: boolean): Record<string, boolean> {
  if (veteran) return allTutorialFlagsDone();
  const out: Record<string, boolean> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === true && isTutorialFlag(id)) out[id] = true;
  }
  return out;
}
