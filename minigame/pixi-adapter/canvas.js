/**
 * Canvas 管理（对齐 game2D_huahua）
 * 第一次 createCanvas() 返回主屏 canvas（小游戏环境特性）
 */

const platform = require('./platform');

let canvas;
try {
  canvas = platform.createCanvas();

  // iOS / Tap：禁用 webgl2（勿在此处 getContext('webgl')，会锁死或打崩宿主）
  const _sysPlat = platform.getSystemInfoSync().platform;
  if ((_sysPlat === 'ios' || platform.name === 'taptap') && canvas && typeof canvas.getContext === 'function') {
    const origGetContext = canvas.getContext.bind(canvas);
    canvas.getContext = function(type, opts) {
      if (type === 'webgl2') return null;
      return origGetContext(type, opts);
    };
  }
} catch (e) {
  console.error('[canvas] createCanvas 失败:', e);
  canvas = { width: 0, height: 0, getContext: function() { return null; } };
}

module.exports = { canvas };
