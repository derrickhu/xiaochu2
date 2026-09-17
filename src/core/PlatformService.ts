/**
 * 平台服务抽象层 - 统一封装微信 / 抖音 / Tap / 华为快游戏 API
 *
 * 业务侧跨平台 SDK 入口：所有 wx/tt 差异（存储、登录、分享、生命周期等）
 * 都必须走 Platform，禁止在业务里写 typeof wx / typeof tt。
 *
 * 宿主识别：抖音注入 tt（可同时存在 wx 兼容层）；Tap 注入 tap；
 * 华为快游戏注入 qg（快应用残留才是 qa；运行时也可能再塞 wx 兼容层）——必须先认华为，不能只看 wx。
 * Tap / 华为包由 VITE_PLATFORM 编译锁定，运行时即使误注入 wx 也不会当成微信。
 */

import { waitMs } from '@/utils/hostTimeout';
import { coerceToArrayBuffer } from './cdnAssetFallback';
import { parseHuaweiLoginData, readHuaweiAppId, type HuaweiAccount } from './huaweiAccount';
import { readHostStorage, removeHostStorage, resolveHostLocalStorage, writeHostStorage } from './hostStorage';
import { shimImageDomContract } from './imageDomShim';

declare const wx: any;
declare const tt: any;
declare const tap: any;
declare const qa: any;
declare const qg: any;
declare const __wxConfig: any;
declare const GameGlobal: any;

export type PlatformName = 'wechat' | 'douyin' | 'taptap' | 'huawei' | 'unknown';
export type BackendPlatformCode = 'wx' | 'dy' | 'tap' | 'hw' | 'anon';

/** 华为快游戏原生是 qg；快应用才是 qa；转换层可能只剩 wx 壳 */
export function isHuaweiQuickGameHost(): boolean {
  if (typeof qg !== 'undefined') return true;
  if (typeof qa !== 'undefined') return true;
  try {
    if (typeof GameGlobal !== 'undefined' && (GameGlobal.__wx2huawei || GameGlobal.qa || GameGlobal.qg)) return true;
  } catch { /* */ }
  if (typeof wx === 'undefined') return false;
  if (typeof __wxConfig !== 'undefined') return false;
  if (typeof wx.getAccountInfoSync === 'function') return false;
  return true;
}

function resolveHuaweiApi(): any {
  if (typeof qg !== 'undefined') return qg;
  if (typeof qa !== 'undefined') return qa;
  return typeof wx !== 'undefined' ? wx : null;
}

/** 检测当前小游戏宿主（单一真源，与 minigame/runtime.js 逻辑一致） */
export function detectMinigamePlatform(): PlatformName {
  if (import.meta.env.VITE_PLATFORM === 'taptap') return 'taptap';
  if (import.meta.env.VITE_PLATFORM === 'huawei') return 'huawei';
  if (typeof tt !== 'undefined') return 'douyin';
  if (typeof tap !== 'undefined') return 'taptap';
  if (isHuaweiQuickGameHost()) return 'huawei';
  if (typeof wx !== 'undefined') return 'wechat';
  return 'unknown';
}

/** 指定宿主的原生 API：抖音 tt / Tap tap / 华为 qa（或转换层 wx） / 微信 wx */
export function getNativePlatformApi(platform: PlatformName = detectMinigamePlatform()): any {
  if (platform === 'douyin') return typeof tt !== 'undefined' ? tt : null;
  if (platform === 'taptap') return typeof tap !== 'undefined' ? tap : null;
  if (platform === 'huawei') return resolveHuaweiApi();
  if (platform === 'wechat') return typeof wx !== 'undefined' ? wx : null;
  return null;
}

/** @deprecated 请用 detectMinigamePlatform + getNativePlatformApi */
export function resolveMinigameRuntime(): { name: PlatformName; api: any } {
  const name = detectMinigamePlatform();
  return { name, api: getNativePlatformApi(name) };
}

/** 抖音鸿蒙 / 华为鸿蒙：platform 常为 ohos */
export function isHarmonyOsInfo(info: Record<string, unknown> | null | undefined): boolean {
  if (!info) return false;
  const blobs = [info.platform, info.system, info.osName, info.brand, info.host]
    .map((value) => String(value ?? '').toLowerCase());
  return blobs.some((text) => (
    text === 'ohos'
    || text === 'openharmony'
    || text.includes('harmony')
    || text.includes('hongmeng')
  ));
}

export function toBackendPlatformCode(name: PlatformName): BackendPlatformCode {
  if (name === 'douyin') return 'dy';
  if (name === 'wechat') return 'wx';
  if (name === 'taptap') return 'tap';
  if (name === 'huawei') return 'hw';
  return 'anon';
}

class PlatformServiceClass {
  /** 当前平台名 */
  readonly name: PlatformName;

  /** 底层平台 API 对象（wx / tt / null） */
  private _api: any;

  /** adUnitId → 激励视频实例（宿主本身也是单例，这里避免重复注册回调） */
  private _adCache = new Map<string, any>();

  /** 当前在播广告的 Promise resolver，null = 无广告在播 */
  private _adResolve: ((ok: boolean) => void) | null = null;

  constructor() {
    this.name = detectMinigamePlatform();
    this._api = getNativePlatformApi(this.name);
    const apiName = this.name === 'douyin' ? 'tt'
      : this.name === 'wechat' ? 'wx'
      : this.name === 'taptap' ? 'tap'
      : this.name === 'huawei' ? (typeof qg !== 'undefined' ? 'qg' : typeof qa !== 'undefined' ? 'qa' : 'wx')
      : 'none';
    console.log(`[Platform] 当前平台: ${this.name}, api=${apiName}`);
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

  get isTaptap(): boolean {
    return this.name === 'taptap';
  }

  get isHuawei(): boolean {
    return this.name === 'huawei';
  }

  /**
   * Tap / 华为快游戏：宿主 createCanvas 会和 document.createElement 互相重入。
   * 禁止再走 PIXI.Application，量字 canvas 也必须用假画布。
   */
  get isCanvasHostGuarded(): boolean {
    return this.name === 'taptap' || this.name === 'huawei';
  }

  /** 后端 login 接口 platform 字段（wx / dy / tap / hw / anon） */
  get backendPlatformCode(): BackendPlatformCode {
    return toBackendPlatformCode(this.name);
  }

  /**
   * 是否具备 HTTP 能力。
   *
   * 必须和 request() 真正用的三条通路一致：宿主 request → 适配器覆盖前的宿主 XHR → fetch。
   * 华为真机 qg 既没有 request 也没有全局 fetch，只剩宿主 XHR；漏掉它就会把云同步整体关掉
   * （症状：经分照样有数，但 user_id 恒为空、云存档一条不写）。
   */
  get canUseBackend(): boolean {
    return typeof this._api?.request === 'function'
      || !!this._hostXHR()
      || typeof this._hostFetch() === 'function';
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

  /** 鸿蒙：抖音开放数据域 / getImRankData 不可用，排行只能走主域本地画 */
  get isHarmony(): boolean {
    return isHarmonyOsInfo(this.getSystemInfoSync());
  }

  /** 底层 API（慎用，优先使用封装方法） */
  get api(): any {
    return this._api;
  }

  // ═══════════════ 存储 ═══════════════

  getStorageSync(key: string): string | null {
    return readHostStorage(this._api, key, resolveHostLocalStorage());
  }

  setStorageSync(key: string, value: string): void {
    writeHostStorage(this._api, key, value, resolveHostLocalStorage());
  }

  /** 异步写入本地存储（避免阻塞主线程） */
  setStorageAsync(key: string, value: string): void {
    const hostLs = resolveHostLocalStorage();
    writeHostStorage(this._api, key, value, hostLs);
    try {
      if (typeof this._api?.setStorage === 'function') {
        this._api.setStorage({ key, data: value, value, fail() {} });
      }
    } catch { /* */ }
  }

  removeStorageSync(key: string): void {
    removeHostStorage(this._api, key, resolveHostLocalStorage());
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
    const headers: Record<string, string> = { ...(opts.headers || {}) };
    if (method !== 'GET' && !headers['content-type'] && !headers['Content-Type']) {
      headers['content-type'] = 'application/json';
    }
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

    // 只用适配器覆盖前保存的宿主 XHR。覆盖后的 XMLHttpRequest 会再去调 qg.request。
    const HostXHR = this._hostXHR();
    if (HostXHR) {
      return this._hostXhrRequest(HostXHR, {
        url: opts.url,
        method,
        headers,
        payload: payload as string | undefined,
        timeoutMs,
        responseType: 'text',
      }).then((res) => {
        const text = String(res.text || '');
        let data: unknown = text;
        try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
        return { statusCode: res.statusCode, data };
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

  /**
   * 抖音排行榜写成绩。非抖音或宿主无此 API 时返回 false，不抛。
   * 文档：tt.setImRankData，基础库 2.70.0。
   */
  setImRankData(opts: {
    dataType: number;
    value: string;
    priority?: number;
    extra?: string;
    zoneId?: string;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.isDouyin || typeof this._api?.setImRankData !== 'function') {
        resolve(false);
        return;
      }
      try {
        const timer = setTimeout(() => {
          console.warn('[Rank] setImRankData timeout');
          resolve(false);
        }, 2000);
        this._api.setImRankData({
          dataType: opts.dataType,
          value: opts.value,
          priority: opts.priority ?? 0,
          extra: opts.extra,
          zoneId: opts.zoneId ?? 'default',
          success: () => { clearTimeout(timer); resolve(true); },
          fail: (err: unknown) => {
            clearTimeout(timer);
            console.warn('[Rank] setImRankData fail', err);
            resolve(false);
          },
        });
      } catch (e) {
        console.warn('[Rank] setImRankData throw', e);
        resolve(false);
      }
    });
  }

  /**
   * 拉起抖音官方原生排行榜。非抖音或宿主无此 API 时返回 false。
   * 拉榜前调用方必须先 ensureLogin，否则可能弹不出或闪退。
   */
  getImRankList(opts: {
    relationType: 'default' | 'friend' | 'all';
    dataType: number;
    rankType: 'day' | 'week' | 'month' | 'all';
    pageNum?: number;
    pageSize?: number;
    suffix?: string;
    rankTitle?: string;
    zoneId?: string;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.isDouyin || typeof this._api?.getImRankList !== 'function') {
        resolve(false);
        return;
      }
      try {
        this._api.getImRankList({
          relationType: opts.relationType,
          dataType: opts.dataType,
          rankType: opts.rankType,
          pageNum: opts.pageNum ?? 1,
          pageSize: opts.pageSize ?? 20,
          suffix: opts.suffix ?? '',
          rankTitle: opts.rankTitle ?? '',
          zoneId: opts.zoneId ?? 'default',
          success: () => resolve(true),
          fail: (err: unknown) => {
            console.warn('[Rank] getImRankList fail', err);
            resolve(false);
          },
        });
      } catch (e) {
        console.warn('[Rank] getImRankList throw', e);
        resolve(false);
      }
    });
  }

  private _loginReady: Promise<boolean> | null = null;

  /**
   * 抖音登录（排行榜写入/拉起前必做）。成功过就复用，避免每次爬塔都弹。
   * 非抖音直接 false。失败不抛。
   */
  ensureLogin(): Promise<boolean> {
    if (!this.isDouyin) return Promise.resolve(false);
    if (!this._loginReady) {
      this._loginReady = this.loginCode().then((code) => {
        const ok = code.length > 0;
        if (!ok) this._loginReady = null;
        return ok;
      });
    }
    return this._loginReady;
  }

  /**
   * 当前登录用户的抖音头像 / 昵称。第一次可能弹授权。
   * 非抖音或失败返回 null，不抛。
   */
  getUserProfile(): Promise<{ nickName: string; avatarUrl: string } | null> {
    return new Promise((resolve) => {
      if (!this.isDouyin || typeof this._api?.getUserInfo !== 'function') {
        resolve(null);
        return;
      }
      try {
        const timer = setTimeout(() => {
          console.warn('[Platform] getUserInfo timeout');
          resolve(null);
        }, 2000);
        this._api.getUserInfo({
          success: (res: {
            userInfo?: { nickName?: string; nick_name?: string; avatarUrl?: string; user_img?: string };
          }) => {
            clearTimeout(timer);
            const info = res?.userInfo ?? {};
            const nickName = String(info.nickName ?? info.nick_name ?? '').trim();
            const avatarUrl = String(info.avatarUrl ?? info.user_img ?? '').trim();
            if (!nickName && !avatarUrl) {
              resolve(null);
              return;
            }
            resolve({ nickName, avatarUrl });
          },
          fail: (err: unknown) => {
            clearTimeout(timer);
            console.warn('[Platform] getUserInfo fail', err);
            resolve(null);
          },
        });
      } catch (e) {
        console.warn('[Platform] getUserInfo throw', e);
        resolve(null);
      }
    });
  }

  /** 平台登录 code（wx.login / tt.login / tap.login） */
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

  /**
   * 华为帐号。先静默取缓存 playerId，没有再调 gameLoginWithReal（可能弹华为帐号框）。
   * 宿主没有这些 API 时返回 null，由后端走设备匿名号。
   */
  loginHuaweiAccount(): Promise<HuaweiAccount | null> {
    if (!this.isHuawei || !this._api) return Promise.resolve(null);
    return this._qgGetCachePlayerId().then((cached) => cached || this._qgGameLogin());
  }

  private _qgGetCachePlayerId(): Promise<HuaweiAccount | null> {
    const api = this._api;
    if (typeof api?.getCachePlayerId !== 'function') return Promise.resolve(null);
    return new Promise((resolve) => {
      let done = false;
      const finish = (account: HuaweiAccount | null): void => {
        if (done) return;
        done = true;
        resolve(account);
      };
      void waitMs(1500).then(() => finish(null));
      try {
        api.getCachePlayerId({
          success: (res: unknown) => {
            const parsed = parseHuaweiLoginData(res);
            if (parsed) console.log(`[Platform] 华为缓存帐号 playerId=${parsed.playerId}`);
            finish(parsed);
          },
          fail: () => finish(null),
        });
      } catch {
        finish(null);
      }
    });
  }

  private _qgGameLogin(): Promise<HuaweiAccount | null> {
    const api = this._api;
    const loginFn = (typeof api?.gameLoginWithReal === 'function' && api.gameLoginWithReal)
      || (typeof api?.gameLogin === 'function' && api.gameLogin)
      || null;
    if (!loginFn) {
      console.warn('[Platform] 华为无 gameLoginWithReal / gameLogin，回退设备匿名号');
      return Promise.resolve(null);
    }
    const appid = readHuaweiAppId(api);
    const via = typeof api.gameLoginWithReal === 'function' ? 'gameLoginWithReal' : 'gameLogin';
    console.log(`[Platform] 华为登录 via=${via} appid=${appid || '(empty)'}`);
    return new Promise((resolve) => {
      let done = false;
      const finish = (account: HuaweiAccount | null): void => {
        if (done) return;
        done = true;
        resolve(account);
      };
      void waitMs(8000).then(() => finish(null));
      try {
        loginFn.call(api, {
          forceLogin: 1,
          appid,
          success: (data: unknown) => {
            const parsed = parseHuaweiLoginData(data);
            if (parsed) {
              console.log(`[Platform] 华为登录 ok playerId=${parsed.playerId}`);
            } else {
              console.warn('[Platform] 华为登录成功但无 playerId', data);
            }
            finish(parsed);
          },
          fail: (data: unknown, code?: number) => {
            console.warn(`[Platform] 华为登录失败 code=${code ?? '?'}`, data);
            finish(null);
          },
        });
      } catch (e) {
        console.warn('[Platform] 华为登录异常', e);
        finish(null);
      }
    });
  }

  // ═══════════════ 创建资源 ═══════════════

  /** 创建平台 Image 对象（加载本地/网络图片用） */
  createImage(): any {
    if (this._api?.createImage) return shimImageDomContract(this._api.createImage());
    if (typeof Image !== 'undefined') return new Image();
    return null;
  }

  /** 原生 downloadFile / download 是否可用（华为 1078 真机常常没有） */
  get hasNativeDownload(): boolean {
    return typeof this._api?.downloadFile === 'function' || typeof this._api?.download === 'function';
  }

  get hasBinaryHttp(): boolean {
    return this.hasNativeDownload || !!this._hostXHR() || typeof this._hostFetch() === 'function';
  }

  /** 下载远程文件到临时路径（CDN 资源用） */
  downloadFile(url: string): Promise<{ tempFilePath?: string; statusCode?: number }> {
    return this._invokeNativeDownload('downloadFile', url)
      .catch(() => this._invokeNativeDownload('download', url));
  }

  /**
   * 拉二进制。华为原生常无 downloadFile，走捕获的宿主 XHR / fetch。
   * 适配器假 XHR 会再调不存在的 qg.request，不能用。
   */
  fetchBinary(url: string, timeoutMs = 30000): Promise<{ data: ArrayBuffer; statusCode: number }> {
    const HostXHR = this._hostXHR();
    if (HostXHR) {
      return this._hostXhrRequest(HostXHR, {
        url,
        method: 'GET',
        headers: {},
        timeoutMs,
        responseType: 'arraybuffer',
      }).then((res) => {
        if (res.statusCode > 0 && (res.statusCode < 200 || res.statusCode >= 300)) {
          throw new Error(`xhr status=${res.statusCode} url=${url}`);
        }
        const data = coerceToArrayBuffer(res.buffer) || coerceToArrayBuffer(res.text);
        if (!data) {
          throw new Error(`xhr empty body url=${url}`);
        }
        return { data, statusCode: res.statusCode || 200 };
      });
    }

    const hostFetch = this._hostFetch();
    if (hostFetch) {
      return hostFetch(url).then(async (res: Response) => {
        if (!res.ok) throw new Error(`fetch status=${res.status} url=${url}`);
        const data = await res.arrayBuffer();
        return { data, statusCode: res.status };
      });
    }

    return Promise.reject(new Error('no binary http transport'));
  }

  private _hostXHR(): any {
    try {
      if (typeof GameGlobal !== 'undefined' && GameGlobal.__hostXMLHttpRequest) {
        return GameGlobal.__hostXMLHttpRequest;
      }
    } catch { /* */ }
    return null;
  }

  /**
   * 宿主 XHR。华为真机经常既不 onload 也不 onerror，xhr.timeout 也不响。
   * 必须再用 waitMs（setTimeout + rAF）硬切，否则 login 会把启动卡在 splash-done。
   */
  private _hostXhrRequest(
    HostXHR: any,
    opts: {
      url: string;
      method: string;
      headers: Record<string, string>;
      payload?: string;
      timeoutMs: number;
      responseType: 'text' | 'arraybuffer';
    },
  ): Promise<{ statusCode: number; text: string; buffer: unknown }> {
    return new Promise((resolve, reject) => {
      let done = false;
      let xhr: any;
      const finish = (fn: () => void): void => {
        if (done) return;
        done = true;
        fn();
      };
      void waitMs(opts.timeoutMs).then(() => {
        finish(() => {
          try { xhr?.abort?.(); } catch { /* */ }
          reject(new Error(`request timeout: ${opts.url}`));
        });
      });
      try {
        xhr = new HostXHR();
        xhr.open(opts.method, opts.url);
        if (opts.responseType === 'arraybuffer') {
          try { xhr.responseType = 'arraybuffer'; } catch { /* 部分 JSB 不认 */ }
        }
        if (typeof xhr.timeout === 'number') xhr.timeout = opts.timeoutMs;
        for (const key of Object.keys(opts.headers)) {
          try { xhr.setRequestHeader(key, opts.headers[key]); } catch { /* */ }
        }
        xhr.onload = () => finish(() => resolve({
          statusCode: Number(xhr.status || 0),
          text: String(xhr.responseText || ''),
          buffer: xhr.response,
        }));
        xhr.onerror = () => finish(() => reject(new Error(`xhr error: ${opts.url}`)));
        xhr.ontimeout = () => finish(() => reject(new Error(`request timeout: ${opts.url}`)));
        xhr.send(opts.payload);
      } catch (e) {
        finish(() => reject(e));
      }
    });
  }

  private _hostFetch(): ((input: string) => Promise<Response>) | null {
    try {
      if (typeof GameGlobal !== 'undefined' && typeof GameGlobal.__hostFetch === 'function') {
        return GameGlobal.__hostFetch.bind(GameGlobal);
      }
    } catch { /* */ }
    if (typeof fetch === 'function') return fetch;
    return null;
  }

  private _invokeNativeDownload(
    method: 'downloadFile' | 'download',
    url: string,
  ): Promise<{ tempFilePath?: string; statusCode?: number }> {
    const fn = this._api?.[method];
    if (typeof fn !== 'function') {
      return Promise.reject(new Error(`${method} unavailable`));
    }
    return new Promise((resolve, reject) => {
      try {
        fn.call(this._api, {
          url,
          success: (res: { tempFilePath?: string; filePath?: string; uri?: string; statusCode?: number }) => {
            const statusCode = Number(res?.statusCode || 0);
            if (statusCode > 0 && (statusCode < 200 || statusCode >= 300)) {
              reject(new Error(`${method} status=${statusCode} url=${url}`));
              return;
            }
            const tempFilePath = res?.tempFilePath || res?.filePath || res?.uri;
            if (!tempFilePath) {
              reject(new Error(`${method} missing tempFilePath url=${url}`));
              return;
            }
            resolve({ tempFilePath, statusCode });
          },
          fail: (err: { errMsg?: string; message?: string } | string) => {
            const msg = typeof err === 'string' ? err : (err?.errMsg || err?.message || String(err));
            reject(new Error(msg));
          },
        });
      } catch (e) {
        reject(e);
      }
    });
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

  /** 关掉当前原生 toast（激励广告关闭后宿主偶发自带提示时用） */
  hideToast(): void {
    try {
      this._api?.hideToast?.();
    } catch (_) {}
  }

  /**
   * 激励视频广告。已配置 createRewardedVideoAd 则拉起；
   * 否则开发/本地环境短暂提示后视为成功，便于联调各广告位。
   *
   * 广告实例按 adUnitId 缓存并只注册一次回调：宿主的 createRewardedVideoAd 对同一
   * adUnitId 返回同一单例，每次播放都重新 onClose 会让回调越积越多，
   * 同一次关闭被回调 N 次（第二次以后打到已结束的 Promise 上，静默丢失奖励）。
   */
  showRewardedVideo(adUnitId = ''): Promise<boolean> {
    return new Promise((resolve) => {
      // 同一时刻只允许一支广告在播，避免两个入口的奖励串到一起
      if (this._adResolve) {
        resolve(false);
        return;
      }

      // Tap 真机没有开发桩：空广告位 / 创建失败一律不发奖，避免白给。
      // 抖音 / 微信本地联调仍走下面的 mock，行为不变。
      if (this.isTaptap && !adUnitId) {
        this.showToast('广告位未配置');
        resolve(false);
        return;
      }

      let ad: any = null;
      try {
        ad = this._rewardedAd(adUnitId);
      } catch (_) { /* fall through mock */ }

      if (!ad) {
        if (this.isTaptap) {
          this.showToast('暂无广告');
          resolve(false);
          return;
        }
        this.showToast('广告播放中…');
        setTimeout(() => {
          // 桩结束立刻清掉，避免和业务侧翻倍数额动画叠在一起
          this.hideToast();
          resolve(true);
        }, 700);
        return;
      }

      this._adResolve = resolve;
      try {
        const p = ad.show();
        // 拉取失败先 load 再播一次：小游戏侧常见于弱网首次拉取超时
        if (p?.catch) {
          p.catch(() => {
            const l = ad.load?.();
            if (l?.then) l.then(() => ad.show()).catch(() => this._settleAd(false));
            else this._settleAd(false);
          });
        }
      } catch (_) {
        this._settleAd(false);
      }
    });
  }

  private _rewardedAd(adUnitId: string): any {
    const cached = this._adCache.get(adUnitId);
    if (cached) return cached;
    const create = this._api?.createRewardedVideoAd;
    if (typeof create !== 'function') return null;
    const ad = create.call(this._api, { adUnitId });
    if (!ad?.onClose || !ad?.show) return null;
    ad.onClose((res: { isEnded?: boolean }) => this._settleAd(!!res?.isEnded));
    ad.onError?.(() => this._settleAd(false));
    this._adCache.set(adUnitId, ad);
    return ad;
  }

  private _settleAd(ok: boolean): void {
    const resolve = this._adResolve;
    this._adResolve = null;
    resolve?.(ok);
  }

  /**
   * 插屏广告（抖音流量主 / 广告金政策建议接入）。
   * 未配置 adUnitId、宿主不支持、加载失败 → resolve(false)，不挡流程。
   * 抖音要求「展示成功后再播须 destroy 再建」：每次调用新建实例，关闭后销毁。
   */
  showInterstitialAd(adUnitId = ''): Promise<boolean> {
    return new Promise((resolve) => {
      if (!adUnitId) {
        resolve(false);
        return;
      }
      const create = this._api?.createInterstitialAd;
      if (typeof create !== 'function') {
        resolve(false);
        return;
      }

      let ad: any = null;
      let settled = false;
      let shown = false;
      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        try { ad?.destroy?.(); } catch { /* ignore */ }
        resolve(ok);
      };

      try {
        ad = create.call(this._api, { adUnitId });
      } catch {
        resolve(false);
        return;
      }
      if (!ad?.show) {
        resolve(false);
        return;
      }

      ad.onError?.(() => finish(false));
      ad.onClose?.(() => finish(true));
      ad.onLoad?.(() => {
        try {
          const p = ad.show();
          if (p?.then) {
            p.then(() => { shown = true; }).catch(() => finish(false));
          } else {
            shown = true;
          }
        } catch {
          finish(false);
        }
      });

      // 创建后会自动 load；超时仍未展示则放行（避免卡死跳转）
      setTimeout(() => {
        if (!settled && !shown) finish(false);
      }, 5000);
    });
  }

  /**
   * 订阅消息（抖音广告金政策建议接入）。
   * 必须在用户点击/支付回调里调用；tmplIds 来自后台「运营-订阅消息」。
   * 返回各模板 id → accept|reject|ban|fail；失败或未配置返回空对象。
   */
  requestSubscribeMessage(tmplIds: readonly string[]): Promise<Record<string, string>> {
    return new Promise((resolve) => {
      const ids = tmplIds.filter(Boolean).slice(0, 3);
      const api = this._api?.requestSubscribeMessage;
      if (typeof api !== 'function' || ids.length === 0) {
        resolve({});
        return;
      }
      try {
        api.call(this._api, {
          tmplIds: ids,
          success: (res: Record<string, string>) => resolve(res ?? {}),
          fail: () => resolve({}),
          complete: () => { /* success/fail 已 settle */ },
        });
      } catch {
        resolve({});
      }
    });
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

  // ═══════════════ 抖音添加到桌面（广告金政策必接） ═══════════════

  /** 检查桌面快捷方式是否已添加（仅 Android 有效） */
  checkShortcut(opts: {
    success?: (res: { status?: { exist?: boolean; needUpdate?: boolean } }) => void;
    fail?: (err?: unknown) => void;
  }): void {
    try {
      if (this._api?.checkShortcut) {
        this._api.checkShortcut(opts);
      } else {
        opts.fail?.({ errMsg: 'checkShortcut not supported' });
      }
    } catch (e) {
      opts.fail?.(e);
    }
  }

  /**
   * 添加小游戏到手机桌面（须在用户点击/touchend 内同步调用）
   * 仅支持抖音 / 抖音极速版 / 抖音火山版
   */
  addShortcut(opts: {
    success?: () => void;
    fail?: (err?: { errMsg?: string }) => void;
    complete?: () => void;
  }): void {
    try {
      if (this._api?.addShortcut) {
        this._api.addShortcut(opts);
      } else {
        opts.fail?.({ errMsg: 'addShortcut not supported' });
      }
    } catch (e) {
      opts.fail?.(e as { errMsg?: string });
    }
  }

  /**
   * 加载本地自定义字体。
   * 优先 wx/tt.loadFont(path)（同步返回 family）；否则走 loadFontFace。
   * 非小游戏环境返回 null，由 FontService 用 @font-face 兜底。
   */
  loadFont(path: string, family: string): Promise<string | null> {
    if (!this.isMinigame) return Promise.resolve(null);

    // 微信/抖音/Tap：loadFont 成功才返回 family。失败是 null，不能改写成请求名
    // 否则 Text 会只用一个未注册的 family，Tap Android 上数字和汉字都会空白/乱码
    if (typeof this._api?.loadFont === 'function') {
      try {
        const loaded = this._api.loadFont(path) as string | undefined;
        if (typeof loaded === 'string' && loaded.trim()) {
          return Promise.resolve(loaded.trim());
        }
        console.warn('[Platform] loadFont 未返回 family', path, loaded);
      } catch (e) {
        console.warn('[Platform] loadFont 失败', path, e);
      }
    }

    if (typeof this._api?.loadFontFace === 'function') {
      return new Promise((resolve) => {
        try {
          this._api.loadFontFace({
            family,
            source: `url("${path}")`,
            global: true,
            success: () => resolve(family),
            fail: (err: unknown) => {
              console.warn('[Platform] loadFontFace 失败', path, err);
              resolve(null);
            },
          });
        } catch (e) {
          console.warn('[Platform] loadFontFace 异常', path, e);
          resolve(null);
        }
      });
    }

    return Promise.resolve(null);
  }
}

export const Platform = new PlatformServiceClass();
