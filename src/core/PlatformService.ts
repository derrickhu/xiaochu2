/**
 * 平台服务抽象层 - 统一封装微信/抖音双平台 API
 *
 * 业务侧跨平台 SDK 入口：所有 wx/tt 差异（存储、登录、分享、生命周期等）
 * 都必须走 Platform，禁止在业务里写 typeof wx / typeof tt。
 *
 * 宿主识别：抖音注入 tt（可同时存在 wx 兼容层）；微信仅 wx。
 * 检测到哪个宿主，就只绑定该宿主原生 API（抖音→tt，微信→wx），互不倒用。
 */

declare const wx: any;
declare const tt: any;

export type PlatformName = 'wechat' | 'douyin' | 'unknown';
export type BackendPlatformCode = 'wx' | 'dy' | 'anon';

/** 检测当前小游戏宿主（单一真源，与 minigame/runtime.js 逻辑一致） */
export function detectMinigamePlatform(): PlatformName {
  if (typeof tt !== 'undefined') return 'douyin';
  if (typeof wx !== 'undefined') return 'wechat';
  return 'unknown';
}

/** 指定宿主的原生 API：抖音仅 tt，微信仅 wx */
export function getNativePlatformApi(platform: PlatformName = detectMinigamePlatform()): any {
  if (platform === 'douyin') return typeof tt !== 'undefined' ? tt : null;
  if (platform === 'wechat') return typeof wx !== 'undefined' ? wx : null;
  return null;
}

/** @deprecated 请用 detectMinigamePlatform + getNativePlatformApi */
export function resolveMinigameRuntime(): { name: PlatformName; api: any } {
  const name = detectMinigamePlatform();
  return { name, api: getNativePlatformApi(name) };
}

export function toBackendPlatformCode(name: PlatformName): BackendPlatformCode {
  if (name === 'douyin') return 'dy';
  if (name === 'wechat') return 'wx';
  return 'anon';
}

class PlatformServiceClass {
  /** 当前平台名 */
  readonly name: PlatformName;

  /** 底层平台 API 对象（wx / tt / null） */
  private _api: any;

  constructor() {
    this.name = detectMinigamePlatform();
    this._api = getNativePlatformApi(this.name);
    console.log(`[Platform] 当前平台: ${this.name}, api=${this.name === 'douyin' ? 'tt' : this.name === 'wechat' ? 'wx' : 'none'}`);
  }

  /** 是否在小游戏环境中 */
  get isMinigame(): boolean {
    return this._api !== null;
  }

  get isWechat(): boolean {
    return this.name === 'wechat';
  }

  get isDouyin(): boolean {
    return this.name === 'douyin';
  }

  /** 后端 login 接口 platform 字段（wx / dy / anon） */
  get backendPlatformCode(): BackendPlatformCode {
    return toBackendPlatformCode(this.name);
  }

  /** 是否具备 HTTP 能力（小游戏 request 或浏览器 fetch） */
  get canUseBackend(): boolean {
    return typeof this._api?.request === 'function' || typeof fetch === 'function';
  }

  /** 开发者工具（非真机） */
  get isDevtools(): boolean {
    if (!this.isMinigame) return false;
    try {
      return this._api?.getSystemInfoSync?.()?.platform === 'devtools';
    } catch {
      return false;
    }
  }

  /** 底层 API（慎用，优先使用封装方法） */
  get api(): any {
    return this._api;
  }

  // ═══════════════ 存储 ═══════════════

  getStorageSync(key: string): string | null {
    try {
      return this._api?.getStorageSync(key) || null;
    } catch (_) {
      return null;
    }
  }

  setStorageSync(key: string, value: string): void {
    try {
      this._api?.setStorageSync(key, value);
    } catch (_) {}
  }

  /** 异步写入本地存储（避免阻塞主线程） */
  setStorageAsync(key: string, value: string): void {
    try {
      if (this._api?.setStorage) {
        this._api.setStorage({ key, data: value, fail() {} });
      } else {
        this._api?.setStorageSync(key, value);
      }
    } catch (_) {}
  }

  removeStorageSync(key: string): void {
    try {
      this._api?.removeStorageSync(key);
    } catch (_) {}
  }

  getSystemInfoSync(): Record<string, unknown> {
    try {
      return this._api?.getSystemInfoSync?.() ?? {};
    } catch {
      return {};
    }
  }

  /** 经分 SDK / 后端 HTTP 请求（Promise 风格） */
  request(opts: {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    data?: unknown;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }): Promise<{ statusCode: number; data: unknown }> {
    const method = (opts.method || 'POST').toUpperCase();
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(opts.headers || {}),
    };
    const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : 10000;
    const payload = opts.data === undefined || typeof opts.data === 'string'
      ? opts.data
      : JSON.stringify(opts.data);

    if (this._api?.request) {
      return new Promise((resolve, reject) => {
        let done = false;
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          reject(new Error(`request timeout: ${opts.url}`));
        }, timeoutMs);
        try {
          this._api.request({
            url: opts.url,
            method,
            data: payload,
            header: headers,
            timeout: timeoutMs,
            success: (res: { statusCode?: number; data?: unknown }) => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              resolve({ statusCode: res?.statusCode ?? 0, data: res?.data });
            },
            fail: (err: unknown) => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              reject(err);
            },
          });
        } catch (e) {
          if (!done) {
            done = true;
            clearTimeout(timer);
            reject(e);
          }
        }
      });
    }

    if (typeof fetch === 'function') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      return fetch(opts.url, {
        method,
        headers,
        body: payload as BodyInit | undefined,
        signal: controller.signal,
      })
        .then(async (res) => {
          clearTimeout(timer);
          const text = await res.text();
          let data: unknown = text;
          try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
          return { statusCode: res.status, data };
        })
        .catch((e) => {
          clearTimeout(timer);
          throw e;
        });
    }

    return Promise.reject(new Error('no http transport available'));
  }

  /** 平台登录 code（wx.login / tt.login） */
  loginCode(): Promise<string> {
    return new Promise((resolve) => {
      if (!this._api?.login) {
        resolve('');
        return;
      }
      try {
        this._api.login({
          success: (res: { code?: string }) => resolve(res?.code || ''),
          fail: () => resolve(''),
        });
      } catch {
        resolve('');
      }
    });
  }

  // ═══════════════ 创建资源 ═══════════════

  /** 创建平台 Image 对象（加载本地/网络图片用） */
  createImage(): any {
    if (this._api?.createImage) return this._api.createImage();
    if (typeof Image !== 'undefined') return new Image();
    return null;
  }

  /** 创建 InnerAudioContext（BGM / 音效） */
  createInnerAudioContext(): WechatMinigame.InnerAudioContext | null {
    try {
      return this._api?.createInnerAudioContext?.() ?? null;
    } catch {
      return null;
    }
  }

  // ═══════════════ 交互反馈 ═══════════════

  /** 短振动（消除/点击反馈），type 控制强度 */
  vibrateShort(type: 'light' | 'medium' | 'heavy' = 'light'): void {
    try {
      this._api?.vibrateShort?.({ type });
    } catch (_) {}
  }

  /** 长振动（重击/Boss 登场等强反馈） */
  vibrateLong(): void {
    try {
      this._api?.vibrateLong?.();
    } catch (_) {}
  }

  showToast(title: string, icon: 'success' | 'error' | 'none' = 'none'): void {
    try {
      this._api?.showToast?.({ title, icon });
    } catch (_) {}
  }

  showModal(title: string, content: string): void {
    try {
      this._api?.showModal?.({ title, content, showCancel: false });
    } catch (_) {}
  }

  // ═══════════════ 分享 ═══════════════

  showShareMenu(opts?: { withShareTicket?: boolean; menus?: string[] }): void {
    try {
      this._api?.showShareMenu?.({
        withShareTicket: opts?.withShareTicket ?? true,
        menus: opts?.menus ?? ['shareAppMessage', 'shareTimeline'],
      });
    } catch (_) {}
  }

  shareAppMessage(opts: { title: string; imageUrl?: string; query?: string }): void {
    try {
      this._api?.shareAppMessage?.(opts);
    } catch (_) {}
  }

  onShareAppMessage(callback: () => { title: string; imageUrl?: string; query?: string }): void {
    try {
      this._api?.onShareAppMessage?.(callback);
    } catch (_) {}
  }

  onShareTimeline(callback: () => { title: string; imageUrl?: string; query?: string }): void {
    try {
      this._api?.onShareTimeline?.(callback);
    } catch (_) {}
  }

  // ═══════════════ 生命周期 ═══════════════

  onShow(handler: (opts: any) => void): void {
    try {
      this._api?.onShow?.(handler);
    } catch (_) {}
  }

  onHide(handler: () => void): void {
    try {
      this._api?.onHide?.(handler);
    } catch (_) {}
  }

  // ═══════════════ 抖音侧边栏复访 ═══════════════

  /** 检测宿主是否支持指定场景（如 sidebar） */
  checkScene(opts: {
    scene: string;
    success?: (res: { isExist?: boolean }) => void;
    fail?: (err?: unknown) => void;
  }): void {
    try {
      if (this._api?.checkScene) {
        this._api.checkScene(opts);
      } else {
        opts.fail?.({ errMsg: 'checkScene not supported' });
      }
    } catch (e) {
      opts.fail?.(e);
    }
  }

  /** 跳转宿主场景（侧边栏复访必接） */
  navigateToScene(opts: {
    scene: string;
    success?: () => void;
    fail?: (err?: unknown) => void;
  }): void {
    try {
      if (this._api?.navigateToScene) {
        this._api.navigateToScene(opts);
      } else {
        opts.fail?.({ errMsg: 'navigateToScene not supported' });
      }
    } catch (e) {
      opts.fail?.(e);
    }
  }
}

export const Platform = new PlatformServiceClass();
