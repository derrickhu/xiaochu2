/**
 * Tap：document.createElement('canvas') / Pixi 量字不能再走 tap.createCanvas。
 * 宿主 createCanvas 往往会回到 document.createElement，一包就栈溢出。
 */
function fake2d() {
  return {
    fillStyle: '',
    strokeStyle: '',
    font: '16px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    lineWidth: 1,
    measureText(s) {
      const n = String(s || '').length;
      return { width: n * 10 };
    },
    fillRect() {},
    clearRect() {},
    strokeRect() {},
    fillText() {},
    strokeText() {},
    drawImage() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    rect() {},
    arc() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    scale() {},
    translate() {},
    rotate() {},
    setTransform() {},
    getImageData(_x, _y, w, h) {
      const width = w || 1;
      const height = h || 1;
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
  };
}

function createMeasureCanvas(w, h) {
  const width = w || 1;
  const height = h || 1;
  const ctx = fake2d();
  const c = {
    width,
    height,
    style: {},
    getContext(type) {
      if (type === '2d') return ctx;
      // 禁止把主屏 WebGL 借给量字假 canvas：Pixi 一旦当新 context 用，Tap 会 SIGABRT
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() {
      return { x: 0, y: 0, top: 0, left: 0, width: c.width, height: c.height, right: c.width, bottom: c.height };
    },
    toDataURL() { return ''; },
  };
  ctx.canvas = c;
  return c;
}

module.exports = { createMeasureCanvas };
