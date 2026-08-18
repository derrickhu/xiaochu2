// Tap 真机没有 eval 绑定；Function() 内部会去找 eval，一加载 bundle 就
// ReferenceError: Can't find variable: eval。必须在 require bundle 之前挂上。
(function () {
  var g = (typeof globalThis !== 'undefined' && globalThis)
    || (typeof global !== 'undefined' && global)
    || (typeof GameGlobal !== 'undefined' && GameGlobal);
  if (!g) return;
  var evalFn = function () { return void 0; };
  if (typeof g.eval !== 'function') {
    try {
      Object.defineProperty(g, 'eval', { value: evalFn, writable: true, configurable: true });
    } catch (e1) {
      try { g.eval = evalFn; } catch (e2) {}
    }
  }
  if (typeof GameGlobal !== 'undefined' && typeof GameGlobal.eval !== 'function') {
    try { GameGlobal.eval = g.eval; } catch (e3) {}
  }
})();

// 最早加载：宿主识别 + 原生 API 绑定（须在 share-bootstrap / bundle 之前）
var _runtime = require('./runtime.js');

// ====== 启动诊断（仅启动失败时弹窗，对齐 game2D_huahua）======
var _diagMsgs = [];
var _diagStart = Date.now();
function _diag(msg) {
  var ts = Date.now() - _diagStart;
  _diagMsgs.push('[' + ts + 'ms] ' + msg);
}

function _showDiag() {
  try {
    var api = _runtime && _runtime.getNativePlatformApi && _runtime.getNativePlatformApi();
    if (!api || !api.showModal) {
      api = (typeof tap !== 'undefined' && tap)
        || (typeof wx !== 'undefined' && wx)
        || (typeof tt !== 'undefined' && tt)
        || null;
    }
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
    GameGlobal.__bootDiag = _diag;
    GameGlobal.__showBootDiag = _showDiag;
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

// 抖音平台必接能力：侧边栏复访 + 添加到桌面（须在 bundle 加载前注册/探测）
(function () {
  var P = _runtime.getNativePlatformApi();
  if (typeof GameGlobal !== 'undefined') {
    GameGlobal.__launchInfo = {};
    GameGlobal.__sidebarSupported = false;
    GameGlobal.__desktopShortcutSupported = false;
    GameGlobal.__desktopShortcutStatus = null;
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
  if (P && typeof P.addShortcut === 'function') {
    if (typeof GameGlobal !== 'undefined') GameGlobal.__desktopShortcutSupported = true;
    console.log('[DesktopShortcut] addShortcut supported');
  }
  if (P && typeof P.checkShortcut === 'function') {
    P.checkShortcut({
      success: function (res) {
        if (typeof GameGlobal !== 'undefined') {
          GameGlobal.__desktopShortcutStatus = res && res.status ? res.status : null;
        }
        console.log('[DesktopShortcut] checkShortcut', JSON.stringify(GameGlobal.__desktopShortcutStatus));
      },
      fail: function (err) {
        console.warn('[DesktopShortcut] checkShortcut fail', err && err.errMsg);
      },
    });
  }
})();

try {
  require('./pixi-adapter/index');
  var _cv = typeof GameGlobal !== 'undefined' ? GameGlobal.canvas : null;
  var _doc = typeof document !== 'undefined' ? document : (GameGlobal && GameGlobal.document);
  _diag('cv=' + (_cv ? ((_cv.width || 0) + 'x' + (_cv.height || 0) + ' getContext=' + (typeof _cv.getContext)) : 'none')
    + ' createCanvas=' + (typeof tap !== 'undefined' ? typeof tap.createCanvas : 'no-tap')
    + ' rAF=' + (typeof requestAnimationFrame)
    + ' createElement=' + (_doc ? typeof _doc.createElement : 'no-doc'));
} catch (e) {
  _diag('pixi-adapter 失败:' + e);
  _showDiag();
}

if (typeof Intl === 'undefined') {
  var _g = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof globalThis !== 'undefined' ? globalThis : {});
  _g.Intl = {};
}

_diag('boot=fix5 tap=' + (typeof tap) + ' wx=' + (typeof wx) + ' tt=' + (typeof tt));
try {
  require('./tap-pack-stamp.js');
  _diag('tap-pack=' + (typeof GameGlobal !== 'undefined' ? GameGlobal.__XIAOCHU2_TAP_PACK : '?'));
} catch (e) {
  _diag('no-stamp:' + e);
}
try {
  require('./game-bundle.js');
} catch (e) {
  _diag('game-bundle 失败:' + e);
  _showDiag();
}

setTimeout(function () {
  if (typeof GameGlobal !== 'undefined' && !GameGlobal.__gameRendered) {
    _diag('5秒超时 step=' + (GameGlobal.__bootStep || '?') + ' rendered=' + GameGlobal.__gameRendered);
    _showDiag();
  }
}, 5000);
