// ====== 启动诊断（真机 vConsole 出不来时用弹窗）======
var _diagMsgs = [];
var _diagStart = Date.now();
function _diag(msg) {
  var ts = Date.now() - _diagStart;
  var line = '[' + ts + 'ms] ' + msg;
  _diagMsgs.push(line);
  try { console.log(line); } catch (_) {}
}

function _showDiag() {
  try {
    var api = typeof wx !== 'undefined' ? wx : (typeof tt !== 'undefined' ? tt : null);
    if (api && api.showModal) {
      var tail = _diagMsgs.length > 28 ? _diagMsgs.slice(-28) : _diagMsgs.slice();
      api.showModal({
        title: '启动诊断',
        content: tail.join('\n'),
        showCancel: false,
      });
    }
  } catch (_) {}
}

_diag('game.js 开始执行');

try {
  if (typeof wx !== 'undefined') {
    var _si0 = wx.getSystemInfoSync();
    _diag('platform:' + _si0.platform + ' system:' + _si0.system);
  }
} catch (e) {
  _diag('getSystemInfo失败:' + e);
}

try {
  if (typeof GameGlobal !== 'undefined') {
    GameGlobal.onError = function (msg) {
      _diag('onError:' + msg);
      _showDiag();
    };
    GameGlobal.onUnhandledRejection = function (ev) {
      _diag('unhandledRej:' + (ev && ev.reason || ev));
      _showDiag();
    };
    // 同 game2D_huahua：单 canvas WebGL 直上屏
    GameGlobal.__directWebgl = true;
    GameGlobal.__renderPath = 'direct-webgl';
    GameGlobal.__minimalBoot = false;
  }
} catch (_) {}

try { require('./share-bootstrap.js'); } catch (e) { _diag('share-bootstrap 失败:' + e); }

_diag('加载 pixi-adapter...');
try {
  require('./pixi-adapter/index');
  _diag('pixi-adapter OK');
} catch (e) {
  _diag('pixi-adapter 失败:' + e);
  _showDiag();
}

if (typeof Intl === 'undefined') {
  var _g = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof globalThis !== 'undefined' ? globalThis : {});
  _g.Intl = {};
}

_diag('加载 game-bundle...');
try {
  require('./game-bundle.js');
  _diag('game-bundle OK');
} catch (e) {
  _diag('game-bundle 失败:' + e);
  _showDiag();
}

_diag('全部加载完成');

setTimeout(function () {
  if (typeof GameGlobal !== 'undefined' && !GameGlobal.__gameRendered) {
    _diag('5秒超时 - 游戏未渲染');
    _showDiag();
  }
}, 5000);
