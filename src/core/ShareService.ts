/**
 * 微信分享：右上角「转发 / 朋友圈」+ 业务主动分享。
 *
 * game.js 内 share-bootstrap.js 会尽早注册监听；bundle 加载后本模块接管 payload 生成。
 */
import { Platform } from '@/core/PlatformService';
import { buildSharePayload, type SharePayload } from '@/config/ShareConfig';

declare const GameGlobal: {
  __sharePayloadFn?: (source: string, mode: 'friend' | 'timeline') => SharePayload;
};

type SharePayloadFn = (source: string, mode: 'friend' | 'timeline') => SharePayload;

function resolvePayload(source: string, mode: 'friend' | 'timeline'): SharePayload {
  return GameGlobal.__sharePayloadFn?.(source, mode) ?? buildSharePayload(source, mode);
}

/** bundle 加载后调用：升级 share-bootstrap 注册的回调数据 */
export function configureWechatShare(getPayload?: SharePayloadFn): void {
  if (!Platform.isWechat) return;

  GameGlobal.__sharePayloadFn = getPayload ?? ((source, mode) => buildSharePayload(source, mode));

  Platform.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline'],
  });

  Platform.onShareAppMessage(() => resolvePayload('menu', 'friend'));
  Platform.onShareTimeline(() => resolvePayload('menu', 'timeline'));
}

/** 业务按钮主动唤起转发面板 */
export function shareToFriend(source = 'button'): void {
  if (!Platform.isWechat) return;
  Platform.shareAppMessage(resolvePayload(source, 'friend'));
}
