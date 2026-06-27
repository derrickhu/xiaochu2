/**
 * 推迟到当前指针事件派发完成后再执行。
 * 避免 pointertap 内切场景/destroy 节点后，Pixi pointerup 仍遍历 pressTargets 报 null.scale。
 */
let _rafId = 0;
const _queue: Array<() => void> = [];

export function deferAfterPointerEvent(fn: () => void): void {
  _queue.push(fn);
  if (_rafId !== 0) return;
  _rafId = requestAnimationFrame(() => {
    _rafId = 0;
    const batch = _queue.splice(0);
    for (const run of batch) {
      try {
        run();
      } catch (err) {
        console.error('[deferAfterPointer]', err);
      }
    }
  });
}

/** 推迟到下一帧（场景 switchTo 后的 build 专用，避免与 Pixi 挂载同帧冲突）。 */
export function deferNextFrame(fn: () => void): void {
  requestAnimationFrame(() => {
    try {
      fn();
    } catch (err) {
      console.error('[deferNextFrame]', err);
    }
  });
}
