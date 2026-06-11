/**
 * 通用对象池
 *
 * 转珠场景高频对象（珠子 Sprite、伤害飘字、粒子）必须复用，
 * 避免每帧 new/destroy 造成 GC 卡顿。
 */

export interface PoolOptions<T> {
  /** 创建新对象 */
  create: () => T;
  /** 从池中取出时调用（重置状态） */
  onGet?: (obj: T) => void;
  /** 归还时调用（隐藏/解绑） */
  onRelease?: (obj: T) => void;
  /** 预创建数量 */
  preallocate?: number;
  /** 池上限，超出的归还对象直接丢弃（交给 destroy） */
  maxSize?: number;
  /** 超出上限丢弃时的销毁逻辑 */
  onDiscard?: (obj: T) => void;
}

export class ObjectPool<T> {
  private _free: T[] = [];
  private readonly _opts: PoolOptions<T>;

  constructor(opts: PoolOptions<T>) {
    this._opts = opts;
    const n = opts.preallocate ?? 0;
    for (let i = 0; i < n; i++) {
      this._free.push(opts.create());
    }
  }

  get(): T {
    const obj = this._free.pop() ?? this._opts.create();
    this._opts.onGet?.(obj);
    return obj;
  }

  release(obj: T): void {
    const max = this._opts.maxSize ?? Infinity;
    if (this._free.length >= max) {
      this._opts.onDiscard?.(obj);
      return;
    }
    this._opts.onRelease?.(obj);
    this._free.push(obj);
  }

  /** 清空池（场景销毁时调用） */
  clear(): void {
    if (this._opts.onDiscard) {
      for (const obj of this._free) this._opts.onDiscard(obj);
    }
    this._free.length = 0;
  }

  get freeCount(): number {
    return this._free.length;
  }
}
