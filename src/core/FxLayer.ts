/**
 * 轻量粒子特效层（引擎级，零业务依赖）
 *
 * - 对象池驱动的 Sprite 粒子，单次爆裂 8~16 粒，普通 Container 足够
 * - 由宿主场景每帧调用 update(dt) 驱动（与场景生命周期同步，场景销毁即停止）
 * - 默认使用 Texture.WHITE + tint，可传自定义纹理（如珠子碎片）
 */
import * as PIXI from 'pixi.js';
import { ObjectPool } from './ObjectPool';
import { TweenManager } from './TweenManager';

interface Particle {
  sp: PIXI.Sprite;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  life: number;
  maxLife: number;
  startSize: number;
  endSize: number;
  startAlpha: number;
  spin: number;
}

export interface BurstOptions {
  x: number;
  y: number;
  color: number;
  /** 粒子数量，默认 10 */
  count?: number;
  /** 初速度（设计像素/秒），默认 360 */
  speed?: number;
  /** 速度随机系数 0~1，默认 0.5 */
  speedVar?: number;
  /** 重力（设计像素/秒²），默认 700 */
  gravity?: number;
  /** 寿命（秒），默认 0.45 */
  life?: number;
  /** 粒子起始尺寸（设计像素），默认 16 */
  size?: number;
  /** 结束尺寸比例（相对起始），默认 0.15 */
  endScale?: number;
  /** 发射基准方向（弧度），不传 = 全向 */
  angle?: number;
  /** 扇形张角（弧度），默认 2π */
  spread?: number;
  /** 自定义纹理（默认 Texture.WHITE） */
  texture?: PIXI.Texture;
  alpha?: number;
}

export class FxLayer {
  readonly container = new PIXI.Container();

  private _pool: ObjectPool<PIXI.Sprite>;
  private _particles: Particle[] = [];

  constructor() {
    this.container.eventMode = 'none';
    this._pool = new ObjectPool<PIXI.Sprite>({
      create: () => {
        const sp = new PIXI.Sprite(PIXI.Texture.WHITE);
        sp.anchor.set(0.5);
        return sp;
      },
      onGet: (sp) => {
        sp.visible = true;
        sp.alpha = 1;
        sp.rotation = 0;
      },
      onRelease: (sp) => {
        sp.visible = false;
        if (sp.parent) sp.parent.removeChild(sp);
      },
      preallocate: 32,
      maxSize: 128,
      onDiscard: (sp) => sp.destroy(),
    });
  }

  /** 粒子爆裂 */
  burst(opts: BurstOptions): void {
    const count = opts.count ?? 10;
    const speed = opts.speed ?? 360;
    const speedVar = opts.speedVar ?? 0.5;
    const gravity = opts.gravity ?? 700;
    const life = opts.life ?? 0.45;
    const size = opts.size ?? 16;
    const endScale = opts.endScale ?? 0.15;
    const spread = opts.spread ?? Math.PI * 2;
    const baseAngle = opts.angle ?? 0;
    const tex = opts.texture ?? PIXI.Texture.WHITE;
    const alpha = opts.alpha ?? 1;

    for (let i = 0; i < count; i++) {
      const sp = this._pool.get();
      sp.texture = tex;
      sp.tint = opts.color;
      sp.position.set(opts.x, opts.y);
      sp.width = size;
      sp.height = size;
      sp.alpha = alpha;
      this.container.addChild(sp);

      // 全向时均匀分布 + 随机抖动；扇形时在张角内随机
      const ang = spread >= Math.PI * 2
        ? (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6
        : baseAngle + (Math.random() - 0.5) * spread;
      const v = speed * (1 - speedVar + Math.random() * speedVar * 2);
      const lifeJitter = life * (0.7 + Math.random() * 0.6);

      this._particles.push({
        sp,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v,
        gravity,
        drag: 0.92,
        life: lifeJitter,
        maxLife: lifeJitter,
        startSize: size * (0.7 + Math.random() * 0.6),
        endSize: size * endScale,
        startAlpha: alpha,
        spin: (Math.random() - 0.5) * 10,
      });
    }
  }

  /** 每帧驱动（由宿主场景调用） */
  update(dt: number): void {
    if (this._particles.length === 0) return;
    const alive: Particle[] = [];
    for (const p of this._particles) {
      p.life -= dt;
      if (p.life <= 0 || p.sp.destroyed) {
        if (!p.sp.destroyed) this._pool.release(p.sp);
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.sp.x += p.vx * dt;
      p.sp.y += p.vy * dt;
      p.sp.rotation += p.spin * dt;
      const t = 1 - p.life / p.maxLife;
      const sz = p.startSize + (p.endSize - p.startSize) * t;
      p.sp.width = sz;
      p.sp.height = sz;
      p.sp.alpha = p.startAlpha * (1 - t * t);
      alive.push(p);
    }
    this._particles = alive;
  }

  /** 立即清空所有粒子 */
  clear(): void {
    for (const p of this._particles) {
      if (!p.sp.destroyed) this._pool.release(p.sp);
    }
    this._particles = [];
  }

  destroy(): void {
    this.clear();
    this._pool.clear();
    this.container.destroy({ children: true });
  }
}

/**
 * 受击闪白：短时把目标推向纯白再恢复。
 * tint 只能压暗不能提亮，必须走 ColorMatrixFilter。
 */
export function flashWhite(target: PIXI.Container, duration: number, strength = 0.85): void {
  if (target.destroyed) return;
  const f = new PIXI.ColorMatrixFilter();
  const k = 1 - strength;
  // out = in × (1-s) + s（向纯白插值）
  f.matrix = [
    k, 0, 0, 0, strength,
    0, k, 0, 0, strength,
    0, 0, k, 0, strength,
    0, 0, 0, 1, 0,
  ];
  target.filters = [...(target.filters ?? []), f];
  TweenManager.to({
    target: { t: 0 }, props: { t: 1 }, duration,
    onComplete: () => {
      if (target.destroyed) return;
      target.filters = (target.filters ?? []).filter((x) => x !== f);
      if (target.filters.length === 0) target.filters = null;
    },
  });
}
