/**
 * 只拦宿主事件的默认行为。
 *
 * Pixi 的 FederatedEvent.preventDefault 会执行 `nativeEvent instanceof Event`。
 * 微信小游戏没有 DOM Event，这一句直接 ReferenceError，pointerdown 整段被吃掉。
 */
export function preventHostDefault(e: unknown): void {
  if (!e || typeof e !== 'object') return;
  const any = e as {
    nativeEvent?: { preventDefault?: () => void };
    preventDefault?: () => void;
  };
  const host = any.nativeEvent && typeof any.nativeEvent.preventDefault === 'function'
    ? any.nativeEvent
    : (!any.nativeEvent ? any : null);
  if (!host || typeof host.preventDefault !== 'function') return;
  try {
    host.preventDefault();
  } catch {
    /* 宿主没有 Event 时忽略，不能打断拖珠 */
  }
}
