/**
 * 纹理加载与缓存
 *
 * - Map 缓存 + inflight 去重（同一路径并发请求只加载一次）
 * - 失败自动重试一次
 * - CDN：先 resolve / 后台 download，逻辑路径作 cache key；加载完成发 texture:loaded
 */
import * as PIXI from 'pixi.js';
import { CdnAssetService } from '@/core/CdnAssetService';
import { EventBus } from '@/core/EventBus';
import { Platform } from './PlatformService';
import { isImageShimApplied, isImageUploadable, markImageLoaded } from './imageDomShim';

const PRELOAD_BATCH_SIZE = 6;
/**
 * 单张图等宿主回调的上限。
 * Tap 部分机型（荣耀/华为）宿主 Image 的 onload/onerror 一个都不来，
 * 没有这道闸首屏 await 会永久挂起，画面停在进度 0% —— 准入直接判黑白屏。
 */
const IMAGE_LOAD_TIMEOUT_MS = 6000;
export const TEXTURE_LOADED_EVENT = 'texture:loaded';

class TextureCacheClass {
  private _cache: Map<string, PIXI.Texture> = new Map();
  private _inflight: Map<string, Promise<PIXI.Texture>> = new Map();
  private _uploadWarned = false;
  private _timeoutCount = 0;
  /** 宿主 Image 是否需要补标准属性；off 说明 imageDomShim 是死代码，可以摘掉 */
  private _imgShim: '?' | 'on' | 'off' = '?';

  /** 同步取缓存（未加载返回 null；CDN miss 时静默 kickoff 加载） */
  get(path: string): PIXI.Texture | null {
    const cached = this._cache.get(path) ?? null;
    if (cached) return cached;
    if (CdnAssetService.isCdnPath(path) && !this._inflight.has(path)) {
      void this.load(path).catch(() => null);
    }
    return null;
  }

  /** 按候选路径顺序查缓存 */
  getFirst(paths: readonly string[]): PIXI.Texture | null {
    for (const path of paths) {
      const tex = this.get(path);
      if (tex) return tex;
    }
    return null;
  }

  has(path: string): boolean {
    return this._cache.has(path);
  }

  /** 订阅纹理加载完成（用于 UI 打开后 CDN 到货自动刷新） */
  onTextureLoaded(handler: (path: string) => void): () => void {
    EventBus.on(TEXTURE_LOADED_EVENT, handler);
    return () => EventBus.off(TEXTURE_LOADED_EVENT, handler);
  }

  /** 加载纹理（带缓存与并发去重） */
  load(path: string): Promise<PIXI.Texture> {
    const cached = this._cache.get(path);
    if (cached) return Promise.resolve(cached);

    const inflight = this._inflight.get(path);
    if (inflight) return inflight;

    const promise = this._loadResolved(path)
      .catch((e) => {
        // 超时是宿主回调机制坏了，重试同样等不到，别把首屏再堵一个超时窗口
        if ((e as any)?.__noRetry) throw e;
        return this._loadResolved(path);
      })
      .then((tex) => {
        this._cache.set(path, tex);
        this._inflight.delete(path);
        EventBus.emit(TEXTURE_LOADED_EVENT, path);
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

  /** 批量预加载（限并发，避免小游戏同时拉过多图） */
  async preload(
    paths: readonly string[],
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<void> {
    const total = paths.length;
    if (total === 0) {
      onProgress?.(0, 0);
      return;
    }
    let loaded = 0;
    for (let i = 0; i < paths.length; i += PRELOAD_BATCH_SIZE) {
      const batch = paths.slice(i, i + PRELOAD_BATCH_SIZE);
      await Promise.all(
        batch.map(async (p) => {
          await this.load(p).catch(() => null);
          loaded += 1;
          onProgress?.(loaded, total);
        }),
      );
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

  /**
   * 纹理健康度摘要，进主场景前打一次。
   * valid 远小于 tex 就是纹理没能上 GPU（宿主 Image 契约问题），
   * nullBase 非 0 则是 texture 被 destroy 后还留在缓存里。
   */
  healthReport(): string {
    let valid = 0;
    let nullBase = 0;
    for (const tex of this._cache.values()) {
      const base = tex.baseTexture;
      if (!base) {
        nullBase += 1;
        continue;
      }
      if (base.valid) valid += 1;
    }
    return `tex=${this._cache.size} valid=${valid} nullBase=${nullBase} `
      + `imgShim=${this._imgShim} timeout=${this._timeoutCount}`;
  }

  private async _loadResolved(logicalPath: string): Promise<PIXI.Texture> {
    const src = await CdnAssetService.resolveOrDownload(logicalPath);
    return this._loadImage(src);
  }

  private _loadImage(src: string): Promise<PIXI.Texture> {
    return new Promise((resolve, reject) => {
      const img = Platform.createImage();
      if (!img) {
        reject(new Error('createImage 不可用'));
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this._warnTimeout(img, src);
        const e: any = new Error(`图片加载超时 ${IMAGE_LOAD_TIMEOUT_MS}ms: ${src}`);
        e.__noRetry = true;
        reject(e);
      }, IMAGE_LOAD_TIMEOUT_MS);

      img.onload = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          // shim 不碰宿主 onload，complete/naturalWidth 靠这里转正，必须在 Pixi 读之前
          markImageLoaded(img);
          if (this._imgShim === '?') {
            this._imgShim = isImageShimApplied(img) ? 'on' : 'off';
            console.log(`[TextureCache] 首图就绪 shim=${this._imgShim} `
              + `${img.width}x${img.height} ${src}`);
          }
          this._warnIfNotUploadable(img, src);
          const base = PIXI.BaseTexture.from(img as any);
          resolve(new PIXI.Texture(base));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = (e: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      };
      img.src = src;
    });
  }

  /**
   * 宿主 onload/onerror 都没来。只报前两条：这种故障是全局性的，刷屏没意义，
   * 但一条都不报就等于下次拿到日志还是查不出。
   */
  private _warnTimeout(img: any, src: string): void {
    this._timeoutCount += 1;
    if (this._timeoutCount > 2) return;
    console.error(`[TextureCache] 宿主 Image 回调未触发（超时 ${IMAGE_LOAD_TIMEOUT_MS}ms）: ${src} `
      + `shim=${isImageShimApplied(img)} size=${img?.width}x${img?.height} `
      + `onloadKept=${typeof img?.onload === 'function'}`);
    try {
      (globalThis as any).GameGlobal?.__bootDiag?.(`img-timeout ${src}`);
    } catch { /* 诊断失败不影响加载 */ }
  }

  /**
   * 宿主 Image 缺 complete/naturalWidth 时，Pixi 会静默拒绝上传纹理——
   * 加载全部“成功”但一张都上不了屏。只报一次，避免刷屏。
   */
  private _warnIfNotUploadable(img: any, src: string): void {
    if (this._uploadWarned || isImageUploadable(img)) return;
    this._uploadWarned = true;
    const detail = `complete=${img.complete} naturalWidth=${img.naturalWidth} `
      + `size=${img.width}x${img.height} shim=${isImageShimApplied(img)}`;
    console.error(`[TextureCache] 宿主 Image 不满足 Pixi 上传条件，纹理将全部为空: ${src} ${detail}`);
    try {
      (globalThis as any).GameGlobal?.__bootDiag?.(`tex-unuploadable ${detail}`);
    } catch { /* 诊断失败不影响加载 */ }
  }
}

export const TextureCache = new TextureCacheClass();
