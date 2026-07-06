// ====== 启动诊断（仅启动失败时弹窗，对齐 game2D_huahua）======
var _diagMsgs = [];
var _diagStart = Date.now();
function _diag(msg) {
  var ts = Date.now() - _diagStart;
  _diagMsgs.push('[' + ts + 'ms] ' + msg);
}

function _showDiag() {
  try {
    var api = typeof wx !== 'undefined' ? wx : (typeof tt !== 'undefined' ? tt : null);
    if (api && api.showModal) {
      var tail = _diagMsgs.length > 28 ? _diagMsgs.slice(-28) : _diagMsgs.slice();
      api.showModal({
        title: '启动失败',
        content: tail.join('\n'),
        showCancel: false,
      });
    }
  } catch (_) {}
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
  }
} catch (_) {}

try { require('./share-bootstrap.js'); } catch (e) {
  console.error('[game.js] share-bootstrap 失败:', e);
}

// 侧边栏复访（抖音必接）：须在 bundle 加载前同步注册 onShow / checkScene
(function () {
  var P = typeof tt !== 'undefined' ? tt : (typeof wx !== 'undefined' ? wx : null);
  if (typeof GameGlobal !== 'undefined') {
    GameGlobal.__launchInfo = {};
    GameGlobal.__sidebarSupported = false;
  }
  if (P && typeof P.onShow === 'function') {
    P.onShow(function (res) {
      console.log('[Sidebar] onShow:', JSON.stringify(res));
      if (typeof GameGlobal !== 'undefined') {
        GameGlobal.__launchInfo = res || {};
      }
    });
  }
  if (P && typeof P.checkScene === 'function') {
    P.checkScene({
      scene: 'sidebar',
      success: function (res) {
        if (typeof GameGlobal !== 'undefined') {
          GameGlobal.__sidebarSupported = !!(res && res.isExist);
        }
        console.log('[Sidebar] checkScene supported:', GameGlobal.__sidebarSupported);
      },
      fail: function () {
        if (typeof GameGlobal !== 'undefined') GameGlobal.__sidebarSupported = false;
      },
    });
  }
})();

try {
  require('./pixi-adapter/index');
} catch (e) {
  _diag('pixi-adapter 失败:' + e);
  _showDiag();
}

if (typeof Intl === 'undefined') {
  var _g = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof globalThis !== 'undefined' ? globalThis : {});
  _g.Intl = {};
}

try {
  require('./game-bundle.js');
} catch (e) {
  _diag('game-bundle 失败:' + e);
  _showDiag();
}

setTimeout(function () {
  if (typeof GameGlobal !== 'undefined' && !GameGlobal.__gameRendered) {
    _diag('5秒超时 - 游戏未渲染');
    _showDiag();
  }
}, 5000);
