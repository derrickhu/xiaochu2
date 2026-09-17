// 任何 require 之前先打点。华为助手「Nodejs Main Content」看不到游戏 console，
// 错误仍走 qg.onError；成功启动不再弹 toast。
(function () {
  try {
    if (typeof globalThis !== 'undefined' && typeof require === 'function' && !globalThis.require) {
      globalThis.require = require;
    }
  } catch (eReq) {}
  try { console.log('[boot] game.js entered'); } catch (e0) {}
  try {
    console.log('[boot] hosts qg=' + (typeof qg)
      + ' qa=' + (typeof qa)
      + ' wx=' + (typeof wx)
      + ' GameGlobal=' + (typeof GameGlobal)
      + ' require=' + (typeof require));
  } catch (e1) {}
  try {
    if (typeof qg !== 'undefined' && typeof qg.onError === 'function') {
      qg.onError(function (res) {
        try { console.error('[boot] qg.onError', res && (res.message || res.errMsg || res)); } catch (e2) {}
      });
    }
  } catch (e4) {}
})();

// Tap / 华为快游戏真机没有 eval 绑定；Function() 内部会去找 eval，一加载 bundle 就
// ReferenceError: Can't find variable: eval。必须在 require bundle 之前挂上。
// 华为原生快游戏未必注入 GameGlobal，先把全局对象挂成 GameGlobal。
(function () {
  var g = (typeof globalThis !== 'undefined' && globalThis)
    || (typeof global !== 'undefined' && global)
    || (typeof GameGlobal !== 'undefined' && GameGlobal);
  if (!g) return;
  try { g.GameGlobal = g; } catch (e0) {}
  try { GameGlobal = g; } catch (e1) {}
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
var _runtime = null;
try {
  _runtime = require('./runtime.js');
} catch (e) {
  try { console.error('[boot] runtime.js 失败', e); } catch (_) {}
  throw e;
}
if (!_runtime) {
  try {
    _runtime = (typeof globalThis !== 'undefined' && globalThis.__xiaochu2Runtime)
      || (typeof GameGlobal !== 'undefined' && GameGlobal.__xiaochu2Runtime)
      || null;
  } catch (_) { _runtime = null; }
}
if (!_runtime) {
  try { console.error('[boot] runtime.js 无导出'); } catch (_) {}
}

// ====== 启动诊断（仅启动失败时弹窗，对齐 game2D_huahua）======
var _diagMsgs = [];
var _diagStart = Date.now();
function _hostApi() {
  var api = _runtime && _runtime.getNativePlatformApi && _runtime.getNativePlatformApi();
  if (api) return api;
  return (typeof tap !== 'undefined' && tap)
    || (typeof qg !== 'undefined' && qg)
    || (typeof qa !== 'undefined' && qa)
    || (typeof wx !== 'undefined' && wx)
    || (typeof tt !== 'undefined' && tt)
    || null;
}
function _diag(msg) {
  var ts = Date.now() - _diagStart;
  var line = '[' + ts + 'ms] ' + msg;
  _diagMsgs.push(line);
  try { console.log('[boot] ' + line); } catch (_) {}
  try {
    var api = _hostApi();
    if (api && typeof api.setStorageSync === 'function') {
      api.setStorageSync('xiaochu2_boot_diag', _diagMsgs.join('\n'));
    }
  } catch (_) {}
}

/** 标题已经出来 / 渲染器活着：诊断只落日志，别挡玩家 */
function _bootLooksAlive() {
  try {
    if (typeof GameGlobal === 'undefined') return false;
    if (GameGlobal.__bootOk) return true;
    var step = String(GameGlobal.__bootStep || '');
    if (!step) return false;
    return /title-ok|splash-|preload-done|overlays|boot-ok|cloud-sync /.test(step);
  } catch (_) {
    return false;
  }
}

function _showDiag(force) {
  var dump = _diagMsgs.join('\n');
  try { console.error('[boot-diag]\n' + dump); } catch (_) {}
  if (!force && _bootLooksAlive()) return;
  try {
    var api = _hostApi();
    if (!api) return;
    var tail = _diagMsgs.length > 28 ? _diagMsgs.slice(-28) : _diagMsgs.slice();
    var content = tail.join('\n');
    if (typeof api.showModal === 'function') {
      api.showModal({ title: '启动诊断', content: content, showCancel: false });
      return;
    }
    if (typeof api.showDialog === 'function') {
      api.showDialog({ title: '启动诊断', message: content, buttons: [{ text: '确定' }] });
      return;
    }
    if (typeof api.showToast === 'function') {
      try { api.showToast({ title: content.slice(0, 80), icon: 'none', duration: 8000 }); return; } catch (_) {}
      try { api.showToast({ message: content.slice(0, 120), duration: 8000 }); } catch (_) {}
    }
  } catch (_) {}
}

try {
  if (typeof GameGlobal !== 'undefined') {
    GameGlobal.__bootDiag = _diag;
    GameGlobal.__showBootDiag = _showDiag;
    GameGlobal.onError = function (msg) {
      _diag('onError:' + msg);
      _showDiag(false);
    };
    GameGlobal.onUnhandledRejection = function (ev) {
      _diag('unhandledRej:' + (ev && ev.reason || ev));
      _showDiag(false);
    };
  }
} catch (_) {}
try {
  var _errApi = _hostApi();
  if (_errApi && typeof _errApi.onError === 'function') {
    _errApi.onError(function (err) {
      _diag('host.onError:' + (err && (err.message || err.errMsg) || err));
      _showDiag(false);
    });
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
  if (_runtime && typeof _runtime.captureHostCanvas === 'function') {
    var _hostCv = _runtime.captureHostCanvas();
    _diag((_runtime.listHostCanvasHints ? _runtime.listHostCanvasHints() : 'no-hints')
      + ' captured=' + (_hostCv ? 'yes' : 'no'));
  }
} catch (eCap) {
  _diag('captureHostCanvas 失败:' + eCap);
}

try {
  require('./pixi-adapter/index');
  var _cv = typeof GameGlobal !== 'undefined' ? GameGlobal.canvas : null;
  if ((!_cv || typeof _cv.getContext !== 'function') && typeof GameGlobal !== 'undefined' && GameGlobal.__hostCanvas) {
    _cv = GameGlobal.__hostCanvas;
    try { GameGlobal.canvas = _cv; } catch (_) {}
  }
  var _doc = typeof document !== 'undefined' ? document : (GameGlobal && GameGlobal.document);
  _diag('cv=' + (_cv ? ((_cv.width || 0) + 'x' + (_cv.height || 0) + ' getContext=' + (typeof _cv.getContext)) : 'none')
    + ' createCanvas=' + (typeof tap !== 'undefined' ? typeof tap.createCanvas
      : (typeof qg !== 'undefined' ? typeof qg.createCanvas
        : (typeof qa !== 'undefined' ? typeof qa.createCanvas : 'no-host')))
    + ' rAF=' + (typeof requestAnimationFrame)
    + ' createElement=' + (_doc ? typeof _doc.createElement : 'no-doc')
    + ' hostSrc=' + (typeof GameGlobal !== 'undefined' ? GameGlobal.__hostCanvasSrc : '?'));
} catch (e) {
  _diag('pixi-adapter 失败:' + e);
  _showDiag();
}

if (typeof Intl === 'undefined') {
  var _g = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof globalThis !== 'undefined' ? globalThis : {});
  _g.Intl = {};
}

_diag('boot tap=' + (typeof tap) + ' wx=' + (typeof wx) + ' tt=' + (typeof tt)
  + ' qg=' + (typeof qg) + ' qa=' + (typeof qa)
  + ' plat=' + (_runtime && _runtime.detectMinigamePlatform ? _runtime.detectMinigamePlatform() : '?'));
try { require('./tap-pack-stamp.js'); } catch (e) { /* 非 Tap 包没有 */ }
try { require('./huawei-pack-stamp.js'); } catch (e) { /* 非华为包没有 */ }
try {
  var _pack = typeof GameGlobal !== 'undefined'
    ? (GameGlobal.__XIAOCHU2_TAP_VERSION || GameGlobal.__XIAOCHU2_HUAWEI_VERSION)
    : null;
  if (_pack) _diag('pack=' + _pack);
} catch (e) { /* */ }
try {
  require('./game-bundle.js');
} catch (e) {
  _diag('game-bundle 失败:' + e);
  _showDiag();
}

setTimeout(function () {
  if (typeof GameGlobal !== 'undefined' && !GameGlobal.__bootOk) {
    _diag('12秒未标成功 step=' + (GameGlobal.__bootStep || '?')
      + ' rendered=' + GameGlobal.__gameRendered);
    // 鸿蒙抖音首包慢，标题已经出来就别再弹诊断
    if (_bootLooksAlive()) return;
    _showDiag(true);
  }
}, 12000);
