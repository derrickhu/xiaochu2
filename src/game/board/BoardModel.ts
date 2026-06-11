/**
 * 棋盘数据模型（纯逻辑，零渲染）
 *
 * 职责：珠盘数据、交换、消除检测（行列 3+ 连 + 同色相邻合并）、
 * 消除后下落补珠。动画由 BoardView 根据返回的位移信息播放。
 */
import { COMBAT, ORB_TYPES, type OrbType } from '@/balance/combat';

export interface Cell {
  r: number;
  c: number;
}

/** 一组可消除的同色珠 */
export interface MatchGroup {
  orb: OrbType;
  cells: Cell[];
}

/** 一颗珠的下落位移（供动画使用） */
export interface FallMove {
  col: number;
  /** 落点行 */
  toRow: number;
  orb: OrbType;
  /** 既有珠的起始行；新珠为 null */
  fromRow: number | null;
  /** 新珠在棋盘顶部之上的虚拟起始位置（1 = 紧贴顶上一格） */
  spawnAbove: number;
}

export class BoardModel {
  readonly cols = COMBAT.boardCols;
  readonly rows = COMBAT.boardRows;

  /** grid[row][col]，消除后短暂存在 null，collapse 后无空洞 */
  readonly grid: (OrbType | null)[][] = [];

  private readonly _rng: () => number;

  constructor(rng: () => number = Math.random) {
    this._rng = rng;
    for (let r = 0; r < this.rows; r++) {
      const row: (OrbType | null)[] = [];
      for (let c = 0; c < this.cols; c++) {
        row.push(this._randomOrb());
      }
      this.grid.push(row);
    }
    this._removeInitialMatches();
  }

  get(row: number, col: number): OrbType | null {
    return this.grid[row][col];
  }

  set(row: number, col: number, orb: OrbType | null): void {
    this.grid[row][col] = orb;
  }

  inBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  swap(r1: number, c1: number, r2: number, c2: number): void {
    const tmp = this.grid[r1][c1];
    this.grid[r1][c1] = this.grid[r2][c2];
    this.grid[r2][c2] = tmp;
  }

  /**
   * 消除检测：先标记所有行/列 3+ 连，再把相邻同色标记珠 BFS 合并为组
   * （十字/L/T 形算一组，与 xiao_chu findMatchesSeparate 行为一致）
   */
  findMatches(): MatchGroup[] {
    const { rows, cols, grid } = this;
    const marked: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));

    // 横向 3+ 连
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c <= cols - 3; c++) {
        const a = grid[r][c];
        if (a && a === grid[r][c + 1] && a === grid[r][c + 2]) {
          let end = c + 2;
          while (end + 1 < cols && grid[r][end + 1] === a) end++;
          for (let cc = c; cc <= end; cc++) marked[r][cc] = true;
          c = end;
        }
      }
    }
    // 纵向 3+ 连
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r <= rows - 3; r++) {
        const a = grid[r][c];
        if (a && a === grid[r + 1][c] && a === grid[r + 2][c]) {
          let end = r + 2;
          while (end + 1 < rows && grid[end + 1][c] === a) end++;
          for (let rr = r; rr <= end; rr++) marked[rr][c] = true;
          r = end;
        }
      }
    }

    // 相邻同色标记珠合并为组
    const visited: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));
    const groups: MatchGroup[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!marked[r][c] || visited[r][c]) continue;
        const orb = grid[r][c]!;
        const cells: Cell[] = [];
        const queue: Cell[] = [{ r, c }];
        visited[r][c] = true;
        let head = 0;
        while (head < queue.length) {
          const cur = queue[head++];
          cells.push(cur);
          for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nr = cur.r + dr;
            const nc = cur.c + dc;
            if (
              nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
              !visited[nr][nc] && marked[nr][nc] && grid[nr][nc] === orb
            ) {
              visited[nr][nc] = true;
              queue.push({ r: nr, c: nc });
            }
          }
        }
        groups.push({ orb, cells });
      }
    }
    return groups;
  }

  /** 清除指定格（置 null，等待 collapse） */
  clearCells(cells: Cell[]): void {
    for (const { r, c } of cells) {
      this.grid[r][c] = null;
    }
  }

  /**
   * 下落补珠：每列非空珠下沉填补空洞，顶部生成新珠。
   * 返回所有发生位移/新生的珠（既有珠 fromRow→toRow，新珠从棋盘上方掉入）。
   */
  collapse(): FallMove[] {
    const moves: FallMove[] = [];
    for (let c = 0; c < this.cols; c++) {
      let writeRow = this.rows - 1;
      // 自底向上：非空珠下沉
      for (let r = this.rows - 1; r >= 0; r--) {
        const orb = this.grid[r][c];
        if (orb === null) continue;
        if (r !== writeRow) {
          this.grid[writeRow][c] = orb;
          this.grid[r][c] = null;
          moves.push({ col: c, toRow: writeRow, orb, fromRow: r, spawnAbove: 0 });
        }
        writeRow--;
      }
      // 顶部补新珠：writeRow 及以上都是空洞
      let spawnAbove = 1;
      for (let r = writeRow; r >= 0; r--) {
        const orb = this._randomOrb();
        this.grid[r][c] = orb;
        moves.push({ col: c, toRow: r, orb, fromRow: null, spawnAbove });
        spawnAbove++;
      }
    }
    return moves;
  }

  private _randomOrb(): OrbType {
    return ORB_TYPES[Math.floor(this._rng() * ORB_TYPES.length)];
  }

  /** 初始盘面不允许出现现成 3 连（保证玩家必须主动转珠） */
  private _removeInitialMatches(): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        let guard = 0;
        while (this._formsMatchAt(r, c) && guard < 20) {
          this.grid[r][c] = this._randomOrb();
          guard++;
        }
      }
    }
  }

  private _formsMatchAt(r: number, c: number): boolean {
    const orb = this.grid[r][c];
    if (!orb) return false;
    // 只需向左/向上看（从左上往右下生成）
    if (c >= 2 && this.grid[r][c - 1] === orb && this.grid[r][c - 2] === orb) return true;
    if (r >= 2 && this.grid[r - 1][c] === orb && this.grid[r - 2][c] === orb) return true;
    return false;
  }
}
