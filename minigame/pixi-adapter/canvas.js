/**
 * Canvas 管理模块
 * 第一次 createCanvas() 返回主屏 canvas（小游戏环境特性，微信和抖音一致）
 */

const platform = require('./platform');

let canvas;
try {
  canvas = platform.createCanvas();
} catch (e) {
  console.error('[canvas] createCanvas 失败:', e);
  // 兜底：空对象防止后续模块加载崩溃
  canvas = { width: 0, height: 0, getContext: function() { return null; } };
}

module.exports = { canvas };
