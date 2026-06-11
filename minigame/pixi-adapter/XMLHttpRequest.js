/**
 * XMLHttpRequest 模拟
 * PixiJS 资源加载可能会用到
 */

const platform = require('./platform');

let _xhrSeq = 0;

function _safeString(v) {
  if (v == null) return '';
  try { return String(v); } catch (_) { return '[unstringifiable]'; }
}

function _shortUrl(url) {
  const s = _safeString(url);
  return s.length > 220 ? s.slice(0, 220) + '...' : s;
}

function _dataKind(v) {
  if (v == null) return 'null';
  if (v instanceof ArrayBuffer) return 'ArrayBuffer(' + v.byteLength + ')';
  if (typeof v === 'string') return 'string(' + v.length + ')';
  if (Array.isArray(v)) return 'array(' + v.length + ')';
  return typeof v;
}

function _xhrLog(id, stage, info) {
  const line = '[XHR#' + id + '] ' + stage + (info ? ' ' + info : '');
  try { console.log(line); } catch (_) {}
  try {
    const g = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof globalThis !== 'undefined' ? globalThis : null);
    if (g) {
      if (!g.__xhrDebugLogs) g.__xhrDebugLogs = [];
      g.__xhrDebugLogs.push(line);
      if (g.__xhrDebugLogs.length > 80) g.__xhrDebugLogs.shift();
    }
  } catch (_) {}
}

function _invoke(xhr, id, name) {
  const fn = xhr[name];
  if (typeof fn !== 'function') return;
  _xhrLog(id, 'callback:' + name + ':begin', 'readyState=' + xhr.readyState + ' status=' + xhr.status);
  try {
    fn.call(xhr);
    _xhrLog(id, 'callback:' + name + ':end', '');
  } catch (e) {
    _xhrLog(id, 'callback:' + name + ':throw', _safeString(e && (e.stack || e.message) || e));
    throw e;
  }
}

class XMLHttpRequest {
  constructor() {
    this._id = ++_xhrSeq;
    this.readyState = 0;
    this.status = 0;
    this.statusText = '';
    this.responseText = '';
    this.response = null;
    this.responseType = '';
    this.responseURL = '';
    this.withCredentials = false;
    this.timeout = 0;

    this._method = '';
    this._url = '';
    this._headers = {};

    this.onreadystatechange = null;
    this.onload = null;
    this.onerror = null;
    this.onabort = null;
    this.ontimeout = null;
    this.onprogress = null;
  }

  open(method, url) {
    this._method = method;
    this._url = url;
    this.readyState = 1;
    _xhrLog(this._id, 'open', String(method || 'GET').toUpperCase() + ' ' + _shortUrl(url));
  }

  setRequestHeader(key, value) {
    this._headers[key] = value;
    _xhrLog(this._id, 'header', _safeString(key) + '=' + _safeString(value));
  }

  getResponseHeader(key) {
    return this._responseHeaders ? this._responseHeaders[key.toLowerCase()] : null;
  }

  getAllResponseHeaders() {
    return '';
  }

  send(data) {
    const self = this;
    const responseType = this.responseType || 'text';
    const headers = {};
    for (const key in this._headers) {
      headers[key] = String(this._headers[key]);
    }
    const requestData = data == null || typeof data === 'string' || data instanceof ArrayBuffer
      ? (data || undefined)
      : JSON.stringify(data);

    const isGet = String(this._method || 'GET').toUpperCase() === 'GET';
    const isHttp = /^https?:\/\//i.test(this._url || '');
    _xhrLog(this._id, 'send', [
      'method=' + String(this._method || 'GET').toUpperCase(),
      'responseType=' + responseType,
      'data=' + _dataKind(requestData),
      'isHttp=' + isHttp,
      'url=' + _shortUrl(this._url),
    ].join(' '));
    if (isGet && isHttp && !requestData && platform.downloadFile && platform.getFileSystemManager) {
      _xhrLog(this._id, 'transport', 'downloadFile');
      platform.downloadFile({
        url: this._url,
        success(res) {
          _xhrLog(self._id, 'downloadFile:success', 'status=' + (res && res.statusCode) + ' temp=' + !!(res && res.tempFilePath));
          const fs = platform.getFileSystemManager();
          self.status = res.statusCode || 200;
          self.statusText = String(self.status);
          self._responseHeaders = {};
          try {
            if (responseType === 'arraybuffer') {
              self.response = fs.readFileSync(res.tempFilePath);
              _xhrLog(self._id, 'readFile', 'arraybuffer response=' + _dataKind(self.response));
            } else {
              const text = fs.readFileSync(res.tempFilePath, 'utf-8');
              self.responseText = text;
              self.response = responseType === 'json' ? JSON.parse(text) : text;
              _xhrLog(self._id, 'readFile', 'text=' + text.length + ' response=' + _dataKind(self.response));
            }
          } catch (e) {
            self.status = 0;
            self.readyState = 4;
            _xhrLog(self._id, 'readFile:error', _safeString(e && (e.stack || e.message) || e));
            _invoke(self, self._id, 'onreadystatechange');
            _invoke(self, self._id, 'onerror');
            return;
          }
          self.readyState = 4;
          _invoke(self, self._id, 'onreadystatechange');
          _invoke(self, self._id, 'onload');
        },
        fail(err) {
          self.status = 0;
          self.readyState = 4;
          const msg = err && (err.errMsg || err.message) ? (err.errMsg || err.message) : String(err);
          _xhrLog(self._id, 'downloadFile:fail', msg);
          _invoke(self, self._id, 'onreadystatechange');
          _invoke(self, self._id, 'onerror');
        },
      });
      return;
    }

    _xhrLog(this._id, 'transport', 'request');
    platform.request({
      url: this._url,
      method: this._method || 'GET',
      header: headers,
      data: requestData,
      responseType: responseType === 'arraybuffer' ? 'arraybuffer' : 'text',
      dataType: responseType === 'json' ? 'json' : undefined,
      success(res) {
        _xhrLog(self._id, 'request:success', 'status=' + (res && res.statusCode) + ' data=' + _dataKind(res && res.data));
        self.status = res.statusCode;
        self.statusText = res.statusCode + '';
        self._responseHeaders = res.header || {};

        if (responseType === 'arraybuffer') {
          self.response = res.data;
        } else if (responseType === 'json') {
          self.response = res.data;
          self.responseText = JSON.stringify(res.data);
        } else {
          self.responseText = res.data;
          self.response = res.data;
        }

        self.readyState = 4;
        _invoke(self, self._id, 'onreadystatechange');
        _invoke(self, self._id, 'onload');
      },
      fail(err) {
        self.status = 0;
        self.readyState = 4;
        const msg = err && (err.errMsg || err.message) ? (err.errMsg || err.message) : String(err);
        _xhrLog(self._id, 'request:fail', msg);
        _invoke(self, self._id, 'onreadystatechange');
        _invoke(self, self._id, 'onerror');
      },
    });
  }

  abort() {
    _xhrLog(this._id, 'abort', _shortUrl(this._url));
    _invoke(this, this._id, 'onabort');
  }

  addEventListener(type, handler) {
    _xhrLog(this._id, 'addEventListener', _safeString(type));
    this['on' + type] = handler;
  }

  removeEventListener() {}
}

Object.defineProperty(XMLHttpRequest.prototype, Symbol.toStringTag, {
  value: 'XMLHttpRequest',
  configurable: true,
});

// 静态常量
XMLHttpRequest.UNSENT = 0;
XMLHttpRequest.OPENED = 1;
XMLHttpRequest.HEADERS_RECEIVED = 2;
XMLHttpRequest.LOADING = 3;
XMLHttpRequest.DONE = 4;

module.exports = XMLHttpRequest;
