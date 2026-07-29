import { describe, it, expect } from 'vitest';
import { BoardModel } from '../BoardModel';

/** 固定 rng，盘面确定 */
function seededRng(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe('封印珠机制', () => {
  it('sealRandom 封印指定数量且标记为 locked', () => {
    const b = new BoardModel(seededRng(7));
    const sealed = b.sealRandom(4);
    expect(sealed).toHaveLength(4);
    expect(b.hasLocked()).toBe(true);
    for (const { r, c } of sealed) expect(b.isLocked(r, c)).toBe(true);
    expect(b.lockedCells()).toHaveLength(4);
  });

  it('封印珠不参与连消', () => {
    const b = new BoardModel(seededRng(3));
    // 构造一行三连 fire
    b.set(0, 0, 'fire');
    b.set(0, 1, 'fire');
    b.set(0, 2, 'fire');
    // 未封印时应能匹配
    let groups = b.findMatches();
    expect(groups.some((g) => g.orb === 'fire' && g.cells.length >= 3)).toBe(true);
    // 封印中间一颗后，三连被打断
    b.seal(0, 1);
    groups = b.findMatches();
    expect(groups.some((g) => g.orb === 'fire' && g.cells.length >= 3)).toBe(false);
  });

  it('消除相邻珠可解封封印珠', () => {
    const b = new BoardModel(seededRng(5));
    b.set(1, 1, 'water');
    b.seal(1, 1);
    expect(b.isLocked(1, 1)).toBe(true);
    // 清除其上方相邻格
    b.clearCells([{ r: 0, c: 1 }]);
    expect(b.isLocked(1, 1)).toBe(false);
  });

  it('sealColumns 锁整列，且不重复锁同一列', () => {
    const b = new BoardModel(seededRng(11));
    const first = b.sealColumns(1);
    expect(first).toHaveLength(b.rows);
    const col = first[0].c;
    for (let r = 0; r < b.rows; r++) expect(b.isLocked(r, col)).toBe(true);

    // 第二次应挑另一列：挑「未封印珠最多」的列，已锁列不会再被选中
    const second = b.sealColumns(1);
    expect(second).toHaveLength(b.rows);
    expect(second[0].c).not.toBe(col);
  });

  it('锁列后该列不参与连消，纵向路线被掐断', () => {
    const b = new BoardModel(seededRng(13));
    const col = b.sealColumns(1)[0].c;
    for (let r = 0; r < b.rows; r++) b.set(r, col, 'fire');
    const groups = b.findMatches();
    expect(groups.some((g) => g.cells.some((c) => c.c === col))).toBe(false);
  });

  it('封印珠不会被转珠技能命中', () => {
    const b = new BoardModel(seededRng(9));
    b.set(2, 2, 'wood');
    b.seal(2, 2);
    b.convertRandom('metal', 30); // 尝试转化全盘（5×6）
    // 被封印的木珠不应被转化
    expect(b.get(2, 2)).toBe('wood');
    expect(b.isLocked(2, 2)).toBe(true);
  });
});
