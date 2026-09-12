/**
 * 小游戏宿主识别与原生 API 绑定（单一真源，对齐 src/core/PlatformService.ts）
 *
 * - 抖音宿主：注入 tt → 业务只走 tt（同时存在的 wx 仅为宿主兼容层，不可用）
 * - Tap 宿主：注入 tap（无 tt）
 * - 华为快游戏：注入 qg（快应用才是 qa）；也可能再塞 wx 壳，必须先认华为
 * - 微信宿主：注入 wx → 业务只走 wx
 */

function isHuaweiQuickGameHost() {
  if (typeof qg !== 'undefined') return true;
  if (typeof qa !== 'undefined') return true;
  try {
    if (typeof GameGlobal !== 'undefined' && (GameGlobal.__wx2huawei || GameGlobal.qa || GameGlobal.qg)) return true;
  } catch (_) { /* */ }
  if (typeof wx === 'undefined') return false;
  if (typeof __wxConfig !== 'undefined') return false;
  if (typeof wx.getAccountInfoSync === 'function') return false;
  return true;
}

function detectMinigamePlatform() {
  // 抖音有 tt，优先于可能存在的兼容层。Tap 包没有 tt/wx，只注入 tap。
  if (typeof tt !== 'undefined') return 'douyin';
  if (typeof tap !== 'undefined') return 'taptap';
  if (isHuaweiQuickGameHost()) return 'huawei';
  if (typeof wx !== 'undefined') return 'wechat';
  return 'unknown';
}

function getNativePlatformApi(platform) {
  var p = platform || detectMinigamePlatform();
  if (p === 'douyin') return typeof tt !== 'undefined' ? tt : null;
  if (p === 'taptap') return typeof tap !== 'undefined' ? tap : null;
  if (p === 'huawei') {
    if (typeof qg !== 'undefined') return qg;
    if (typeof qa !== 'undefined') return qa;
    return typeof wx !== 'undefined' ? wx : null;
  }
  if (p === 'wechat') return typeof wx !== 'undefined' ? wx : null;
  return null;
}

function _globalObject() {
  return (typeof globalThis !== 'undefined' && globalThis)
    || (typeof GameGlobal !== 'undefined' && GameGlobal)
    || (typeof global !== 'undefined' && global)
    || {};
}

function isUsableCanvas(c) {
  return !!(c && typeof c.getContext === 'function');
}

function _rememberHostDocument(g) {
  if (g.__hostDocument) return g.__hostDocument;
  var doc = null;
  try { if (typeof document !== 'undefined') doc = document; } catch (_) { /* */ }
  if (!doc) {
    try { doc = g.document || null; } catch (_) { doc = null; }
  }
  if (doc) {
    try { g.__hostDocument = doc; } catch (_) { /* */ }
  }
  return doc;
}

function _tryCanvas(label, value, acc) {
  if (acc.found || !isUsableCanvas(value)) return;
  acc.found = value;
  acc.src = label;
}

/**
 * 华为原生 qg 没有 createCanvas。主屏在全局 canvas / screencanvas，
 * 或宿主 document.getElementById('canvas') / 第一次 createElement('canvas')。
 * 必须在 pixi-adapter 覆盖 document 之前调用。
 */
function captureHostTransports() {
  var g = _globalObject();
  try {
    if (typeof XMLHttpRequest === 'function' && !g.__hostXMLHttpRequest) {
      g.__hostXMLHttpRequest = XMLHttpRequest;
    }
  } catch (_) { /* */ }
  try {
    if (typeof fetch === 'function' && !g.__hostFetch) {
      g.__hostFetch = fetch.bind(g);
    }
  } catch (_) { /* */ }
  try {
    if (!g.__hostLocalStorage && typeof localStorage !== 'undefined'
      && localStorage && typeof localStorage.getItem === 'function') {
      g.__hostLocalStorage = localStorage;
    }
  } catch (_) { /* */ }
}

/**
 * 宿主画布的真实 getBoundingClientRect。
 *
 * 触摸坐标必须用「事件和矩形同一坐标系」去归一化。用 getSystemInfoSync().screenWidth
 * 换算会算飞（真机实测 design y 跑到 2442，设计高度只有约 1669，于是全部 hit=no）。
 * 必须在 pixi-adapter 用假 rect 覆盖之前存下来。
 */
function _rememberHostCanvasRect(g, cv) {
  // 只给华为开：微信/抖音/Tap 现有换算已在真机验证过，不跟着改道
  if (detectMinigamePlatform() !== 'huawei') return;
  if (!cv || typeof cv.getBoundingClientRect !== 'function') return;
  var native = cv.getBoundingClientRect.bind(cv);
  var probe = null;
  try { probe = native(); } catch (_) { return; }
  if (!probe || !(Number(probe.width) > 0) || !(Number(probe.height) > 0)) return;
  try { g.__hostCanvasRect = native; } catch (_) { /* */ }
}

function captureHostCanvas() {
  captureHostTransports();
  var g = _globalObject();
  if (isUsableCanvas(g.__hostCanvas)) return g.__hostCanvas;

  var acc = { found: null, src: 'none' };
  _rememberHostDocument(g);

  try { if (typeof canvas !== 'undefined') _tryCanvas('id:canvas', canvas, acc); } catch (_) { /* */ }
  try { _tryCanvas('g.canvas', g.canvas, acc); } catch (_) { /* */ }
  try { if (typeof screencanvas !== 'undefined') _tryCanvas('id:screencanvas', screencanvas, acc); } catch (_) { /* */ }
  try { _tryCanvas('g.screencanvas', g.screencanvas, acc); } catch (_) { /* */ }

  var hostDoc = g.__hostDocument;
  if (!acc.found && hostDoc) {
    if (typeof hostDoc.getElementById === 'function') {
      try { _tryCanvas('getElementById', hostDoc.getElementById('canvas'), acc); } catch (_) { /* */ }
    }
    if (!acc.found && typeof hostDoc.querySelector === 'function') {
      try { _tryCanvas('querySelector', hostDoc.querySelector('canvas'), acc); } catch (_) { /* */ }
    }
  }

  if (!acc.found) {
    var apis = [];
    try { if (typeof qg !== 'undefined' && qg) apis.push(['qg', qg]); } catch (_) { /* */ }
    try { if (typeof qa !== 'undefined' && qa) apis.push(['qa', qa]); } catch (_) { /* */ }
    for (var i = 0; i < apis.length; i++) {
      var api = apis[i][1];
      if (typeof api.createCanvas !== 'function') continue;
      try { _tryCanvas(apis[i][0] + '.createCanvas', api.createCanvas(), acc); } catch (_) { /* */ }
      if (acc.found) break;
    }
  }

  if (!acc.found && hostDoc && typeof hostDoc.createElement === 'function') {
    try { _tryCanvas('createElement', hostDoc.createElement('canvas'), acc); } catch (_) { /* */ }
  }

  try { g.__hostCanvasSrc = acc.src; } catch (_) { /* */ }
  if (acc.found) {
    try { g.__hostCanvas = acc.found; } catch (_) { /* */ }
    _rememberHostCanvasRect(g, acc.found);
    try {
      if (!isUsableCanvas(g.canvas)) g.canvas = acc.found;
    } catch (_) { /* */ }
    try {
      if (typeof GameGlobal !== 'undefined' && GameGlobal && !isUsableCanvas(GameGlobal.canvas)) {
        GameGlobal.canvas = acc.found;
      }
    } catch (_) { /* */ }
  }
  return acc.found;
}

function createHuaweiCanvas() {
  var g = _globalObject();
  var main = isUsableCanvas(g.__hostCanvas) ? g.__hostCanvas : captureHostCanvas();
  if (!g.__huaweiMainIssued && isUsableCanvas(main)) {
    try { g.__huaweiMainIssued = true; } catch (_) { /* */ }
    return main;
  }
  if (typeof qg !== 'undefined' && typeof qg.createCanvas === 'function') {
    try {
      var off = qg.createCanvas();
      if (isUsableCanvas(off)) return off;
    } catch (_) { /* */ }
  }
  var hostDoc = g.__hostDocument || _rememberHostDocument(g);
  if (hostDoc && typeof hostDoc.createElement === 'function') {
    try {
      var el = hostDoc.createElement('canvas');
      if (isUsableCanvas(el)) return el;
    } catch (_) { /* */ }
  }
  return null;
}

/** 离屏 2D，绝不能把主屏 canvas 交给文字光栅 */
function createHuaweiOffscreenCanvas() {
  var g = _globalObject();
  var main = g.__hostCanvas || g.canvas;
  if (typeof qg !== 'undefined' && typeof qg.createCanvas === 'function') {
    try {
      var off = qg.createCanvas();
      if (isUsableCanvas(off) && off !== main) return off;
    } catch (_) { /* */ }
  }
  var hostDoc = g.__hostDocument || _rememberHostDocument(g);
  if (hostDoc && typeof hostDoc.createElement === 'function') {
    for (var n = 0; n < 2; n++) {
      try {
        var el = hostDoc.createElement('canvas');
        if (!isUsableCanvas(el) || el === main) continue;
        try {
          if (!el.width) el.width = 64;
          if (!el.height) el.height = 64;
        } catch (_) { /* */ }
        return el;
      } catch (_) { /* */ }
    }
  }
  return null;
}

function createHuaweiImage() {
  var g = _globalObject();
  if (typeof qg !== 'undefined' && typeof qg.createImage === 'function') {
    try {
      var img = qg.createImage();
      if (img) return img;
    } catch (_) { /* */ }
  }
  var hostDoc = g.__hostDocument || _rememberHostDocument(g);
  if (hostDoc && typeof hostDoc.createElement === 'function') {
    try {
      var el = hostDoc.createElement('img') || hostDoc.createElement('image');
      if (el) return el;
    } catch (_) { /* */ }
  }
  try { if (typeof Image !== 'undefined') return new Image(); } catch (_) { /* */ }
  return { src: '', onload: null, onerror: null };
}

function listHostCanvasHints() {
  var parts = [];
  try { parts.push('idCanvas=' + (typeof canvas)); } catch (_) { parts.push('idCanvas=unref'); }
  try { parts.push('screencanvas=' + (typeof screencanvas)); } catch (_) { parts.push('screencanvas=unref'); }
  try {
    var g = _globalObject();
    parts.push('gCanvas=' + (g.canvas ? 'obj' : typeof g.canvas));
    parts.push('hostSrc=' + (g.__hostCanvasSrc || 'none'));
  } catch (_) { /* */ }
  try {
    var doc = (typeof document !== 'undefined' && document) || null;
    parts.push('doc=' + (doc ? 'obj' : 'none'));
    parts.push('docCreate=' + (doc ? typeof doc.createElement : 'no'));
    if (doc && typeof doc.getElementById === 'function') {
      var byId = doc.getElementById('canvas');
      parts.push('byId=' + (byId ? 'obj' : 'null'));
    }
  } catch (_) { /* */ }
  try {
    if (typeof qg !== 'undefined' && qg) {
      var names = [
        'createCanvas', 'createImage', 'createOffscreenCanvas',
        'getSystemInfoSync', 'getSystemInfo', 'getDeviceInfo',
        'showToast', 'showModal', 'showDialog', 'onError',
        'onShow', 'onHide', 'onTouchStart', 'createInnerAudioContext',
        'setStorageSync', 'getStorageSync', 'setStorage', 'getStorage',
        'request', 'downloadFile', 'download', 'loadSubpackage', 'getFileSystemManager',
        'fetch', 'gameLoginWithReal', 'gameLogin', 'getCachePlayerId',
      ];
      var present = [];
      for (var i = 0; i < names.length; i++) {
        if (typeof qg[names[i]] === 'function') present.push(names[i]);
      }
      parts.push('qgFn=' + (present.join(',') || 'none'));
    }
  } catch (_) { /* */ }
  return parts.join(' ');
}

function canUsePrivacyApi(api, name) {
  if (!api) return false;
  if (typeof api.canIUse === 'function') {
    try { return !!api.canIUse(name); } catch (_) { /* ignore */ }
  }
  return typeof api[name] === 'function';
}

/** 原生 API 未注册时（devtools / 后台未配隐私政策）的 JS 层兜底，避免兼容层 stub 直接抛 unregistered */
function makePrivacyFallback(name) {
  return function (opts) {
    opts = opts || {};
    var res = {
      needAuthorization: false,
      privacyContractName: '',
      errMsg: name + ':ok (fallback)',
    };
    if (typeof opts.success === 'function') opts.success(res);
    if (typeof opts.complete === 'function') opts.complete(res);
  };
}

/**
 * 抖音隐私 API 启动兜底（业界常见组合）：
 * 1. 后台配置「小游戏隐私政策」→ 原生 API 才会注册（根治 INTERNAL_APPLY_NATIVE_ERROR）
 * 2. game.json usePrivacyCheck: true → 启用合规链路
 * 3. 不主动 register onNeedPrivacyAuthorization → 走抖音官方自动弹窗（Canvas 游戏常用）
 * 4. wx 兼容层 stub 代理到 tt；tt 也不可用时 JS 层 noop（仅消 devtools 噪音，不治 native）
 */
function initDouyinPrivacyBootstrap() {
  if (detectMinigamePlatform() !== 'douyin' || typeof tt === 'undefined') return;

  var privacyNames = [
    'getPrivacySetting',
    'requirePrivacyAuthorize',
    'openPrivacyContract',
    'onNeedPrivacyAuthorization',
  ];

  var ttReady = canUsePrivacyApi(tt, 'getPrivacySetting');
  if (!ttReady) {
    console.warn(
      '[Privacy] tt.getPrivacySetting 未注册。业界常规处理：'
      + '①抖音开放平台→设置→基础设置→小游戏隐私政策 填写并发布；'
      + '②开发者工具升级到 4.2.3+、真机扫码验证（工具内常报 unregistered）；'
      + '③调用前用 tt.canIUse("getPrivacySetting") 判断。',
    );
  }

  if (typeof wx === 'undefined') return;

  privacyNames.forEach(function (name) {
    if (name === 'onNeedPrivacyAuthorization') {
      if (typeof tt[name] === 'function') {
        wx[name] = function (cb) { return tt[name](cb); };
      }
      return;
    }
    if (canUsePrivacyApi(tt, name)) {
      wx[name] = function (opts) { return tt[name](opts); };
      return;
    }
    wx[name] = makePrivacyFallback(name);
  });
}

initDouyinPrivacyBootstrap();

var __runtimeApi = {
  detectMinigamePlatform: detectMinigamePlatform,
  getNativePlatformApi: getNativePlatformApi,
  isUsableCanvas: isUsableCanvas,
  captureHostCanvas: captureHostCanvas,
  captureHostTransports: captureHostTransports,
  createHuaweiCanvas: createHuaweiCanvas,
  createHuaweiOffscreenCanvas: createHuaweiOffscreenCanvas,
  createHuaweiImage: createHuaweiImage,
  listHostCanvasHints: listHostCanvasHints,
  /** @deprecated 使用 getNativePlatformApi */
  resolveMinigameApi: function () { return getNativePlatformApi(); },
  /** @deprecated 使用 detectMinigamePlatform */
  resolveMinigameName: detectMinigamePlatform,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = __runtimeApi;
}
try {
  var g = (typeof globalThis !== 'undefined' && globalThis)
    || (typeof GameGlobal !== 'undefined' && GameGlobal);
  if (g) g.__xiaochu2Runtime = __runtimeApi;
} catch (_) { /* */ }
