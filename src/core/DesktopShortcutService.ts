/**
 * 抖音「添加到桌面」能力（广告投放小游戏必接）
 *
 * GameGlobal.__desktopShortcut* 在 minigame/game.js 启动期写入；
 * addShortcut 须在用户点击/touchend 内同步调用（见 bindPointerTap sync 模式）。
 */
import { Platform } from './PlatformService';

declare const GameGlobal: {
  __desktopShortcutSupported?: boolean;
  __desktopShortcutStatus?: { exist?: boolean; needUpdate?: boolean } | null;
} | undefined;

export interface DesktopShortcutStatus {
  exist: boolean;
  needUpdate: boolean;
}

class DesktopShortcutServiceClass {
  /** 宿主是否暴露 addShortcut（启动期探测） */
  get supported(): boolean {
    return !!GameGlobal?.__desktopShortcutSupported;
  }

  /** checkShortcut 结果（仅 Android 可靠；其它平台可能为 null） */
  get status(): DesktopShortcutStatus | null {
    const s = GameGlobal?.__desktopShortcutStatus;
    if (!s) return null;
    return { exist: !!s.exist, needUpdate: !!s.needUpdate };
  }

  get isAvailable(): boolean {
    return Platform.isDouyin && this.supported;
  }

  /** 刷新桌面快捷方式状态（Android） */
  refreshStatus(): void {
    Platform.checkShortcut({
      success: (res) => {
        if (typeof GameGlobal !== 'undefined') {
          GameGlobal.__desktopShortcutStatus = res?.status ?? null;
        }
      },
    });
  }

  /**
   * 添加到桌面 — 调用方必须处于 syncGesture 点击回调内
   * @returns 是否已发起 native 调用（false = 当前环境不支持）
   */
  addToDesktop(handlers?: {
    onSuccess?: () => void;
    onFail?: (errMsg: string) => void;
  }): boolean {
    if (!this.isAvailable) {
      handlers?.onFail?.('addShortcut not supported');
      return false;
    }
    Platform.addShortcut({
      success: () => {
        console.log('[DesktopShortcut] addShortcut ok');
        this.refreshStatus();
        handlers?.onSuccess?.();
      },
      fail: (err) => {
        const msg = err?.errMsg || 'addShortcut fail';
        console.warn('[DesktopShortcut] addShortcut fail', msg);
        handlers?.onFail?.(msg);
      },
    });
    return true;
  }
}

export const DesktopShortcutService = new DesktopShortcutServiceClass();
