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

  /** 封印状态叠加层：locked[r][c] = true 表示该珠被封印（不可拖/不可消） */
  private readonly _locked: boolean[][] = [];

  private readonly _rng: () => number;

  constructor(rng: () => number = Math.random) {
    this._rng = rng;
    for (let r = 0; r < this.rows; r++) {
      const row: (OrbType | null)[] = [];
      const lockRow: boolean[] = [];
      for (let c = 0; c < this.cols; c++) {
        row.push(this._randomOrb());
        lockRow.push(false);
      }
      this.grid.push(row);
      this._locked.push(lockRow);
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
    const lt = this._locked[r1][c1];
    this._locked[r1][c1] = this._locked[r2][c2];
    this._locked[r2][c2] = lt;
  }

  // ── 封印珠（机制轴 · 棋盘） ──

  /** 该格是否被封印（锁定不可拖/不可消） */
  isLocked(row: number, col: number): boolean {
    return this._locked[row]?.[col] ?? false;
  }

  /** 是否存在任意封印珠 */
  hasLocked(): boolean {
    return this._locked.some((row) => row.some(Boolean));
  }

  /** 当前所有封印珠格（渲染用） */
  lockedCells(): Cell[] {
    const cells: Cell[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this._locked[r][c]) cells.push({ r, c });
      }
    }
    return cells;
  }

  /** 封印指定格（仅对彩色珠生效） */
  seal(row: number, col: number): void {
    if (this.grid[row]?.[col]) this._locked[row][col] = true;
  }

  /** 随机封印 count 颗未封印的彩色珠，返回实际封印格 */
  sealRandom(count: number): Cell[] {
    const candidates: Cell[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] && !this._locked[r][c]) candidates.push({ r, c });
      }
    }
    const n = Math.min(count, candidates.length);
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(this._rng() * (candidates.length - i));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const picked = candidates.slice(0, n);
    for (const { r, c } of picked) this._locked[r][c] = true;
    return picked;
  }

  /** 取该格用于消除判定的颜色：封印珠视为 null（不参与连消） */
  private _matchColor(row: number, col: number): OrbType | null {
    return this._locked[row][col] ? null : this.grid[row][col];
  }

  /**
   * 消除检测：先标记所有行/列 3+ 连，再把相邻同色标记珠 BFS 合并为组
   * （十字/L/T 形算一组，与 xiao_chu findMatchesSeparate 行为一致）
   */
  findMatches(): MatchGroup[] {
    const { rows, cols, grid } = this;
    const marked: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));
    // 封印珠视为 null，不参与连消判定
    const cl = (r: number, c: number): OrbType | null => this._matchColor(r, c);

    // 横向 3+ 连
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c <= cols - 3; c++) {
        const a = cl(r, c);
        if (a && a === cl(r, c + 1) && a === cl(r, c + 2)) {
          let end = c + 2;
          while (end + 1 < cols && cl(r, end + 1) === a) end++;
          for (let cc = c; cc <= end; cc++) marked[r][cc] = true;
          c = end;
        }
      }
    }
    // 纵向 3+ 连
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r <= rows - 3; r++) {
        const a = cl(r, c);
        if (a && a === cl(r + 1, c) && a === cl(r + 2, c)) {
          let end = r + 2;
          while (end + 1 < rows && cl(end + 1, c) === a) end++;
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

  /**
   * 清除指定格（置 null，等待 collapse）。
   * 副作用：被消除格正交相邻的封印珠解封（「消周围解锁」）。
   */
  clearCells(cells: Cell[]): void {
    for (const { r, c } of cells) {
      this.grid[r][c] = null;
      this._locked[r][c] = false;
    }
    for (const { r, c } of cells) {
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (this.inBounds(nr, nc) && this._locked[nr][nc]) this._locked[nr][nc] = false;
      }
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
      // 自底向上：非空珠下沉（封印状态随珠一起移动）
      for (let r = this.rows - 1; r >= 0; r--) {
        const orb = this.grid[r][c];
        if (orb === null) continue;
        if (r !== writeRow) {
          this.grid[writeRow][c] = orb;
          this._locked[writeRow][c] = this._locked[r][c];
          this.grid[r][c] = null;
          this._locked[r][c] = false;
          moves.push({ col: c, toRow: writeRow, orb, fromRow: r, spawnAbove: 0 });
        }
        writeRow--;
      }
      // 顶部补新珠：writeRow 及以上都是空洞（新珠永远未封印）
      let spawnAbove = 1;
      for (let r = writeRow; r >= 0; r--) {
        const orb = this._randomOrb();
        this.grid[r][c] = orb;
        this._locked[r][c] = false;
        moves.push({ col: c, toRow: r, orb, fromRow: null, spawnAbove });
        spawnAbove++;
      }
    }
    return moves;
  }

  /** 解除全部封印珠（净化技），返回被解封的格子 */
  unsealAll(): Cell[] {
    const cells: Cell[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this._locked[r][c]) {
          this._locked[r][c] = false;
          cells.push({ r, c });
        }
      }
    }
    return cells;
  }

  /**
   * 转珠技能：随机把 count 颗非目标色珠转为 to。
   * 指定 from 时只转该颜色珠（定向转珠，策略性更强）。
   * 返回实际转换的格子（可能少于 count，盘面同色不足时）。
   */
  convertRandom(to: OrbType, count: number, from?: OrbType): Cell[] {
    const candidates: Cell[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const orb = this.grid[r][c];
        if (!orb || orb === to || this._locked[r][c]) continue;
        if (from && orb !== from) continue;
        candidates.push({ r, c });
      }
    }
    // Fisher-Yates 局部洗牌取前 count 个
    const n = Math.min(count, candidates.length);
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(this._rng() * (candidates.length - i));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const picked = candidates.slice(0, n);
    for (const { r, c } of picked) {
      this.grid[r][c] = to;
    }
    return picked;
  }

  /** 转化整行（随机一行内全部非锁定珠）为 to，返回受影响格 */
  convertRow(to: OrbType): Cell[] {
    return this._convertLine('row', to);
  }

  /** 转化整列（随机一列内全部非锁定珠）为 to，返回受影响格 */
  convertCol(to: OrbType): Cell[] {
    return this._convertLine('col', to);
  }

  /** 十字转珠：选可转珠最多的行+列组合，整行整列转为 to，返回受影响格 */
  convertCross(to: OrbType): Cell[] {
    const rowCells = this._convertLine('row', to);
    const colCells = this._convertLine('col', to);
    // 去重（行列交叉格只记一次；_convertLine 已跳过 to 色，列转换不会重复行内格）
    const seen = new Set(rowCells.map(({ r, c }) => r * this.cols + c));
    const merged = [...rowCells];
    for (const cell of colCells) {
      if (!seen.has(cell.r * this.cols + cell.c)) merged.push(cell);
    }
    return merged;
  }

  private _convertLine(kind: 'row' | 'col', to: OrbType): Cell[] {
    const span = kind === 'row' ? this.rows : this.cols;
    const cross = kind === 'row' ? this.cols : this.rows;
    // 选含可转珠最多的一条线，避免整条都被锁定时空转
    let bestLine = -1;
    let bestCount = -1;
    for (let line = 0; line < span; line++) {
      let cnt = 0;
      for (let i = 0; i < cross; i++) {
        const r = kind === 'row' ? line : i;
        const c = kind === 'row' ? i : line;
        const orb = this.grid[r][c];
        if (orb && orb !== to && !this._locked[r][c]) cnt++;
      }
      if (cnt > bestCount) { bestCount = cnt; bestLine = line; }
    }
    if (bestLine < 0 || bestCount <= 0) return [];
    const picked: Cell[] = [];
    for (let i = 0; i < cross; i++) {
      const r = kind === 'row' ? bestLine : i;
      const c = kind === 'row' ? i : bestLine;
      const orb = this.grid[r][c];
      if (orb && orb !== to && !this._locked[r][c]) {
        this.grid[r][c] = to;
        picked.push({ r, c });
      }
    }
    return picked;
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
