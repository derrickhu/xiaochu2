/**
 * 长拖示意的纯逻辑：可示范路径的搜索 + 文案与时序常量。
 *
 * 与 BattleDragHint（显示对象）分开，便于回归测试，也让「盘面试探必须还原」这条
 * 关键契约能被单测盯住 —— 它操作的是玩家的真实盘面，不是副本。
 */
import type { OrbType } from '@/balance/combat';
import type { BoardModel, Cell } from '@/game/board/BoardModel';

/**
 * 文案立刻上屏；手势只等半拍让进场落稳。
 * 上一版等 3 秒再出、再 3 秒就收，真机上根本看不清。
 */
export const FIRST_DELAY_MS = 350;
/** 一轮手势走完到下一轮的间隔；气泡一直留着 */
export const REPEAT_DELAY_MS = 700;
/** 手势循环上限（只作埋点计数，不再自动标「学会了」） */
export const MAX_ROUNDS = 8;
/** 单轮里手势走几遍 —— 慢一点、多走两遍，才跟得上手势 */
export const SWEEPS_PER_ROUND = 3;
export const SWEEP_MS = 1800;
export const SWEEP_GAP_MS = 450;

/**
 * 小灵在示意时说的唯一一句话。
 *
 * 文案纪律（第一版的教训）：**禁止相对进度描述**。
 * xiao_chu 第一章从 3 关扩到 8 关后，引导里「最后一关试炼在眼前啦」没同步改，
 * 玩家在 1-3 就看到「完成本章」，完全跳戏。有 __tests__/dragHintPath.test.ts 盯着。
 */
export const DRAG_HINT_TIP = '按住珠子，顺着路一直拖过去～';

export interface DragHintPath {
  from: Cell;
  to: Cell;
}

/**
 * 找一条「按住 A 拖到相邻 B 就能消」的真实路径。
 *
 * 只搜单步交换：一格的位移足够示范「按住 + 拖动」这个手势本身，
 * 而且它是盘面上最容易成功的一步 —— 玩家照着做一定能消掉，第一次尝试就该给成功。
 * 搜不到就返回 null，宁可不教也不能演一个拖完没反应的假动作。
 *
 * @param isUseful 该色珠是否有对应上阵灵宠（无则消除不出伤害）。优先挑有伤害的那步演。
 */
export function findDragHintPath(
  board: BoardModel,
  isUseful?: (orb: OrbType) => boolean,
): DragHintPath | null {
  // 盘面本身已有可消组 = 异常态（正常开局不留初始匹配），此时示意只会添乱
  if (board.findMatches().length > 0) return null;

  let fallback: DragHintPath | null = null;
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const orb = board.get(r, c);
      if (!orb || board.isLocked(r, c)) continue;
      // 只往右 / 下试，避免同一对相邻珠算两遍
      for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
        const nr = r + dr;
        const nc = c + dc;
        if (!board.inBounds(nr, nc)) continue;
        const other = board.get(nr, nc);
        if (!other || board.isLocked(nr, nc) || other === orb) continue;

        let matched: OrbType | null = null;
        board.swap(r, c, nr, nc);
        try {
          for (const group of board.findMatches()) {
            const touchesSwap = group.cells.some(
              (cell) => (cell.r === r && cell.c === c) || (cell.r === nr && cell.c === nc),
            );
            if (touchesSwap) {
              matched = group.orb;
              break;
            }
          }
        } finally {
          // 试探必须还原：这是玩家的真实盘面，不是副本
          board.swap(r, c, nr, nc);
        }
        if (!matched) continue;

        const path: DragHintPath = { from: { r, c }, to: { r: nr, c: nc } };
        if (!isUseful || isUseful(matched)) return path;
        fallback ??= path;
      }
    }
  }
  return fallback;
}
