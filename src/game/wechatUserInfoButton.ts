/**
 * 微信头像昵称授权。
 * 小游戏里 wx.getUserInfo 不会再弹窗，只有盖在界面上的 createUserInfoButton 被点到才会授权。
 * 按钮是原生控件，浮在画布上面，页面关掉必须 destroy。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';
import { acceptHostProfile, rememberHostProfile, type HostProfile } from './rankHostProfile';

export function rendererRectToCss(
  rect: { x: number; y: number; width: number; height: number },
  dpr: number,
): { left: number; top: number; width: number; height: number } {
  const scale = dpr > 0 ? dpr : 1;
  return {
    left: Math.max(0, Math.round(rect.x / scale)),
    top: Math.max(0, Math.round(rect.y / scale)),
    width: Math.max(1, Math.round(rect.width / scale)),
    height: Math.max(1, Math.round(rect.height / scale)),
  };
}

type UserInfoButton = {
  onTap: (cb: (res: unknown) => void) => void;
  show?: () => void;
  hide?: () => void;
  destroy?: () => void;
};

function destroyButton(btn: UserInfoButton | null): void {
  if (!btn) return;
  try { btn.hide?.(); } catch { /* 已经没了 */ }
  try { btn.destroy?.(); } catch { /* 已经没了 */ }
}

/** 玩家拒绝或隐私协议挡住时，不要再走一次静默读取 */
const TAP_STOPPED = Symbol('wechat-auth-stopped');

function profileFromTap(res: unknown): HostProfile | null | typeof TAP_STOPPED {
  const rec = res as {
    errMsg?: string;
    err_code?: number;
    userInfo?: { nickName?: string; avatarUrl?: string };
  } | null;
  const errMsg = String(rec?.errMsg || '');
  if (errMsg.includes('no privacy') || rec?.err_code === -12034) {
    Platform.showToast('请先同意隐私协议');
    return TAP_STOPPED;
  }
  if (/auth deny|auth denied/i.test(errMsg)) {
    Platform.showToast('未授权头像昵称');
    return TAP_STOPPED;
  }
  const info = rec?.userInfo;
  return acceptHostProfile(String(info?.nickName || ''), String(info?.avatarUrl || ''));
}

/**
 * 把透明授权按钮盖在 target 上。点到真实头像昵称后写入缓存并回调。
 * 返回拆掉按钮的函数。
 */
export function bindWeChatUserInfoButton(
  target: PIXI.Container,
  onReady: (profile: HostProfile) => void,
): () => void {
  if (!Platform.isWechat) return () => {};
  let btn: UserInfoButton | null = null;
  let stopped = false;

  const place = (): boolean => {
    if (stopped || target.destroyed) return false;
    const bounds = target.getBounds();
    if (bounds.width < 2 || bounds.height < 2) return false;
    const css = rendererRectToCss(bounds, Game.dpr || 1);
    destroyButton(btn);
    btn = Platform.createUserInfoButton(css);
    if (!btn) return false;
    btn.onTap((res) => {
      const direct = profileFromTap(res);
      if (direct === TAP_STOPPED) return;
      if (direct) {
        rememberHostProfile(direct);
        onReady(direct);
        return;
      }
      void Platform.getUserProfile().then((live) => {
        if (stopped) return;
        const accepted = live ? acceptHostProfile(live.nickName, live.avatarUrl) : null;
        if (!accepted) {
          Platform.showToast('未拿到微信头像昵称');
          return;
        }
        rememberHostProfile(accepted);
        onReady(accepted);
      });
    });
    return true;
  };

  if (!place()) Game.ticker.addOnce(() => { place(); });

  return () => {
    stopped = true;
    destroyButton(btn);
    btn = null;
  };
}
