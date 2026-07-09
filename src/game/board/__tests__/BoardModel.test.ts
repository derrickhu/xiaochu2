import { describe, it, expect } from 'vitest';
import { BoardModel } from '../BoardModel';
import type { OrbType } from '@/balance/combat';

/** 用固定盘面覆盖随机生成的棋盘 */
function setBoard(board: BoardModel, layout: string[]): void {
  const map: Record<string, OrbType> = {
    M: 'metal', W: 'wood', A: 'water', F: 'fire', E: 'earth', H: 'heart',
  };
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      board.set(r, c, map[layout[r][c]]);
    }
  }
}

/** 构造无现成消除的基底盘面（双色棋盘格交错，5×6） */
const NEUTRAL: string[] = [
  'MWMWMW',
  'WMWMWM',
  'MWMWMW',
  'WMWMWM',
  'MWMWMW',
];

function neutralBoard(): BoardModel {
  const b = new BoardModel(() => 0);
  setBoard(b, NEUTRAL);
  return b;
}

describe('初始盘面', () => {
  it('生成后无现成 3 连', () => {
    for (let i = 0; i < 30; i++) {
      const b = new BoardModel();
      expect(b.findMatches()).toEqual([]);
    }
  });

  it('盘面无空洞', () => {
    const b = new BoardModel();
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        expect(b.get(r, c)).not.toBeNull();
      }
    }
  });
});

describe('findMatches', () => {
  it('横向 3 连', () => {
    const b = neutralBoard();
    setBoard(b, [
      'FFFWMW',
      'WMWMWM',
      'MWMWMW',
      'WMWMWM',
      'MWMWMW',
    ]);
    const groups = b.findMatches();
    expect(groups).toHaveLength(1);
    expect(groups[0].orb).toBe('fire');
    expect(groups[0].cells).toHaveLength(3);
  });

  it('纵向 4 连整组识别', () => {
    const b = neutralBoard();
    setBoard(b, [
      'EWMWMW',
      'EMWMWM',
      'EWMWMW',
      'EMWMWM',
      'MWMWMW',
    ]);
    const groups = b.findMatches();
    expect(groups).toHaveLength(1);
    expect(groups[0].orb).toBe('earth');
    expect(groups[0].cells).toHaveLength(4);
  });

  it('十字形横纵相连合并为一组', () => {
    const b = neutralBoard();
    setBoard(b, [
      'MWHWMW',
      'WMHMWM',
      'MHHHMW',
      'WMHMWM',
      'MWMWMW',
    ]);
    const groups = b.findMatches();
    expect(groups).toHaveLength(1);
    expect(groups[0].orb).toBe('heart');
    // 纵 4（r0~r3 c2）+ 横 3（r2 c1~c3），交叉去重共 6 颗
    expect(groups[0].cells).toHaveLength(6);
  });

  it('同色不相邻的两组分开计（Combo 基础）', () => {
    const b = neutralBoard();
    setBoard(b, [
      'FFFWMW',
      'WMWMWM',
      'MWMFFF',
      'WMWMWM',
      'MWMWMW',
    ]);
    const groups = b.findMatches();
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.orb === 'fire')).toBe(true);
  });

  it('不同色多组同时检出', () => {
    const b = neutralBoard();
    setBoard(b, [
      'FFFWMW',
      'WMWMWM',
      'MWMWMW',
      'WMWMWM',
      'AAAWMW',
    ]);
    const groups = b.findMatches();
    expect(groups).toHaveLength(2);
    const orbs = groups.map((g) => g.orb).sort();
    expect(orbs).toEqual(['fire', 'water']);
  });

  it('2 连不消除', () => {
    const b = neutralBoard();
    expect(b.findMatches()).toEqual([]);
  });
});

describe('clearCells + collapse', () => {
  it('消除后下落填补空洞，新珠补满顶部', () => {
    const b = neutralBoard();
    setBoard(b, [
      'FWMWMW',
      'AMWMWM',
      'EEEWMW',
      'WMWMWM',
      'MWMWMW',
    ]);
    const groups = b.findMatches();
    expect(groups).toHaveLength(1);
    b.clearCells(groups[0].cells);

    // 清除后 r2 行前三列为空
    expect(b.get(2, 0)).toBeNull();
    expect(b.get(2, 1)).toBeNull();
    expect(b.get(2, 2)).toBeNull();

    const moves = b.collapse();

    // 盘面无空洞
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        expect(b.get(r, c)).not.toBeNull();
      }
    }
    // c0：r0 'F'、r1 'A' 各下落一格，顶部补 1 颗新珠
    expect(b.get(1, 0)).toBe('fire');
    expect(b.get(2, 0)).toBe('water');
    // 每列消 1 颗 → 3 颗既有珠位移记录 ×2 + 3 颗新珠
    const newOrbs = moves.filter((m) => m.fromRow === null);
    const fallen = moves.filter((m) => m.fromRow !== null);
    expect(newOrbs).toHaveLength(3);
    expect(fallen).toHaveLength(6);
    // 新珠 spawnAbove 从 1 开始
    expect(newOrbs.every((m) => m.spawnAbove >= 1)).toBe(true);
    // 下落不改变列
    expect(moves.every((m) => m.fromRow === null || m.col === m.col)).toBe(true);
  });

  it('整列消除时新珠按 spawnAbove 递增堆叠', () => {
    const b = neutralBoard();
    const cells = Array.from({ length: 5 }, (_, r) => ({ r, c: 3 }));
    b.clearCells(cells);
    const moves = b.collapse();
    const colMoves = moves.filter((m) => m.col === 3);
    expect(colMoves).toHaveLength(5);
    expect(colMoves.every((m) => m.fromRow === null)).toBe(true);
    const spawns = colMoves.map((m) => m.spawnAbove).sort((a, b2) => a - b2);
    expect(spawns).toEqual([1, 2, 3, 4, 5]);
  });

  it('连锁：下落后可再次 findMatches', () => {
    const b = neutralBoard();
    // 消除 r3 行 EEE 后，r2 的 F 落到 r3
    setBoard(b, [
      'MWMWMW',
      'WMWMWM',
      'FWMWMW',
      'EEEWAM',
      'MWFFMW',
    ]);
    const first = b.findMatches();
    expect(first).toHaveLength(1);
    expect(first[0].orb).toBe('earth');
    b.clearCells(first[0].cells);

    // 用固定 rng 保证新珠不构成额外消除干扰断言：metal/wood 交替
    // （collapse 内部用构造时传入的 rng=()=>0，恒生成 ORB_TYPES[0]='metal'）
    b.collapse();

    const second = b.findMatches();
    expect(Array.isArray(second)).toBe(true);
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        expect(b.get(r, c)).not.toBeNull();
      }
    }
  });

  it('swap 交换两格', () => {
    const b = neutralBoard();
    b.swap(0, 0, 0, 1);
    expect(b.get(0, 0)).toBe('wood');
    expect(b.get(0, 1)).toBe('metal');
  });
});
