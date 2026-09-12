/**
 * Canvas 管理（对齐 game2D_huahua）
 * 第一次 createCanvas() 返回主屏 canvas（小游戏环境特性）
 */

const platform = require('./platform');

function _usable(c) {
  return !!(c && typeof c.getContext === 'function');
}

let canvas;
try {
  canvas = platform.createCanvas();
  if (!_usable(canvas) && typeof GameGlobal !== 'undefined' && _usable(GameGlobal.__hostCanvas)) {
    canvas = GameGlobal.__hostCanvas;
  }

  // iOS / Tap：禁用 webgl2（勿在此处 getContext('webgl')，会锁死或打崩宿主）
  const _sysPlat = platform.getSystemInfoSync().platform;
  if ((_sysPlat === 'ios' || platform.name === 'taptap' || platform.name === 'huawei') && canvas && typeof canvas.getContext === 'function') {
    const origGetContext = canvas.getContext.bind(canvas);
    canvas.getContext = function(type, opts) {
      if (type === 'webgl2') return null;
      return origGetContext(type, opts);
    };
  }
} catch (e) {
  console.error('[canvas] createCanvas 失败:', e);
  canvas = (typeof GameGlobal !== 'undefined' && _usable(GameGlobal.__hostCanvas))
    ? GameGlobal.__hostCanvas
    : { width: 0, height: 0, getContext: function() { return null; } };
}

module.exports = { canvas };
