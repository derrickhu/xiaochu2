import { isHuaweiAnonUpgrade } from './huaweiAccount';

/**
 * 宿主账号是否换人。
 *
 * Tap 小游戏的 setStorage 跟设备走、不跟 Tap 账号走；JWT 未过期时若跳过 login，
 * 换号杀进程再进游戏仍会用旧 token 拉旧档。首次安装（本地无 userId）不算换号。
 * 华为：设备匿名号升级成华为帐号也不算换人。
 */
export function didHostIdentityChange(previousUserId: string, nextUserId: string): boolean {
  const prev = previousUserId.trim();
  const next = nextUserId.trim();
  if (!prev || !next || prev === next) return false;
  if (isHuaweiAnonUpgrade(prev, next)) return false;
  return true;
}
