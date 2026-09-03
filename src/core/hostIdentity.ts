/**
 * 宿主账号是否换人。
 *
 * Tap 小游戏的 setStorage 跟设备走、不跟 Tap 账号走；JWT 未过期时若跳过 login，
 * 换号杀进程再进游戏仍会用旧 token 拉旧档。首次安装（本地无 userId）不算换号。
 */
export function didHostIdentityChange(previousUserId: string, nextUserId: string): boolean {
  const prev = previousUserId.trim();
  const next = nextUserId.trim();
  return prev.length > 0 && next.length > 0 && prev !== next;
}
