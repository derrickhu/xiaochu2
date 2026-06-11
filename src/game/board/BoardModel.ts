/**
 * 棋盘数据模型（骨架）
 *
 * 只负责珠盘数据，不含渲染。后续迭代在此加入：
 * 拖珠路径交换、消除检测、下落填充。
 */
import { COMBAT, ORB_TYPES, type OrbType } from '@/balance/combat';

export class BoardModel {
  readonly cols = COMBAT.boardCols;
  readonly rows = COMBAT.boardRows;

  /** grid[row][col] */
  readonly grid: OrbType[][] = [];

  constructor(rng: () => number = Math.random) {
    for (let r = 0; r < this.rows; r++) {
      const row: OrbType[] = [];
      for (let c = 0; c < this.cols; c++) {
        row.push(this._randomOrb(rng));
      }
      this.grid.push(row);
    }
    this._removeInitialMatches(rng);
  }

  get(row: number, col: number): OrbType {
    return this.grid[row][col];
  }

  set(row: number, col: number, orb: OrbType): void {
    this.grid[row][col] = orb;
  }

  swap(r1: number, c1: number, r2: number, c2: number): void {
    const tmp = this.grid[r1][c1];
    this.grid[r1][c1] = this.grid[r2][c2];
    this.grid[r2][c2] = tmp;
  }

  private _randomOrb(rng: () => number): OrbType {
    return ORB_TYPES[Math.floor(rng() * ORB_TYPES.length)];
  }

  /** 初始盘面不允许出现现成 3 连（保证玩家必须主动转珠） */
  private _removeInitialMatches(rng: () => number): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        let guard = 0;
        while (this._formsMatchAt(r, c) && guard < 20) {
          this.grid[r][c] = this._randomOrb(rng);
          guard++;
        }
      }
    }
  }

  private _formsMatchAt(r: number, c: number): boolean {
    const orb = this.grid[r][c];
    // 只需向左/向上看（从左上往右下生成）
    if (c >= 2 && this.grid[r][c - 1] === orb && this.grid[r][c - 2] === orb) return true;
    if (r >= 2 && this.grid[r - 1][c] === orb && this.grid[r - 2][c] === orb) return true;
    return false;
  }
}
