/**
 * 开发者工具网络面板走 contextBridge，参数必须能 structured clone。
 * JSON 来回一遍之后，唯一还会克隆失败的是字符串里的孤立代理项
 * （把图片当文本读进来就会有）。这里先削掉再交给工具。
 */

function stripLoneSurrogates(str) {
  var out = '';
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF) {
      var next = str.charCodeAt(i + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        out += str.charAt(i) + str.charAt(i + 1);
        i++;
      } else {
        out += '\uFFFD';
      }
    } else if (c >= 0xDC00 && c <= 0xDFFF) {
      out += '\uFFFD';
    } else {
      out += str.charAt(i);
    }
  }
  return out;
}

function softenClone(data) {
  try {
    var json = JSON.stringify(data, function (_key, value) {
      if (typeof value === 'bigint') return String(value);
      if (typeof value === 'string') {
        var text = value.length > 4096 ? value.slice(0, 4096) + '…' : value;
        return stripLoneSurrogates(text);
      }
      if (value instanceof Error) return { name: value.name, message: value.message };
      if (value && typeof value === 'object') {
        var tag = Object.prototype.toString.call(value);
        if (tag === '[object Object]' || tag === '[object Array]') return value;
        return '[' + tag.slice(8, -1) + ']';
      }
      return value;
    });
    var plain = json ? JSON.parse(json) : [];
    if (typeof structuredClone === 'function') {
      try {
        structuredClone(plain);
      } catch (e) {
        return { type: 'dropped', detail: { reason: 'uncloneable' } };
      }
    }
    return plain;
  } catch (e) {
    return { type: 'dropped', detail: { reason: 'uncloneable' } };
  }
}

/**
 * 开发者工具 appservice 把网络日志 structured clone 失败时，
 * wx.onError 会收到 MiniProgramError「An object could not be cloned」。
 * 堆栈在 message 里，不在 Error.stack。真机没有 ide:/// 这条通道。
 */
function isDevtoolsCloneNoise(err) {
  var text = '';
  try {
    if (typeof err === 'string') text = err;
    else if (err) {
      text = [err.message, err.errMsg, err.stack, String(err)].join('\n');
    }
  } catch (e) {
    text = '';
  }
  if (!/could not be cloned/i.test(text)) return false;
  return text.indexOf('appservice') >= 0
    || text.indexOf('ide:///') >= 0
    || text.indexOf('WAGame.js') >= 0;
}

function isNetLogItem(item) {
  if (!item || typeof item !== 'object') return false;
  var type = item.type;
  return typeof type === 'string'
    && (type.indexOf('HTTP_') === 0 || type.indexOf('WEBSOCKET_') === 0);
}

/**
 * 包住 Array.push / splice 时用。
 * 微信开发者工具的分包加载（WAGameSubContext）自己会 push；
 * 包装函数里如果再 require，会从 push 回到包装函数，直接爆栈。
 * 重入时走原始方法，不再进包装体。
 */
function createReentryGuard() {
  var depth = 0;
  return function guardCall(orig, thisArg, args, fn) {
    if (depth) return orig.apply(thisArg, args);
    depth += 1;
    try {
      return fn();
    } finally {
      depth -= 1;
    }
  };
}

/** 就地把网络日志收成可克隆对象。其它元素保持原引用。 */
function softenNetLogs(list) {
  if (!list || typeof list.length !== 'number') return list;
  for (var i = 0; i < list.length; i++) {
    if (isNetLogItem(list[i])) list[i] = softenClone(list[i]);
  }
  return list;
}

module.exports = {
  stripLoneSurrogates: stripLoneSurrogates,
  softenClone: softenClone,
  isNetLogItem: isNetLogItem,
  softenNetLogs: softenNetLogs,
  createReentryGuard: createReentryGuard,
  isDevtoolsCloneNoise: isDevtoolsCloneNoise,
};
