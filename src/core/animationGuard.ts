import { Game } from './Game';
import { Platform } from './PlatformService';
import { TweenManager, type TweenConfig } from './TweenManager';

const frameListeners = new Set<(dt: number) => void>();

/** iOS 真机 direct-webgl：touch 结束后 ticker 偶发不上屏，需手动 render（与 BoardView 拖动一致） */
export function presentMinigameFrame(): void {
  if (!Platform.isMinigame || Platform.isDevtools) return;
  try {
    Game.app?.renderer?.render(Game.stage);
  } catch {
    /* 场景切换中 renderer 可能已销毁 */
  }
}

/**
 * 战斗结算等 async 演出期间持续推进动画并 present（真机专用）。
 *
 * iOS 微信真机 touch 结束后，Pixi ticker 偶发低频/停顿；如果只用 timer
 * 兜底 Promise，逻辑会继续跑，但 Tween/粒子/Combo 不更新，最后直接跳结果。
 * 返回 stop 函数，必须在 finally 中调用。
 */
export function startMinigamePresentLoop(opts?: {
  onUpdate?: (dt: number) => void;
  fps?: number;
  pauseTicker?: boolean;
}): () => void {
  if (!Platform.isMinigame || Platform.isDevtools) return () => {};
  let stopped = false;
  let last = Date.now();
  const frameMs = 1000 / (opts?.fps ?? 60);
  const tickerWasStarted = Game.ticker?.started;
  if (opts?.pauseTicker && tickerWasStarted) {
    try { Game.ticker.stop(); } catch { /* */ }
  }
  const tick = (): void => {
    if (stopped) return;
    const now = Date.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    TweenManager.update(dt);
    opts?.onUpdate?.(dt);
    for (const listener of frameListeners) listener(dt);
    presentMinigameFrame();
    setTimeout(tick, frameMs);
  };
  tick();
  return () => {
    stopped = true;
    if (opts?.pauseTicker && tickerWasStarted) {
      try { Game.ticker.start(); } catch { /* */ }
    }
    presentMinigameFrame();
  };
}

export function minigameFrameDelay(sec: number): Promise<void> {
  if (!Platform.isMinigame || Platform.isDevtools) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, sec * 1000)));
  }
  return new Promise((resolve) => {
    let elapsed = 0;
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      frameListeners.delete(onFrame);
      resolve();
    };
    const onFrame = (dt: number): void => {
      elapsed += dt;
      if (elapsed >= sec) finish();
    };
    frameListeners.add(onFrame);
    setTimeout(finish, Math.max(0, sec * 1000) + 120);
  });
}

export function once(fn: () => void): () => void {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    fn();
  };
}

export function minigameFallback(sec: number, fn: () => void, bufferMs = 80): void {
  if (!Platform.isMinigame) return;
  setTimeout(fn, Math.max(0, sec * 1000) + bufferMs);
}

export function guardedTween(
  config: TweenConfig,
  opts?: {
    /** 默认使用 config.duration + config.delay */
    fallbackSec?: number;
    bufferMs?: number;
    onFallback?: () => void;
  },
): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (kind: 'complete' | 'fallback'): void => {
      if (finished) return;
      finished = true;
      if (kind === 'complete') config.onComplete?.();
      else opts?.onFallback?.();
      resolve();
    };
    const fallbackSec = opts?.fallbackSec ?? ((config.delay ?? 0) + config.duration);
    minigameFallback(fallbackSec, () => finish('fallback'), opts?.bufferMs);

    TweenManager.to({
      ...config,
      onComplete: () => {
        finish('complete');
      },
    });
  });
}

export async function guardedPromise(
  promise: Promise<unknown>,
  fallbackSec: number,
  onFallback?: () => void,
): Promise<void> {
  if (!Platform.isMinigame) {
    await promise;
    return;
  }
  await Promise.race([
    promise,
    new Promise<void>((resolve) => {
      minigameFallback(fallbackSec, () => {
        onFallback?.();
        resolve();
      }, 0);
    }),
  ]);
}
