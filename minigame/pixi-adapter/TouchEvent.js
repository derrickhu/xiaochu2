/**
 * 触摸事件适配（对齐 game2D_huahua）
 * wx touch → canvas touch/pointer + window pointer（Pixi EventSystem 依赖后者收 move/up）
 */

const platform = require('./platform');
const { canvas } = require('./canvas');

class TouchEvent {
  constructor(type, touches) {
    this.type = type;
    this.target = canvas;
    this.currentTarget = canvas;
    this.touches = touches || [];
    this.changedTouches = touches || [];
    this.targetTouches = touches || [];
    this.timeStamp = Date.now();
    this.bubbles = true;
    this.cancelable = true;
    this.defaultPrevented = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {}
}

function convertTouches(rawTouches) {
  if (!rawTouches) return [];
  return Array.prototype.map.call(rawTouches, (touch) => ({
    identifier: touch.identifier,
    clientX: touch.clientX,
    clientY: touch.clientY,
    pageX: touch.clientX,
    pageY: touch.clientY,
    screenX: touch.clientX,
    screenY: touch.clientY,
    target: canvas,
  }));
}

function createPointerEvent(type, touch, buttons) {
  return {
    type: type,
    pointerId: touch.identifier || 0,
    pointerType: 'touch',
    clientX: touch.clientX,
    clientY: touch.clientY,
    pageX: touch.clientX,
    pageY: touch.clientY,
    screenX: touch.clientX,
    screenY: touch.clientY,
    x: touch.clientX,
    y: touch.clientY,
    offsetX: touch.clientX,
    offsetY: touch.clientY,
    movementX: 0,
    movementY: 0,
    width: 1,
    height: 1,
    pressure: buttons ? 0.5 : 0,
    button: 0,
    buttons: buttons,
    isPrimary: true,
    target: canvas,
    currentTarget: canvas,
    timeStamp: Date.now(),
    bubbles: true,
    cancelable: true,
    preventDefault: function() {},
    stopPropagation: function() {},
    stopImmediatePropagation: function() {},
  };
}

function _hostDocument() {
  try {
    if (typeof GameGlobal !== 'undefined' && GameGlobal.__hostDocument) {
      return GameGlobal.__hostDocument;
    }
  } catch (_) { /* */ }
  return null;
}

function _toTouchList(rawEvent) {
  if (!rawEvent) return [];
  if (rawEvent.changedTouches && rawEvent.changedTouches.length) return rawEvent.changedTouches;
  if (rawEvent.touches && rawEvent.touches.length) return rawEvent.touches;
  if (typeof rawEvent.clientX === 'number' || typeof rawEvent.pageX === 'number') {
    return [{
      identifier: rawEvent.pointerId || rawEvent.identifier || 0,
      clientX: rawEvent.clientX ?? rawEvent.pageX ?? 0,
      clientY: rawEvent.clientY ?? rawEvent.pageY ?? 0,
    }];
  }
  return [];
}

function registerTouchEvents() {
  const _listeners = {};
  const nativeAdd = typeof canvas.addEventListener === 'function'
    ? canvas.addEventListener.bind(canvas)
    : null;

  canvas.addEventListener = function(type, handler, options) {
    if (!_listeners[type]) _listeners[type] = [];
    _listeners[type].push(handler);
  };

  canvas.removeEventListener = function(type, handler) {
    if (!_listeners[type]) return;
    const idx = _listeners[type].indexOf(handler);
    if (idx !== -1) _listeners[type].splice(idx, 1);
  };

  function dispatch(type, rawEvent) {
    const source = _toTouchList(rawEvent);
    const touches = convertTouches(rawEvent.touches && rawEvent.touches.length ? rawEvent.touches : source);
    const event = new TouchEvent(type, touches);
    event.changedTouches = convertTouches(rawEvent.changedTouches && rawEvent.changedTouches.length
      ? rawEvent.changedTouches
      : source);
    const t0 = event.changedTouches[0] || event.touches[0];
    if (t0) {
      event.clientX = t0.clientX;
      event.clientY = t0.clientY;
    }

    const queue = _listeners[type];
    if (queue) {
      queue.forEach(function(handler) {
        try { handler(event); } catch (e) { console.error('[TouchEvent]', type, e); }
      });
    }
  }

  function dispatchPointer(pointerType, rawEvent) {
    const touches = rawEvent.changedTouches || rawEvent.touches || [];
    if (!touches.length) return;
    const touch = touches[0];

    const pointerEvent = createPointerEvent(
      pointerType,
      touch,
      pointerType === 'pointerup' || pointerType === 'pointercancel' ? 0 : 1,
    );

    const queue = _listeners[pointerType];
    if (queue) {
      queue.forEach(function(handler) {
        try { handler(pointerEvent); } catch (e) { console.error('[PointerEvent]', pointerType, e); }
      });
    }
  }

  function dispatchToWindow(type, event) {
    if (typeof GameGlobal !== 'undefined' && GameGlobal.__windowDispatchEvent) {
      try {
        GameGlobal.__windowDispatchEvent(type, event);
      } catch (e) {
        console.error('[TouchEvent] dispatchToWindow failed:', type, e);
      }
    }
  }

  platform.onTouchStart(function(e) {
    dispatch('touchstart', e);
    dispatchPointer('pointerdown', e);
    var touches = e.changedTouches || e.touches || [];
    if (touches.length) {
      dispatchToWindow('pointerdown', createPointerEvent('pointerdown', touches[0], 1));
    }
  });

  platform.onTouchMove(function(e) {
    dispatch('touchmove', e);
    dispatchPointer('pointermove', e);
    var touches = e.changedTouches || e.touches || [];
    if (touches.length) {
      dispatchToWindow('pointermove', createPointerEvent('pointermove', touches[0], 1));
    }
  });

  platform.onTouchEnd(function(e) {
    dispatch('touchend', e);
    dispatchPointer('pointerup', e);
    var touches = e.changedTouches || [];
    if (touches.length) {
      dispatchToWindow('pointerup', createPointerEvent('pointerup', touches[0], 0));
    }
  });

  platform.onTouchCancel(function(e) {
    dispatch('touchcancel', e);
    dispatchPointer('pointercancel', e);
    var touches = e.changedTouches || [];
    if (touches.length) {
      dispatchToWindow('pointercancel', createPointerEvent('pointercancel', touches[0], 0));
    }
  });

  /**
   * 华为原生 qg 没有 onTouchStart。触摸在宿主 canvas / document 上。
   * 上面刚覆盖了 canvas.addEventListener，必须用覆盖前的 nativeAdd 去听真事件，
   * 再灌进假监听表，canvasTapRouter / Pixi 才能收到。
   */
  if (!platform.hasTouchApi) {
    var lastSig = '';
    var lastSigAt = 0;
    var lastTouchAt = 0;
    var logged = false;

    function emitAdapter(touchType, pointerType, raw) {
      var list = _toTouchList(raw);
      if (!list.length) return;
      var t0 = list[0];
      var sig = touchType + ':' + Math.round(t0.clientX || 0) + ':' + Math.round(t0.clientY || 0);
      var now = Date.now();
      if (sig === lastSig && now - lastSigAt < 30) return;
      lastSig = sig;
      lastSigAt = now;
      if (touchType === 'touchstart' || touchType === 'touchend') lastTouchAt = Date.now();
      if (!logged) {
        logged = true;
        console.log('[TouchEvent] host-dom via=' + (raw && raw.type || touchType)
          + ' ' + Math.round(t0.clientX || 0) + ',' + Math.round(t0.clientY || 0));
      }
      var payload = { touches: list, changedTouches: list };
      dispatch(touchType, payload);
      dispatchPointer(pointerType, payload);
      var buttons = pointerType === 'pointerup' || pointerType === 'pointercancel' ? 0 : 1;
      dispatchToWindow(pointerType, createPointerEvent(pointerType, list[0], buttons));
    }

    function onDom(touchType, pointerType) {
      return function(e) {
        if (e && e.__adapterTouch) return;
        emitAdapter(touchType, pointerType, e);
      };
    }

    function listen(target, add, type, touchType, pointerType) {
      if (!target || typeof add !== 'function') return false;
      try {
        add.call(target, type, onDom(touchType, pointerType), true);
        return true;
      } catch (_) {
        try {
          add.call(target, type, onDom(touchType, pointerType));
          return true;
        } catch (e2) {
          return false;
        }
      }
    }

    var pairs = [
      ['touchstart', 'touchstart', 'pointerdown'],
      ['touchmove', 'touchmove', 'pointermove'],
      ['touchend', 'touchend', 'pointerup'],
      ['touchcancel', 'touchcancel', 'pointercancel'],
      ['pointerdown', 'touchstart', 'pointerdown'],
      ['pointermove', 'touchmove', 'pointermove'],
      ['pointerup', 'touchend', 'pointerup'],
      ['mousedown', 'touchstart', 'pointerdown'],
      ['mousemove', 'touchmove', 'pointermove'],
      ['mouseup', 'touchend', 'pointerup'],
    ];

    var bound = 0;
    var hostDoc = _hostDocument();
    var targets = [];
    if (nativeAdd) targets.push([canvas, nativeAdd]);
    if (hostDoc && typeof hostDoc.addEventListener === 'function') {
      targets.push([hostDoc, hostDoc.addEventListener.bind(hostDoc)]);
    }

    for (var ti = 0; ti < targets.length; ti++) {
      for (var pi = 0; pi < pairs.length; pi++) {
        if (listen(targets[ti][0], targets[ti][1], pairs[pi][0], pairs[pi][1], pairs[pi][2])) {
          bound += 1;
        }
      }
    }

    function onHostClick(e) {
      if (Date.now() - lastTouchAt < 400) return;
      emitAdapter('touchstart', 'pointerdown', e);
      lastSig = '';
      emitAdapter('touchend', 'pointerup', e);
    }
    if (nativeAdd) {
      try { nativeAdd('click', onHostClick, true); } catch (_) { /* */ }
    }
    if (hostDoc && typeof hostDoc.addEventListener === 'function') {
      try { hostDoc.addEventListener('click', onHostClick, true); } catch (_) { /* */ }
    }

    console.log('[TouchEvent] 华为无 qg.onTouchStart，改听宿主 DOM bound=' + bound);
  }

  var sysInfo = platform.getSystemInfoSync();
  var screenW = sysInfo.screenWidth || sysInfo.windowWidth || 375;
  var screenH = sysInfo.screenHeight || sysInfo.windowHeight || 667;

  /**
   * 宿主自己有真 rect（华为快游戏有 DOM）时绝不能覆盖：
   * Pixi 的 mapPositionToPoint 与 clientEventToDesign 都靠它把事件坐标归一化，
   * 换成 getSystemInfoSync 的屏宽屏高会把命中点算飞。
   */
  var hostRect = null;
  try {
    if (typeof GameGlobal !== 'undefined' && typeof GameGlobal.__hostCanvasRect === 'function') {
      hostRect = GameGlobal.__hostCanvasRect;
    }
  } catch (e) {}

  if (hostRect) {
    try { canvas.getBoundingClientRect = hostRect; } catch (e) {}
  } else {
    try {
      canvas.getBoundingClientRect = function() {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          width: screenW,
          height: screenH,
          right: screenW,
          bottom: screenH,
        };
      };
    } catch (e) {}
  }

  try {
    Object.defineProperty(canvas, 'clientWidth', {
      get: function() { return hostRect ? hostRect().width : screenW; },
      configurable: true,
    });
    Object.defineProperty(canvas, 'clientHeight', {
      get: function() { return hostRect ? hostRect().height : screenH; },
      configurable: true,
    });
  } catch (e) {}

  try {
    if (!canvas.style) canvas.style = {};
    canvas.style.touchAction = '';
    canvas.style.msTouchAction = '';
    canvas.style.cursor = '';
    canvas.style.width = screenW + 'px';
    canvas.style.height = screenH + 'px';
  } catch (e) {}

  if (!canvas.focus) canvas.focus = function() {};

  var _parentListeners = {};
  var fakeParent = {
    addEventListener: function(type, handler, options) {
      if (!_parentListeners[type]) _parentListeners[type] = [];
      _parentListeners[type].push(handler);
    },
    removeEventListener: function(type, handler) {
      if (!_parentListeners[type]) return;
      var idx = _parentListeners[type].indexOf(handler);
      if (idx !== -1) _parentListeners[type].splice(idx, 1);
    },
  };
  try { canvas.parentElement = fakeParent; } catch (e) {
    try { Object.defineProperty(canvas, 'parentElement', { value: fakeParent, configurable: true, writable: true }); } catch (e2) {}
  }
  try { canvas.parentNode = fakeParent; } catch (e) {
    try { Object.defineProperty(canvas, 'parentNode', { value: fakeParent, configurable: true, writable: true }); } catch (e2) {}
  }

}

module.exports = { TouchEvent, registerTouchEvents };
