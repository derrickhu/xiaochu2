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
  // 游戏已经起来之后，wx.onError 仍会进这里。先打 console.error 会把整段启动日志
  // 当成红错弹进调试器（开发者工具克隆失败就是这条）。活着就别再弹。
  if (!force && _bootLooksAlive()) return;
  var dump = _diagMsgs.join('\n');
  try { console.error('[boot-diag]\n' + dump); } catch (_) {}
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
      if (_isDevtoolsCloneNoise(msg)) return;
      _diag('onError:' + msg);
      _showDiag(false);
    };
    GameGlobal.onUnhandledRejection = function (ev) {
      var reason = ev && ev.reason || ev;
      if (_isDevtoolsCloneNoise(reason)) return;
      _diag('unhandledRej:' + reason);
      _showDiag(false);
    };
  }
} catch (_) {}
try {
  var _errApi = _hostApi();
  if (_errApi && typeof _errApi.onError === 'function') {
    _errApi.onError(function (err) {
      if (_isDevtoolsCloneNoise(err)) return;
      _diag('host.onError:' + (err && (err.message || err.errMsg) || err));
      _showDiag(false);
    });
  }
} catch (_) {}

// 微信开发者工具把 XHR / WebSocket 日志经 contextBridge 送回网络面板。
// 载荷里如果有宿主对象（响应体、Event、DOM），structured clone 会抛
// "An object could not be cloned"，再被 wx.onError 记成 MiniProgramError。
// 请求本身已经结束。这里只把开发者工具的日志收成可克隆数据。真机没有这条通道。
// 必须在改 Array.push 之前加载。包装后的 push 里再 require，会和
// WAGameSubContext 的模块加载对撞，启动即 Maximum call stack size exceeded。
var _cloneSafe = require('./cloneSafe.js');
var _guardCall = _cloneSafe.createReentryGuard();
function _cs() {
  return _cloneSafe;
}
function _isCloneErr(err) {
  var msg = err && (err.message || err.errMsg) || '';
  return (err && err.name === 'DataCloneError') || /could not be cloned/i.test(String(msg));
}
function _softenClone(data) {
  return _cs().softenClone(data);
}
function _looksLikeNetLog(value, depth) {
  if (value == null || depth > 6) return false;
  if (typeof value === 'string') {
    return value.indexOf('HTTP_REQUEST') >= 0
      || value.indexOf('HTTP_RESPONSE') >= 0
      || value.indexOf('WEBSOCKET_') >= 0;
  }
  if (typeof value !== 'object') return false;
  var kind = value.type;
  if (typeof kind === 'string' && (kind.indexOf('HTTP_') === 0 || kind.indexOf('WEBSOCKET_') === 0)) {
    return true;
  }
  var list = Object.prototype.toString.call(value) === '[object Array]' ? value : null;
  if (list) {
    var n = Math.min(list.length, 8);
    for (var i = 0; i < n; i++) {
      if (_looksLikeNetLog(list[i], depth + 1)) return true;
    }
    return false;
  }
  var keys = ['data', 'detail', 'payload', 'message', 'args'];
  for (var k = 0; k < keys.length; k++) {
    try {
      if (_looksLikeNetLog(value[keys[k]], depth + 1)) return true;
    } catch (e2) {}
  }
  return false;
}
function _wrapNetPostMessage(proto) {
  if (!proto || typeof proto.postMessage !== 'function' || proto.postMessage.__xiaochuCloneWrap) return false;
  var orig = proto.postMessage;
  var wrapped = function (message) {
    try {
      return orig.apply(this, arguments);
    } catch (err) {
      if (!_isCloneErr(err) || !_looksLikeNetLog(message, 0)) throw err;
      try { return orig.call(this, _softenClone(message)); } catch (err2) {
        if (!_isCloneErr(err2)) throw err2;
      }
    }
  };
  wrapped.__xiaochuCloneWrap = true;
  try { proto.postMessage = wrapped; return true; } catch (e) { return false; }
}
function _inWechatDevtools() {
  if (!_runtime || !_runtime.detectMinigamePlatform || _runtime.detectMinigamePlatform() !== 'wechat') return false;
  function hasMessager(g) {
    try {
      return !!(g && ((g.__global__ && g.__global__.__messager__) || (g.__global && g.__global.__messager__)));
    } catch (e) {
      return false;
    }
  }
  if (hasMessager(typeof window !== 'undefined' ? window : null)) return true;
  if (hasMessager(typeof globalThis !== 'undefined' ? globalThis : null)) return true;
  try { if (hasMessager(window.parent)) return true; } catch (e2) {}
  try {
    var api = _runtime.getNativePlatformApi && _runtime.getNativePlatformApi();
    var info = api && api.getSystemInfoSync && api.getSystemInfoSync();
    return !!(info && info.platform === 'devtools');
  } catch (e3) {
    return false;
  }
}
function _forceArrayMethod(proto, name, wrapped) {
  try {
    Object.defineProperty(proto, name, { configurable: true, writable: true, value: wrapped });
  } catch (e) {
    try { proto[name] = wrapped; } catch (e2) {}
  }
  return proto[name] === wrapped;
}
function _realms() {
  var list = [];
  function add(w) {
    if (!w) return;
    for (var i = 0; i < list.length; i++) if (list[i] === w) return;
    try {
      if (!w.Array || !w.Array.prototype) return;
      list.push(w);
    } catch (e) {}
  }
  add(typeof window !== 'undefined' ? window : null);
  add(typeof globalThis !== 'undefined' ? globalThis : null);
  try { add(window.parent); } catch (e1) {}
  try { add(window.top); } catch (e2) {}
  try {
    var frames = window.frames;
    var n = frames ? frames.length : 0;
    for (var i = 0; i < n; i++) {
      try { add(frames[i]); } catch (e3) {}
    }
  } catch (e4) {}
  return list;
}
function _wrapPushOn(proto) {
  var orig = proto.push;
  if (!orig) return false;
  if (orig.__xiaochuCloneWrap) return true;
  var wrapped = function (item) {
    var self = this;
    var args = arguments;
    return _guardCall(orig, self, args, function () {
      if (args.length === 1 && _cs().isNetLogItem(item)) {
        return orig.call(self, _softenClone(item));
      }
      return orig.apply(self, args);
    });
  };
  wrapped.__xiaochuCloneWrap = true;
  return _forceArrayMethod(proto, 'push', wrapped);
}
function _wrapNetLogPush() {
  var realms = _realms();
  var ok = false;
  for (var i = 0; i < realms.length; i++) {
    if (_wrapPushOn(realms[i].Array.prototype)) ok = true;
  }
  return ok;
}
/**
 * 工具每 2 秒 `s.splice(0, n)` 再 `messager.send`。
 * send 过 contextBridge 时会克隆参数，直接改 send 会被桥接层忽略。
 * 网络日志和游戏不在同一个 window 时，push 包装也碰不到那条队列，
 * 所以每个能摸到的 window 都包一层 splice，取出时再收成纯数据。
 */
function _wrapSpliceOn(proto) {
  var orig = proto.splice;
  if (!orig) return false;
  if (orig.__xiaochuCloneWrap) return true;
  var wrapped = function () {
    var self = this;
    var args = arguments;
    return _guardCall(orig, self, args, function () {
      var removed = orig.apply(self, args);
      try { _cs().softenNetLogs(removed); } catch (e) {}
      return removed;
    });
  };
  wrapped.__xiaochuCloneWrap = true;
  return _forceArrayMethod(proto, 'splice', wrapped);
}
function _wrapNetLogSplice() {
  var realms = _realms();
  var ok = false;
  for (var i = 0; i < realms.length; i++) {
    if (_wrapSpliceOn(realms[i].Array.prototype)) ok = true;
  }
  return ok;
}
function _isDevtoolsCloneNoise(err) {
  try { return !!_cs().isDevtoolsCloneNoise(err); } catch (e) { return false; }
}
function _isIdeClone(err) {
  return _isDevtoolsCloneNoise(err);
}
function _wrapIdeTimer(name) {
  var g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : null);
  if (!g || typeof g[name] !== 'function' || g[name].__xiaochuCloneWrap) return false;
  var orig = g[name];
  var wrapped = function (fn) {
    if (typeof fn !== 'function') return orig.apply(this, arguments);
    var args = Array.prototype.slice.call(arguments);
    var userFn = fn;
    args[0] = function () {
      try {
        return userFn.apply(this, arguments);
      } catch (err) {
        if (!_isIdeClone(err)) throw err;
      }
    };
    return orig.apply(this, args);
  };
  wrapped.__xiaochuCloneWrap = true;
  try {
    g[name] = wrapped;
    return g[name] === wrapped;
  } catch (e) {
    return false;
  }
}
function _installWechatDevtoolsNetGuard() {
  if (!_inWechatDevtools()) return;
  var patched = 0;
  try { if (_wrapNetLogPush()) patched++; } catch (ePush) {}
  try { if (_wrapNetLogSplice()) patched++; } catch (eSplice) {}
  try { if (_wrapIdeTimer('setTimeout')) patched++; } catch (eTimer) {}
  var seen = [];
  function addMessager(m) {
    if (!m || typeof m.send !== 'function' || m.send.__xiaochuCloneWrap) return;
    for (var i = 0; i < seen.length; i++) if (seen[i] === m) return;
    seen.push(m);
    var orig = m.send;
    var wrapped = function () {
      var args = Array.prototype.slice.call(arguments);
      // EMessagerCMD.NETWORK_MESSAGE === "56"
      if (String(args[1]) === '56') args[2] = _softenClone(args[2]);
      try {
        return orig.apply(this, args);
      } catch (err) {
        if (String(args[1]) !== '56' || !_isCloneErr(err)) throw err;
      }
    };
    wrapped.__xiaochuCloneWrap = true;
    var assigned = false;
    try {
      m.send = wrapped;
      assigned = m.send === wrapped;
    } catch (e) {}
    if (!assigned) {
      try {
        Object.defineProperty(m, 'send', { configurable: true, writable: true, value: wrapped });
        assigned = m.send === wrapped;
      } catch (e2) {}
    }
    if (assigned) patched++;
  }
  function scan(g) {
    if (!g) return;
    try { addMessager(g.__messager__); } catch (e) {}
    try { addMessager(g.__global && g.__global.__messager__); } catch (e2) {}
    try { addMessager(g.__global__ && g.__global__.__messager__); } catch (e3) {}
  }
  scan(typeof window !== 'undefined' ? window : null);
  scan(typeof globalThis !== 'undefined' ? globalThis : null);
  scan(typeof GameGlobal !== 'undefined' ? GameGlobal : null);
  try { scan(window.parent); } catch (e4) {}
  try {
    if (typeof MessagePort !== 'undefined') _wrapNetPostMessage(MessagePort.prototype);
    if (typeof Window !== 'undefined') _wrapNetPostMessage(Window.prototype);
    if (typeof Worker !== 'undefined') _wrapNetPostMessage(Worker.prototype);
  } catch (e5) {}
  if (patched && typeof GameGlobal !== 'undefined' && !GameGlobal.__netGuardLogged) {
    GameGlobal.__netGuardLogged = true;
    _diag('devtools-net-guard');
  }
}
try { _installWechatDevtoolsNetGuard(); } catch (eGuard) {}
try { setTimeout(_installWechatDevtoolsNetGuard, 0); } catch (eGuard2) {}
try { setTimeout(_installWechatDevtoolsNetGuard, 1000); } catch (eGuard3) {}

try { require('./share-bootstrap.js'); } catch (e) {
  console.error('[game.js] share-bootstrap 失败:', e);
}

// 抖音平台必接能力：侧边栏复访 + 添加到桌面（须在 bundle 加载前注册/探测）。
// 微信没有这两项，不要对 wx 调 checkScene / addShortcut。
(function () {
  if (!_runtime || _runtime.detectMinigamePlatform() !== 'douyin') return;
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
