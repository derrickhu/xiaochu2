import type { Container, ObservablePoint } from 'pixi.js';
import { Game } from './Game';
import { Platform } from './PlatformService';
import { TweenManager, type TweenConfig } from './TweenManager';

/** Pixi 节点是否仍可用于读写 transform（destroy 后 .scale getter 可能抛错） */
export function displayAlive(obj: unknown): obj is Container {
  if (obj == null) return false;
  const d = obj as { destroyed?: boolean };
  return typeof d.destroyed !== 'boolean' || !d.destroyed;
}

export function readScale(obj: Container): ObservablePoint | null {
  if (!displayAlive(obj)) return null;
  try {
    return obj.scale;
  } catch {
    return null;
  }
}

export function resetScale(obj: Container, v = 1): boolean {
  const s = readScale(obj);
  if (!s) return false;
  try {
    s.set(v);
    return true;
  } catch {
    return false;
  }
}

/** 安全写 scale；失败时返回 false（节点已 destroy / transform 为空） */
export function setScaleSafe(obj: Container, x: number, y?: number): boolean {
  const s = readScale(obj);
  if (!s) return false;
  try {
    if (y === undefined) s.set(x);
    else s.set(x, y);
    return true;
  } catch {
    return false;
  }
}

export function cancelDisplayTweens(obj: Container): void {
  if (!displayAlive(obj)) return;
  TweenManager.cancelTarget(obj);
  const s = readScale(obj);
  if (s) TweenManager.cancelTarget(s);
}

/** 安全读取 container.scale 再 guardedTween，避免调用点直接访问 .scale getter */
export function tweenScale(
  container: Container,
  props: { x: number; y: number },
  config: Omit<TweenConfig, 'target' | 'props'>,
  opts?: {
    fallbackSec?: number;
    bufferMs?: number;
    onFallback?: () => void;
  },
): Promise<void> {
  const scale = readScale(container);
  if (!scale) return Promise.resolve();
  return guardedTween({ ...config, target: scale, props }, opts);
}

const frameListeners = new Set<(dt: number) => void>();

/** iOS 真机 direct-webgl：touch 结束后 ticker 偶发不上屏，需手动 render（与 BoardView 拖动一致） */
function presentMinigameFrame(): void {
  if (!Platform.isMinigame || Platform.isDevtools) return;
  try {
    Game.app?.renderer?.render(Game.stage);
  } catch {
    /* 场景切换中 renderer 可能已销毁 */
  }
}

/**
 * 战斗结算 async 演出期间：补帧 present + 在 ticker 停滞时推进 Tween。
 * 不 pause ticker（与 huahua 单时钟一致）；ticker 正常时避免重复 TweenManager.update。
 */
export function startMinigamePresentLoop(opts?: {
  onUpdate?: (dt: number) => void;
  fps?: number;
}): () => void {
  if (!Platform.isMinigame || Platform.isDevtools) return () => {};
  let stopped = false;
  let last = Date.now();
  let lastTickerTime = Game.ticker?.lastTime ?? -1;
  const frameMs = 1000 / (opts?.fps ?? 60);
  const tick = (): void => {
    if (stopped) return;
    const now = Date.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    const tickerTime = Game.ticker?.lastTime ?? -1;
    const tickerAdvancing = tickerTime !== lastTickerTime;
    lastTickerTime = tickerTime;
    if (!tickerAdvancing) {
      TweenManager.update(dt);
    }
    opts?.onUpdate?.(dt);
    for (const listener of frameListeners) listener(dt);
    presentMinigameFrame();
    setTimeout(tick, frameMs);
  };
  tick();
  return () => {
    stopped = true;
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
    const tgt = config.target;
    const invalid = tgt == null
      || (typeof (tgt as { destroyed?: boolean }).destroyed === 'boolean'
        && (tgt as { destroyed: boolean }).destroyed);
    if (invalid) {
      opts?.onFallback?.();
      resolve();
      return;
    }

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
