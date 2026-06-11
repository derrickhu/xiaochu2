/**
 * 触摸事件适配
 * 将小游戏触摸事件转换为 PixiJS 所需的标准 DOM 事件格式
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

// 将小游戏触摸坐标转换为 canvas 坐标
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

// 注册触摸事件监听桥接
function registerTouchEvents() {
  const _listeners = {};

  // 给 canvas 挂上 addEventListener / removeEventListener
  canvas.addEventListener = function(type, handler, options) {
    if (!_listeners[type]) _listeners[type] = [];
    _listeners[type].push(handler);
  };

  canvas.removeEventListener = function(type, handler) {
    if (!_listeners[type]) return;
    const idx = _listeners[type].indexOf(handler);
    if (idx !== -1) _listeners[type].splice(idx, 1);
  };

  // 分发事件到 canvas 上的监听器
  function dispatch(type, rawEvent) {
    const touches = convertTouches(rawEvent.touches || rawEvent.changedTouches);
    const event = new TouchEvent(type, touches);
    event.changedTouches = convertTouches(rawEvent.changedTouches);

    const queue = _listeners[type];
    if (queue) {
      queue.forEach(handler => {
        try { handler(event); } catch (e) { console.error('[TouchEvent]', type, e); }
      });
    }
  }

  // pointer 事件映射（PixiJS 7 优先使用 pointer 事件）
  function dispatchPointer(pointerType, rawEvent) {
    const touches = rawEvent.changedTouches || rawEvent.touches || [];
    if (!touches.length) return;
    const touch = touches[0];

    const pointerEvent = createPointerEvent(pointerType, touch, pointerType === 'pointerup' ? 0 : 1);

    const queue = _listeners[pointerType];
    if (queue) {
      queue.forEach(handler => {
        try { handler(pointerEvent); } catch (e) { console.error('[PointerEvent]', pointerType, e); }
      });
    }
  }

  // 分发 window 上的全局事件（PixiJS EventSystem 在 window 上也注册了 pointermove/pointerup）
  function dispatchToWindow(type, event) {
    if (typeof GameGlobal !== 'undefined' && GameGlobal.__windowDispatchEvent) {
      try {
        GameGlobal.__windowDispatchEvent(type, event);
      } catch (e) {
        console.error('[TouchEvent] dispatchToWindow failed:', type, e);
      }
    }
  }

  // 诊断：3秒后输出已注册的 canvas 事件监听器类型
  setTimeout(function() {
    console.log('[TouchEvent] canvas listeners:', Object.keys(_listeners).join(', ') || '(空)');
  }, 3000);

  var _touchLogCount = 0;

  platform.onTouchStart((e) => {
    _touchLogCount++;
    if (_touchLogCount <= 5) {
      var t = (e.changedTouches || e.touches || [])[0];
      console.log('[Touch] down #' + _touchLogCount,
        'x:', t && t.clientX, 'y:', t && t.clientY,
        'canvasListeners:', Object.keys(_listeners).join(','));
    }
    dispatch('touchstart', e);
    dispatchPointer('pointerdown', e);
    // window 上也需要收到 pointerdown
    var touches = e.changedTouches || e.touches || [];
    if (touches.length) {
      var t = touches[0];
      dispatchToWindow('pointerdown', createPointerEvent('pointerdown', t, 1));
    }
  });

  var _moveLogCount = 0;
  platform.onTouchMove((e) => {
    dispatch('touchmove', e);
    dispatchPointer('pointermove', e);
    var touches = e.changedTouches || e.touches || [];
    if (touches.length) {
      var t = touches[0];
      _moveLogCount++;
      if (_moveLogCount <= 3) {
        console.log('[Touch] move #' + _moveLogCount,
          'x:', t.clientX, 'y:', t.clientY,
          'windowListeners(pointermove):', typeof GameGlobal.__windowDispatchEvent);
      }
      dispatchToWindow('pointermove', createPointerEvent('pointermove', t, 1));
    }
  });

  platform.onTouchEnd((e) => {
    dispatch('touchend', e);
    dispatchPointer('pointerup', e);
    var touches = e.changedTouches || [];
    if (touches.length) {
      var t = touches[0];
      dispatchToWindow('pointerup', createPointerEvent('pointerup', t, 0));
    }
  });

  platform.onTouchCancel((e) => {
    dispatch('touchcancel', e);
    dispatchPointer('pointercancel', e);
    var touches = e.changedTouches || [];
    if (touches.length) {
      var t = touches[0];
      dispatchToWindow('pointercancel', createPointerEvent('pointercancel', t, 0));
    }
  });

  // canvas.getBoundingClientRect - PixiJS 用来计算事件坐标
  // 必须返回逻辑像素尺寸（与触摸事件 clientX/clientY 一致），否则坐标偏移
  var sysInfo = platform.getSystemInfoSync();
  var screenW = sysInfo.screenWidth || sysInfo.windowWidth || 375;
  var screenH = sysInfo.screenHeight || sysInfo.windowHeight || 667;

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

  // clientWidth/clientHeight 也需返回逻辑像素
  try {
    Object.defineProperty(canvas, 'clientWidth', { get: function() { return screenW; }, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { get: function() { return screenH; }, configurable: true });
  } catch (e) {}

  // PixiJS 会检查 canvas.style（微信 canvas 部分属性可能只读）
  try {
    if (!canvas.style) canvas.style = {};
    canvas.style.touchAction = '';
    canvas.style.msTouchAction = '';
    canvas.style.cursor = '';
    canvas.style.width = screenW + 'px';
    canvas.style.height = screenH + 'px';
  } catch (e) {}

  // PixiJS 检查 focus
  if (!canvas.focus) canvas.focus = function() {};

  // PixiJS EventSystem 需要 canvas.parentElement 来 addEventListener
  // 不能设为 null，设为一个带事件能力的虚拟节点
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

  // 诊断：确认 parentElement 是否设置成功
  console.log('[TouchEvent] canvas.parentElement set:', !!canvas.parentElement,
    ', getBoundingClientRect:', typeof canvas.getBoundingClientRect);
}

module.exports = { TouchEvent, registerTouchEvents };
