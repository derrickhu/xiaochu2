import { describe, expect, it } from 'vitest';

import type { OrbType } from '@/balance/combat';
import { BoardModel } from '@/game/board/BoardModel';
import { HOME_START_TIP, HOME_WELCOME_TIP } from '@/scenes/HomeStartGuide';
import {
  DRAG_HINT_TIP,
  FIRST_DELAY_MS,
  findDragHintPath,
} from '@/scenes/battle/dragHintPath';

/** 确定性 rng，便于复现盘面 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function snapshot(board: BoardModel): string {
  return board.grid.map((row) => row.join(',')).join('|');
}

/**
 * 无初始匹配的确定盘面，含两处「一步可消」：
 *   (0,2)↔(1,2) 让首行凑成三连火，(0,5)↔(1,5) 让首行凑成三连水。
 */
function fixedBoard(): BoardModel {
  const rows: OrbType[][] = [
    ['fire', 'fire', 'wood', 'water', 'water', 'metal'],
    ['earth', 'metal', 'fire', 'earth', 'wood', 'water'],
    ['wood', 'water', 'earth', 'metal', 'fire', 'earth'],
    ['metal', 'fire', 'water', 'wood', 'earth', 'wood'],
    ['water', 'earth', 'metal', 'fire', 'metal', 'fire'],
  ];
  const board = new BoardModel(lcg(1));
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) board.set(r, c, rows[r][c]);
  }
  return board;
}

describe('长拖示意寻路', () => {
  it('返回的路径交换后确实能消，且必须命中被交换的格子', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const board = new BoardModel(lcg(seed));
      const path = findDragHintPath(board);
      if (!path) continue;
      const { from, to } = path;
      board.swap(from.r, from.c, to.r, to.c);
      const groups = board.findMatches();
      const hit = groups.some((g) => g.cells.some(
        (cell) => (cell.r === from.r && cell.c === from.c)
          || (cell.r === to.r && cell.c === to.c),
      ));
      expect(hit, `seed=${seed} 演示的一步拖完没有消除`).toBe(true);
    }
  });

  it('搜索不留痕：试探过后盘面必须与搜索前完全一致', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const board = new BoardModel(lcg(seed));
      const before = snapshot(board);
      findDragHintPath(board);
      expect(snapshot(board), `seed=${seed} 搜索污染了玩家的真实盘面`).toBe(before);
    }
  });

  it('相邻两格必定紧挨着，不会演出一个跨格的假手势', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const path = findDragHintPath(new BoardModel(lcg(seed)));
      if (!path) continue;
      const dist = Math.abs(path.from.r - path.to.r) + Math.abs(path.from.c - path.to.c);
      expect(dist).toBe(1);
    }
  });

  it('盘面本身已有可消组时不演：那是异常态，示意只会添乱', () => {
    const board = new BoardModel(lcg(7));
    // 头一行强行摆出三连
    board.set(0, 0, 'fire');
    board.set(0, 1, 'fire');
    board.set(0, 2, 'fire');
    expect(board.findMatches().length).toBeGreaterThan(0);
    expect(findDragHintPath(board)).toBeNull();
  });

  it('优先演有上阵灵宠承接的珠色：拖完没伤害的示范等于白教', () => {
    // 这盘面上「消火」的一步在搜索顺序里更早（0,2），「消水」的一步更晚（0,5）
    const board = fixedBoard();
    const fireStep = findDragHintPath(board);
    expect(fireStep).toEqual({ from: { r: 0, c: 2 }, to: { r: 1, c: 2 } });

    // 队里只有水宠时必须跳过更早的火，改演水那一步
    const waterStep = findDragHintPath(fixedBoard(), (orb: OrbType) => orb === 'water');
    expect(waterStep).toEqual({ from: { r: 0, c: 5 }, to: { r: 1, c: 5 } });
  });

  it('一个可消珠色都接不住时仍给出路径：先让他学会拖，伤害是下一课', () => {
    const path = findDragHintPath(fixedBoard(), () => false);
    expect(path).not.toBeNull();
  });
});

describe('引导文案纪律', () => {
  it('不含相对进度描述：第一版扩关后没同步，玩家在 1-3 看到「完成本章」直接跳戏', () => {
    const banned = ['本章', '最后一关', '章末', '还剩', '终章'];
    for (const word of banned) {
      expect(DRAG_HINT_TIP).not.toContain(word);
      expect(HOME_START_TIP).not.toContain(word);
      expect(HOME_WELCOME_TIP).not.toContain(word);
    }
  });

  it('进战斗后立刻出字：再等 3 秒等于半天才出，真机上看不清', () => {
    expect(FIRST_DELAY_MS).toBeLessThanOrEqual(500);
  });

  it('首页先欢迎再指路，欢迎句里要有世界名', () => {
    expect(HOME_WELCOME_TIP).toContain('欢迎来到灵兽森林');
    expect(HOME_START_TIP).toContain('点这一关');
  });
});
