/**
 * 平台抽象层 - 统一微信/抖音小游戏 API
 * 宿主识别与 src/core/PlatformService 一致：检测到哪个平台就用哪个原生 API
 */

const {
  detectMinigamePlatform,
  getNativePlatformApi,
  createHuaweiCanvas,
  createHuaweiImage,
} = require('../runtime.js');
const _platformName = detectMinigamePlatform();
const _api = getNativePlatformApi(_platformName);
const _dummyCanvas = { width: 0, height: 0, getContext: function() { return null; } };
const _isDouyin = _platformName === 'douyin';
const _isWechat = _platformName === 'wechat';

if (!_api) {
  console.error('[platform] 未检测到小游戏运行环境（wx/tt/tap/qg/qa）');
}

// 安全调用包装：防止鸿蒙等环境中 API 缺失导致崩溃
function _safeCall(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    console.warn('[platform] API 调用失败:', e);
    return fallback;
  }
}

function _hostLocalStorage() {
  try {
    if (typeof GameGlobal !== 'undefined' && GameGlobal.__hostLocalStorage) {
      return GameGlobal.__hostLocalStorage;
    }
  } catch (_) { /* */ }
  return null;
}

function _unwrapStorage(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') return raw.data || raw.value || '';
  return String(raw);
}

function _readStorage(key) {
  if (_api && typeof _api.getStorageSync === 'function') {
    const wxStyle = _safeCall(() => _unwrapStorage(_api.getStorageSync(key)), '');
    if (wxStyle) return wxStyle;
    const qgStyle = _safeCall(() => _unwrapStorage(_api.getStorageSync({ key: key })), '');
    if (qgStyle) return qgStyle;
  }
  const ls = _hostLocalStorage();
  if (ls && typeof ls.getItem === 'function') {
    return _safeCall(() => ls.getItem(key) || '', '');
  }
  return '';
}

function _writeStorage(key, data) {
  if (_api && typeof _api.setStorageSync === 'function') {
    try {
      _api.setStorageSync(key, data);
    } catch (_) {
      _safeCall(() => _api.setStorageSync({ key: key, value: data }));
    }
  }
  const ls = _hostLocalStorage();
  if (ls && typeof ls.setItem === 'function') {
    _safeCall(() => { ls.setItem(key, data); });
  }
}

function _removeStorage(key) {
  if (_api && typeof _api.removeStorageSync === 'function') {
    _safeCall(() => _api.removeStorageSync(key));
    _safeCall(() => _api.removeStorageSync({ key: key }));
  }
  if (_api && typeof _api.deleteStorageSync === 'function') {
    _safeCall(() => _api.deleteStorageSync({ key: key }));
  }
  const ls = _hostLocalStorage();
  if (ls && typeof ls.removeItem === 'function') {
    _safeCall(() => { ls.removeItem(key); });
  }
}

const noop = function() {};

function _sanitizeRequestOptions(opts) {
  const out = {
    url: String(opts && opts.url || ''),
    method: String(opts && opts.method || 'GET'),
  };
  if (opts && opts.header) {
    out.header = {};
    for (const k in opts.header) out.header[k] = String(opts.header[k]);
  }
  if (opts && opts.data !== undefined) {
    out.data = typeof opts.data === 'string' || opts.data instanceof ArrayBuffer
      ? opts.data
      : JSON.stringify(opts.data);
  }
  if (opts && opts.responseType) out.responseType = String(opts.responseType);
  if (opts && opts.dataType) out.dataType = String(opts.dataType);
  if (opts && opts.timeout) out.timeout = Number(opts.timeout);
  if (opts && typeof opts.success === 'function') out.success = opts.success;
  if (opts && typeof opts.fail === 'function') {
    out.fail = function(err) {
      const msg = err && (err.errMsg || err.message) ? (err.errMsg || err.message) : String(err);
      opts.fail({ errMsg: msg });
    };
  }
  if (opts && typeof opts.complete === 'function') out.complete = opts.complete;
  return out;
}

function _createCanvas() {
  if (_platformName === 'huawei' && typeof createHuaweiCanvas === 'function') {
    const hw = createHuaweiCanvas();
    if (hw) return hw;
  }
  if (_api && typeof _api.createCanvas === 'function') {
    try {
      const c = _api.createCanvas();
      if (c && typeof c.getContext === 'function') return c;
    } catch (e) {
      console.warn('[platform] createCanvas 失败:', e);
    }
  }
  return _dummyCanvas;
}

function _createImage() {
  if (_platformName === 'huawei' && typeof createHuaweiImage === 'function') {
    return createHuaweiImage();
  }
  if (_api && typeof _api.createImage === 'function') {
    try { return _api.createImage(); } catch (e) {
      console.warn('[platform] createImage 失败:', e);
    }
  }
  return { src: '', onload: null, onerror: null };
}

const platform = {
  createCanvas: _createCanvas,
  createImage: _createImage,

  getSystemInfoSync: () => _api ? _safeCall(() => _api.getSystemInfoSync(), { platform: 'unknown', screenWidth: 375, screenHeight: 667 }) : { platform: 'unknown', screenWidth: 375, screenHeight: 667 },

  getStorageSync: (key) => _readStorage(key),
  setStorageSync: (key, data) => _writeStorage(key, data),
  removeStorageSync: (key) => _removeStorage(key),

  request: (opts) => {
    if (!_api) return null;
    return _api.request(_sanitizeRequestOptions(opts || {}));
  },
  downloadFile: (opts) => {
    if (!_api || !_api.downloadFile) return null;
    const clean = {
      url: String(opts && opts.url || ''),
    };
    if (opts && typeof opts.success === 'function') clean.success = opts.success;
    if (opts && typeof opts.fail === 'function') {
      clean.fail = function(err) {
        const msg = err && (err.errMsg || err.message) ? (err.errMsg || err.message) : String(err);
        opts.fail({ errMsg: msg });
      };
    }
    if (opts && typeof opts.complete === 'function') clean.complete = opts.complete;
    if (opts && opts.timeout) clean.timeout = Number(opts.timeout);
    return _api.downloadFile(clean);
  },
  getFileSystemManager: () => _api && _api.getFileSystemManager ? _api.getFileSystemManager() : null,
  connectSocket: (opts) => _api ? _api.connectSocket(opts) : null,

  onTouchStart: (cb) => _api && _api.onTouchStart ? _api.onTouchStart(cb) : noop,
  onTouchMove: (cb) => _api && _api.onTouchMove ? _api.onTouchMove(cb) : noop,
  onTouchEnd: (cb) => _api && _api.onTouchEnd ? _api.onTouchEnd(cb) : noop,
  onTouchCancel: (cb) => _api && _api.onTouchCancel ? _api.onTouchCancel(cb) : noop,
  offTouchStart: (cb) => _api && _api.offTouchStart ? _api.offTouchStart(cb) : noop,
  offTouchMove: (cb) => _api && _api.offTouchMove ? _api.offTouchMove(cb) : noop,
  offTouchEnd: (cb) => _api && _api.offTouchEnd ? _api.offTouchEnd(cb) : noop,
  offTouchCancel: (cb) => _api && _api.offTouchCancel ? _api.offTouchCancel(cb) : noop,

  createInnerAudioContext: () => _api && _api.createInnerAudioContext ? _api.createInnerAudioContext() : null,

  name: _platformName,
  api: _api,
  /** 微信/抖音有 onTouchStart；华为原生 qg 常常没有 */
  hasTouchApi: !!( _api && typeof _api.onTouchStart === 'function'),
};

module.exports = platform;
