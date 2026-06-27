/**
 * 平台服务抽象层 - 统一封装微信/抖音双平台 API
 *
 * 所有平台特有调用（存储、振动、分享等）都通过本模块统一访问，
 * src/ 中不再需要各自 declare const wx / tt。
 */

declare const wx: any;
declare const tt: any;

export type PlatformName = 'wechat' | 'douyin' | 'unknown';

class PlatformServiceClass {
  /** 当前平台名 */
  readonly name: PlatformName;

  /** 底层平台 API 对象（wx / tt / null） */
  private _api: any;

  constructor() {
    if (typeof wx !== 'undefined') {
      this._api = wx;
      this.name = 'wechat';
    } else if (typeof tt !== 'undefined') {
      this._api = tt;
      this.name = 'douyin';
    } else {
      this._api = null;
      this.name = 'unknown';
    }
    console.log(`[Platform] 当前平台: ${this.name}`);
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
}

export const Platform = new PlatformServiceClass();
