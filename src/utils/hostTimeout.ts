/**
 * 华为快游戏上 setTimeout 经常不按时回调（点击音响了、场景却卡住）。
 * 同时挂 setTimeout + rAF 轮询 Date.now，谁先到谁算。
 */
export function waitMs(ms: number): Promise<void> {
  const delay = Math.max(0, ms);
  return new Promise((resolve) => {
    let done = false;
    const fire = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    try {
      setTimeout(fire, delay);
    } catch { /* */ }
    if (typeof requestAnimationFrame !== 'function') return;
    const start = Date.now();
    const tick = (): void => {
      if (done) return;
      if (Date.now() - start >= delay) {
        fire();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
