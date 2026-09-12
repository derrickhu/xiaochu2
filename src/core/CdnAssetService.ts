/**
 * CDN 资源加载：manifest + 按需下载 + 本地缓存
 *
 * 对齐 xiao_chu AssetLoader / game2D_huahua CdnAssetService：
 * - 逻辑路径不变；CDN 目录未命中缓存时异步下载，不阻塞主流程超时窗口外继续。
 * - manifest 用 request 拉文本，避免 downloadFile 解析 JSON 坑。
 */
import { CDN_CONFIG, type CdnConfig } from '@/config/CdnConfig';
import {
  arrayBufferToDataUrl,
  buildCdnUrl,
  cdnLoadCandidates,
  huaweiBundledLoadCandidates,
  mimeFromAssetPath,
  packagePathCandidates,
  resolveUserDataPath,
} from '@/core/cdnAssetFallback';
import { Platform } from '@/core/PlatformService';

export interface CdnManifestFile {
  hash?: string;
  size?: number;
}

export interface CdnManifest {
  version?: number;
  updated?: string;
  filePrefix?: string;
  files: Record<string, CdnManifestFile>;
}

type ProgressCallback = (loaded: number, total: number) => void;

/** 真机 wx.downloadFile / request 合计并发约 10；自建队列避免瞬间打满后超时失败 */
const DOWNLOAD_CONCURRENCY = 4;
/**
 * 无文件系统（华为快游戏）时只能把字节留在内存。base64 比原文件还大 1/3，
 * 大图一律不进内存，交给 createImage(https) 直连；小图才缓存，且限量。
 */
const MEMORY_CACHE_MAX_BYTES = 256 * 1024;
const MEMORY_CACHE_MAX_ENTRIES = 24;

class CdnAssetServiceClass {
  private readonly _config: CdnConfig = CDN_CONFIG;
  private readonly _cdnPrefixes = this._config.cdnDirs.map((d) => this._prefix(d));
  private readonly _bundledPrefixes = this._config.bundledDirs.map((d) => this._prefix(d));
  private readonly _embeddedPrefixes = (this._config.huaweiEmbeddedDirs || [])
    .map((d) => this._prefix(d));
  private _manifest: CdnManifest | null = null;
  private _manifestReady = false;
  /**
   * 仅「成功拉到非空云端 manifest」时为 true。
   * 空缓存 / 拉失败时若仍按 files[path] 判无，会把全部 CDN 下载误杀，
   * 真机上就只剩本地残留缓存（常见：只剩第一只宠头像）。
   */
  private _manifestAuthoritative = false;
  private _downloadQueue = new Map<string, Promise<boolean>>();
  private _downloadWaiters: Array<() => void> = [];
  private _downloadActive = 0;
  private _localExistsCache = new Map<string, boolean>();
  private _accessLog = new Map<string, number>();
  private _accessFrame = 0;
  /** 无 FS 时把二进制留在内存（data URL），给 Image / Audio 用 */
  private _memorySrc = new Map<string, string>();
  private _remoteOnlyLogged = false;

  get enabled(): boolean {
    return this._config.enabled;
  }

  get manifestReady(): boolean {
    return this._manifestReady;
  }

  get manifest(): CdnManifest | null {
    return this._manifest;
  }

  /**
   * 能否落盘缓存。华为即使后来露出 getFileSystemManager / downloadFile，
   * 路径和回调也不稳；批量预下载只会把启动卡死，继续走 createImage(https)。
   */
  get canCacheLocally(): boolean {
    if (Platform.isHuawei) return false;
    return !!this._getFs() && !!this._getUserDataPath();
  }

  isCdnPath(path: string): boolean {
    const normalized = this._normalize(path);
    if (!this.enabled || this.isBundledPath(normalized)) return false;
    return this._cdnPrefixes.some((prefix) => normalized.startsWith(prefix));
  }

  isBundledPath(path: string): boolean {
    const normalized = this._normalize(path);
    return this._bundledPrefixes.some((prefix) => normalized.startsWith(prefix));
  }

  areAllCdnPaths(paths: readonly string[]): boolean {
    return paths.length > 0 && paths.every((path) => this.isCdnPath(path));
  }

  /**
   * 同步解析：
   * - 非 CDN → 原路径
   * - CDN 缓存有效 → USER_DATA 缓存路径
   * - 包内仍有本地文件（开发期 / 未瘦包）→ 逻辑路径
   * - 否则 null（调用方应 download / 占位，勿设 src）
   */
  resolveAsset(path: string): string | null {
    const logicalPath = this._normalize(path);
    if (!this.isCdnPath(logicalPath)) return logicalPath;

    this._touch(logicalPath);
    const memory = this._memorySrc.get(logicalPath);
    if (memory) return memory;
    if (this._isCacheValid(logicalPath)) return this._getCachePath(logicalPath);
    if (this._packageFileExists(logicalPath)) return logicalPath;
    return null;
  }

  /** 云端直链；华为用 createImage(src=https) 代替 downloadFile */
  remoteUrl(path: string): string | null {
    const logicalPath = this._normalize(path);
    if (!this.isCdnPath(logicalPath) || !this._config.baseUrl) return null;
    return this._getCdnUrl(logicalPath);
  }

  /** 构建时已打进华为 rpk 的目录（读包内比走网快，也不怕断网） */
  isHuaweiEmbeddedPath(path: string): boolean {
    const normalized = this._normalize(path);
    return this._embeddedPrefixes.some((prefix) => normalized.startsWith(prefix));
  }

  /** 候选顺序：包内已嵌的先读本地，其余先走 https，data URL 垫底 */
  loadCandidates(path: string): string[] {
    const logicalPath = this._normalize(path);
    if (!this.isCdnPath(logicalPath)) {
      if (Platform.isHuawei && logicalPath.startsWith('subpackages/')) {
        return huaweiBundledLoadCandidates(logicalPath, this._bundledRemoteUrl(logicalPath));
      }
      return [logicalPath];
    }
    return cdnLoadCandidates({
      preferRemote: !this.canCacheLocally && !this.isHuaweiEmbeddedPath(logicalPath),
      logicalPath,
      remoteUrl: this.remoteUrl(logicalPath),
      memorySrc: this._memorySrc.get(logicalPath) ?? null,
      cachePath: this._isCacheValid(logicalPath) ? this._getCachePath(logicalPath) : null,
    });
  }

  /** 无 downloadFile 时把文件拉成 data URL（绕过 CDN attachment 头） */
  async ensureMemorySrc(path: string): Promise<string | null> {
    const logicalPath = this._normalize(path);
    const cached = this._memorySrc.get(logicalPath);
    if (cached) return cached;
    if (!this.isCdnPath(logicalPath) || !this._config.baseUrl) return null;
    const ok = await this.download(logicalPath);
    return ok ? (this._memorySrc.get(logicalPath) ?? null) : null;
  }

  async resolveOrDownload(path: string): Promise<string> {
    const logicalPath = this._normalize(path);
    const resolved = this.resolveAsset(logicalPath);
    if (resolved) return resolved;

    if (!this.isCdnPath(logicalPath)) return logicalPath;

    /**
     * 华为没有 downloadFile/FS：直接把 https 交给 createImage，别在后台再抓一份二进制。
     * 抓一份等于同一张图下两遍，还要转 base64——真机上就是点了有音、页面半天不出。
     */
    if (!this.canCacheLocally) {
      if (this.isHuaweiEmbeddedPath(logicalPath)) return logicalPath;
      const remote = this.remoteUrl(logicalPath);
      if (remote && !this._remoteOnlyLogged) {
        this._remoteOnlyLogged = true;
        console.log(`[CDN] 宿主无本地缓存，改走 createImage(https): ${remote}`);
      }
      return remote || logicalPath;
    }

    // manifest 尚未就绪时先拉一次，避免空清单把下载误杀
    if (!this._manifestReady) {
      await this.fetchManifest().catch(() => false);
    }

    const ok = await this.download(logicalPath);
    if (ok && this._isCacheValid(logicalPath)) return this._getCachePath(logicalPath);
    if (ok && this._memorySrc.has(logicalPath)) return this._memorySrc.get(logicalPath)!;

    // 分包可能在 CDN 下载期间才 load 完：包内存在性不做「永久 false」缓存，这里再探一次
    if (this._packageFileExists(logicalPath)) return logicalPath;

    if (Platform.isHuawei || !this._getFs() || !Platform.hasNativeDownload) {
      return this.remoteUrl(logicalPath) || logicalPath;
    }
    throw new Error(`[CDN] 下载失败且包内无文件: ${logicalPath}`);
  }

  async fetchManifest(): Promise<boolean> {
    if (!this.enabled) {
      this._manifest = { files: {} };
      this._manifestReady = true;
      this._manifestAuthoritative = false;
      return false;
    }

    const fs = this._getFs();
    if (!fs || !this._config.baseUrl || !Platform.isMinigame) {
      this._loadCachedManifest();
      return false;
    }

    const url = this._getCdnUrl('manifest.json');
    try {
      /**
       * manifest 易被边缘 CDN 缓存：优先带时间戳的 request 拉最新版，
       * 再与 downloadFile（无 query，兼容抖音白名单）取 version 更高者。
       */
      type Cand = { text: string; via: string; version: number; count: number };
      const parseCand = (text: string, via: string): Cand | null => {
        try {
          const parsed = JSON.parse(text) as CdnManifest;
          const count = Object.keys(parsed.files || {}).length;
          return {
            text,
            via,
            version: Number(parsed.version || 0),
            count,
          };
        } catch {
          return null;
        }
      };

      const cands: Cand[] = [];
      try {
        const t = await this._requestText(`${url}?_t=${Date.now()}`);
        const c = parseCand(t, 'request');
        if (c) cands.push(c);
      } catch (reqErr) {
        console.warn('[CDN] request 拉 manifest 失败:', String((reqErr as Error)?.message || reqErr));
      }
      try {
        const t = await this._downloadText(url);
        const c = parseCand(t, 'downloadFile');
        if (c) cands.push(c);
      } catch (dlErr) {
        console.warn('[CDN] downloadFile 拉 manifest 失败:', String((dlErr as Error)?.message || dlErr));
      }

      // 本地缓存也参与比较，避免边缘返回更旧版本时倒退
      try {
        const cached = String(fs.readFileSync(this._getCachePath('manifest.json'), 'utf-8') || '');
        const c = parseCand(cached, 'local-cache');
        if (c) cands.push(c);
      } catch { /* ignore */ }

      if (cands.length === 0) {
        this._loadCachedManifest();
        return false;
      }
      cands.sort((a, b) => b.version - a.version || b.count - a.count);
      const best = cands[0];
      const parsed = JSON.parse(best.text) as CdnManifest;
      this._manifest = parsed;
      this._manifestReady = true;
      this._manifestAuthoritative = best.count > 0;
      this._ensureCacheDir(this._getCachePath('manifest.json'));
      try {
        fs.writeFileSync(this._getCachePath('manifest.json'), best.text, 'utf-8');
      } catch (_) { /* ignore */ }
      console.log(
        `[CDN] manifest 就绪 via=${best.via}, v${best.version}, files=${best.count}`
        + (cands.length > 1 ? ` (candidates=${cands.map((c) => `${c.via}:v${c.version}`).join(',')})` : ''),
      );
      if (best.count === 0) {
        console.warn('[CDN] 云端 manifest 文件列表为空，下载不做「名单外跳过」');
      }
      return best.count > 0;
    } catch (e) {
      console.warn('[CDN] manifest 拉取失败，使用本地缓存:', e);
      this._loadCachedManifest();
      return false;
    }
  }

  /** downloadFile → 读临时文件文本（manifest / 兜底） */
  private async _downloadText(url: string): Promise<string> {
    const fs = this._getFs();
    if (!fs) throw new Error('getFileSystemManager unavailable');
    const res = await Platform.downloadFile(url);
    if (!res.tempFilePath) throw new Error('downloadFile missing tempFilePath');
    let text = '';
    try {
      text = String(fs.readFileSync(res.tempFilePath, 'utf-8') || '');
    } catch (e) {
      // 少数端 utf-8 读失败时再试默认编码
      text = String(fs.readFileSync(res.tempFilePath) || '');
      if (typeof text !== 'string') text = '';
    }
    if (!text) throw new Error('downloaded manifest empty');
    return text;
  }

  /** 权威 manifest 才把「名单外」当不存在；空清单绝不拦下载 */
  private _knownMissing(logicalPath: string): boolean {
    if (!this._manifestAuthoritative) return false;
    const files = this._manifest?.files;
    return !!files && !files[logicalPath];
  }

  async download(path: string): Promise<boolean> {
    const logicalPath = this._normalize(path);
    if (!this.isCdnPath(logicalPath)) return true;
    if (this._isCacheValid(logicalPath)) return true;
    // 权威 manifest 缺条目：多半是真机残留旧清单（strip 事故后常见）。
    // 强刷一次；仍缺也不再硬跳过，改为直拉（404 由 retry 消化），避免立绘永久空白。
    if (this._knownMissing(logicalPath)) {
      console.warn(`[CDN] manifest 缺条目，强刷后直拉: ${logicalPath}`);
      await this.fetchManifest().catch(() => false);
    }

    const inflight = this._downloadQueue.get(logicalPath);
    if (inflight) return inflight;

    const task = this._runDownloadSlot(() => this._downloadWithRetry(logicalPath)).finally(() => {
      this._downloadQueue.delete(logicalPath);
    });
    this._downloadQueue.set(logicalPath, task);
    return task;
  }

  private _runDownloadSlot<T>(job: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this._downloadActive += 1;
        job().then(resolve, reject).finally(() => {
          this._downloadActive -= 1;
          const next = this._downloadWaiters.shift();
          if (next) next();
        });
      };
      if (this._downloadActive < DOWNLOAD_CONCURRENCY) run();
      else this._downloadWaiters.push(run);
    });
  }

  /** 静默预下载；超时后仍 resolve，后台任务可继续 */
  async preloadPaths(paths: readonly string[], onProgress?: ProgressCallback): Promise<void> {
    // 不能落盘就没有「预」可言：批量抓字节只会堆内存，按需 https 直连即可
    if (!this.canCacheLocally) {
      onProgress?.(paths.length, paths.length);
      return;
    }
    if (!this._manifestReady) {
      await this.fetchManifest().catch(() => false);
    }
    const cdnPaths = paths
      .map((p) => this._normalize(p))
      .filter((p) => {
        if (!this.isCdnPath(p) || this._isCacheValid(p) || this._packageFileExists(p)) return false;
        if (this._knownMissing(p)) return false;
        return true;
      });

    if (cdnPaths.length === 0) {
      onProgress?.(paths.length, paths.length);
      return;
    }

    let done = 0;
    await Promise.race([
      Promise.all(
        cdnPaths.map(async (p) => {
          await this.download(p);
          done++;
          onProgress?.(paths.length - cdnPaths.length + done, paths.length);
        }),
      ),
      new Promise<void>((resolve) => setTimeout(resolve, this._config.downloadTimeoutMs)),
    ]);
  }

  async preloadCategory(prefix: string, onProgress?: ProgressCallback): Promise<void> {
    if (!this._manifestReady) await this.fetchManifest();
    const normalized = this._prefix(prefix);
    const files = Object.keys(this._manifest?.files || {}).filter((f) => f.startsWith(normalized));
    await this.preloadPaths(files, onProgress);
  }

  clearCache(): void {
    const fs = this._getFs();
    if (!fs || this._accessLog.size === 0) return;

    const entries = [...this._accessLog.entries()].sort((a, b) => a[1] - b[1]);
    const evictCount = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < evictCount; i++) {
      const logicalPath = entries[i][0];
      const cachePath = this._getCachePath(logicalPath);
      try { fs.unlinkSync(cachePath); } catch (_) { /* ignore */ }
      try { fs.unlinkSync(`${cachePath}.meta`); } catch (_) { /* ignore */ }
      this._localExistsCache.delete(cachePath);
      this._accessLog.delete(logicalPath);
    }
  }

  clearAllCache(): void {
    const fs = this._getFs();
    const root = this._getCacheRootPath();
    if (!fs || !root) return;
    this._localExistsCache.clear();
    this._accessLog.clear();
    try {
      fs.rmdirSync(root, true);
      console.log('[CDN] 已清空本地 CDN 缓存');
    } catch (e) {
      console.warn('[CDN] 清空本地 CDN 缓存失败:', e);
    }
  }

  private async _downloadWithRetry(logicalPath: string): Promise<boolean> {
    if (!this._config.baseUrl) return false;
    const url = this._getCdnUrl(logicalPath);
    const fs = this._getFs();
    const cachePath = this._getCachePath(logicalPath);
    if (fs) this._ensureCacheDir(cachePath);

    for (let attempt = 0; attempt <= this._config.downloadRetry; attempt++) {
      try {
        if (Platform.hasNativeDownload) {
          const res = await Platform.downloadFile(url);
          if (!res.tempFilePath) throw new Error('downloadFile missing tempFilePath');
          if (!fs) throw new Error('getFileSystemManager unavailable');
          fs.copyFileSync(res.tempFilePath, cachePath);
          this._rememberCachedFile(logicalPath, cachePath);
          return true;
        }

        const bin = await Platform.fetchBinary(url, this._config.downloadTimeoutMs);
        if (fs && cachePath && this._writeCacheBytes(cachePath, bin.data)) {
          this._rememberCachedFile(logicalPath, cachePath);
          return true;
        }
        return this._rememberMemoryBytes(logicalPath, bin.data);
      } catch (e) {
        if (attempt >= this._config.downloadRetry) {
          console.warn(`[CDN] 下载失败 ${logicalPath}:`, e);
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    return false;
  }

  /** 无盘可写时的最后一招：小图转 data URL 留在内存，限量限大小 */
  private _rememberMemoryBytes(logicalPath: string, data: ArrayBuffer): boolean {
    if (data.byteLength > MEMORY_CACHE_MAX_BYTES) {
      console.warn(`[CDN] ${logicalPath} 超过内存缓存上限，仅用 https 直连`);
      return false;
    }
    if (this._memorySrc.size >= MEMORY_CACHE_MAX_ENTRIES) {
      const oldest = this._memorySrc.keys().next().value;
      if (oldest) this._memorySrc.delete(oldest);
    }
    this._memorySrc.set(logicalPath, arrayBufferToDataUrl(data, mimeFromAssetPath(logicalPath)));
    return true;
  }

  private _rememberCachedFile(logicalPath: string, cachePath: string): void {
    const fs = this._getFs();
    this._localExistsCache.set(cachePath, true);
    const hash = this._manifest?.files?.[logicalPath]?.hash || '';
    try { fs?.writeFileSync(`${cachePath}.meta`, hash, 'utf-8'); } catch (_) { /* ignore */ }
  }

  private _writeCacheBytes(cachePath: string, data: ArrayBuffer): boolean {
    const fs = this._getFs();
    if (!fs) return false;
    try {
      fs.writeFileSync(cachePath, data, 'binary');
      return true;
    } catch { /* */ }
    try {
      fs.writeFileSync({ filePath: cachePath, data, encoding: 'binary' });
      return true;
    } catch { /* */ }
    return false;
  }

  private async _requestText(url: string): Promise<string> {
    const res = await Platform.request({
      url,
      method: 'GET',
      headers: { accept: 'application/json,text/plain,*/*' },
      timeoutMs: this._config.downloadTimeoutMs,
    });
    const statusCode = Number(res?.statusCode || 0);
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`request status=${statusCode || 'unknown'} url=${url}`);
    }
    const data = res?.data;
    return typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
  }

  private _loadCachedManifest(): void {
    const fs = this._getFs();
    try {
      const text = fs?.readFileSync(this._getCachePath('manifest.json'), 'utf-8');
      this._manifest = text ? JSON.parse(text) as CdnManifest : { files: {} };
    } catch (_) {
      this._manifest = { files: {} };
    }
    this._manifestReady = true;
    const count = Object.keys(this._manifest.files || {}).length;
    // 本地残留 manifest 可作权威；完全空则放开下载，靠 URL 直拉
    this._manifestAuthoritative = count > 0;
  }

  private _isCacheValid(logicalPath: string): boolean {
    if (!this._cacheFileExists(logicalPath)) return false;
    const entry = this._manifest?.files?.[logicalPath];
    if (entry?.size && this._getLocalFileSize(this._getCachePath(logicalPath)) !== entry.size) {
      return false;
    }
    if (!entry?.hash) return true;
    return this._readCachedHash(logicalPath) === entry.hash;
  }

  private _cacheFileExists(logicalPath: string): boolean {
    return this._localFileExists(this._getCachePath(logicalPath));
  }

  /**
   * 包内是否仍有该文件（开发未 strip / 分包刚 load 完）。
   * 注意：loadSubpackage 与 CDN 下载并行，「不存在」不能永久缓存，否则分包到位后仍误判。
   */
  private _packageFileExists(logicalPath: string): boolean {
    const fs = this._getFs();
    if (!fs) return false;
    for (const candidate of packagePathCandidates(logicalPath)) {
      try {
        fs.accessSync(candidate);
        this._localExistsCache.set(logicalPath, true);
        return true;
      } catch { /* 试下一个前缀 */ }
    }
    return false;
  }

  private _localFileExists(path: string): boolean {
    const cached = this._localExistsCache.get(path);
    if (cached !== undefined) return cached;

    const fs = this._getFs();
    if (!fs) {
      this._localExistsCache.set(path, false);
      return false;
    }

    try {
      fs.accessSync(path);
      this._localExistsCache.set(path, true);
      return true;
    } catch (_) {
      this._localExistsCache.set(path, false);
      return false;
    }
  }

  private _getLocalFileSize(path: string): number {
    const fs = this._getFs();
    try {
      const stat = fs?.statSync(path);
      return Number(stat?.size || 0);
    } catch (_) {
      return 0;
    }
  }

  private _readCachedHash(logicalPath: string): string | null {
    const fs = this._getFs();
    try {
      return String(fs?.readFileSync(`${this._getCachePath(logicalPath)}.meta`, 'utf-8') || '').trim();
    } catch (_) {
      return null;
    }
  }

  private _getCdnUrl(logicalPath: string): string {
    return buildCdnUrl(this._config.baseUrl, this._config.filePrefix, logicalPath);
  }

  /** 随包资源在华为上也可能被传到同一套 CDN，本地分包未挂载时拿来垫底 */
  private _bundledRemoteUrl(logicalPath: string): string | null {
    if (!this._config.baseUrl) return null;
    return this._getCdnUrl(logicalPath);
  }

  private _getCachePath(logicalPath: string): string {
    return `${this._getCacheRootPath()}/${logicalPath}`;
  }

  private _getCacheRootPath(): string {
    const userDataPath = this._getUserDataPath();
    return userDataPath ? `${userDataPath}/${this._config.cacheRootName}` : '';
  }

  private _ensureCacheDir(filePath: string): void {
    const fs = this._getFs();
    const userDataPath = this._getUserDataPath();
    if (!fs || !userDataPath) return;

    const dir = filePath.split('/').slice(0, -1).join('/');
    try { fs.accessSync(dir); return; } catch (_) { /* mkdir */ }

    const segments = dir.replace(`${userDataPath}/`, '').split('/').filter(Boolean);
    let cur = userDataPath;
    for (const seg of segments) {
      cur += `/${seg}`;
      try { fs.accessSync(cur); } catch (_) {
        try { fs.mkdirSync(cur, true); } catch (_) { /* ignore */ }
      }
    }
  }

  private _getFs(): any {
    return Platform.api?.getFileSystemManager?.() ?? null;
  }

  private _getUserDataPath(): string {
    return resolveUserDataPath(Platform.api);
  }

  private _touch(logicalPath: string): void {
    this._accessFrame++;
    this._accessLog.set(logicalPath, this._accessFrame);
  }

  private _prefix(path: string): string {
    const normalized = this._normalize(path);
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  }

  private _normalize(path: string): string {
    return path.replace(/^\/+/, '').replace(/^minigame\//, '');
  }
}

export const CdnAssetService = new CdnAssetServiceClass();
