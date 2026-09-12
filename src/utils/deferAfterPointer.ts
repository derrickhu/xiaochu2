/**
 * 推迟到当前指针事件派发完成后再执行。
 * 避免 pointertap 内切场景/destroy 节点后，Pixi pointerup 仍遍历 pressTargets 报 null.scale。
 */
import { Game } from '@/core/Game';

const _queue: Array<() => void> = [];
let _scheduled = false;

/**
 * ticker 与 setTimeout 双路挂，谁先到谁执行。
 *
 * 只用 setTimeout：华为快游戏真机上回调可能迟到很久，表现是点击音响了、
 * 场景半天不切，攒够了再一次性切过去。
 * 只用 ticker：iOS 微信 pointerup 之后 addOnce 偶尔不触发，build 永远不跑 → 黑屏。
 */
function scheduleOnce(run: () => void): void {
  let done = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = (): void => {
    if (done) return;
    done = true;
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    run();
  };

  try {
    timer = setTimeout(fire, 0);
  } catch {
    timer = null;
  }

  let tickerArmed = false;
  try {
    const ticker = Game.ticker;
    if (ticker?.started) {
      ticker.addOnce(fire);
      tickerArmed = true;
    }
  } catch { /* ticker 尚未就绪 */ }

  if (timer == null && !tickerArmed) {
    try {
      requestAnimationFrame(fire);
    } catch {
      fire();
    }
  }
}

export function deferAfterPointerEvent(fn: () => void): void {
  _queue.push(fn);
  if (_scheduled) return;
  _scheduled = true;
  scheduleOnce(() => {
    _scheduled = false;
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
  scheduleOnce(() => {
    try {
      fn();
    } catch (err) {
      console.error('[deferNextFrame]', err);
    }
  });
}
