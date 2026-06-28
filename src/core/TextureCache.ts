/**
 * 纹理加载与缓存
 *
 * - Map 缓存 + inflight 去重（同一路径并发请求只加载一次）
 * - 失败自动重试一次
 * - 预留分包 / CDN 懒加载扩展点（首版只走主包本地路径）
 */
import * as PIXI from 'pixi.js';
import { Platform } from './PlatformService';

const PRELOAD_BATCH_SIZE = 6;

class TextureCacheClass {
  private _cache: Map<string, PIXI.Texture> = new Map();
  private _inflight: Map<string, Promise<PIXI.Texture>> = new Map();

  /** 同步取缓存（未加载返回 null） */
  get(path: string): PIXI.Texture | null {
    return this._cache.get(path) ?? null;
  }

  /** 按候选路径顺序查缓存 */
  getFirst(paths: readonly string[]): PIXI.Texture | null {
    for (const path of paths) {
      const tex = this._cache.get(path);
      if (tex) return tex;
    }
    return null;
  }

  /** 加载纹理（带缓存与并发去重） */
  load(path: string): Promise<PIXI.Texture> {
    const cached = this._cache.get(path);
    if (cached) return Promise.resolve(cached);

    const inflight = this._inflight.get(path);
    if (inflight) return inflight;

    const promise = this._loadImage(path)
      .catch(() => this._loadImage(path)) // 失败重试一次
      .then((tex) => {
        this._cache.set(path, tex);
        this._inflight.delete(path);
        return tex;
      })
      .catch((e) => {
        this._inflight.delete(path);
        console.error(`[TextureCache] 加载失败: ${path}`, e);
        throw e;
      });

    this._inflight.set(path, promise);
    return promise;
  }

  /** 加载首个可用路径，可选写入 canonical 别名 */
  async loadFirst(paths: readonly string[], aliasTo?: string): Promise<PIXI.Texture | null> {
    for (const path of paths) {
      try {
        const tex = await this.load(path);
        if (aliasTo && aliasTo !== path) this._cache.set(aliasTo, tex);
        return tex;
      } catch {
        /* 尝试下一候选路径 */
      }
    }
    return null;
  }

  /** 批量预加载（限并发，避免小游戏同时拉过多分包图） */
  async preload(paths: readonly string[]): Promise<void> {
    for (let i = 0; i < paths.length; i += PRELOAD_BATCH_SIZE) {
      const batch = paths.slice(i, i + PRELOAD_BATCH_SIZE);
      await Promise.all(batch.map((p) => this.load(p).catch(() => null)));
    }
  }

  /** 释放单张纹理 */
  release(path: string): void {
    const tex = this._cache.get(path);
    if (tex) {
      tex.destroy(true);
      this._cache.delete(path);
    }
  }

  /** 释放全部纹理（场景大切换时用） */
  releaseAll(): void {
    for (const tex of this._cache.values()) tex.destroy(true);
    this._cache.clear();
  }

  get size(): number {
    return this._cache.size;
  }

  private _loadImage(path: string): Promise<PIXI.Texture> {
    return new Promise((resolve, reject) => {
      const img = Platform.createImage();
      if (!img) {
        reject(new Error('createImage 不可用'));
        return;
      }
      img.onload = () => {
        try {
          // 真机不能走 Texture.from(img.src) 的 document 路径，直接用 BaseTexture 包装平台 Image
          const base = PIXI.BaseTexture.from(img as any);
          resolve(new PIXI.Texture(base));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = (e: any) => reject(e);
      img.src = path;
    });
  }
}

export const TextureCache = new TextureCacheClass();
