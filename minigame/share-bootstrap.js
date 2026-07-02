/**
 * 微信分享尽早注册（须在 game-bundle 加载前完成，否则真机体验版右上角转发可能无效）。
 * 逻辑对齐 xiao_chu/game.js → js/share.registerMenuShareListeners。
 *
 * bundle 加载后 ShareService.configureWechatShare 会通过 GameGlobal.__sharePayloadFn 升级分享文案。
 */
(function () {
  var api = typeof wx !== 'undefined' ? wx : (typeof tt !== 'undefined' ? tt : null);
  if (!api) return;

  var g = typeof GameGlobal !== 'undefined' ? GameGlobal : {};
  g.__sharePayloadFn = g.__sharePayloadFn || null;

  var DEFAULT_TITLE = '灵宠消消塔2 — 转珠消消+灵宠养成，来挑战！';
  var DEFAULT_TIMELINE_TITLE = '灵宠消消塔2，越玩越上头';
  var DEFAULT_IMAGE = 'images/share/share_default.jpg';
  var DEFAULT_QUERY = 'from=share&source=menu';

  function resolvePayload(source, mode) {
    if (typeof g.__sharePayloadFn === 'function') {
      try {
        return g.__sharePayloadFn(source, mode);
      } catch (e) {
        console.warn('[Share] payload fn failed', e);
      }
    }
    return {
      title: mode === 'timeline' ? DEFAULT_TIMELINE_TITLE : DEFAULT_TITLE,
      imageUrl: DEFAULT_IMAGE,
      query: DEFAULT_QUERY,
    };
  }

  try {
    api.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    });
  } catch (_) {}

  if (typeof api.onShareAppMessage === 'function') {
    api.onShareAppMessage(function () {
      return resolvePayload('menu', 'friend');
    });
  }

  if (typeof api.onShareTimeline === 'function') {
    api.onShareTimeline(function () {
      return resolvePayload('menu', 'timeline');
    });
  }
})();
