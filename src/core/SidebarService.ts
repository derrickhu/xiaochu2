/**
 * 抖音侧边栏复访（平台必接能力）
 *
 * GameGlobal.__launchInfo / __sidebarSupported 在 minigame/game.js 启动期写入；
 * 业务层只读状态并调用 Platform.navigateToScene({ scene: 'sidebar' })。
 */
import { Platform } from './PlatformService';

declare const GameGlobal: {
  __launchInfo?: DouyinLaunchInfo;
  __sidebarSupported?: boolean;
} | undefined;

export interface DouyinLaunchInfo {
  scene?: string;
  launch_from?: string;
  location?: string;
  query?: Record<string, string>;
}

export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

class SidebarServiceClass {
  /** 当前宿主是否支持侧边栏场景（checkScene 结果） */
  get supported(): boolean {
    return !!GameGlobal?.__sidebarSupported;
  }

  /** 最近一次 onShow 启动参数 */
  get launchInfo(): DouyinLaunchInfo {
    return GameGlobal?.__launchInfo ?? {};
  }

  /** 是否从抖音首页侧边栏卡片进入 */
  isFromSidebar(): boolean {
    const info = this.launchInfo;
    return info.scene === '021036'
      && info.launch_from === 'homepage'
      && info.location === 'sidebar_card';
  }

  /** 抖音 + 宿主支持侧边栏 → 展示入口与弹窗 */
  get isAvailable(): boolean {
    return Platform.isDouyin && this.supported;
  }

  /** 跳转抖音首页侧边栏（审核必检：tt.navigateToScene） */
  navigateToSidebar(): void {
    Platform.navigateToScene({
      scene: 'sidebar',
      success: () => console.log('[Sidebar] navigateToScene success'),
      fail: (err) => console.warn('[Sidebar] navigateToScene fail', err),
    });
  }
}

export const SidebarService = new SidebarServiceClass();
