/**
 * 华为快游戏帐号：qg.gameLoginWithReal / getCachePlayerId
 * https://developer.huawei.com/consumer/cn/doc/quickApp-References/quickgame-api-account-0000001083874630
 */

export type HuaweiAccount = {
  playerId: string;
  displayName?: string;
  gameAuthSign?: string;
  ts?: string;
};

/**
 * 本游戏自己的 AGC App ID。未申请前留空，打包时用 VITE_HUAWEI_APPID 注入。
 * 不要填其它游戏（例如花花）的 App ID，否则 gameLoginWithReal 会 AUTH FAIL。
 */
export const HUAWEI_AG_APPID = '';

export function readHuaweiAppId(api: { getSystemInfoSync?: () => Record<string, unknown> } | null | undefined): string {
  const fromEnv = String(
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_HUAWEI_APPID) || '',
  ).trim();
  if (fromEnv) return fromEnv;
  if (HUAWEI_AG_APPID) return HUAWEI_AG_APPID;
  try {
    const info = api?.getSystemInfoSync?.() || {};
    const raw = info.appID ?? info.appId ?? info.appid ?? '';
    return String(raw).trim();
  } catch {
    return '';
  }
}

export function parseHuaweiLoginData(data: unknown): HuaweiAccount | null {
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  const playerId = String(rec.playerId ?? rec.playerID ?? rec.player_id ?? '').trim();
  if (playerId.length < 4 || playerId.length > 128) return null;
  const displayName = rec.displayName != null ? String(rec.displayName).trim() : '';
  const gameAuthSign = rec.gameAuthSign != null ? String(rec.gameAuthSign).trim() : '';
  const ts = rec.ts != null ? String(rec.ts).trim() : '';
  return {
    playerId,
    ...(displayName ? { displayName } : {}),
    ...(gameAuthSign ? { gameAuthSign } : {}),
    ...(ts ? { ts } : {}),
  };
}

/** 设备匿名号升级成华为帐号，不算换人，避免把刚玩的档清掉 */
export function isHuaweiAnonUpgrade(previousUserId: string, nextUserId: string): boolean {
  const prev = previousUserId.trim();
  const next = nextUserId.trim();
  return prev.startsWith('hw:anon_') && next.startsWith('hw:') && !next.startsWith('hw:anon_');
}
