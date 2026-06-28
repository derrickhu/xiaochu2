/**
 * Canvas 管理模块
 * 第一次 createCanvas() 返回主屏 canvas（小游戏环境特性，微信和抖音一致）
 */

const platform = require('./platform');

function patchCanvasForceWebGL1(c) {
  if (!c || typeof c.getContext !== 'function' || c.__forceWebGL1) return;
  var orig = c.getContext.bind(c);
  c.getContext = function(type, opts) {
    if (type === 'webgl2') type = 'webgl';
    if (type === 'webgl' || type === 'experimental-webgl') {
      return orig('webgl', Object.assign({
        stencil: true, antialias: true, alpha: true, depth: true, preserveDrawingBuffer: true,
      }, opts || {}));
    }
    return orig(type, opts);
  };
  c.__forceWebGL1 = true;
}

let canvas;
try {
  canvas = platform.createCanvas();
  var sysInfo = platform.getSystemInfoSync();
  if (sysInfo.platform === 'ios') {
    patchCanvasForceWebGL1(canvas);
    console.log('[canvas] iOS 真机：主屏 canvas 已 patch forceWebGL1');
  }
} catch (e) {
  console.error('[canvas] createCanvas 失败:', e);
  // 兜底：空对象防止后续模块加载崩溃
  canvas = { width: 0, height: 0, getContext: function() { return null; } };
}

module.exports = { canvas };
