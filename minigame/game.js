// ====== 最早期诊断 ======
// 鸿蒙上"卡在转圈、控制台出不来"的情况，用 wx.showModal 弹窗显示诊断信息
var _diagMsgs = [];
var _diagStart = Date.now();
function _diag(msg) {
  var ts = Date.now() - _diagStart;
  var line = '[' + ts + 'ms] ' + msg;
  _diagMsgs.push(line);
  try { console.log(line); } catch(_) {}
}

// 弹窗显示诊断信息（控制台出不来时的最后手段）
function _showDiag() {
  try {
    var api = typeof wx !== 'undefined' ? wx : (typeof tt !== 'undefined' ? tt : null);
    if (api && api.showModal) {
      api.showModal({
        title: '启动诊断',
        content: _diagMsgs.join('\n'),
        showCancel: false
      });
    }
  } catch(_) {}
}

_diag('game.js 开始执行');

// 尽早注册分享菜单（须在 bundle 加载前完成，否则真机体验版右上角转发可能无效；对齐 xiao_chu）
try {
  require('./share-bootstrap.js');
} catch (e) {
  _diag('share-bootstrap 失败:' + e);
}

try {
  var _api = typeof wx !== 'undefined' ? wx : (typeof tt !== 'undefined' ? tt : null);
  if (_api) {
    var _si = _api.getSystemInfoSync();
    _diag('platform:' + _si.platform + ' system:' + _si.system);
    _diag('brand:' + _si.brand + ' model:' + _si.model);
  }
} catch(e) {
  _diag('getSystemInfo失败:' + e);
}

// 全局错误捕获——鸿蒙等设备 adapter 阶段崩溃无日志，必须最先注册
try {
  if (typeof GameGlobal !== 'undefined') {
    GameGlobal.onError = function(msg) {
      _diag('onError:' + msg);
      _showDiag();
    };
    GameGlobal.onUnhandledRejection = function(ev) {
      _diag('unhandledRej:' + (ev && ev.reason || ev));
      _showDiag();
    };
  }
} catch(_) {}

// ====== 加载 adapter ======
_diag('加载 pixi-adapter...');
try {
  require('./pixi-adapter/index');
  _diag('pixi-adapter OK');
} catch (e) {
  _diag('pixi-adapter 失败!!:' + e);
  _showDiag();
}

// ====== 鸿蒙 Intl polyfill ======
// 鸿蒙版微信 V8 引擎不含 ICU，Intl 对象不存在
// PixiJS graphemeSegmenter 中 `Intl==null?...` 会触发 ReferenceError
if (typeof Intl === 'undefined') {
  _diag('Intl不存在,注入polyfill');
  var _g = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof globalThis !== 'undefined' ? globalThis : {});
  _g.Intl = {};
}

// ====== 加载 game-bundle ======
_diag('加载 game-bundle...');
try {
  require('./game-bundle.js');
  _diag('game-bundle OK');
} catch (e) {
  _diag('game-bundle 失败!!:' + e);
  _showDiag();
}

_diag('全部加载完成');

// 5秒后诊断：未渲染 或 仍黑屏时弹窗（含 BootDiag 快照）
setTimeout(function() {
  var api = typeof wx !== 'undefined' ? wx : (typeof tt !== 'undefined' ? tt : null);
  var gg = typeof GameGlobal !== 'undefined' ? GameGlobal : null;
  if (gg && typeof gg.__bootDiagSnapshot === 'function') {
    try { gg.__bootDiagSnapshot(); } catch (e) { _diag('BootDiag快照失败:' + e); }
  }
  if (gg && typeof gg.__bootDiagLines === 'function') {
    try {
      var lines = gg.__bootDiagLines();
      for (var i = 0; i < lines.length; i++) _diag('BD|' + lines[i]);
    } catch (e2) { _diag('BootDiagLines失败:' + e2); }
  }
  if (gg && !gg.__gameRendered) {
    _diag('5秒超时 - 游戏未渲染');
    _showDiag();
    return;
  }
  // 已 init 但用户仍可能黑屏：强制再采样，便于导出 vConsole
  _diag('5秒复检 - gameRendered=true，详见 BD| 行');
}, 5000);
